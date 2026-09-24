import "server-only";

import { revalidateTag } from "next/cache";

import { cobrancasDaAssinatura, parcelasDoParcelamento, type AsaasCobranca } from "@/lib/asaas";
import { tagBarbearia } from "@/lib/queries/barbearia";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O que fazer com uma cobrança do Asaas — num lugar só, porque ela chega por
 * DOIS caminhos:
 *
 *   1. o webhook (`/api/webhooks/asaas`), o caminho normal;
 *   2. a conferência direta (`sincronizarComAsaas`), quando o dono abre
 *      /assinatura com fatura pendente. É a rede de segurança: webhook
 *      desligado, fila pausada no Asaas, túnel fora do ar em dev — o dono pagou
 *      e não pode ficar esperando um aviso que não vem.
 *
 * Os dois chegam às MESMAS funções do banco, que já são idempotentes: o
 * espelho é upsert pelo id da cobrança e `assinatura_pagamento_confirmado()`
 * só empurra o período para a frente. Processar a mesma cobrança pelos dois
 * caminhos não dá período em dobro.
 *
 * Decide pelo STATUS da cobrança, não pelo nome do evento: a conferência
 * direta não tem evento, e o status é a verdade do Asaas nos dois casos.
 */

/** Dinheiro entrou. RECEIVED_IN_CASH = baixa manual no painel do Asaas. */
const STATUS_PAGO = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

/** O dinheiro voltou para o dono (estorno) ou está voltando (chargeback). */
const STATUS_ESTORNADO = new Set(["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"]);

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoCobranca =
  { ok: true; shopId: string | null; liberou: boolean } | { ok: false; erro: unknown };

export async function registrarCobranca(
  admin: Admin,
  cobranca: AsaasCobranca,
  opcoes: {
    apagada?: boolean;
    /**
     * Falso quando chamada durante a renderização de uma página: o Next 15
     * não permite `revalidateTag` ali. O webhook revalida; a conferência feita
     * pela página, não — a página pública só atualiza no fim do cache.
     */
    revalidar?: boolean;
  } = {},
): Promise<ResultadoCobranca> {
  // Duas origens: parcela de uma ASSINATURA do Asaas (mensal, ou à vista) ou
  // parcela de um PARCELAMENTO no cartão (semestral 6x, anual 12x).
  const chave = cobranca.subscription
    ? { coluna: "asaas_subscription_id" as const, valor: cobranca.subscription }
    : cobranca.installment
      ? { coluna: "asaas_installment_id" as const, valor: cobranca.installment }
      : null;
  if (!chave) return { ok: true, shopId: null, liberou: false };

  const { data: assinatura, error: erroAssinatura } = await admin
    .from("subscriptions")
    .select("barbershop_id, plan_id, cycle, status, installment_first_due")
    .eq(chave.coluna, chave.valor)
    .maybeSingle();

  if (erroAssinatura) return { ok: false, erro: erroAssinatura };
  // Assinatura removida (o dono trocou de plano antes de pagar) ou de outro
  // ambiente: nada a fazer.
  if (!assinatura) return { ok: true, shopId: null, liberou: false };

  const shopId = assinatura.barbershop_id;
  const pago = STATUS_PAGO.has(cobranca.status);
  const pagoEm = cobranca.clientPaymentDate ?? cobranca.paymentDate ?? cobranca.confirmedDate;

  const { error: erroEspelho } = await admin.from("subscription_payments").upsert(
    {
      barbershop_id: shopId,
      asaas_payment_id: cobranca.id,
      plan_id: assinatura.plan_id,
      cycle: assinatura.cycle,
      value: cobranca.value,
      billing_type: cobranca.billingType,
      status: opcoes.apagada ? "DELETED" : cobranca.status,
      due_date: cobranca.dueDate,
      // Meio-dia de Brasília: a data do Asaas é só o dia, e meia-noite UTC
      // viraria o dia anterior na tela. Só escreve quando está pago: um
      // estorno depois NÃO apaga quando o pagamento aconteceu.
      ...(pago && pagoEm ? { paid_at: new Date(`${pagoEm}T12:00:00-03:00`).toISOString() } : {}),
      invoice_url: cobranca.invoiceUrl ?? null,
      installment_number: cobranca.installmentNumber ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "asaas_payment_id" },
  );
  if (erroEspelho) return { ok: false, erro: erroEspelho };

  if (pago) {
    // O período começa no vencimento da cobrança — ou, no parcelado, no da
    // 1ª parcela: qualquer parcela confirmada libera o período INTEIRO, porque
    // o cartão já aprovou o valor todo.
    const { error } = cobranca.subscription
      ? await admin.rpc("assinatura_pagamento_confirmado", {
          p_asaas_subscription: cobranca.subscription,
          p_due_date: cobranca.dueDate,
        })
      : await admin.rpc("assinatura_periodo_pago", {
          p_shop: shopId,
          p_inicio: assinatura.installment_first_due ?? cobranca.dueDate,
        });
    if (error) return { ok: false, erro: error };
  } else if (STATUS_ESTORNADO.has(cobranca.status) && assinatura.status !== "canceled") {
    // Estorno que NÃO passou pelo /admin (feito direto no painel do Asaas, ou
    // um chargeback do cartão). O do /admin já deixou `canceled` e registrou
    // o evento antes — este ramo não roda para ele.
    const { error } = await admin.rpc("assinatura_estornada", { p_shop: shopId });
    if (error) return { ok: false, erro: error };
    const { error: erroEvento } = await admin.from("subscription_events").insert({
      barbershop_id: shopId,
      action: "external_refund",
      reason: `Asaas: ${cobranca.status}`,
      details: { asaas_payment_id: cobranca.id, value: cobranca.value },
    });
    if (erroEvento) console.error("[assinatura] falha ao registrar o estorno externo:", erroEvento);
  } else if (cobranca.status === "OVERDUE" && assinatura.status === "active") {
    // Venceu sem pagar: só a marca, para a tela avisar. Quem corta o acesso é
    // o relógio, em `assinatura_liberada()` — com o 1 dia de tolerância.
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("barbershop_id", shopId);
    if (error) console.error("[assinatura] falha ao marcar past_due:", error);
  }

  // A página pública guarda "aceita agendamento" por alguns minutos.
  if (opcoes.revalidar !== false) revalidateTag(tagBarbearia(shopId));
  return { ok: true, shopId, liberou: pago };
}

