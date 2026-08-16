"use client";

import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AbaDoPerfil = {
  /** Vai para a URL (`?aba=servicos`). Só letras minúsculas. */
  id: string;
  rotulo: string;
  conteudo: ReactNode;
};

/**
 * As abas do perfil público da barbearia — T-5.
 *
 * Três decisões que este componente carrega, e que não são detalhe:
 *
 * 1. O CONTEÚDO INATIVO CONTINUA NO HTML. Cada painel é renderizado sempre; o
 *    que muda é o atributo `hidden`. Desmontar seria mais barato em DOM e faria
 *    o Google indexar SÓ a primeira aba — e este é o perfil público, a página
 *    que traz cliente pela busca. O custo é o HTML inteiro em toda visita; é
 *    conteúdo de texto de uma barbearia, cabe.
 *
 *    Por isso `conteudo` é ReactNode montado no servidor e passado como prop:
 *    o HTML das cinco abas sai pronto do SSR, sem JavaScript no meio.
 *
 * 2. A ABA ATIVA VAI PARA A URL, mas por `history.replaceState` — não pelo
 *    router. `router.replace` refaria a requisição de servidor a cada clique de
 *    aba (a página é dinâmica: lê cookie e registra visita), e o PERFORMANCE.md
 *    mediu ~1s por ida e volta. Trocar de aba é instantâneo e a URL acompanha.
 *
 *    `replaceState` em vez de `pushState` de propósito: empilhar histórico faria
 *    quem tocou em quatro abas precisar de cinco "voltar" para sair da página.
 *    O link continua compartilhável, e voltar de /agendar cai na aba certa.
 *
 * 3. Mobile-first (é perfil público): a fita de abas rola na horizontal quando
 *    não cabe, e cada aba tem 44px de altura.
 */
export function AbasPerfil({
  abas,
  abaInicial,
}: {
  abas: AbaDoPerfil[];
  abaInicial: string;
}) {
  const primeira = abas[0]?.id ?? "";
  const [ativa, setAtiva] = useState(
    abas.some((a) => a.id === abaInicial) ? abaInicial : primeira,
  );
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  if (abas.length === 0) return null;

  function selecionar(id: string) {
    setAtiva(id);

    // Sem `?aba=` na primeira: a URL limpa é a canônica para o Google, e é a
    // que o dono cola na bio do Instagram.
    const url = new URL(window.location.href);
    if (id === primeira) url.searchParams.delete("aba");
    else url.searchParams.set("aba", id);
    window.history.replaceState(null, "", url);
  }

  /** Setas, Home e End andam pela fita — é o que a semântica de tabs promete. */
  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const ultimo = abas.length - 1;
    let alvo: number | null = null;

    if (evento.key === "ArrowRight") alvo = indice === ultimo ? 0 : indice + 1;
    else if (evento.key === "ArrowLeft") alvo = indice === 0 ? ultimo : indice - 1;
    else if (evento.key === "Home") alvo = 0;
    else if (evento.key === "End") alvo = ultimo;

    if (alvo == null) return;
    evento.preventDefault();

    const aba = abas[alvo];
    if (!aba) return;
    selecionar(aba.id);
    botoes.current[alvo]?.focus();
  }

  return (
    <div className="mt-6">
      {/* A fita rola sozinha no celular. `-mx-4 px-4` faz a rolagem sangrar até
          a borda da tela em vez de parar no respiro do conteúdo. */}
      <div
        role="tablist"
        aria-label="Seções da barbearia"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {abas.map((aba, indice) => {
          const selecionada = aba.id === ativa;
          return (
            <button
              key={aba.id}
              ref={(el) => {
                botoes.current[indice] = el;
              }}
              type="button"
              role="tab"
              id={`aba-${aba.id}`}
              aria-controls={`painel-${aba.id}`}
              aria-selected={selecionada}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => selecionar(aba.id)}
              onKeyDown={(e) => aoTeclar(e, indice)}
              className={cn(
                "h-11 shrink-0 whitespace-nowrap rounded-field px-4 text-sm transition-colors",
                selecionada
                  ? "bg-brass font-medium text-brass-ink"
                  : "bg-surface-2 text-ink-soft hover:bg-line",
              )}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>

      {abas.map((aba) => (
        <section
          key={aba.id}
          role="tabpanel"
          id={`painel-${aba.id}`}
          aria-labelledby={`aba-${aba.id}`}
          tabIndex={0}
          hidden={aba.id !== ativa}
          className="mt-4 outline-none"
        >
          {aba.conteudo}
        </section>
      ))}
    </div>
  );
}
