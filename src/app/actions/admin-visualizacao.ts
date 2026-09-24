"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_VISUALIZACAO, DURACAO_VISUALIZACAO_SEG, lojaDoCookie } from "@/lib/visualizacao";

/**
 * Liga e desliga o "Ver como o dono" (ver src/lib/visualizacao.ts).
 *
 * Toda abertura fica em `admin_audit`: o admin vai enxergar clientes,
 * telefones e valores de uma barbearia que não é dele, e isso precisa deixar
 * rastro de quem, qual loja e quando. Sem conseguir registrar, não abre.
 */
export async function iniciarVisualizacao(shopId: string): Promise<void> {
  const perfil = await requireAdmin();
  const loja = lojaDoCookie(shopId);
  if (!loja) redirect("/admin/barbearias");

  const supabase = await createClient();
  const { data } = await supabase.from("barbershops").select("id").eq("id", loja).maybeSingle();
  if (!data) redirect("/admin/barbearias");

  const { error } = await supabase.from("admin_audit").insert({
    actor_id: perfil.id,
    barbershop_id: loja,
    action: "view_as_owner",
  });
  if (error) {
    console.error("[admin] não registrou a visualização — não abre:", error);
    redirect(`/admin/barbearias/${loja}?erro=visualizacao`);
  }

  (await cookies()).set(COOKIE_VISUALIZACAO, loja, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_VISUALIZACAO_SEG,
  });

  redirect("/painel");
}

export async function encerrarVisualizacao(): Promise<void> {
  await requireAdmin();
  const jar = await cookies();
  const loja = lojaDoCookie(jar.get(COOKIE_VISUALIZACAO)?.value);
  jar.delete(COOKIE_VISUALIZACAO);
  redirect(loja ? `/admin/barbearias/${loja}` : "/admin");
}
