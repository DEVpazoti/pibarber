import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { ListaEspera, type EsperaDoCliente } from "@/components/client/ListaEspera";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Lista de espera" };

export default async function EsperaPage() {
  const perfil = await requireRole(["client"]);

  let entradas: EsperaDoCliente[] = [];

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("waitlist_entries")
      .select(
        `id, desired_date, period, status,
         barbearia:barbershops!waitlist_entries_barbershop_id_fkey(name, slug)`,
      )
      .eq("profile_id", perfil.id)
      .in("status", ["waiting", "notified"])
      // Dia que já passou não é espera, é histórico morto.
      .gte("desired_date", hojeISO())
      .order("desired_date", { ascending: true });

    if (error) console.error("[espera] falha ao listar:", error);
    else {
      entradas = (data ?? []).map((e) => ({
        id: e.id,
        desired_date: e.desired_date,
        period: e.period,
        status: e.status,
        barbearia: one(e.barbearia),
      }));
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("[espera] erro inesperado ao listar:", error);
  }

  return (
    <>
      <PageHeader
        titulo="Lista de espera"
        descricao="O que você está aguardando vagar."
        voltarPara="/app/perfil"
      />
      <ListaEspera entradas={entradas} />
    </>
  );
}
