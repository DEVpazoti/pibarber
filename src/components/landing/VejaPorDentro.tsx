"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

import { VISOES } from "@/lib/landing";
import { cn } from "@/lib/utils";

/**
 * "Veja por dentro" — o visualizador de telas reais da landing (T-6).
 *
 * Quatro decisões que este componente carrega:
 *
 * 1. TUDO FICA NO HTML, inclusive o que está escondido. As nove legendas são
 *    renderizadas sempre; o que muda é o atributo `hidden`. É o mesmo motivo da
 *    armadilha nº22: desmontar o inativo faria o Google indexar só a primeira
 *    tela, e as legendas são justamente onde moram as palavras-chave desta
 *    página ("controle de comissão", "agenda", "caixa da barbearia").
 *
 * 2. O CUSTO DE IMAGEM É PAGO SOB DEMANDA. Só a primeira imagem tem `priority`;
 *    as outras oito nascem `loading="lazy"` e dentro de um painel escondido, o
 *    que faz o navegador nem pedir o arquivo enquanto ninguém trocar de aba.
 *    Nove capturas baixadas de uma vez seriam megabytes na página que mais
 *    precisa ser rápida.
 *
 * 3. NADA VAI PARA A URL. Diferente das abas do perfil público, aqui não há link
 *    para compartilhar nem estado que valha um `replaceState` — é uma vitrine
 *    dentro da página, e mexer no histórico só atrapalharia o botão de voltar.
 *
 * 4. AS DUAS VISÕES TÊM CTA PRÓPRIO. Quem é dono fala com a gente no WhatsApp;
 *    quem é cliente cria conta de cliente. É a única diferença de caminho entre
 *    elas — a landing continua sendo uma página só, com um objetivo só.
 */

/** O mesmo botão para os dois CTAs; muda só o elemento (âncora ou Link). */
const CLASSES_CTA =
  "inline-flex h-12 items-center rounded-field border border-line bg-surface px-6 text-sm font-medium text-ink transition-colors hover:bg-surface-2";
