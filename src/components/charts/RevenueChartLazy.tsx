"use client";

import dynamic from "next/dynamic";

import type { PontoDaSerie } from "./RevenueChart";

/**
 * O gráfico de faturamento, carregado SOB DEMANDA (G5 do PERFORMANCE.md).
 *
 * O PROBLEMA: o Recharts é a única biblioteca pesada do projeto e o único
 * lugar que a usa é este gráfico, numa tela só. Importado estaticamente, ele
 * levava `/painel/relatorios` a 222 kB de First Load JS — o dobro de qualquer
 * outra rota, que ficam entre 110 e 123 kB. Toda visita a Relatórios baixava
 * uma biblioteca de gráficos antes de mostrar qualquer coisa.
 *
 * POR QUE ESTE ARQUIVO EXISTE, em vez de o `dynamic()` ficar na página:
 * `relatorios/page.tsx` é Server Component, e `ssr: false` só pode ser
 * declarado dentro de um Client Component. Daí esta casca de três linhas —
 * mesmo padrão que o T-4 usou para o Leaflet em `LocalizacaoBarbearia.tsx`.
 *
 * POR QUE `ssr: false` E NÃO SÓ O `dynamic()`: com SSR ligado o Next continua
 * mandando o Recharts no pacote inicial para hidratar o que ele renderizou —
 * o chunk sai separado, mas é baixado do mesmo jeito, e o First Load JS não
 * cai. Desligar o SSR é o que efetivamente tira a biblioteca do caminho de
 * quem abre a tela.
 *
 * O CUSTO, dito por inteiro: o gráfico não vem no HTML. Quem tem JavaScript
 * desligado não o vê, e o gráfico aparece um instante depois do resto. É um
 * gráfico de apoio numa tela do painel — não é conteúdo indexável nem a
 * informação principal, que são os números em cima. O esqueleto abaixo tem
 * exatamente a mesma altura do gráfico (h-64 dentro de um card com p-3), então
 * nada salta na tela quando ele chega.
 */
const Grafico = dynamic(() => import("./RevenueChart").then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="skeleton h-64 w-full rounded-field" role="status" aria-label="Carregando o gráfico" />
    </div>
  ),
});

export function RevenueChartLazy({ dados }: { dados: PontoDaSerie[] }) {
  return <Grafico dados={dados} />;
}
