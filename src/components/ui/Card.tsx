import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type PropsCard = ComponentPropsWithoutRef<"div"> & {
  /** Borda de 2px em gradiente latão → âmbar. Uma coisa por tela, no máximo. */
  destaque?: boolean;
  /** Tira o padding interno — para card que tem imagem colada na borda. */
  semPadding?: boolean;
};

export function Card({
  destaque = false,
  semPadding = false,
  className,
  children,
  ...resto
}: PropsCard) {
  return (
    <div
      className={cn(
        "rounded-card bg-surface shadow-card",
        destaque ? "border-gradient" : "border border-line",
        !semPadding && "p-4",
        className,
      )}
      {...resto}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-sm text-ink-soft">{descricao}</p> : null}
      </div>
      {acao ? <div className="shrink-0">{acao}</div> : null}
    </div>
  );
}