export function VejaPorDentro() {
  const [visaoId, setVisaoId] = useState(VISOES[0]!.id);
  const [telaPorVisao, setTelaPorVisao] = useState<Record<string, number>>({});

  const botoesVisao = useRef<(HTMLButtonElement | null)[]>([]);
  const botoesTela = useRef<(HTMLButtonElement | null)[]>([]);

  const visao = VISOES.find((v) => v.id === visaoId) ?? VISOES[0]!;
  const telaAtiva = telaPorVisao[visao.id] ?? 0;

  function escolherTela(indice: number) {
    setTelaPorVisao((atual) => ({ ...atual, [visao.id]: indice }));
  }

  /** Setas, Home e End andam pela fita — é o que a semântica de tabs promete. */
  function andar(
    evento: React.KeyboardEvent,
    indice: number,
    total: number,
    ir: (i: number) => void,
    refs: React.RefObject<(HTMLButtonElement | null)[]>,
  ) {
    const ultimo = total - 1;
    let alvo: number | null = null;

    if (evento.key === "ArrowRight") alvo = indice === ultimo ? 0 : indice + 1;
    else if (evento.key === "ArrowLeft") alvo = indice === 0 ? ultimo : indice - 1;
    else if (evento.key === "Home") alvo = 0;
    else if (evento.key === "End") alvo = ultimo;

    if (alvo == null) return;
    evento.preventDefault();
    ir(alvo);
    refs.current[alvo]?.focus();
  }

  return (
    <div className="mt-10">
      {/* ---------- Quem é você ---------- */}
      <div
        role="tablist"
        aria-label="Escolha de quem é a visão"
        className="flex flex-col gap-2 sm:flex-row sm:justify-center"
      >
        {VISOES.map((v, indice) => {
          const selecionada = v.id === visao.id;
          return (
            <button
              key={v.id}
              ref={(el) => {
                botoesVisao.current[indice] = el;
              }}
              type="button"
              role="tab"
              id={`visao-${v.id}`}
              aria-controls={`painel-visao-${v.id}`}
              aria-selected={selecionada}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setVisaoId(v.id)}
              onKeyDown={(e) =>
                andar(e, indice, VISOES.length, (i) => setVisaoId(VISOES[i]!.id), botoesVisao)
              }
              className={cn(
                "h-12 rounded-field px-5 text-sm transition-colors sm:min-w-56",
                selecionada
                  ? "bg-brass font-medium text-brass-ink"
                  : "border border-line bg-surface text-ink-soft hover:bg-surface-2",
              )}
            >
              {v.rotulo}
            </button>
          );
        })}
      </div>

      {VISOES.map((v) => (
        <div
          key={v.id}
          role="tabpanel"
          id={`painel-visao-${v.id}`}
          aria-labelledby={`visao-${v.id}`}
          hidden={v.id !== visao.id}
          className="mt-8"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-2xl font-semibold text-ink sm:text-3xl">{v.titulo}</h3>
            <p className="mt-3 text-base leading-relaxed text-ink-soft">{v.texto}</p>
          </div>

          {/* A fita rola sozinha no celular. `-mx-4 px-4` faz a rolagem sangrar
              até a borda da tela em vez de parar no respiro do conteúdo. */}
          <div
            role="tablist"
            aria-label={`Telas — ${v.rotulo}`}
            className="-mx-4 mt-7 flex gap-2 overflow-x-auto px-4 pb-2 sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {v.telas.map((tela, indice) => {
              const daVisaoAtiva = v.id === visao.id;
              const selecionada = daVisaoAtiva && indice === telaAtiva;
              return (
                <button
                  key={tela.arquivo}
                  ref={(el) => {
                    if (daVisaoAtiva) botoesTela.current[indice] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tela-${tela.arquivo}`}
                  aria-controls={`painel-tela-${tela.arquivo}`}
                  aria-selected={selecionada}
                  tabIndex={selecionada ? 0 : -1}
                  onClick={() => escolherTela(indice)}
                  onKeyDown={(e) =>
                    andar(e, indice, v.telas.length, escolherTela, botoesTela)
                  }
                  className={cn(
                    "h-11 shrink-0 whitespace-nowrap rounded-field px-4 text-sm transition-colors",
                    selecionada
                      ? "bg-ink font-medium text-bg"
                      : "bg-surface-2 text-ink-soft hover:bg-line",
                  )}
                >
                  {tela.rotulo}
                </button>
              );
            })}
          </div>

          {v.telas.map((tela, indice) => (
            <figure
              key={tela.arquivo}
              role="tabpanel"
              id={`painel-tela-${tela.arquivo}`}
              aria-labelledby={`tela-${tela.arquivo}`}
              hidden={v.id !== visao.id || indice !== telaAtiva}
              className="mt-4"
            >
              <div
                className={cn(
                  "mx-auto overflow-hidden rounded-card border border-line bg-surface shadow-float",
                  // O print do celular é retrato e altíssimo: solto na largura
                  // do container ele viraria uma coluna de 800px de altura.
                  v.formato === "celular" ? "max-w-[18rem]" : "max-w-5xl",
                )}
              >
                <Image
                  src={`/capturas/${tela.arquivo}.png`}
                  alt={`${tela.rotulo} — ${v.rotulo.toLowerCase()}: ${tela.legenda}`}
                  width={tela.largura}
                  height={tela.altura}
                  // Só a primeira tela da primeira visão vale antecipar; as
                  // outras oito estão dentro de um painel escondido e o
                  // navegador não pede o arquivo até alguém trocar de aba.
                  //
                  // Medido em build de produção, 6 amostras com cache limpo:
                  // com `priority` o LCP ficou em 392 ms (316–472), sem ele em
                  // 420 ms (356–496) — faixas sobrepostas, diferença dentro do
                  // ruído. O motivo é estrutural: o elemento de LCP da landing é
                  // o H1, texto no topo, que o preload da imagem não disputa.
                  priority={v.id === VISOES[0]!.id && indice === 0}
                  sizes={
                    v.formato === "celular"
                      ? "288px"
                      : "(max-width: 1024px) 100vw, 1024px"
                  }
                  className="h-auto w-full"
                />
              </div>

              <figcaption className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-ink-soft">
                {tela.legenda}
              </figcaption>
            </figure>
          ))}

          {/* O CTA do dono sai do site (vai para o WhatsApp) e o do cliente
              fica dentro dele. `next/link` só sabe navegar internamente, então
              o externo precisa ser uma âncora de verdade. */}
          <div className="mt-8 flex justify-center">
            {v.cta.externo ? (
              <a
                href={v.cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className={CLASSES_CTA}
              >
                {v.cta.texto}
              </a>
            ) : (
              <Link href={v.cta.href} className={CLASSES_CTA}>
                {v.cta.texto}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
