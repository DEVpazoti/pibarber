import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página. O h1 sai em Fraunces por causa do globals.css —
 * é o único lugar, junto com o logotipo, onde a serifada aparece.
 */
export function PageHeader({
  titulo,
  descricao,
  voltarPara,
  acao,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  /** Rota do botão de voltar. Nas subpáginas do perfil ele fica sempre visível. */
  voltarPara?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start gap-2", className)}>
      {voltarPara ? (
        <Link
          href={voltarPara}
          aria-label="Voltar"
          className="-ml-2 mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="text-2xl leading-tight text-ink sm:text-3xl">{titulo}</h1>
        {descricao ? <p className="mt-1 text-sm text-ink-soft">{descricao}</p> : null}
      </div>

      {acao ? <div className="shrink-0">{acao}</div> : null}
    </div>
  );
}
