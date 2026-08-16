"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const TAMANHOS = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-8 w-8",
} as const;

/** Só exibe a nota. Meia estrela não existe: arredonda para a mais próxima. */
export function Rating({
  valor,
  quantidade,
  tamanho = "sm",
  className,
}: {
  valor: number | null | undefined;
  quantidade?: number | null;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const media = valor ?? 0;

  if (!quantidade) {
    return <span className={cn("text-xs text-ink-faint", className)}>Sem avaliações</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Star className={cn(TAMANHOS[tamanho], "fill-brass text-brass")} aria-hidden />
      <span className="tnum text-sm font-semibold text-ink">{media.toFixed(1)}</span>
      <span className="text-xs text-ink-faint">
        ({quantidade} {quantidade === 1 ? "avaliação" : "avaliações"})
      </span>
    </span>
  );
}

/**
 * Estrelas clicáveis — o formulário de avaliação do cliente.
 * Envia o valor num input escondido, para funcionar dentro de um <form> de
 * server action sem estado extra.
 */
export function RatingInput({
  name = "rating",
  valorInicial = 0,
  tamanho = "lg",
  aoMudar,
}: {
  name?: string;
  valorInicial?: number;
  tamanho?: keyof typeof TAMANHOS;
  /** Para quem precisa da nota em estado — habilitar o botão, por exemplo. */
  aoMudar?: (nota: number) => void;
}) {
  const [valor, setValor] = useState(valorInicial);
  const [preview, setPreview] = useState(0);
  const mostrado = preview || valor;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setPreview(0)}>
      <input type="hidden" name={name} value={valor} />
      {[1, 2, 3, 4, 5].map((nota) => (
        <button
          key={nota}
          type="button"
          onClick={() => {
            setValor(nota);
            aoMudar?.(nota);
          }}
          onMouseEnter={() => setPreview(nota)}
          aria-label={`${nota} ${nota === 1 ? "estrela" : "estrelas"}`}
          aria-pressed={valor === nota}
          className="grid h-11 w-11 place-items-center rounded-chip transition-transform active:scale-90"
        >
          <Star
            className={cn(
              TAMANHOS[tamanho],
              "transition-colors",
              nota <= mostrado ? "fill-brass text-brass" : "text-line-strong",
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}
