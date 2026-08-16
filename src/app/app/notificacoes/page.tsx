import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { ListaNotificacoes } from "@/components/client/ListaNotificacoes";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/types";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  const perfil = await requireRole(["client"]);

  let notificacoes: AppNotification[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) console.error("[notificações] falha ao listar:", error);
    else notificacoes = data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[notificações] erro inesperado ao listar:", error);
  }

  return (
    <>
      <PageHeader titulo="Notificações" voltarPara="/app" />
      <ListaNotificacoes notificacoes={notificacoes} />
    </>
  );
}
