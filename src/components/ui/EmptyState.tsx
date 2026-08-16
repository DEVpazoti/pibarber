import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio. Regra do design system: SEMPRE ensina o próximo passo.
 * "Nenhum cliente ainda" sozinho não serve — por isso `acao` existe.
 */
export function EmptyState({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icone ? (
        <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink-faint [&>svg]:h-8 [&>svg]:w-8">
          {icone}
        </div>
      ) : null}

      <div>
        <p className="text-base font-semibold text-ink">{titulo}</p>
        {descricao ? (
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{descricao}</p>
        ) : null}
      </div>

      {acao ? <div className="mt-1">{acao}</div> : null}
    </div>
  );
}
