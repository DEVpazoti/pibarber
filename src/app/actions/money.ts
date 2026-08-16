"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireOwnerContext, requireShopContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type PaymentMethod } from "@/lib/types";
import { hojeISO } from "@/lib/utils";

/**
 * O dinheiro: caixa, comissões e fiado.
 *
 * Caixa e comissões são do DONO — `requireOwnerContext()` no topo, e a RLS de
 * `transactions` e `commissions` exigindo `can_manage_money`. O assistente não
 * lê essas tabelas nem chamando a API REST direto com a chave anônima.
 *
 * Fiado é diferente: é informação OPERACIONAL. O assistente precisa saber quem
 * está devendo, porque é ele quem cobra no balcão. Por isso `receberFiado` usa
 * `requireShopContext()`, e `pay_debt` confere com `has_shop_access`.
 *
 * ⚠️ SÓ FUNÇÃO ASYNC SAI DAQUI. Um `"use server"` que exporta constante derruba
 * o módulo inteiro em tempo de execução — foi o que quebrou as quatro actions
 * deste arquivo. As categorias de despesa moram em `src/lib/caixa.ts`; a
 * explicação completa está lá.
 */

/* ==========================================================================
   Caixa — despesa manual
   ========================================================================== */

export async function lancarDespesa(entrada: {
  valor: number;
  categoria: string;
  descricao?: string;
  /** "2026-08-14". Vazio = hoje, resolvido no servidor. */
  data?: string;
}): Promise<ActionResult> {
  try {
    const { shopId, profile } = await requireOwnerContext();

    if (!(entrada.valor > 0)) return falha("Informe um valor maior que zero.");
    if (!entrada.categoria.trim()) return falha("Escolha a categoria da despesa.");

    const supabase = await createClient();

    const { error } = await supabase.from("transactions").insert({
      barbershop_id: shopId,
      type: "expense",
      // O valor é SEMPRE positivo; quem diz se entra ou sai é o `type`.
      amount: Math.round(entrada.valor * 100) / 100,
      category: entrada.categoria.trim(),
      description: entrada.descricao?.trim() || null,
      occurred_at: entrada.data || hojeISO(),
      created_by: profile.id,
    });

    if (error) return falha(traduzirErroBanco(error, "[caixa] lançar despesa"));

    revalidatePath("/painel/caixa");
    revalidatePath("/painel/relatorios");
    revalidatePath("/painel");
    return sucesso(undefined, "Despesa lançada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[caixa] lancarDespesa"));
  }
}

export async function apagarLancamento(id: string): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
    const supabase = await createClient();

    // Só despesa manual pode ser apagada. Entrada de atendimento sai do caixa
    // pela conclusão, e apagar na mão descolaria o caixa da agenda.
    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("barbershop_id", shopId)
      .eq("type", "expense")
      .is("appointment_id", null)
      .select("id");

    if (error) return falha(traduzirErroBanco(error, "[caixa] apagar lançamento"));
    if (!data || data.length === 0) {
      return falha("Só dá para apagar despesa lançada à mão.");
    }

    revalidatePath("/painel/caixa");
    revalidatePath("/painel/relatorios");
    return sucesso(undefined, "Lançamento apagado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[caixa] apagarLancamento"));
  }
}

/* ==========================================================================
   Comissões
   ========================================================================== */

/**
 * Paga (parte d)a comissão que um profissional tem a receber.
 *
 * O valor é contra o SALDO do profissional, não contra um atendimento: o dono
 * paga "R$ 100 hoje, o resto sexta". Quem distribui esse valor pelas comissões
 * pendentes — da mais antiga para a mais nova — é `pay_commissions`, no banco,
 * que também lança a saída no caixa e recalcula os status. Tudo numa transação
 * só: antes isto eram duas escritas em TypeScript com um "desfaz" à mão que
 * podia falhar por sua vez.
 *
 * Mesma divisão de papéis do resto do dinheiro: `requireOwnerContext()` aqui, e
 * `can_manage_money` dentro da função. O assistente não paga comissão nem
 * chamando a RPC direto.
 */
export async function pagarComissao(entrada: {
  professionalId: string;
  valor: number;
  forma: PaymentMethod;
  /**
   * Gerada pelo formulário, uma vez por abertura do modal. Dois envios com a
   * mesma chave registram UM pagamento — o segundo recebe de volta o id do
   * primeiro. Sem isso, dois cliques rápidos pagam o profissional em dobro:
   * os dois valores cabem no saldo, então nenhuma validação os separa.
   */
  idempotencia?: string;
}): Promise<ActionResult> {
  try {
    await requireOwnerContext();

    if (!(entrada.valor > 0)) return falha("Informe um valor maior que zero.");
    if (entrada.forma === "fiado") {
      return falha("Não dá para pagar comissão como fiado. Escolha outra forma.");
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("pay_commissions", {
      p_professional: entrada.professionalId,
      p_valor: Math.round(entrada.valor * 100) / 100,
      p_forma: entrada.forma,
      p_idem: entrada.idempotencia ?? undefined,
    });

    if (error) return falha(traduzirErroBanco(error, "[comissões] pay_commissions"));

    revalidatePath("/painel/comissoes");
    revalidatePath("/painel/caixa");
    revalidatePath("/painel/relatorios");
    return sucesso(undefined, "Pagamento registrado e lançado no caixa.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[comissões] pagarComissao"));
  }
}

/**
 * Desfaz um pagamento de comissão lançado por engano: devolve as comissões ao
 * estado anterior e apaga a saída do caixa junto.
 *
 * Só o pagamento MAIS RECENTE de cada profissional. Não é limitação de tela: o
 * pagamento anterior pode ter uma fatia coberta pelo mais novo, e desfazer fora
 * de ordem embaralharia qual atendimento foi pago. A função recusa e explica.
 */
export async function estornarPagamentoComissao(pagamentoId: string): Promise<ActionResult> {
  try {
    await requireOwnerContext();

    const supabase = await createClient();

    const { error } = await supabase.rpc("revert_commission_payment", {
      p_payment: pagamentoId,
    });

    if (error) return falha(traduzirErroBanco(error, "[comissões] revert_commission_payment"));

    revalidatePath("/painel/comissoes");
    revalidatePath("/painel/caixa");
    revalidatePath("/painel/relatorios");
    return sucesso(undefined, "Pagamento estornado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[comissões] estornarPagamentoComissao"));
  }
}

/* ==========================================================================
   Fiado
   ========================================================================== */

/**
 * Recebe (parte de) uma dívida.
 *
 * Quem faz o trabalho é `pay_debt`, no banco: registra o pagamento, lança a
 * entrada no caixa e recalcula o status da dívida — tudo numa transação só.
 * O assistente pode chamar: cobrar é operação de balcão.
 */
export async function receberFiado(entrada: {
  debtId: string;
  valor: number;
  forma: PaymentMethod;
}): Promise<ActionResult> {
  try {
    await requireShopContext();

    if (!(entrada.valor > 0)) return falha("Informe um valor maior que zero.");
    if (entrada.forma === "fiado") {
      return falha("Não dá para pagar fiado com fiado. Escolha outra forma.");
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("pay_debt", {
      p_debt: entrada.debtId,
      p_valor: Math.round(entrada.valor * 100) / 100,
      p_forma: entrada.forma,
    });

    if (error) return falha(traduzirErroBanco(error, "[fiado] pay_debt"));

    revalidatePath("/painel/fiado");
    revalidatePath("/painel/caixa");
    revalidatePath("/painel");
    revalidatePath("/painel/clientes");
    return sucesso(undefined, "Pagamento registrado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[fiado] receberFiado"));
  }
}
