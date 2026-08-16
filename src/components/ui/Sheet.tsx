"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { useFecharNoEsc, useTravaRolagem } from "./Modal";

/**
 * Gaveta que sobe de baixo no celular e entra pela direita no desktop.
 * É o formato certo para escolher algo com o polegar sem cobrir a tela toda.
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
  lado?: "bottom" | "right";
  children: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useTravaRolagem(aberto);
  useFecharNoEsc(aberto, aoFechar);

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
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute flex flex-col bg-surface shadow-float animate-fade-up",
          lado === "bottom"
            ? "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-card"
            : "inset-y-0 right-0 w-full max-w-md",
        )}
      >
        {/* Puxador — sinaliza que dá para arrastar, e centraliza o olhar. */}
        {lado === "bottom" ? (
          <div className="flex justify-center pt-2.5" aria-hidden>
            <span className="h-1 w-10 rounded-chip bg-line-strong" />
          </div>
        ) : null}

        {titulo ? (
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">{titulo}</h2>
              {descricao ? <p className="mt-0.5 text-sm text-ink-soft">{descricao}</p> : null}
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

        {rodape ? (
          <div className="border-t border-line px-5 py-4 pb-safe">{rodape}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
