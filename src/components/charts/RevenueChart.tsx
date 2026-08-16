"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { brl } from "@/lib/utils";

/**
 * O gráfico de faturamento por dia.
 *
 * UMA série, eixo limpo, cor de latão, números tabulares. Sem gradiente, sem
 * 3D, sem segunda escala: o dono olha isso entre um corte e outro, e precisa
 * entender em dois segundos se o mês está bom.
 *
 * A cor vem do token via CSS custom property — assim ela troca sozinha no tema
 * escuro, sem `if` nenhum aqui dentro.
 */

export type PontoDaSerie = { dia: string; receita: number; despesa: number };

export function RevenueChart({ dados }: { dados: PontoDaSerie[] }) {
  if (dados.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-10 text-center text-sm text-ink-soft">
        Nenhum movimento no período.
      </p>
    );
  }

  // "2026-08-14" → "14/08". O eixo X num celular não cabe o ano.
  const pontos = dados.map((d) => ({
    ...d,
    rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
  }));

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="rotulo"
              tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-line)" }}
              // Num mês inteiro, mostrar 31 rótulos vira borrão.
              interval="preserveStartEnd"
              minTickGap={24}
            />

            <YAxis
              tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(valor: number) =>
                valor >= 1000 ? `${Math.round(valor / 1000)}k` : String(valor)
              }
            />

            <Tooltip
              cursor={{ stroke: "var(--color-line-strong)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-field)",
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--color-ink-soft)" }}
              formatter={(valor) => [brl(Number(valor ?? 0)), "Faturamento"]}
            />

            <Line
              type="monotone"
              dataKey="receita"
              stroke="var(--color-brass)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-brass)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
