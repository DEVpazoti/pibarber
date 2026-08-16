"use client";

import { Calendar, Home, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/app", rotulo: "Início", Icone: Home },
  { href: "/app/buscar", rotulo: "Buscar", Icone: Search },
  { href: "/app/agendamentos", rotulo: "Agendamentos", Icone: Calendar },
  { href: "/app/perfil", rotulo: "Perfil", Icone: User },
] as const;

/**
 * As 4 abas da base. Ativa em latão com o ícone preenchido; inativas em cinza
 * com ícone de traço.
 *
 * NÃO É MAIS `position: fixed`, e isso é o conserto e não um detalhe.
 *
 * Fixa com o documento rolando, ela escorregava para baixo durante a rolagem
 * no Safari do iPhone — o navegador muda a altura da viewport ao recolher a
 * barra de endereço e só reposiciona o `fixed` quando o gesto termina. Agora
 * ela é o último item de uma coluna de altura travada (ver
 * src/app/app/layout.tsx): fica na base porque é ali que ela está no fluxo, e
 * não porque foi grudada por cima.
 *
 * `shrink-0` é o que impede o flex de espremê-la quando a lista cresce.
 *
 * `pb-safe` respeita o env(safe-area-inset-bottom): sem isso, no iPhone a
 * barra fica embaixo do indicador de gesto e o polegar não alcança.
 *
 * Fundo opaco e sem `backdrop-blur`: não há mais conteúdo passando por baixo
 * para desfocar, e o blur custa composição de camada a cada quadro rolado.
 */
export function TabBar() {
  const caminho = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="shrink-0 border-t border-line bg-surface pb-safe"
    >
      <ul className="mx-auto flex max-w-[480px] items-stretch">
        {ABAS.map(({ href, rotulo, Icone }) => {
          // /app só casa exato; o resto casa por prefixo, para a subpágina do
          // perfil manter a aba Perfil acesa.
          const ativa = href === "/app" ? caminho === "/app" : caminho.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2",
                  "transition-colors",
                  ativa ? "text-brass" : "text-ink-faint hover:text-ink-soft",
                )}
              >
                <Icone
                  className={cn("h-6 w-6", ativa && "fill-brass/20")}
                  strokeWidth={ativa ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className={cn("text-[11px]", ativa ? "font-semibold" : "font-medium")}>
                  {rotulo}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
