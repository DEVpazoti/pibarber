/**
 * O que o DONO lê sobre as mensagens — em português de balcão, nunca em
 * código de erro da Meta.
 *
 * Sem import de servidor: a tela de configurações é "use client".
 */

import type { WhatsappStatus, WhatsappTemplateStatus } from "@/lib/types";

export const STATUS_MENSAGEM: Record<
  WhatsappStatus,
  { rotulo: string; tom: "neutro" | "brass" | "money" | "danger" | "info" }
> = {
  pending: { rotulo: "Aguardando", tom: "neutro" },
  sent: { rotulo: "Enviado", tom: "info" },
  delivered: { rotulo: "Entregue", tom: "money" },
  read: { rotulo: "Lido", tom: "money" },
  failed: { rotulo: "Falhou", tom: "danger" },
};

/**
 * O template está em condição de ser enviado?
 *
 * Só `approved` sai. Os outros:
 *   · `pending`  — a Meta ainda está analisando; nada é enfileirado até
 *     aprovar, e a tela avisa.
 *   · `rejected`, `paused`, `disabled` — a Meta recusaria cada envio. A tela
 *     troca o interruptor por "Indisponível no momento".
 */
export function templateIndisponivel(status: WhatsappTemplateStatus | null | undefined): boolean {
  return status === "rejected" || status === "paused" || status === "disabled";
}

/**
 * O `failure_code` traduzido. O código cru NUNCA vai para a tela.
 *
 * O dono não tem o que fazer com "130497" — e, pior, código cru parece defeito
 * do sistema quando quase sempre é o número do cliente. A frase diz de quem é
 * o problema e, quando há, o que fazer.
 */
export function explicarFalha(codigo: string | null | undefined): string {
  switch (codigo) {
    case "130497":
      return "Restrição da Meta para o país";
    case "131026":
      return "O número do cliente não usa WhatsApp";
    case "190":
      return "Integração desconectada — avise o suporte";
    case "OBSOLETA":
      return "Não enviada: o horário mudou antes";
    default:
      return "Não foi possível entregar";
  }
}
