import type { Plan, SubscriptionCycle } from "@/lib/types";

/**
 * Textos e contas de TELA da assinatura. Pode ser importado do cliente.
 *
 * A regra de "pode operar ou não" NÃO mora aqui — é `assinatura_liberada()`,
 * no banco (26_assinaturas.sql), e chega pronta no contexto do painel. Este
 * arquivo só decide o que escrever: "faltam 3 dias", "Anual", "2 a 4
 * profissionais". Os preços também não: vêm da view `plan_prices`.
 */

/** As duas formas aceitas (decisão do negócio). Boleto fica de fora. */
export type FormaDePagamento = "PIX" | "CREDIT_CARD";

export const CICLOS: { id: SubscriptionCycle; rotulo: string; meses: number; selo?: string }[] = [
  { id: "monthly", rotulo: "Mensal", meses: 1 },
  { id: "semiannual", rotulo: "Semestral", meses: 6, selo: "−10%" },
  { id: "annual", rotulo: "Anual", meses: 12, selo: "−20%" },
];

export function rotuloDoCiclo(ciclo: SubscriptionCycle | null | undefined): string {
  return CICLOS.find((c) => c.id === ciclo)?.rotulo ?? "";
}

/** "1 profissional", "2 a 4 profissionais". */
export function faixaDoPlano(plano: Pick<Plan, "min_professionals" | "max_professionals">): string {
  if (plano.min_professionals === plano.max_professionals) {
    return plano.max_professionals === 1
      ? "1 profissional"
      : `${plano.max_professionals} profissionais`;
  }
  return `${plano.min_professionals} a ${plano.max_professionals} profissionais`;
}

/**
 * Dias inteiros até `ate`, arredondando para CIMA: faltando 26 horas, são "2
 * dias" — dizer "1 dia" faria o dono achar que perde o acesso amanhã cedo.
 * Zero ou negativo = já passou.
 */
export function diasAte(ate: string | Date, agora = new Date()): number {
  const fim = typeof ate === "string" ? new Date(ate) : ate;
  return Math.ceil((fim.getTime() - agora.getTime()) / 86_400_000);
}

/** Os mesmos 1 dia de tolerância de `assinatura_liberada()`, para a tela avisar. */
export const TOLERANCIA_DIAS = 1;

export function fimDaTolerancia(paidUntil: string): Date {
  return new Date(new Date(paidUntil).getTime() + TOLERANCIA_DIAS * 86_400_000);
}

/**
 * O parcelado não renova sozinho. A renovação abre neste número de dias antes
 * do fim do período pago — a tela oferece "Renovar" e a action aceita.
 */
export const DIAS_PARA_RENOVAR = 15;

/**
 * A situação de uma fatura (status do Asaas) em português, com o tom da
 * etiqueta. Um mapa só para a tela do dono e a do /admin: antes, cada uma
 * tratava alguns status e o resto caía em "Em aberto" — inclusive fatura
 * CANCELADA, que aparecia como se ainda devesse ser paga.
 */
export function situacaoDaFatura(status: string): {
  texto: string;
  tom: "money" | "danger" | "neutro" | "info" | "brass";
} {
  switch (status.toUpperCase()) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return { texto: "Paga", tom: "money" };
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return { texto: "Em aberto", tom: "info" };
    case "OVERDUE":
      return { texto: "Vencida", tom: "danger" };
    case "REFUNDED":
      return { texto: "Estornada", tom: "neutro" };
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return { texto: "Estorno em andamento", tom: "brass" };
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return { texto: "Contestada no cartão", tom: "danger" };
    case "DELETED":
      return { texto: "Cancelada", tom: "neutro" };
    default:
      return { texto: status, tom: "neutro" };
  }
}
