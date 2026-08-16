"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { CHAVE_TEMA } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Alternador de tema: lua no claro, sol no escuro.
 *
 * A escolha vira `data-theme` no <html> e é persistida. Enquanto não montou,
 * renderiza um espaço do mesmo tamanho — o ícone certo só é conhecido depois
 * de ler o localStorage, e trocar ícone no meio da hidratação dá aviso.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [escuro, setEscuro] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const carimbo = document.documentElement.getAttribute("data-theme");
    if (carimbo === "dark" || carimbo === "light") {
      setEscuro(carimbo === "dark");
    } else {
      setEscuro(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    setMontado(true);
  }, []);

  function alternar() {
    const proximo = !escuro;
    setEscuro(proximo);
    document.documentElement.setAttribute("data-theme", proximo ? "dark" : "light");
    try {
      localStorage.setItem(CHAVE_TEMA, proximo ? "dark" : "light");
    } catch {
      // Sem persistência: vale só para esta sessão.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-chip text-ink-soft",
        "transition-colors hover:bg-surface-2 hover:text-ink active:scale-95",
        className,
      )}
    >
      {montado ? (
        escuro ? (
          <Sun className="h-5 w-5" aria-hidden />
        ) : (
          <Moon className="h-5 w-5" aria-hidden />
        )
      ) : (
        <span className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
