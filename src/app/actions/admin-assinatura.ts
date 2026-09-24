"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  AsaasErro,
  buscarCobranca,
  estornarCobranca,
  estornarParcelamento,
  parcelasDoParcelamento,
  removerAssinatura,
  removerParcelamento,
} from "@/lib/asaas";
import { registrarCobranca } from "@/lib/assinatura-servidor";
import { requireAdmin } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { tagBarbearia } from "@/lib/queries/barbearia";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  falha,
  sucesso,
  type ActionResult,
  type Subscription,
  type SubscriptionPayment,
} from "@/lib/types";

/**
 * A ASSINATURA vista pela PiSystem, no /admin: estornar, cancelar e estender
 * o teste de uma barbearia.
 *
 * Tudo aqui é dinheiro ou acesso de outra pessoa. Por isso:
 *   - `requireAdmin()` na primeira linha de cada action;
 *   - service role só DEPOIS dele (a RLS não deixa ninguém escrever na
 *     assinatura);
 *   - todo efeito vira uma linha em `subscription_events`, com quem, quando,
 *     o motivo e o que o Asaas respondeu.
 *
 * As regras seguem o item 5 dos Termos: estorno integral em até 7 dias de
 * cada pagamento, e o acesso pago termina quando o dinheiro volta; cancelar
 * sem estorno mantém o acesso até o fim do período pago.
 */

/** Os 7 dias de arrependimento dos Termos, item 5. */
const DIAS_ARREPENDIMENTO = 7;
const STATUS_PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

export type EventoAssinatura = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  quem: string | null;
};

export type AssinaturaNoAdmin = {
  nomeBarbearia: string;
  assinatura: Subscription | null;
  faturas: SubscriptionPayment[];
  eventos: EventoAssinatura[];
};

/** Tudo que a janela de assinatura do /admin mostra de uma barbearia. */
export async function carregarAssinaturaAdmin(
  shopId: string,
): Promise<ActionResult<AssinaturaNoAdmin>> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const [loja, assinatura, faturas, eventos] = await Promise.all([
      admin.from("barbershops").select("name").eq("id", shopId).maybeSingle(),
      admin.from("subscriptions").select("*").eq("barbershop_id", shopId).maybeSingle(),
      admin
        .from("subscription_payments")
        .select("*")
        .eq("barbershop_id", shopId)
        .order("due_date", { ascending: false })
        .limit(40),
      admin
        .from("subscription_events")
        .select("id, action, reason, created_at, quem:profiles(full_name, email)")
        .eq("barbershop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const erro = loja.error ?? assinatura.error ?? faturas.error ?? eventos.error;
    if (erro) return falha(traduzirErroBanco(erro, "[admin] carregar assinatura"));
    if (!loja.data) return falha("Barbearia não encontrada.");

    return sucesso({
      nomeBarbearia: loja.data.name,
      assinatura: assinatura.data ?? null,
      faturas: faturas.data ?? [],
      eventos: (eventos.data ?? []).map((e) => {
        const q = Array.isArray(e.quem) ? e.quem[0] : e.quem;
        return {
          id: e.id,
          action: e.action,
          reason: e.reason,
          created_at: e.created_at,
          quem: q?.full_name ?? q?.email ?? null,
        };
      }),
    });
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] carregarAssinaturaAdmin"));
  }
}

/* ==========================================================================
   Estornar
   ========================================================================== */

/**
 * Devolve o valor INTEIRO de uma fatura paga e encerra o acesso pago.
 *
 * No parcelado, estorna o parcelamento todo (todas as parcelas) — é assim que
 * o Asaas faz, e é o que os Termos prometem. A assinatura que renovaria
 * sozinha é encerrada junto: ninguém recebe o dinheiro de volta e continua
 * sendo cobrado no mês seguinte.
 *
 * Fora dos 7 dias só passa com `foraDoPrazo: true` — exceção consciente, não
 * clique distraído.
 */
