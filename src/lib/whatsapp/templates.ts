import "server-only";

import { envWhatsapp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsappTemplateStatus } from "@/lib/types";
import { listarTemplates } from "@/lib/whatsapp/graph";

/**
 * O espelho local dos templates (`whatsapp_templates`) em dia com a Meta.
 *
 * O caminho normal é o webhook `message_template_status_update`. Mas ele só
 * chega se o campo foi assinado no painel da Meta — e é exatamente o passo que
 * se esquece. Sem ele, o template é aprovado lá, continua `pending` aqui, e
 * `enfileirar()` pula TODA mensagem para sempre, sem erro nenhum.
 *
 * Por isso o cron também confere, pela API. Só quando há template que não está
 * `approved`: com os três aprovados, não custa chamada nenhuma.
 */

/** Status da Meta (APPROVED, REJECTED…) → o nosso enum. `null` = não mexe. */
export function statusDeTemplate(statusMeta: string | null | undefined): WhatsappTemplateStatus | null {
  switch ((statusMeta ?? "").toUpperCase()) {
    case "APPROVED":
    case "REINSTATED":
      return "approved";
    case "PENDING":
    case "IN_APPEAL":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "PAUSED":
      return "paused";
    case "DISABLED":
    case "PENDING_DELETION":
    case "DELETED":
    case "LIMIT_EXCEEDED":
      return "disabled";
    default:
      // FLAGGED é aviso de qualidade, não mudança de estado: o template
      // continua enviando. Qualquer valor novo que a Meta inventar também não
      // derruba um template que está funcionando.
      return null;
  }
}

export async function sincronizarTemplates(): Promise<{ conferidos: number; atualizados: number }> {
  const resumo = { conferidos: 0, atualizados: 0 };
  if (!envWhatsapp()) return resumo;

  const admin = createAdminClient();

  const { data: locais, error } = await admin
    .from("whatsapp_templates")
    .select("id, meta_name, language, status");
  if (error) throw new Error(`[whatsapp] ler templates: ${error.message}`);

  const pendentes = (locais ?? []).filter((t) => t.status !== "approved");
  resumo.conferidos = pendentes.length;
  if (pendentes.length === 0) return resumo;

  const remotos = await listarTemplates();

  for (const local of pendentes) {
    const remoto = remotos.find(
      (r) => r.name === local.meta_name && (!r.language || r.language === local.language),
    );
    if (!remoto) continue;

    const novo = statusDeTemplate(remoto.status);
    if (!novo || novo === local.status) continue;

    const { error: erroGravar } = await admin
      .from("whatsapp_templates")
      .update({
        status: novo,
        // A Meta devolve "NONE" quando não há motivo.
        reject_reason:
          remoto.rejected_reason && remoto.rejected_reason !== "NONE" ? remoto.rejected_reason : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", local.id);

    if (erroGravar) {
      console.error("[whatsapp] falha ao atualizar template:", local.meta_name, erroGravar.message);
    } else {
      resumo.atualizados++;
    }
  }

  return resumo;
}
