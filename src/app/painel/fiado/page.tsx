import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { FiadoPainel, type DividaAberta } from "@/components/painel/FiadoPainel";
import { PageHeader, StatCard } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brl, hojeISO, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Fiado" };

/**
 * FIADO — dono E assistente.
 *
 * Não é exceção à regra do dinheiro: fiado é informação operacional. Quem
 * atende no balcão precisa saber quem está devendo para poder cobrar. A RLS de
 * `debts` usa `has_shop_access`, e não `can_manage_money`, exatamente por isso.
 */
export default async function FiadoPage() {
  const { shopId } = await requireShopContext();

  const { dividas, nomeBarbearia } = await carregarDividas(shopId);

  const total = dividas.reduce((acc, d) => acc + (d.original_amount - d.paid_amount), 0);
  const hoje = hojeISO();
  const vencidas = dividas.filter((d) => d.due_date != null && d.due_date < hoje);
  const totalVencido = vencidas.reduce(
    (acc, d) => acc + (d.original_amount - d.paid_amount),
    0,
  );

  return (
    <>
      <PageHeader
        titulo="Fiado"
        descricao={`Quem tá devendo na ${nomeBarbearia}, do mais antigo para o mais novo.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          rotulo="Total em aberto"
          valor={brl(total)}
          dica={`${dividas.length} ${dividas.length === 1 ? "pessoa" : "pessoas"}`}
          tom="brass"
        />
        <StatCard
          rotulo="Vencido"
          valor={brl(totalVencido)}
          dica={`${vencidas.length} ${vencidas.length === 1 ? "cobrança" : "cobranças"}`}
          tom={totalVencido > 0 ? "danger" : "neutro"}
        />
      </div>

      <FiadoPainel dividas={dividas} />
    </>
  );
}

async function carregarDividas(
  shopId: string,
): Promise<{ dividas: DividaAberta[]; nomeBarbearia: string }> {
  let nomeBarbearia = "barbearia";

  try {
    const supabase = await createClient();

    const { data: loja, error: erroLoja } = await supabase
      .from("barbershops")
      .select("name")
      .eq("id", shopId)
      .maybeSingle();

    if (erroLoja) console.error("[fiado] falha ao ler o nome da barbearia:", erroLoja);
    else if (loja?.name) nomeBarbearia = loja.name;

    const { data, error } = await supabase
      .from("debts")
      .select(
        `id, original_amount, paid_amount, due_date, created_at, status,
         cliente:customers!debts_customer_id_fkey(id, full_name, phone)`,
      )
      .eq("barbershop_id", shopId)
      .in("status", ["open", "partial"])
      // Do mais antigo para o mais novo: é a ordem em que se cobra.
      .order("created_at", { ascending: true })
      .limit(300);

    if (error) {
      console.error("[fiado] falha ao listar dívidas:", error);
      return { dividas: [], nomeBarbearia };
    }

    const dividas: DividaAberta[] = (data ?? []).map((d) => ({
      id: d.id,
      original_amount: Number(d.original_amount),
      paid_amount: Number(d.paid_amount),
      due_date: d.due_date,
      created_at: d.created_at,
      status: d.status as "open" | "partial",
      cliente: one(d.cliente),
      barbearia: nomeBarbearia,
    }));

    return { dividas, nomeBarbearia };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[fiado] erro inesperado ao listar dívidas:", error);
    return { dividas: [], nomeBarbearia };
  }
}
