import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { CaixaExtrato, type Lancamento } from "@/components/painel/CaixaExtrato";
import { SeletorPeriodo } from "@/components/painel/SeletorPeriodo";
import { PageHeader, StatCard } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/periodo";
import { createClient } from "@/lib/supabase/server";
import { brl } from "@/lib/utils";

export const metadata: Metadata = { title: "Caixa" };

/**
 * O CAIXA — só o dono.
 *
 * Duas camadas guardam esta tela: `requireOwnerContext()` aqui, e a RLS de
 * `transactions`, que exige `can_manage_money`. O assistente que digitar
 * /painel/caixa na barra volta para /painel, e se chamasse a API REST direto
 * receberia zero linha.
 */
export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; de?: string; ate?: string }>;
}) {
  const { shopId } = await requireOwnerContext();
  const periodo = resolverPeriodo(await searchParams);

  const lancamentos = await carregarLancamentos(shopId, periodo.de, periodo.ate);

  const entrou = lancamentos
    .filter((l) => l.type === "income")
    .reduce((acc, l) => acc + l.amount, 0);
  const saiu = lancamentos
    .filter((l) => l.type === "expense")
    .reduce((acc, l) => acc + l.amount, 0);

  return (
    <>
      <PageHeader
        titulo="Caixa"
        descricao="Tudo que entrou e tudo que saiu, no período escolhido."
      />

      <SeletorPeriodo periodo={periodo} />

      {/* Duas colunas no celular: três valores de dinheiro lado a lado em
          375px espremem "R$ 1.234,56" a ponto de não caber. "Sobrou" ocupa a
          linha inteira embaixo — é a conclusão, e merece o destaque. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          rotulo="Entrou"
          valor={brl(entrou)}
          tom="money"
          icone={<ArrowUpRight className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          rotulo="Saiu"
          valor={brl(saiu)}
          tom="danger"
          icone={<ArrowDownLeft className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          rotulo="Sobrou"
          valor={brl(entrou - saiu)}
          tom={entrou - saiu >= 0 ? "brass" : "danger"}
          icone={<Scale className="h-4 w-4" aria-hidden />}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <CaixaExtrato lancamentos={lancamentos} />
    </>
  );
}

async function carregarLancamentos(
  shopId: string,
  de: string,
  ate: string,
): Promise<Lancamento[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, type, amount, payment_method, category, description, occurred_at, appointment_id",
      )
      .eq("barbershop_id", shopId)
      .gte("occurred_at", de)
      .lte("occurred_at", ate)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[caixa] falha ao listar lançamentos:", error);
      return [];
    }

    return (data ?? []).map((l) => ({ ...l, amount: Number(l.amount) }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[caixa] erro inesperado ao listar lançamentos:", error);
    return [];
  }
}
