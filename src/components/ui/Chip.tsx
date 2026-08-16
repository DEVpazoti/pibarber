import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TomChip = "neutro" | "brass" | "money" | "danger" | "info";

const TONS: Record<TomChip, string> = {
  neutro: "bg-surface-2 text-ink-soft",
  brass: "bg-brass-soft text-brass-deep",
  money: "bg-money-soft text-money",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** Etiqueta de leitura — status de agendamento, "Aberto agora", etc. */
export function Chip({
  tom = "neutro",
  className,
  children,
}: {
  tom?: TomChip;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-xs font-medium",
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

type PropsFiltroChip = ComponentPropsWithoutRef<"button"> & {
  ativo?: boolean;
};

/**
 * Chip clicável de filtro — os três da busca: Nome · Cidade · Próximas.
 * Ativo = latão preenchido. Inativo = fundo suave com texto em cinza.
 */
export function FilterChip({ ativo = false, className, children, ...resto }: PropsFiltroChip) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-chip px-4 text-sm font-medium",
        "transition-colors active:scale-[0.97]",
        ativo
          ? "bg-brass text-brass-ink"
          : "bg-surface-2 text-ink-soft hover:bg-line hover:text-ink",
        className,
      )}
      {...resto}
    >
      {children}
    </button>
  );
}
