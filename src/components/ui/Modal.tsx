"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** Trava a rolagem do fundo e devolve no fim. Vale para o Modal e o Sheet. */
export function useTravaRolagem(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [ativo]);
}

/** Fecha no Esc. */
export function useFecharNoEsc(ativo: boolean, aoFechar: () => void) {
  useEffect(() => {
    if (!ativo) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ativo, aoFechar]);
}

/**
 * Portal seguro para SSR: só monta depois da hidratação.
 * Precisa ser estado, não ref — um ref não dispara nova renderização, e o
 * portal nunca apareceria.
 */
function Portal({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(children, document.body);
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rodape,
  largura = "md",
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: ReactNode;
  descricao?: ReactNode;
  rodape?: ReactNode;
  largura?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  useTravaRolagem(aberto);
  useFecharNoEsc(aberto, aoFechar);

  if (!aberto) return null;

  const larguras = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
  } as const;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        {/* Fundo escurecido. Clicar fora fecha. */}
        <button
          type="button"
          aria-label="Fechar"
          onClick={aoFechar}
          className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        />

        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative z-10 flex w-full flex-col rounded-t-card bg-surface shadow-float",
            "max-h-[92dvh] animate-fade-up sm:rounded-card",
            larguras[largura],
          )}
        >
          {titulo ? (
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">{titulo}</h2>
                {descricao ? (
                  <p className="mt-0.5 text-sm text-ink-soft">{descricao}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={aoFechar}
                aria-label="Fechar"
                className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-chip text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {rodape ? (
            <div className="border-t border-line px-5 py-4 pb-safe">{rodape}</div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
