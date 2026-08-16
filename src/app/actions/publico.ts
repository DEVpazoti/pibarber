"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createAdminClient } from "@/lib/supabase/admin";
import { erroDeTelefone, normalizarTelefone } from "@/lib/telefone";
import { falha, sucesso, type ActionResult } from "@/lib/types";
import { timestampSP } from "@/lib/utils";

/**
 * AGENDAMENTO SEM CADASTRO — o lado do servidor.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE ARQUIVO USA A SERVICE ROLE
 * ---------------------------------------------------------------------------
 * `createAdminClient()` ignora a RLS, e o próprio arquivo dele diz que só há
 * dois usos legítimos. Este é o terceiro, e a razão é específica:
 *
 * `book_appointment_publico` NÃO tem grant para `anon`. Se tivesse, qualquer
 * um chamaria `/rest/v1/rpc/book_appointment_publico` passando um `p_ip_hash`
 * inventado a cada requisição, e o limite por IP viraria enfeite. A função só
 * é alcançável por aqui, e é AQUI que o IP verdadeiro é lido — do
 * `x-forwarded-for`, que quem está do outro lado não escolhe.
 *
 * A service role não está sendo usada para pular validação: TODA a validação
 * (loja permite, telefone real, limites, horário livre) mora dentro da função
 * do Postgres. Ela está sendo usada para ser o único portão.
 */

/* ==========================================================================
   O IP
   ========================================================================== */

/**
 * O IP de quem está chamando, já em hash.
 *
 * `x-forwarded-for` é uma LISTA: "cliente, proxy1, proxy2". Na Vercel o
 * primeiro item é o cliente real — os proxies acrescentam à direita. Pegar o
 * último daria sempre o mesmo endereço (o da própria Vercel) e o limite por IP
 * passaria a valer para o mundo inteiro junto.
 *
 * O cabeçalho é forjável em geral, mas na Vercel ele é REESCRITO na borda, e
 * é o melhor sinal disponível sem infraestrutura extra. Vale o que vale: é uma
 * barreira contra spam simples, não contra um adversário determinado.
 *
 * HASH, e não o IP em claro: para contar "esta origem tentou 40 vezes" o hash
 * serve igual, e o log fica sem dado pessoal identificável.
 */
async function hashDoIP(): Promise<string> {
  const cabecalhos = await headers();

  const encaminhado = cabecalhos.get("x-forwarded-for") ?? "";
  const ip =
    encaminhado.split(",")[0]?.trim() ||
    cabecalhos.get("x-real-ip")?.trim() ||
    // Sem cabeçalho nenhum é desenvolvimento local. Um valor fixo mantém o
    // limite funcionando (e testável) em vez de desligá-lo.
    "local";

  // O sal impede que alguém com o banco na mão descubra IPs testando os 4
  // bilhões possíveis — sha256 puro de um IPv4 é trivial de reverter.
  const sal = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "pibarber";
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
}

/* ==========================================================================
   Agendar sem conta
   ========================================================================== */

export type AgendamentoPublico = {
  shopId: string;
  professionalId: string;
  /** "2026-08-14" */
  dia: string;
  /** "14:30" */
  hora: string;
  serviceIds: string[];
  nome: string;
  telefone: string;
  observacao?: string;
  /**
   * O campo-armadilha. Fica escondido no formulário: pessoa nenhuma o
   * preenche, bot que preenche todo input preenche. Ver o comentário no
   * BookingWizard.
   */
  armadilha?: string;
};

