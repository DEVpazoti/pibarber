import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TomStat = "neutro" | "money" | "danger" | "brass" | "info";

const TONS: Record<TomStat, { valor: string; icone: string }> = {
  neutro: { valor: "text-ink", icone: "bg-surface-2 text-ink-soft" },
  money: { valor: "text-money", icone: "bg-money-soft text-money" },
  danger: { valor: "text-danger", icone: "bg-danger-soft text-danger" },
  brass: { valor: "text-brass-deep", icone: "bg-brass-soft text-brass-deep" },
  info: { valor: "text-info", icone: "bg-info-soft text-info" },
};

/**
 * Card de número — "quanto entrou hoje", "atendimentos do dia".
 *
 * Verde é dinheiro que entra, vermelho é que sai. O valor sempre com `tnum`,
 * senão as colunas desalinham e o financeiro parece amador.
 */
export function StatCard({
  rotulo,
  valor,
  dica,
  icone,
  tom = "neutro",
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  dica?: ReactNode;
  icone?: ReactNode;
  tom?: TomStat;
  className?: string;
}) {
  const cores = TONS[tom];

  return (
    <div
      className={cn(
        // `min-w-0`: item de grid e de flex nasce com `min-width: auto` e se
        // recusa a encolher abaixo do conteúdo. Um valor comprido como
        // "R$ 12.345,67" empurrava a coluna e estourava a página em 375px.
        "min-w-0 rounded-card border border-line bg-surface p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {rotulo}
        </p>
        {icone ? (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", cores.icone)}>
            {icone}
          </span>
        ) : null}
      </div>

      <p className={cn("tnum mt-2 text-2xl font-semibold", cores.valor)}>{valor}</p>

      {dica ? <p className="mt-1 text-xs text-ink-soft">{dica}</p> : null}
    </div>
  );
}
