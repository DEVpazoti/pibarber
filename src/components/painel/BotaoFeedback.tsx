"use client";

import {
  Bug,
  CheckCircle2,
  ImagePlus,
  Lightbulb,
  MessageSquarePlus,
  ThumbsUp,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { enviarFeedback, type TipoDeRelato } from "@/app/actions/feedback";
import { Button, Field, Modal, Textarea } from "@/components/ui";
import { ACCEPT, conferirArquivo, reduzir } from "@/lib/imagens";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * "Reportar problema ou dar sugestão" — mora no "Precisa de ajuda?" do painel.
 *
 * O barbeiro escreve só o essencial; o resto (página em que estava, navegador,
 * tamanho da tela, papel, plano) vai junto sozinho — ver
 * `enviarFeedback` em src/app/actions/feedback.ts.
 *
 * O print vai para o bucket PRIVADO `feedbacks` (28_feedbacks.sql), não para
 * o `imagens`, que é público: um print do painel pode ter nome e telefone de
 * cliente. Só o /admin vê, por link assinado.
 */

const TIPOS: { id: TipoDeRelato; rotulo: string; Icone: typeof Bug; dica: string }[] = [
  { id: "problema", rotulo: "Problema", Icone: Bug, dica: "O que aconteceu? O que você esperava?" },
  {
    id: "sugestao",
    rotulo: "Sugestão",
    Icone: Lightbulb,
    dica: "O que deixaria o sistema melhor?",
  },
  { id: "elogio", rotulo: "Elogio", Icone: ThumbsUp, dica: "Conta pra gente o que está bom!" },
];

export function BotaoFeedback({ shopId }: { shopId: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-field px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
      >
        <MessageSquarePlus className="h-4.5 w-4.5 shrink-0 text-brass" aria-hidden />
        Reportar problema ou dar sugestão
      </button>
      {aberto ? <JanelaFeedback shopId={shopId} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}

function JanelaFeedback({ shopId, aoFechar }: { shopId: string; aoFechar: () => void }) {
  const pagina = usePathname();
  const [tipo, setTipo] = useState<TipoDeRelato>("problema");
  const [mensagem, setMensagem] = useState("");
  const [print, setPrint] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const emVoo = useRef(false);
  const refArquivo = useRef<HTMLInputElement>(null);

  const dica = TIPOS.find((t) => t.id === tipo)?.dica;

  function escolherPrint(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    const problema = conferirArquivo(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    setPrint(arquivo);
  }

  function enviar() {
    if (emVoo.current) return;
    if (mensagem.trim().length < 5) {
      setErro("Conte um pouco mais — pelo menos uma frase.");
      return;
    }
    emVoo.current = true;
    setErro(null);

    iniciar(async () => {
      let anexo: string | null = null;

      if (print) {
        try {
          const { blob, extensao } = await reduzir(print, 1600);
          const caminho = `${shopId}/print-${Date.now()}.${extensao}`;
          const { error } = await createClient()
            .storage.from("feedbacks")
            .upload(caminho, blob, { contentType: blob.type, upsert: false });
          if (error) throw error;
          anexo = caminho;
        } catch (e) {
          console.error("[feedback] falha ao enviar o print:", e);
          emVoo.current = false;
          setErro("Não consegui enviar o print. Tente sem ele, ou de novo em instantes.");
          return;
        }
      }

      const r = await enviarFeedback({
        tipo,
        mensagem,
        pagina: pagina ?? undefined,
        navegador: navigator.userAgent,
        tela: `${window.innerWidth}x${window.innerHeight}`,
        anexo,
      });
      emVoo.current = false;

      if (!r.ok) {
        setErro(r.message ?? "Não consegui enviar. Tente de novo.");
        return;
      }
      setEnviado(r.message ?? "Recebemos, obrigado!");
    });
  }

  return (
    <Modal
      aberto
      aoFechar={enviando ? () => undefined : aoFechar}
      titulo={enviado ? "Obrigado!" : "Reportar problema ou dar sugestão"}
      descricao={enviado ? undefined : "Vai direto para a equipe do PiBarber."}
      rodape={
        enviado ? (
          <div className="flex justify-end">
            <Button onClick={aoFechar}>Fechar</Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variante="ghost" onClick={aoFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button carregando={enviando} onClick={enviar}>
              Enviar
            </Button>
          </div>
        )
      }
    >
      {enviado ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-money" aria-hidden />
          <p className="text-sm text-ink">{enviado}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Tipo do relato" className="grid grid-cols-3 gap-2">
            {TIPOS.map(({ id, rotulo, Icone }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tipo === id}
                onClick={() => setTipo(id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-card border p-3 text-sm font-medium transition-colors",
                  tipo === id
                    ? "border-brass bg-brass-soft text-ink"
                    : "border-line bg-surface text-ink-soft hover:bg-surface-2",
                )}
              >
                <Icone
                  className={cn("h-5 w-5", tipo === id ? "text-brass-deep" : "text-ink-faint")}
                  aria-hidden
                />
                {rotulo}
              </button>
            ))}
          </div>

          <Field label="Conte pra gente" htmlFor="fb-msg" obrigatorio dica={dica}>
            <Textarea
              id="fb-msg"
              rows={5}
              maxLength={2000}
              value={mensagem}
              onChange={(e) => {
                setMensagem(e.target.value);
                setErro(null);
              }}
            />
          </Field>

          <div>
            <input
              ref={refArquivo}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => escolherPrint(e.target.files?.[0])}
            />
            {print ? (
              <div className="flex items-center gap-2 rounded-field bg-surface-2 px-3 py-2 text-sm text-ink">
                <ImagePlus className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{print.name}</span>
                <button
                  type="button"
                  onClick={() => setPrint(null)}
                  aria-label="Remover o print"
                  className="grid h-8 w-8 place-items-center rounded-chip text-ink-faint hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => refArquivo.current?.click()}
                className="inline-flex h-11 items-center gap-2 rounded-field px-1 text-sm font-medium text-brass hover:text-brass-deep"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                Anexar um print da tela (opcional)
              </button>
            )}
          </div>

          <p className="text-xs text-ink-faint">
            Junto vai a página em que você está e o seu navegador — ajuda a gente a achar o problema
            mais rápido. A resposta chega pelo seu WhatsApp.
          </p>

          {erro ? (
            <p
              role="alert"
              className="rounded-field bg-danger-soft px-3.5 py-3 text-sm text-danger"
            >
              {erro}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
