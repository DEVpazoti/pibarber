import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import type { PontoDaSerie } from "@/components/charts/RevenueChart";
import { RevenueChartLazy } from "@/components/charts/RevenueChartLazy";
import { SeletorPeriodo } from "@/components/painel/SeletorPeriodo";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { periodoAnterior, resolverPeriodo } from "@/lib/periodo";
import { carregarResumo } from "@/lib/queries/agenda";
import { createClient } from "@/lib/supabase/server";
import { brl, cn, faixaDoDia, one, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatórios" };

/**
 * RELATÓRIOS — só o dono.
 *
 * A RLS impede o assistente até chamando a API direto: `revenue_series`
 * levanta exceção sem `can_manage_money`, e `dashboard_summary` devolve o JSON
 * sem as chaves de dinheiro.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; de?: string; ate?: string }>;
}) {
  const { shopId } = await requireOwnerContext();
  const periodo = resolverPeriodo(await searchParams);
  const anterior = periodoAnterior(periodo);

  const [resumo, resumoAnterior, serie, servicos, profissionais] = await Promise.all([
    carregarResumo(shopId, periodo.de, periodo.ate),
    carregarResumo(shopId, anterior.de, anterior.ate),
    carregarSerie(shopId, periodo.de, periodo.ate),
    servicosMaisVendidos(shopId, periodo.de, periodo.ate),
    desempenhoPorProfissional(shopId, periodo.de, periodo.ate),
  ]);

  const receita = resumo?.receita ?? 0;
  const receitaAnterior = resumoAnterior?.receita ?? 0;
  const variacao =
    receitaAnterior === 0 ? null : ((receita - receitaAnterior) / receitaAnterior) * 100;

  return (
    <>
      {/* "Como o mês está indo" mentia em três dos quatro filtros: o período é
          escolhido logo abaixo, e pode ser hoje, a semana ou um intervalo
          qualquer. */}
      <PageHeader
        titulo="Relatórios"
        descricao="Como o período está indo, comparado com o anterior."
      />

      <SeletorPeriodo periodo={periodo} />

      {/* --- Números principais ------------------------------------------ */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          rotulo="Faturamento"
          valor={brl(receita)}
          tom="money"
          dica={
            variacao == null ? (
              "Sem período anterior para comparar"
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  variacao > 0 ? "text-money" : variacao < 0 ? "text-danger" : "text-ink-soft",
                )}
              >
                {variacao > 0 ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : variacao < 0 ? (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                ) : (
                  <Minus className="h-3 w-3" aria-hidden />
                )}
                <span className="tnum">{pct(Math.abs(variacao))}</span> vs. anterior
              </span>
            )
          }
        />

        <StatCard rotulo="Lucro" valor={brl(resumo?.lucro ?? 0)} tom="brass" />
        <StatCard rotulo="Ticket médio" valor={brl(resumo?.ticket_medio ?? 0)} />
        <StatCard
          rotulo="Taxa de falta"
          valor={pct(resumo?.taxa_falta ?? 0)}
          tom={(resumo?.taxa_falta ?? 0) > 10 ? "danger" : "neutro"}
          dica={`${resumo?.faltas ?? 0} de ${resumo?.atendimentos ?? 0}`}
        />
      </div>

      {/* --- Gráfico ------------------------------------------------------ */}
      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold text-ink">Faturamento por dia</h2>
        <RevenueChartLazy dados={serie} />
      </section>

      {/* --- Serviços ----------------------------------------------------- */}
      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold text-ink">Serviços mais vendidos</h2>

        {servicos.length === 0 ? (
          <EmptyState titulo="Nenhum atendimento concluído no período" />
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {servicos.map((s) => (
              <li
                key={s.nome}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {s.nome}
                </span>
                <span className="tnum shrink-0 text-xs text-ink-soft">{s.quantidade}×</span>
                <span className="tnum w-24 shrink-0 text-right text-sm font-semibold text-ink">
                  {brl(s.receita)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Profissionais ------------------------------------------------ */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-ink">Desempenho por profissional</h2>

        {profissionais.length === 0 ? (
          <EmptyState titulo="Nenhum atendimento concluído no período" />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5 font-medium">Profissional</th>
                  <th className="px-4 py-2.5 text-right font-medium">Atend.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receita</th>
                  <th className="px-4 py-2.5 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {profissionais.map((p) => (
                  <tr key={p.nome} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-medium text-ink">{p.nome}</td>
                    <td className="tnum px-4 py-3 text-right text-ink-soft">{p.atendimentos}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-ink">
                      {brl(p.receita)}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-brass-deep">
                      {brl(p.comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ==========================================================================
   Consultas
   ========================================================================== */

async function carregarSerie(shopId: string, de: string, ate: string): Promise<PontoDaSerie[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("revenue_series", {
      p_shop: shopId,
      p_de: de,
      p_ate: ate,
    });

    if (error) {
      console.error("[relatórios] falha ao carregar a série:", error);
      return [];
    }

    return (data ?? []).map((linha) => ({
      dia: linha.dia,
      receita: Number(linha.receita),
      despesa: Number(linha.despesa),
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[relatórios] erro inesperado na série:", error);
    return [];
  }
}

async function servicosMaisVendidos(
  shopId: string,
  de: string,
  ate: string,
): Promise<{ nome: string; quantidade: number; receita: number }[]> {
  try {
    const supabase = await createClient();

    // Preço e duração ficam congelados em `appointment_services` na marcação.
    // Somar dali é o que faz o relatório de julho continuar certo depois de um
    // reajuste em agosto.
    const { data, error } = await supabase
      .from("appointment_services")
      .select(
        `price,
         service:services!appointment_services_service_id_fkey(name),
         atendimento:appointments!appointment_services_appointment_id_fkey(
           status, starts_at, barbershop_id
         )`,
      )
      .eq("atendimento.barbershop_id", shopId)
      .eq("atendimento.status", "completed")
      .gte("atendimento.starts_at", faixaDoDia(de).de)
      .lt("atendimento.starts_at", faixaDoDia(ate).ate)
      .limit(5000);

    if (error) {
      console.error("[relatórios] falha ao somar serviços:", error);
      return [];
    }

    const totais = new Map<string, { quantidade: number; receita: number }>();

    for (const linha of data ?? []) {
      // O filtro no embed não remove a linha-mãe: ela volta com o embed nulo.
      if (!one(linha.atendimento)) continue;

      const nome = one(linha.service)?.name ?? "Serviço";
      const atual = totais.get(nome) ?? { quantidade: 0, receita: 0 };
      atual.quantidade += 1;
      atual.receita += Number(linha.price);
      totais.set(nome, atual);
    }

    return [...totais.entries()]
      .map(([nome, t]) => ({ nome, ...t }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 10);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[relatórios] erro inesperado ao somar serviços:", error);
    return [];
  }
}

async function desempenhoPorProfissional(
  shopId: string,
  de: string,
  ate: string,
): Promise<{ nome: string; atendimentos: number; receita: number; comissao: number }[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `id, total_price, discount,
         profissional:professionals!appointments_professional_id_fkey(name, nickname),
         comissao:commissions!commissions_appointment_id_fkey(amount)`,
      )
      .eq("barbershop_id", shopId)
      .eq("status", "completed")
      .gte("starts_at", faixaDoDia(de).de)
      .lt("starts_at", faixaDoDia(ate).ate)
      .limit(5000);

    if (error) {
      console.error("[relatórios] falha ao somar por profissional:", error);
      return [];
    }

    const totais = new Map<
      string,
      { atendimentos: number; receita: number; comissao: number }
    >();

    for (const a of data ?? []) {
      const prof = one(a.profissional);
      const nome = prof ? (prof.nickname ?? prof.name) : "Sem profissional";

      const atual = totais.get(nome) ?? { atendimentos: 0, receita: 0, comissao: 0 };
      atual.atendimentos += 1;
      atual.receita += Number(a.total_price) - Number(a.discount);
      atual.comissao += Number(one(a.comissao)?.amount ?? 0);
      totais.set(nome, atual);
    }

    return [...totais.entries()]
      .map(([nome, t]) => ({ nome, ...t }))
      .sort((a, b) => b.receita - a.receita);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[relatórios] erro inesperado ao somar por profissional:", error);
    return [];
  }
}
