import { Bell } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Cabeçalho do app: logo à esquerda; sino e alternador de tema à direita.
 * O sino ganha um ponto em latão quando há notificação não lida.
 *
 * Era `sticky top-0` com fundo translúcido, e deixou de precisar: desde que o
 * app virou casca de altura travada (ver src/app/app/layout.tsx), o documento
 * não rola e o cabeçalho já está sempre no topo. `sticky` num elemento cujo
 * contêiner não rola não faz nada — manter só enganaria quem lesse depois.
 *
 * Fundo opaco pelo mesmo motivo da TabBar: não passa conteúdo por baixo.
 */
export function AppHeader({ naoLidas = 0 }: { naoLidas?: number }) {
  return (
    <header className="shrink-0 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between px-4">
        {/* h-11: a logo sozinha tem 32px, abaixo do alvo de toque de 44px. */}
        <Link href="/app" aria-label="Início" className="inline-flex h-11 items-center">
          <Logo tamanho="sm" />
        </Link>

        <div className="flex items-center gap-0.5">
          <Link
            href="/app/notificacoes"
            aria-label={
              naoLidas > 0
                ? `Notificações, ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}`
                : "Notificações"
            }
            className="relative grid h-11 w-11 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {naoLidas > 0 ? (
              <span
                className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-brass ring-2 ring-bg"
                aria-hidden
              />
            ) : null}
          </Link>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
