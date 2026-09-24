"use client";

import { LayoutDashboard, LogOut, MessageSquare, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sair } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * A navegação do /admin. Lateral no computador; cabeçalho + barra de baixo no
 * celular — o mesmo idioma do painel do barbeiro, para quem usa os dois.
 */

const ITENS = [
  { href: "/admin", rotulo: "Visão geral", Icone: LayoutDashboard, exato: true },
  { href: "/admin/barbearias", rotulo: "Barbearias", Icone: Store, exato: false },
  { href: "/admin/feedbacks", rotulo: "Relatos", Icone: MessageSquare, exato: false },
] as const;

export function AdminNav({ nome, relatosNovos }: { nome: string; relatosNovos: number }) {
  const caminho = usePathname();
  const ativo = (href: string, exato: boolean) =>
    exato ? caminho === href : caminho === href || caminho.startsWith(`${href}/`);

  return (
    <>
      {/* ---------- Computador: lateral ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin">
            <Logo tamanho="sm" />
          </Link>
          <ThemeToggle />
        </div>
        <div className="border-y border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Admin da plataforma</p>
          <p className="truncate text-xs text-ink-faint">{nome}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {ITENS.map(({ href, rotulo, Icone, exato }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-field px-3 text-sm font-medium transition-colors",
                ativo(href, exato)
                  ? "bg-brass-soft text-brass-deep"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icone className="h-4.5 w-4.5 shrink-0" aria-hidden />
              <span className="flex-1">{rotulo}</span>
              {href === "/admin/feedbacks" && relatosNovos > 0 ? (
                <span className="rounded-full bg-brass px-2 py-0.5 text-[11px] font-semibold text-brass-ink">
                  {relatosNovos}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <form action={sair} className="border-t border-line p-3">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-field px-3 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            <LogOut className="h-4.5 w-4.5" aria-hidden />
            Sair
          </button>
        </form>
      </aside>

      {/* ---------- Celular: cabeçalho ---------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Admin da plataforma</p>
            <p className="truncate text-xs text-ink-faint">{nome}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={sair}>
              <button
                type="submit"
                aria-label="Sair"
                className="grid h-11 w-11 place-items-center rounded-field text-danger"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ---------- Celular: barra de baixo ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-surface pb-safe lg:hidden">
        {ITENS.map(({ href, rotulo, Icone, exato }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              ativo(href, exato) ? "text-brass" : "text-ink-faint",
            )}
          >
            <Icone className="h-5 w-5" aria-hidden />
            {rotulo}
            {href === "/admin/feedbacks" && relatosNovos > 0 ? (
              <span className="absolute right-1/4 top-2 rounded-full bg-brass px-1.5 text-[10px] font-semibold text-brass-ink">
                {relatosNovos}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );
}
