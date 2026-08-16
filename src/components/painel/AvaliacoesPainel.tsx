"use client";

import { AlertCircle, MessageSquare, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { responderAvaliacao } from "@/app/actions/shop";
import { Button, EmptyState, Textarea } from "@/components/ui";
import { cn, dataBR } from "@/lib/utils";

export type AvaliacaoNoPainel = {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
  autor: string | null;
  profissional: string | null;
};

/**
 * As avaliações recebidas, com o campo de responder.
 *
 * A resposta é PÚBLICA — sai em `/b/[slug]`, embaixo do comentário. Por isso o
 * aviso no rodapé do campo: quem responde precisa saber que está falando com
 * todo mundo, não só com aquele cliente.
 */
export function AvaliacoesPainel({ avaliacoes }: { avaliacoes: AvaliacaoNoPainel[] }) {
  if (avaliacoes.length === 0) {
    return (
      <EmptyState
        icone={<Star aria-hidden />}
        titulo="Nenhuma avaliação ainda"
        descricao="Depois de concluir um atendimento, o cliente recebe o convite para avaliar. A nota aparece no seu perfil público."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {avaliacoes.map((a) => (
        <li key={a.id}>
          <CartaoAvaliacao avaliacao={a} />
        </li>
      ))}
    </ul>
  );
}

function CartaoAvaliacao({ avaliacao }: { avaliacao: AvaliacaoNoPainel }) {
  const router = useRouter();
  const [respondendo, setRespondendo] = useState(false);
  const [texto, setTexto] = useState(avaliacao.reply ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await responderAvaliacao(avaliacao.id, texto);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui publicar.");
        return;
      }
      setRespondendo(false);
      router.refresh();
    });
  }

  return (
    <article className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-0.5" aria-label={`${avaliacao.rating} de 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "h-4 w-4",
                n <= avaliacao.rating ? "fill-brass text-brass" : "text-line-strong",
              )}
              aria-hidden
            />
          ))}
        </span>

        <span className="text-xs text-ink-faint">
          {avaliacao.autor ?? "Cliente"} · {dataBR(avaliacao.created_at)}
          {avaliacao.profissional ? ` · atendeu ${avaliacao.profissional}` : ""}
        </span>
      </div>

      {avaliacao.comment ? (
        <p className="mt-2 text-sm leading-relaxed text-ink">{avaliacao.comment}</p>
      ) : (
        <p className="mt-2 text-sm italic text-ink-faint">Sem comentário.</p>
      )}

      {avaliacao.reply && !respondendo ? (
        <div className="mt-3 rounded-field bg-surface-2 p-3">
          <p className="text-xs font-semibold text-brass-deep">Sua resposta</p>
          <p className="mt-0.5 text-sm text-ink-soft">{avaliacao.reply}</p>
          <button
            type="button"
            onClick={() => setRespondendo(true)}
            className="mt-2 text-xs font-medium text-brass"
          >
            Editar resposta
          </button>
        </div>
      ) : null}

      {respondendo ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Agradeça, ou explique o que aconteceu. Responder bem a uma crítica vale mais do que ela custou."
            aria-label="Resposta"
          />
          <p className="text-xs text-ink-faint">
            Esta resposta aparece publicamente no seu perfil, para qualquer pessoa.
          </p>

          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button tamanho="sm" carregando={enviando} onClick={enviar}>
              Publicar resposta
            </Button>
            <Button variante="ghost" tamanho="sm" onClick={() => setRespondendo(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : !avaliacao.reply ? (
        <div className="mt-3">
          <Button
            variante="secondary"
            tamanho="sm"
            onClick={() => setRespondendo(true)}
            iconeEsquerda={<MessageSquare className="h-4 w-4" aria-hidden />}
          >
            Responder
          </Button>
        </div>
      ) : null}
    </article>
  );
}