/**
 * Confere direto no Asaas as cobranças da assinatura da loja e registra o que
 * mudou. Só é chamada com fatura pendente — em dia, não há o que conferir, e
 * não vale uma ida ao Asaas a cada visita da página.
 *
 * Nunca lança: é rede de segurança. Se o Asaas estiver fora, a página abre
 * com o que já sabe, e o webhook resolve depois.
 */
export async function sincronizarComAsaas(origem: {
  assinatura?: string | null;
  parcelamento?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const cobrancas = origem.assinatura
      ? (await cobrancasDaAssinatura(origem.assinatura)).map((c) => ({
          ...c,
          subscription: origem.assinatura,
        }))
      : origem.parcelamento
        ? (await parcelasDoParcelamento(origem.parcelamento)).map((c) => ({
            ...c,
            installment: origem.parcelamento,
          }))
        : [];
    for (const c of cobrancas) {
      const r = await registrarCobranca(admin, c, { revalidar: false });
      if (!r.ok) console.error("[assinatura] falha ao registrar cobrança conferida:", r.erro);
    }
  } catch (error) {
    console.error("[assinatura] falha ao conferir no Asaas:", error);
  }
}

/**
 * A assinatura ou o parcelamento que está valendo JÁ recebeu algum pagamento?
 *
 * Separa duas situações que têm o mesmo `status = active`:
 *   - o plano PAGO e em vigor (não se troca pelo painel);
 *   - a escolha AGENDADA e ainda não paga, feita por quem tem período pago
 *     sobrando (renovação do parcelado, ou quem cancelou e voltou). Essa o
 *     dono pode trocar à vontade até pagar — errar a forma de pagamento e não
 *     conseguir mudar era um beco sem saída.
 *
 * Na dúvida (Asaas fora do ar), responde que SIM: melhor recusar a troca uma
 * vez do que apagar um plano que o dono pagou.
 */
export async function temPagamentoConfirmado(origem: {
  assinatura?: string | null;
  parcelamento?: string | null;
}): Promise<boolean> {
  try {
    const cobrancas = origem.assinatura
      ? await cobrancasDaAssinatura(origem.assinatura)
      : origem.parcelamento
        ? await parcelasDoParcelamento(origem.parcelamento)
        : [];
    return cobrancas.some((c) => STATUS_PAGO.has(c.status));
  } catch (error) {
    console.error("[assinatura] falha ao conferir pagamentos no Asaas:", error);
    return true;
  }
}
