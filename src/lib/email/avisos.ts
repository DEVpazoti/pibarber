import "server-only";

import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";

import {
  dadosDosAgendamentosEmail,
  despacharEmail,
  enfileirarEmail,
  paramsDoAgendamento,
  type ResultadoEnfileirarEmail,
} from "@/lib/email/fila";
import { envEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O GANCHO DAS SERVER ACTIONS PARA E-MAIL — irmão de `avisarPorWhatsapp`.
 *
 * ⚠️ NUNCA LANÇA. E-mail é efeito colateral: o agendamento vale mesmo com o
 * Resend fora do ar. O erro vai para o log e para mais nenhum lugar.
 *
 *   agendado             → dono ("Novo agendamento") + cliente ("Agendado")
 *   cancelado_pelo_cliente → dono ("Um cliente cancelou")
 *   cancelado_pela_loja  → cliente ("Seu horário foi cancelado")
 *
 * O cliente que cancelou sozinho não recebe e-mail: ele acabou de ver o
 * "Cancelado" na tela. O dono que cancelou pelo painel também não.
 */
export type EventoEmail = "agendado" | "cancelado_pelo_cliente" | "cancelado_pela_loja";

export async function avisarPorEmail(
  evento: EventoEmail,
  alvo: { appointmentId: string } | { token: string },
): Promise<void> {
  try {
    if (!envEmail()) return;
    const admin = createAdminClient();

    let appointmentId: string;
    if ("appointmentId" in alvo) {
      appointmentId = alvo.appointmentId;
    } else {
      const { data, error } = await admin
        .from("appointments")
        .select("id")
        .eq("public_token", alvo.token)
        .maybeSingle();
      if (error) throw new Error(`ler agendamento pelo token: ${error.message}`);
      if (!data) return;
      appointmentId = data.id;
    }

    const [linha] = await dadosDosAgendamentosEmail(admin, [appointmentId]);
    if (!linha) return;

    const base = { barbershopId: linha.barbershop_id, appointmentId: linha.appointment_id };
    const pedidos: Promise<ResultadoEnfileirarEmail>[] = [];

    if (evento === "agendado") {
      if (linha.aviso_novo_ligado) {
        pedidos.push(
          enfileirarEmail({
            ...base,
            tipo: "novo_agendamento",
            para: linha.dono_email,
            chave: `novo:${linha.appointment_id}`,
            params: paramsDoAgendamento(linha, "dono"),
          }),
        );
      }
      pedidos.push(
        enfileirarEmail({
          ...base,
          tipo: "confirmacao",
          para: linha.cliente_email,
          chave: `confirmacao:${linha.appointment_id}`,
          params: paramsDoAgendamento(linha, "cliente"),
        }),
      );
    } else if (evento === "cancelado_pelo_cliente") {
      if (linha.aviso_cancelado_ligado) {
        pedidos.push(
          enfileirarEmail({
            ...base,
            tipo: "cancelamento_dono",
            para: linha.dono_email,
            chave: `cancelamento-dono:${linha.appointment_id}`,
            params: paramsDoAgendamento(linha, "dono"),
          }),
        );
      }
    } else {
      pedidos.push(
        enfileirarEmail({
          ...base,
          tipo: "cancelamento",
          para: linha.cliente_email,
          chave: `cancelamento:${linha.appointment_id}`,
          params: paramsDoAgendamento(linha, "cliente"),
        }),
      );
    }

    const ids = (await Promise.allSettled(pedidos)).flatMap((r) => {
      if (r.status === "rejected") {
        console.error(
          "[email] não consegui enfileirar:",
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
        return [];
      }
      return r.value.tipo === "enfileirada" ? [r.value.id] : [];
    });

    if (ids.length === 0) return;

    // Envia depois que a resposta saiu; o que falhar, o cron pega.
    after(async () => {
      for (const id of ids) {
        try {
          await despacharEmail(id);
        } catch (e) {
          console.error("[email] envio imediato falhou; fica para o cron:", {
            id,
            erro: e instanceof Error ? e.message : e,
          });
        }
      }
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error(
      `[email] aviso (${evento}) falhou — a ação seguiu normal:`,
      e instanceof Error ? e.message : e,
    );
  }
}
