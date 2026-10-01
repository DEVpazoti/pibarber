"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { useFecharNoEsc, usePrenderFoco, useTravaRolagem } from "./Modal";

/**
 * Gaveta que sobe de baixo no celular e entra pela direita no desktop.
 * É o formato certo para escolher algo com o polegar sem cobrir a tela toda.
 *
 * `lado`:
 *   - "bottom"      → sempre de baixo;
 *   - "right"       → sempre pela direita (o /admin, que é só de computador);
 *   - "responsivo"  → de baixo no celular e painel lateral de 440px a partir
 *                     de `md`, com o foco preso dentro. É o detalhe do
 *                     agendamento: no PC, a gaveta de baixo ocupava a largura
 *                     inteira com botões de 1.000px.
 */
export function Sheet({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rodape,
  lado = "bottom",
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: ReactNode;
  descricao?: ReactNode;
  rodape?: ReactNode;
  lado?: "bottom" | "right" | "responsivo";
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  // O nome da janela para o leitor de tela (e para os testes) — ver o Modal.
  const idTitulo = useId();
  const idDescricao = useId();

  useTravaRolagem(aberto);
  useFecharNoEsc(aberto, aoFechar);
  // Só no responsivo, para não mudar o comportamento dos usos que já existem.
  const janela = useRef<HTMLDivElement>(null);
  usePrenderFoco(montado && aberto && lado === "responsivo", janela);

  if (!montado || !aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />

      <div
        ref={janela}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo ? idTitulo : undefined}
        aria-describedby={descricao ? idDescricao : undefined}
        className={cn(
          "absolute flex flex-col bg-surface shadow-float animate-fade-up",
          "outline-none",
          lado === "bottom" && "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-card",
          lado === "right" && "inset-y-0 right-0 w-full max-w-md",
          lado === "responsivo" &&
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-card md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[440px] md:rounded-none",
        )}
      >
        {/* Puxador — sinaliza que dá para arrastar, e centraliza o olhar. */}
        {lado !== "right" ? (
          <div
            className={cn("flex justify-center pt-2.5", lado === "responsivo" && "md:hidden")}
            aria-hidden
          >
            <span className="h-1 w-10 rounded-chip bg-line-strong" />
          </div>
        ) : null}

        {titulo ? (
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <h2 id={idTitulo} className="text-base font-semibold text-ink">
                {titulo}
              </h2>
              {descricao ? (
                <p id={idDescricao} className="mt-0.5 text-sm text-ink-soft">
                  {descricao}
                </p>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {rodape ? <div className="border-t border-line px-5 py-4 pb-safe">{rodape}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
