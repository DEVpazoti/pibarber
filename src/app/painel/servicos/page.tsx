import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { ServicosPainel, type ServicoDaLista } from "@/components/painel/ServicosPainel";
import { PageHeader } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Serviços" };

/**
 * O catálogo. O assistente enxerga (precisa, para agendar) e não edita.
 */
export default async function ServicosPage() {
  const { shopId, podeVerDinheiro } = await requireShopContext();

  let servicos: ServicoDaLista[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("services")
      .select("id, name, description, price, duration_minutes, is_active")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) console.error("[serviços] falha ao listar:", error);
    else servicos = (data ?? []).map((s) => ({ ...s, price: Number(s.price) }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[serviços] erro inesperado ao listar:", error);
  }

  return (
    <>
      <PageHeader
        titulo="Serviços"
        descricao={
          podeVerDinheiro
            ? "Preço e duração. A duração é o que reserva a cadeira na agenda."
            : "Lista de serviços da barbearia. Só o dono edita."
        }
      />

      <ServicosPainel servicos={servicos} podeEditar={podeVerDinheiro} />
    </>
  );
}
