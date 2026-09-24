import type { Metadata } from "next";

import { FeedbacksAdmin, type RelatoNoAdmin } from "@/components/admin/FeedbacksAdmin";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatos dos barbeiros" };

/**
 * Os relatos que os barbeiros mandam pelo "Reportar problema" do painel.
 *
 * A lista é lida pelo cliente do próprio admin (a RLS de `feedbacks` só deixa
 * o admin da plataforma ler). O print mora num bucket PRIVADO: o link para
 * vê-lo é assinado aqui, pela service role, depois de `requireAdmin()`, e vale
 * uma hora.
 */
export default async function FeedbacksPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("feedbacks")
    .select(
      `id, kind, message, page, context, attachment_path, status, created_at,
       loja:barbershops(name, slug, whatsapp, phone),
       autor:profiles(full_name, email, phone)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) console.error("[admin] falha ao listar relatos:", error);

  const linhas = data ?? [];

  // Links assinados, de uma vez, só para quem tem print.
  const caminhos = linhas.map((l) => l.attachment_path).filter((c): c is string => Boolean(c));
  const links = new Map<string, string>();
  if (caminhos.length > 0) {
    const { data: assinados, error: erroLinks } = await createAdminClient()
      .storage.from("feedbacks")
      .createSignedUrls(caminhos, 3600);
    if (erroLinks) console.error("[admin] falha ao assinar os prints:", erroLinks);
    for (const a of assinados ?? []) if (a.path && a.signedUrl) links.set(a.path, a.signedUrl);
  }

  const relatos: RelatoNoAdmin[] = linhas.map((l) => {
    const loja = one(l.loja);
    const autor = one(l.autor);
    return {
      id: l.id,
      tipo: l.kind as RelatoNoAdmin["tipo"],
      mensagem: l.message,
      pagina: l.page,
      contexto: (l.context ?? {}) as Record<string, unknown>,
      status: l.status as RelatoNoAdmin["status"],
      criadoEm: l.created_at,
      printUrl: l.attachment_path ? (links.get(l.attachment_path) ?? null) : null,
      loja: loja?.name ?? "Barbearia removida",
      slug: loja?.slug ?? null,
      autor: autor?.full_name ?? autor?.email ?? "Conta removida",
      // Para "Responder no WhatsApp": o celular de quem escreveu; sem ele, o
      // WhatsApp da loja.
      telefone: autor?.phone ?? loja?.whatsapp ?? loja?.phone ?? null,
    };
  });

  return (
    <>
      <PageHeader
        titulo="Relatos dos barbeiros"
        descricao="Problemas, sugestões e elogios enviados pelo painel. Responda pelo WhatsApp e marque como resolvido."
      />
      <FeedbacksAdmin relatos={relatos} />
    </>
  );
}
