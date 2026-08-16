import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import { ConfiguracoesPainel } from "@/components/painel/ConfiguracoesPainel";
import { PageHeader } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { urlDoSite } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Amenity, BusinessHour } from "@/lib/types";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { shopId } = await requireOwnerContext();

  const supabase = await createClient();

  const { data: loja, error } = await supabase
    .from("barbershops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();

  if (error) console.error("[configurações] falha ao carregar a barbearia:", error);
  if (!loja) notFound();

  let horarios: BusinessHour[] = [];
  try {
    const { data, error: erroHorarios } = await supabase
      .from("business_hours")
      .select("*")
      .eq("barbershop_id", shopId)
      .order("weekday", { ascending: true });

    if (erroHorarios) console.error("[configurações] falha ao ler horários:", erroHorarios);
    else horarios = data ?? [];
  } catch (erro) {
    unstable_rethrow(erro);
    console.error("[configurações] erro inesperado ao ler horários:", erro);
  }

  // Benefícios (T-5): o catálogo é fechado e global; a seleção é da loja.
  // As duas consultas vão juntas — são as menores da página e uma sem a outra
  // não desenha nada.
  let catalogo: Amenity[] = [];
  let beneficiosMarcados: string[] = [];
  try {
    const [{ data: todos, error: erroCatalogo }, { data: meus, error: erroMeus }] =
      await Promise.all([
        supabase
          .from("amenities")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase.from("barbershop_amenities").select("amenity_id").eq("barbershop_id", shopId),
      ]);

    if (erroCatalogo) console.error("[configurações] falha ao ler o catálogo:", erroCatalogo);
    else catalogo = todos ?? [];

    if (erroMeus) console.error("[configurações] falha ao ler os benefícios:", erroMeus);
    else beneficiosMarcados = (meus ?? []).map((l) => l.amenity_id);
  } catch (erro) {
    unstable_rethrow(erro);
    console.error("[configurações] erro inesperado ao ler benefícios:", erro);
  }

  return (
    <>
      <PageHeader
        titulo="Configurações"
        descricao="Os dados da barbearia, o link público e o horário de funcionamento."
      />

      <ConfiguracoesPainel
        loja={loja}
        horarios={horarios}
        urlPublica={urlDoSite()}
        catalogoBeneficios={catalogo}
        beneficiosMarcados={beneficiosMarcados}
      />
    </>
  );
}