export async function agendarSemLogin(
  entrada: AgendamentoPublico,
): Promise<ActionResult<{ token: string }>> {
  try {
    const ipHash = await hashDoIP();

    // ---------------------------------------------------------------------
    // A ARMADILHA, antes de tudo.
    //
    // Não devolve sucesso falso de propósito. Fingir que deu certo é melhor
    // contra bots, mas se um gerenciador de senhas preencher o campo por
    // engano, a pessoa acha que agendou e não agendou — e só descobre na
    // porta da barbearia. O erro genérico é o mal menor.
    // ---------------------------------------------------------------------
    if (entrada.armadilha && entrada.armadilha.trim() !== "") {
      console.warn("[público] armadilha preenchida — provável bot:", { ipHash });
      return falha("Não consegui concluir. Recarregue a página e tente de novo.");
    }

    // Validação de forma. NÃO é a que vale — a que vale está no Postgres, e
    // roda de novo lá dentro. Esta existe para o erro voltar rápido, com a
    // mensagem certa, sem gastar uma ida ao banco.
    const nome = entrada.nome.trim();
    if (nome.length < 3) return falha("Informe seu nome completo.");

    const erroTelefone = erroDeTelefone(entrada.telefone);
    if (erroTelefone) return falha(erroTelefone);

    if (entrada.serviceIds.length === 0) return falha("Escolha pelo menos um serviço.");
    if (!entrada.professionalId) return falha("Escolha o profissional.");
    if (!entrada.dia || !entrada.hora) return falha("Escolha o dia e o horário.");

    // A service role entra SÓ agora, depois de a entrada estar conferida.
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("book_appointment_publico", {
      p_shop: entrada.shopId,
      p_professional: entrada.professionalId,
      // O instante é montado AQUI, com o fuso de São Paulo fixo. Se o navegador
      // calculasse, um celular com fuso errado agendaria na hora errada.
      p_quando: timestampSP(entrada.dia, entrada.hora),
      p_service_ids: entrada.serviceIds,
      p_nome: nome,
      p_telefone: normalizarTelefone(entrada.telefone),
      p_ip_hash: ipHash,
      p_obs: entrada.observacao?.trim() || undefined,
    });

    if (error) return falha(traduzirErroBanco(error, "[público] book_appointment_publico"));

    // ---------------------------------------------------------------------
    // A função devolve jsonb, não o token direto.
    //
    // Limite atingido volta como `{ok:false, motivo}` em vez de exceção, para
    // que o registro do bloqueio SOBREVIVA — uma exceção desfaria a transação
    // e levaria o log embora, deixando só as tentativas bem-sucedidas
    // gravadas. Ver o comentário na assinatura da função, em
    // 17_agendamento_publico.sql.
    // ---------------------------------------------------------------------
    const resposta = data as { ok?: boolean; token?: string; motivo?: string } | null;

    if (!resposta?.ok) {
      // O motivo do bloqueio vai para o LOG DO SERVIDOR, e é aqui que você
      // acompanha se o endereço está sendo abusado.
      console.warn("[público] agendamento bloqueado:", {
        motivo: resposta?.motivo ?? "desconhecido",
        shop: entrada.shopId,
        ipHash,
      });

      // Uma frase só para todos os limites, e sem dizer qual regra pegou:
      // explicar a regra ensina como contorná-la. Quem esbarrou nisso sendo
      // cliente de verdade precisa de um caminho, não de um diagnóstico.
      return falha(
        "Não consegui concluir agora. Se você já tem horário marcado aqui, use o link que recebeu — ou fale direto com a barbearia.",
      );
    }

    if (!resposta.token) return falha("Não consegui concluir o agendamento.");

    // A agenda do painel precisa mostrar o horário novo na hora.
    revalidatePath("/painel");
    revalidatePath("/painel/agenda");
    revalidatePath("/painel/clientes");

    return sucesso({ token: resposta.token }, "Agendamento confirmado!");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[público] agendarSemLogin"));
  }
}

/* ==========================================================================
   Acompanhar e cancelar pelo link
   ========================================================================== */

export type AgendamentoPorToken = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price: number;
  cliente_nome: string | null;
  profissional: string | null;
  servicos: string | null;
  shop_nome: string;
  shop_slug: string;
  shop_telefone: string | null;
  shop_whatsapp: string | null;
  shop_endereco: string | null;
  cancel_deadline_hours: number;
};

/**
 * O agendamento por trás de um token.
 *
 * Devolve `null` para token inexistente, e a página mostra "não encontrei" sem
 * distinguir "nunca existiu" de "não é seu" — não há o que distinguir: quem
 * tem o link, tem o horário.
 *
 * Formato de token conferido ANTES de ir ao banco: sem isso, cada visita a
 * `/a/qualquer-coisa` viraria uma consulta, e varrer a rota ficaria barato.
 */
export async function buscarPorToken(token: string): Promise<AgendamentoPorToken | null> {
  const formatoUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!formatoUUID.test(token)) return null;

  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("agendamento_por_token", { p_token: token });

    if (error) {
      console.error("[público] falha ao buscar pelo token:", error);
      return null;
    }

    const linha = data?.[0];
    if (!linha) return null;

    return { ...linha, total_price: Number(linha.total_price) } as AgendamentoPorToken;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[público] erro inesperado ao buscar pelo token:", error);
    return null;
  }
}

/**
 * Cancela pelo link.
 *
 * O prazo é o mesmo do cliente com conta — `cancel_deadline_hours` da loja,
 * conferido no banco. Quem agenda sem cadastro não ganha um prazo melhor por
 * isso, e a barbearia não precisa aprender duas regras.
 */
export async function cancelarPorToken(
  token: string,
  motivo?: string,
): Promise<ActionResult> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.rpc("cancelar_por_token", {
      p_token: token,
      p_motivo: motivo?.trim() || undefined,
    });

    if (error) return falha(traduzirErroBanco(error, "[público] cancelar_por_token"));

    revalidatePath("/painel");
    revalidatePath("/painel/agenda");
    revalidatePath(`/a/${token}`);

    return sucesso(undefined, "Agendamento cancelado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[público] cancelarPorToken"));
  }
}
