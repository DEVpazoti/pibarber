import "server-only";

import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";

import { envWhatsapp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { montarParametros } from "@/lib/whatsapp/catalogo";
import {
  buscarDadosDosAgendamentos,
  dadosDaMensagem,
  despacharUma,
  enfileirar,
} from "@/lib/whatsapp/fila";

/**
 * O GANCHO DAS SERVER ACTIONS — a única função de WhatsApp que elas chamam.
 *
 * ⚠️ ESTA FUNÇÃO NUNCA LANÇA. É a regra que importa: o WhatsApp é efeito
 * colateral do agendamento, não parte dele. Se a Meta estiver fora do ar, se
 * o banco engasgar na fila, se faltar variável, o cliente AGENDA do mesmo
 * jeito e lê "Agendamento confirmado!". O erro vai para o log e para mais
 * nenhum lugar — nunca vira `falha()`.
 *
 * Duas fases, e a separação é deliberada:
 *
 *   1. ENFILEIRAR — antes de a action responder. É rápido (duas leituras e um
 *      insert) e é o que garante que a mensagem existe mesmo se o resto der
 *      errado: o cron pega depois.
 *   2. ENVIAR — em `after()`, DEPOIS que a resposta já saiu. A chamada à Meta
 *      pode levar até 15s; ela não pode segurar a tela de "Agendado!". É o que
 *      faz a confirmação chegar em segundos em vez de esperar os 5 minutos
 *      do cron.
 */
export async function avisarPorWhatsapp(
  evento: "confirmation" | "cancellation",
  alvo: { appointmentId: string } | { token: string },
): Promise<void> {
  try {
    // Ambiente sem credencial (o dev local): nem abre conexão com o banco.
    if (!envWhatsapp()) return;

    const admin = createAdminClient();

    let appointmentId: string;
    if ("appointmentId" in alvo) {
      appointmentId = alvo.appointmentId;
    } else {
      // O agendamento público devolve só o token para a tela. O id sai daqui.
      const { data, error } = await admin
        .from("appointments")
        .select("id")
        .eq("public_token", alvo.token)
        .maybeSingle();
      if (error) throw new Error(`ler agendamento pelo token: ${error.message}`);
      if (!data) return;
      appointmentId = data.id;
    }

    const [linha] = await buscarDadosDosAgendamentos(admin, [appointmentId]);
    if (!linha) return;

    // O interruptor da barbearia (/painel/configuracoes).
    const ligado =
      evento === "confirmation" ? linha.confirmacao_ligada : linha.cancelamento_ligado;
    if (!ligado) return;

    const resultado = await enfileirar({
      barbershopId: linha.barbershop_id,
      appointmentId: linha.appointment_id,
      evento,
      telefone: linha.telefone,
      params: montarParametros(evento, dadosDaMensagem(evento, linha)),
    });

    if (resultado.tipo !== "enfileirada") return;

    after(async () => {
      try {
        await despacharUma(resultado.id);
      } catch (e) {
        // Sem problema: a linha continua `pending` e o cron tenta de novo.
        console.error("[whatsapp] envio imediato falhou; fica para o cron:", {
          id: resultado.id,
          erro: e instanceof Error ? e.message : e,
        });
      }
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[whatsapp] não consegui enfileirar (${evento}) — o agendamento seguiu normal:`, {
      alvo: "appointmentId" in alvo ? alvo.appointmentId : "token",
      erro: e instanceof Error ? e.message : e,
    });
  }
}
