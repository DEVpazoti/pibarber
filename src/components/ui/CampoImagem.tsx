"use client";

import { AlertCircle, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/Input";
import {
  ACCEPT,
  apagarImagemAntiga,
  conferirArquivo,
  enviarImagem,
  type TipoDeImagem,
} from "@/lib/imagens";
import { cn } from "@/lib/utils";

/**
 * CAMPO DE IMAGEM — escolher do aparelho ou colar um endereço.
 *
 * Antes só existia o endereço: um campo de texto pedindo "https://…". Funciona,
 * não custa nada e foi o certo para a primeira versão — mas obriga o dono a
 * hospedar a imagem em outro lugar antes, e ninguém faz isso do celular no meio
 * do expediente. Ver `docs/imagens.md`.
 *
 * As duas formas convivem. O envio é o caminho normal; a URL continua ali para
 * quem já tem a imagem publicada em outro lugar (o próprio logo do Instagram,
 * por exemplo) e para não invalidar o que já está cadastrado.
 *
 * ⚠️ O componente NÃO salva sozinho. Ele sobe o arquivo, devolve a URL por
 * `aoMudar` e quem manda no formulário decide quando gravar. A limpeza da
 * imagem antiga acontece só quando a nova já subiu — se o envio falhar, o que
 * estava lá continua lá.
 */
export function CampoImagem({
  rotulo,
  dica,
  tipo,
  dono,
  valor,
  aoMudar,
  /** `redondo` para logo e foto de pessoa; `largo` para a capa. */
  formato = "redondo",
}: {
  rotulo: string;
  dica?: string;
  tipo: TipoDeImagem;
  /** O id que manda no caminho: a barbearia, o profissional ou o perfil. */
  dono: string;
  valor: string;
  aoMudar: (url: string) => void;
  formato?: "redondo" | "largo";
}) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);

  const [modo, setModo] = useState<"enviar" | "url">("enviar");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * A prévia local, criada com `URL.createObjectURL`. Ela aparece no instante
   * em que o arquivo é escolhido, antes de o envio terminar — assim o dono vê
   * o que escolheu enquanto a barra de 4G decide se colabora.
   */
  const [previa, setPrevia] = useState<string | null>(null);

  // Todo objectURL criado precisa ser devolvido, senão o blob fica preso na
  // memória da aba até o recarregamento.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [previa]);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);

    const problema = conferirArquivo(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }

    const local = URL.createObjectURL(arquivo);
    setPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return local;
    });

    setEnviando(true);
    try {
      const anterior = valor;
      const url = await enviarImagem(tipo, dono, arquivo);
      aoMudar(url);
      // Só depois de a nova estar no ar. Não espera: é faxina, não é o trabalho.
      void apagarImagemAntiga(anterior);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui enviar a imagem.");
      setPrevia((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior);
        return null;
      });
    } finally {
      setEnviando(false);
      // Zera o input: escolher o MESMO arquivo de novo (depois de um erro) não
      // dispara `change` se o valor não mudar.
      if (entrada.current) entrada.current.value = "";
    }
  }

  function remover() {
    const anterior = valor;
    setErro(null);
    setPrevia((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    aoMudar("");
    void apagarImagemAntiga(anterior);
  }

  const mostrando = previa ?? (valor || null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{rotulo}</span>
        <button
          type="button"
          onClick={() => {
            setModo((m) => (m === "url" ? "enviar" : "url"));
            setErro(null);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-field px-2 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {modo === "url" ? (
            <>
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Enviar do aparelho
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Usar um endereço
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* --- A prévia ---------------------------------------------------
            <img> em vez de next/image de propósito: a origem aqui é um
            `blob:` local ou uma URL que o dono acabou de colar, e o
            otimizador do Next não sabe lidar com nenhum dos dois. */}
        <span
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden border border-line bg-surface-2",
            formato === "redondo" ? "h-16 w-16 rounded-full" : "h-16 w-28 rounded-field",
          )}
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-faint" aria-hidden />
          ) : mostrando ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mostrando}
              alt={`Prévia — ${rotulo.toLowerCase()}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <Upload className="h-5 w-5 text-ink-faint" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {modo === "enviar" ? (
            <>
              <input
                ref={entrada}
                id={id}
                type="file"
                accept={ACCEPT}
                disabled={enviando}
                onChange={(e) => void escolher(e.target.files?.[0])}
                className="sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line",
                  enviando && "pointer-events-none opacity-50",
                )}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {enviando ? "Enviando…" : mostrando ? "Trocar imagem" : "Escolher imagem"}
              </label>
            </>
          ) : (
            <Input
              id={id}
              value={valor}
              onChange={(e) => aoMudar(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              aria-label={`Endereço da imagem — ${rotulo.toLowerCase()}`}
            />
          )}

          {mostrando && !enviando ? (
            <button
              type="button"
              onClick={remover}
              className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-field px-2 text-xs font-medium text-danger transition-colors hover:bg-danger-soft"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remover
            </button>
          ) : null}
        </div>
      </div>

      {erro ? (
        <p className="flex items-start gap-1.5 text-xs text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : dica ? (
        <p className="text-xs text-ink-faint">{dica}</p>
      ) : null}
    </div>
  );
}
