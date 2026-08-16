"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, LinkButton } from "@/components/ui";

/**
 * A REDE DE SEGURANÇA de todas as telas.
 *
 * Sem este arquivo, um erro não tratado em qualquer página do sistema derruba a
 * árvore inteira e o Next mostra a tela branca genérica dele — em inglês, sem
 * saída, e no meio do expediente de alguém.
 *
 * As consultas do projeto já devolvem lista vazia em vez de estourar (é o
 * padrão dos `catch` em `lib/queries/`), então chegar aqui significa que algo
 * saiu do previsto de verdade. O que esta tela oferece é o que resolve a maior
 * parte desses casos: tentar de novo.
 *
 * `reset()` remonta o segmento sem recarregar a página inteira — se foi uma
 * consulta que falhou por rede, ela é refeita e o barbeiro segue trabalhando.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Em produção o Next entrega só o `digest`; a mensagem real fica no log do
    // servidor, de propósito — mensagem de erro é onde vaza nome de tabela.
    console.error("[erro] tela quebrou:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>

      <div>
        <h1 className="text-xl font-semibold text-ink">Alguma coisa deu errado aqui</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Não foi culpa sua. Tente de novo — costuma resolver. Se continuar, fale com o
          suporte e conte o que você estava fazendo.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset} iconeEsquerda={<RotateCcw className="h-4 w-4" aria-hidden />}>
          Tentar de novo
        </Button>
        <LinkButton href="/" variante="secondary">
          Ir para o início
        </LinkButton>
      </div>

      {/* O digest é o que liga esta tela à linha certa no log do servidor. Sem
          ele, "deu erro" é tudo que se sabe quando alguém liga reclamando. */}
      {error.digest ? (
        <p className="tnum text-xs text-ink-faint">Código do erro: {error.digest}</p>
      ) : null}
    </div>
  );
}
