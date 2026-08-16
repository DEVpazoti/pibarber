import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { EsperaPainel, type EsperaNoPainel } from "@/components/painel/EsperaPainel";
import { PageHeader } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { carregarProfissionais, carregarServicos } from "@/lib/queries/agenda";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Lista de espera" };

export default async function EsperaPainelPage() {
  const { shopId } = await requireShopContext();

  const [entradas, profissionais, servicos] = await Promise.all([
    carregar(shopId),
    carregarProfissionais(shopId),
    carregarServicos(shopId),
  ]);

  return (
    <>
      <PageHeader
        titulo="Lista de espera"
        descricao="Quem está esperando vaga, por dia e período. Encaixe direto na agenda."
      />
      <EsperaPainel entradas={entradas} profissionais={profissionais} servicos={servicos} />
    </>
  );
}

async function carregar(shopId: string): Promise<EsperaNoPainel[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("waitlist_entries")
      .select(
        `id, desired_date, period, status, created_at,
         pessoa:profiles!waitlist_entries_profile_id_fkey(full_name, phone),
         profissional:professionals!waitlist_entries_professional_id_fkey(name, nickname),
         servico:services!waitlist_entries_service_id_fkey(name)`,
      )
      .eq("barbershop_id", shopId)
      .in("status", ["waiting", "notified"])
      // Dia que já passou não é fila, é lixo na tela.
      .gte("desired_date", hojeISO())
      .order("desired_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[espera] falha ao listar:", error);
      return [];
    }

    return (data ?? []).map((e) => {
      const prof = one(e.profissional);
      return {
        id: e.id,
        desired_date: e.desired_date,
        period: e.period,
        status: e.status,
        created_at: e.created_at,
        pessoa: one(e.pessoa),
        profissional: prof ? (prof.nickname ?? prof.name) : null,
        servico: one(e.servico)?.name ?? null,
      };
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[espera] erro inesperado ao listar:", error);
    return [];
  }
}