export async function estornarFatura(entrada: {
  asaasPaymentId: string;
  motivo: string;
  nomeConfirmacao: string;
  foraDoPrazo?: boolean;
}): Promise<ActionResult> {
  try {
    const perfil = await requireAdmin();
    const admin = createAdminClient();

    const motivo = entrada.motivo.trim();
    if (motivo.length < 3) return falha("Escreva o motivo do estorno.", "motivo");

    const { data: fatura, error } = await admin
      .from("subscription_payments")
      .select("*, loja:barbershops(name)")
      .eq("asaas_payment_id", entrada.asaasPaymentId)
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[admin] ler fatura"));
    if (!fatura) return falha("Fatura não encontrada.");

    const loja = Array.isArray(fatura.loja) ? fatura.loja[0] : fatura.loja;
    const nome = loja?.name ?? "";
    if (entrada.nomeConfirmacao.trim().toLowerCase() !== nome.trim().toLowerCase()) {
      return falha("Digite o nome da barbearia exatamente como aparece.", "nomeConfirmacao");
    }

    if (!STATUS_PAGO.includes(fatura.status)) {
      return falha("Só dá para estornar fatura paga.");
    }
    if (fatura.billing_type === "BOLETO") {
      return falha(
        "Boleto não é estornado pela API do Asaas (precisa de dado bancário). Faça pelo painel do Asaas e depois cancele aqui.",
      );
    }

    const pagoEm = new Date(fatura.paid_at ?? `${fatura.due_date}T12:00:00-03:00`);
    const dias = (Date.now() - pagoEm.getTime()) / 86_400_000;
    if (dias > DIAS_ARREPENDIMENTO && !entrada.foraDoPrazo) {
      return falha(
        `Esta fatura foi paga há ${Math.floor(dias)} dias — fora dos ${DIAS_ARREPENDIMENTO} dias de arrependimento. Confirme a exceção para continuar.`,
        "foraDoPrazo",
      );
    }

    // --- No Asaas ---------------------------------------------------------
    const cobranca = await buscarCobranca(fatura.asaas_payment_id);
    const parcelamento = cobranca.installment ?? null;
    if (parcelamento) {
      await estornarParcelamento(parcelamento);
    } else {
      await estornarCobranca(fatura.asaas_payment_id, `PiBarber — estorno: ${motivo}`);
    }

    const shopId = fatura.barbershop_id;
    const { data: assinatura } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id, status")
      .eq("barbershop_id", shopId)
      .maybeSingle();

    // A renovação automática para junto: dinheiro devolvido não renova.
    let assinaturaEncerrada = false;
    if (assinatura?.asaas_subscription_id && assinatura.status !== "canceled") {
      try {
        await removerAssinatura(assinatura.asaas_subscription_id);
        assinaturaEncerrada = true;
      } catch (e) {
        console.error("[admin] estornou, mas não encerrou a assinatura no Asaas:", e);
      }
    }

    // --- No PiBarber --------------------------------------------------------
    // Primeiro `canceled`: assim o espelho abaixo não confunde este estorno
    // com um feito por fora (`external_refund`).
    const { error: erroEstorno } = await admin.rpc("assinatura_estornada", { p_shop: shopId });
    if (erroEstorno) {
      console.error("[admin] estornou no Asaas mas não encerrou o acesso:", erroEstorno);
    }

    // O espelho das faturas com o status novo, vindo do próprio Asaas.
    const atualizadas = parcelamento
      ? await parcelasDoParcelamento(parcelamento)
      : [await buscarCobranca(fatura.asaas_payment_id)];
    for (const c of atualizadas) {
      const r = await registrarCobranca(admin, c);
      if (!r.ok) console.error("[admin] falha ao atualizar a fatura estornada:", r.erro);
    }

    await registrarEvento(admin, {
      shopId,
      actorId: perfil.id,
      action: "refund",
      reason: motivo,
      details: {
        asaas_payment_id: fatura.asaas_payment_id,
        asaas_installment_id: parcelamento,
        value: fatura.value,
        billing_type: fatura.billing_type,
        fora_do_prazo: dias > DIAS_ARREPENDIMENTO,
        assinatura_encerrada: assinaturaEncerrada,
      },
    });

    revalidatePath("/admin");
    revalidateTag(tagBarbearia(shopId));
    return sucesso(
      undefined,
      parcelamento
        ? "Estorno feito: todas as parcelas serão devolvidas no cartão."
        : fatura.billing_type === "PIX"
          ? "Estorno feito: o Pix volta na hora."
          : "Estorno feito: o valor volta na fatura do cartão.",
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AsaasErro) {
      console.error(
        "[admin] o Asaas recusou o estorno:",
        error.status,
        error.codigo,
        error.descricao,
      );
      return falha(`O Asaas recusou o estorno: ${error.descricao}`);
    }
    return falha(traduzirErroDesconhecido(error, "[admin] estornarFatura"));
  }
}

/* ==========================================================================
   Cancelar (sem estorno)
   ========================================================================== */

/**
 * Encerra a assinatura SEM devolver dinheiro: para de renovar, e o acesso vai
 * até o fim do período já pago. Cobrança ainda não paga (assinatura ou
 * parcelamento esperando o 1º pagamento) é removida no Asaas.
 *
 * Parcelamento JÁ PAGO não é tocado: as parcelas restantes continuam, como
 * dizem os Termos. Para devolver, é o estorno.
 */
