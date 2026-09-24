import type { Metadata } from "next";

import { FormAbrirBarbearia } from "@/components/client/FormAbrirBarbearia";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Abrir minha barbearia" };

/**
 * O cliente que quer abrir a barbearia dele sem criar outra conta.
 * A regra toda está em `abrirMinhaBarbearia` (actions/client.ts).
 */
export default async function AbrirBarbeariaPage() {
  const perfil = await requireRole(["client"]);

  // Os horários que ele ainda tem pela frente como cliente: depois de virar
  // dono, o /app some para ele, e a tela precisa avisar ANTES.
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", new Date().toISOString());

  if (error) console.error("[abrir barbearia] falha ao contar os agendamentos:", error);

  return (
    <>
      <PageHeader titulo="Abrir minha barbearia" voltarPara="/app/perfil" />
      <FormAbrirBarbearia telefoneAtual={perfil.phone ?? ""} agendamentosFuturos={count ?? 0} />
    </>
  );
}
