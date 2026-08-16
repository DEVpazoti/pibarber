import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A moldura de um campo: rótulo acima em peso 500, asterisco vermelho quando
 * obrigatório, dica em cinza e erro em vermelho embaixo.
 *
 * O campo em si (Input, Select, textarea) vai como `children`, para o Field
 * servir para qualquer controle.
 */
export function Field({
  label,
  htmlFor,
  obrigatorio = false,
  dica,
  erro,
  className,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  obrigatorio?: boolean;
  dica?: ReactNode;
  erro?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {obrigatorio ? (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {erro ? (
        <p className="text-xs text-danger" role="alert">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-xs text-ink-faint">{dica}</p>
      ) : null}
    </div>
  );
}