export async function cancelarAssinaturaAdmin(entrada: {
  shopId: string;
  motivo: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireAdmin();
    const admin = createAdminClient();

    const motivo = entrada.motivo.trim();
    if (motivo.length < 3) return falha("Escreva o motivo do cancelamento.", "motivo");

    const { data: atual, error } = await admin
      .from("subscriptions")
      .select("*")
      .eq("barbershop_id", entrada.shopId)
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[admin] ler assinatura"));
    if (!atual) return falha("Assinatura não encontrada.");
    if (atual.status === "trialing" || atual.status === "canceled") {
      return falha(
        atual.status === "canceled"
          ? "Esta assinatura já está cancelada."
          : "A barbearia está no teste grátis: não há assinatura para cancelar.",
      );
    }

    const feito: string[] = [];
    if (atual.asaas_subscription_id) {
      await removerAssinatura(atual.asaas_subscription_id);
      feito.push("assinatura encerrada no Asaas");
    }
    if (atual.asaas_installment_id) {
      const parcelas = await parcelasDoParcelamento(atual.asaas_installment_id);
      const algumaPaga = parcelas.some((p) => STATUS_PAGO.includes(p.status));
      if (!algumaPaga) {
        await removerParcelamento(atual.asaas_installment_id);
        feito.push("parcelamento não pago removido no Asaas");
      }
    }

    const { error: erroGravar } = await admin
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("barbershop_id", entrada.shopId);
    if (erroGravar) return falha(traduzirErroBanco(erroGravar, "[admin] cancelar assinatura"));

    // As faturas que ainda pediam pagamento deixam de oferecer "Pagar agora".
    await admin
      .from("subscription_payments")
      .update({ status: "DELETED", updated_at: new Date().toISOString() })
      .eq("barbershop_id", entrada.shopId)
      .in("status", ["PENDING", "OVERDUE"]);

    await registrarEvento(admin, {
      shopId: entrada.shopId,
      actorId: perfil.id,
      action: "cancel",
      reason: motivo,
      details: { feito, paid_until: atual.paid_until },
    });

    revalidatePath("/admin");
    return sucesso(
      undefined,
      atual.paid_until && new Date(atual.paid_until) > new Date()
        ? "Assinatura cancelada. A barbearia segue até o fim do período pago."
        : "Assinatura cancelada.",
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AsaasErro) {
      console.error("[admin] o Asaas recusou o cancelamento:", error.status, error.descricao);
      return falha(`O Asaas recusou o cancelamento: ${error.descricao}`);
    }
    return falha(traduzirErroDesconhecido(error, "[admin] cancelarAssinaturaAdmin"));
  }
}

/* ==========================================================================
   Estender o teste
   ========================================================================== */

/**
 * Mais dias de teste grátis — negociação, ou um problema nosso que atrapalhou
 * o teste. Soma a partir do que for MAIOR entre o fim atual e agora: teste
 * vencido há uma semana ganha N dias a partir de hoje, não N dias no passado.
 */
export async function estenderTeste(entrada: {
  shopId: string;
  dias: number;
  motivo: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireAdmin();

    const dias = Math.round(entrada.dias);
    if (!(dias >= 1 && dias <= 60)) return falha("Escolha de 1 a 60 dias.", "dias");
    const motivo = entrada.motivo.trim();
    if (motivo.length < 3) return falha("Escreva o motivo.", "motivo");

    const admin = createAdminClient();
    const { data: atual, error } = await admin
      .from("subscriptions")
      .select("trial_ends_at")
      .eq("barbershop_id", entrada.shopId)
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[admin] ler assinatura"));
    if (!atual) return falha("Assinatura não encontrada.");

    const base = Math.max(new Date(atual.trial_ends_at).getTime(), Date.now());
    const novoFim = new Date(base + dias * 86_400_000).toISOString();

    const { error: erroGravar } = await admin
      .from("subscriptions")
      .update({ trial_ends_at: novoFim, updated_at: new Date().toISOString() })
      .eq("barbershop_id", entrada.shopId);
    if (erroGravar) return falha(traduzirErroBanco(erroGravar, "[admin] estender teste"));

    await registrarEvento(admin, {
      shopId: entrada.shopId,
      actorId: perfil.id,
      action: "extend_trial",
      reason: motivo,
      details: { dias, de: atual.trial_ends_at, para: novoFim },
    });

    revalidatePath("/admin");
    revalidateTag(tagBarbearia(entrada.shopId));
    return sucesso(undefined, `Teste estendido em ${dias} dia(s).`);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] estenderTeste"));
  }
}

/* ==========================================================================
   Auditoria
   ========================================================================== */

async function registrarEvento(
  admin: ReturnType<typeof createAdminClient>,
  e: {
    shopId: string;
    actorId: string;
    action: string;
    reason: string;
    details: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("subscription_events").insert({
    barbershop_id: e.shopId,
    actor_id: e.actorId,
    action: e.action,
    reason: e.reason,
    details: e.details as never,
  });
  // O efeito já aconteceu (no Asaas e aqui). Perder o registro é ruim, mas
  // desfazer um estorno por causa dele seria pior — fica no log do servidor.
  if (error) console.error("[admin] falha ao registrar na auditoria:", e.action, error);
}
