"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * O intervalo do e-mail de volta ("bora voltar?"), em dias depois da última
 * visita. É da PLATAFORMA — as lojas só ligam e desligam (31_emails.sql).
 */
export async function salvarIntervaloVolta(dias: number): Promise<ActionResult> {
  try {
    const perfil = await requireAdmin();
    if (!Number.isInteger(dias) || dias < 7 || dias > 120) {
      return falha("Use um número inteiro de 7 a 120 dias.", "dias");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("platform_settings")
      .update({ value: dias, updated_by: perfil.id, updated_at: new Date().toISOString() })
      .eq("key", "recorrencia_dias");
    if (error) return falha(traduzirErroBanco(error, "[admin] salvar intervalo de volta"));

    revalidatePath("/admin/emails");
    revalidatePath("/painel/configuracoes");
    return sucesso(undefined, `Salvo: ${dias} dias.`);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] salvarIntervaloVolta"));
  }
}
