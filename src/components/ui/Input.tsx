import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Campo do design system: fundo suave, SEM borda, raio 10px, altura 48px.
 * O foco é um anel de 2px em latão — nada de borda azul do navegador.
 */
export const CLASSES_CAMPO = cn(
  "w-full rounded-field bg-surface-2 px-3.5 text-[15px] text-ink",
  "border-0 outline-none transition-shadow",
  "placeholder:text-ink-faint",
  "focus:ring-2 focus:ring-brass focus:ring-inset",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

// ComponentProps (e não ...WithoutRef) porque no React 19 o `ref` é um prop
// normal: a busca precisa focar o campo ao chegar da home.
type PropsInput = ComponentProps<"input"> & {
  erro?: boolean;
  /** Ícone à esquerda dentro do campo — a lupa da busca, por exemplo. */
  iconeEsquerda?: ReactNode;
  /** Ícone ou botão à direita — o olho da senha. */
  iconeDireita?: ReactNode;
};

export function Input({
  className,
  erro = false,
  iconeEsquerda,
  iconeDireita,
  ...resto
}: PropsInput) {
  const campo = (
    <input
      className={cn(
        CLASSES_CAMPO,
        "h-12",
        iconeEsquerda && "pl-10",
        iconeDireita && "pr-11",
        erro && "ring-2 ring-danger ring-inset",
        className,
      )}
      aria-invalid={erro || undefined}
      {...resto}
    />
  );

  if (!iconeEsquerda && !iconeDireita) return campo;

  return (
    <div className="relative">
      {iconeEsquerda ? (
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          aria-hidden
        >
          {iconeEsquerda}
        </span>
      ) : null}
      {campo}
      {iconeDireita ? (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{iconeDireita}</span>
      ) : null}
    </div>
  );
}

type PropsTextarea = ComponentPropsWithoutRef<"textarea"> & { erro?: boolean };

export function Textarea({ className, erro = false, rows = 4, ...resto }: PropsTextarea) {
  return (
    <textarea
      rows={rows}
      className={cn(
        CLASSES_CAMPO,
        "resize-y py-3 leading-relaxed",
        erro && "ring-2 ring-danger ring-inset",
        className,
      )}
      aria-invalid={erro || undefined}
      {...resto}
    />
  );
}
