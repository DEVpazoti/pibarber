"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * Notas internas da PiSystem sobre uma barbearia ("ligou dia 12, assina em
 * outubro"). Só os admins veem — a RLS de `admin_notes` garante, e a nota vai
 * sempre em nome de quem escreveu.
 */

export async function adicionarNota(shopId: string, texto: string): Promise<ActionResult> {
  try {
    const perfil = await requireAdmin();
    const body = texto.trim();
    if (!body) return falha("Escreva a nota.");
    if (body.length > 2000) return falha("Use no máximo 2.000 caracteres.");

    const supabase = await createClient();
    const { error } = await supabase
      .from("admin_notes")
      .insert({ barbershop_id: shopId, author_id: perfil.id, body });
    if (error) return falha(traduzirErroBanco(error, "[admin] adicionar nota"));

    revalidatePath(`/admin/barbearias/${shopId}`);
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] adicionarNota"));
  }
}

export async function apagarNota(id: string, shopId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("admin_notes").delete().eq("id", id);
    if (error) return falha(traduzirErroBanco(error, "[admin] apagar nota"));

    revalidatePath(`/admin/barbearias/${shopId}`);
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] apagarNota"));
  }
}
