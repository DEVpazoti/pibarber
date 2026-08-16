"use client";

import { LogOut, MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { sair } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { Suporte } from "@/components/Suporte";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { itensDoMenu } from "./menu";

function estaAtivo(caminho: string, href: string): boolean {
  return href === "/painel" ? caminho === "/painel" : caminho.startsWith(href);
}

/**
 * Navegação do painel: barra lateral no desktop, barra inferior no celular.
 *
 * No celular a base leva os 4 itens mais usados durante o expediente e um
 * botão "Mais" com o resto — 12 ícones numa barra de 375px não seriam
 * clicáveis com o polegar.
 */
/**
 * O contador de pendências, no canto do item de menu.
 *
 * Passa de 99 vira "99+": três dígitos esticam a pílula e empurram o rótulo
 * para fora da barra lateral.
 */
function Badge({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;

  return (
    <span
      className="tnum ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-danger-ink"
      aria-label={`${quantidade} pendente(s)`}
    >
      {quantidade > 99 ? "99+" : quantidade}
    </span>
  );
}

export function PainelNav({
  podeVerDinheiro,
  nome,
  nomeBarbearia,
  pendencias = 0,
}: {
  podeVerDinheiro: boolean;
  nome: string;
  nomeBarbearia: string;
  /** Atendimentos de dias anteriores sem conclusão. Alimenta o badge. */
  pendencias?: number;
}) {
  const caminho = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  const itens = itensDoMenu(podeVerDinheiro);
  const naBase = itens.filter((i) => i.destaque);
  const noMais = itens.filter((i) => !i.destaque);

  /**
   * No celular, "Pendências" mora dentro da gaveta "Mais" — o badge lá dentro
   * seria invisível justamente para quem precisa dele. Então o botão "Mais"
   * carrega o contador para fora, e a gaveta o repete no item certo.
   */
  const pendenciasNoMais = noMais.some((i) => i.temBadge) ? pendencias : 0;

  return (
    <>
      {/* ---------- Desktop: barra lateral ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/painel">
            <Logo tamanho="sm" />
          </Link>
          <ThemeToggle />
        </div>

        <div className="border-y border-line px-4 py-3">
          <p className="truncate text-sm font-semibold text-ink">{nomeBarbearia}</p>
          <p className="truncate text-xs text-ink-faint">
            {nome}
            {!podeVerDinheiro ? " · assistente" : ""}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-0.5">
            {itens.map(({ href, rotulo, Icone, temBadge }) => {
              const ativo = estaAtivo(caminho, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-field px-3 text-sm font-medium transition-colors",
                      ativo
                        ? "bg-brass-soft text-brass-deep"
                        : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icone className="h-4.5 w-4.5 shrink-0" aria-hidden />
                    {rotulo}
                    {temBadge ? <Badge quantidade={pendencias} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Suporte sempre à mão: é rodapé, não rota — uma tela nova custaria
            uma ida e volta ao banco para mostrar dois links. */}
        <Suporte variante="rodape" className="border-t border-line p-3" />

        <form action={sair} className="border-t border-line p-3">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-field px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
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
            <p className="truncate text-sm font-semibold text-ink">{nomeBarbearia}</p>
            <p className="truncate text-xs text-ink-faint">
              {nome}
              {!podeVerDinheiro ? " · assistente" : ""}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* ---------- Celular: barra inferior ---------- */}
      <nav
        aria-label="Navegação do painel"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-safe backdrop-blur lg:hidden"
      >
        <ul className="flex items-stretch">
          {naBase.map(({ href, rotulo, Icone }) => {
            const ativo = estaAtivo(caminho, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors",
                    ativo ? "text-brass" : "text-ink-faint hover:text-ink-soft",
                  )}
                >
                  <Icone
                    className={cn("h-5.5 w-5.5", ativo && "fill-brass/20")}
                    strokeWidth={ativo ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span className={cn("text-[11px]", ativo ? "font-semibold" : "font-medium")}>
                    {rotulo}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMaisAberto(true)}
              aria-label={
                pendenciasNoMais > 0
                  ? `Mais opções — ${pendenciasNoMais} pendente(s)`
                  : "Mais opções"
              }
              className="relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-ink-faint transition-colors hover:text-ink-soft"
            >
              <MoreHorizontal className="h-5.5 w-5.5" strokeWidth={1.75} aria-hidden />
              <span className="text-[11px] font-medium">Mais</span>

              {/* O aviso precisa vazar da gaveta: dentro dela ninguém veria. */}
              {pendenciasNoMais > 0 ? (
                <span
                  className="tnum absolute right-[calc(50%-22px)] top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-ink"
                  aria-hidden
                >
                  {pendenciasNoMais > 99 ? "99+" : pendenciasNoMais}
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>

      {/* ---------- Celular: gaveta "Mais" ---------- */}
      {maisAberto ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setMaisAberto(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] animate-fade-up overflow-y-auto rounded-t-card bg-surface pb-safe shadow-float">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Mais</h2>
              <button
                type="button"
                onClick={() => setMaisAberto(false)}
                aria-label="Fechar"
                className="-mr-2 grid h-11 w-11 place-items-center rounded-chip text-ink-faint hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <ul className="px-3 pb-2">
              {noMais.map(({ href, rotulo, Icone, temBadge }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMaisAberto(false)}
                    className="flex min-h-[52px] items-center gap-3 rounded-field px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
                  >
                    <Icone className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
                    {rotulo}
                    {temBadge ? <Badge quantidade={pendencias} /> : null}
                  </Link>
                </li>
              ))}
            </ul>

            <Suporte variante="rodape" className="border-t border-line p-3" />

            <form action={sair} className="border-t border-line p-3">
              <button
                type="submit"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-field text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                <LogOut className="h-4.5 w-4.5" aria-hidden />
                Sair
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
