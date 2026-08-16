"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { salvarMinhaFoto } from "@/app/actions/client";
import { Avatar } from "@/components/ui";
import {
  ACCEPT,
  apagarImagemAntiga,
  conferirArquivo,
  enviarImagem,
} from "@/lib/imagens";

/**
 * A FOTO DE PERFIL DO CLIENTE — o botão de câmera que até agora era enfeite.
 *
 * O avatar já existia (vem do Google, quando o login é por lá) e o ícone de
 * câmera já estava desenhado sobre ele, sem fazer nada. Agora ele abre a
 * galeria do celular.
 *
 * Diferente dos campos do painel, aqui NÃO existe formulário para salvar
 * depois: a pessoa toca, escolhe e pronto. Então esta tela grava sozinha, em
 * dois tempos — sobe o arquivo, depois guarda a URL no perfil.
 *
 * O campo de URL não aparece: colar endereço de imagem é coisa de quem
 * administra um sistema, não de quem só quer trocar a própria foto.
 */
export function FotoDoPerfil({
  profileId,
  nome,
  urlAtual,
}: {
  profileId: string;
  nome: string | null;
  urlAtual: string | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);

  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [, iniciar] = useTransition();

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);

    const problema = conferirArquivo(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }

    setEnviando(true);
    let local: string | null = null;

    try {
      local = URL.createObjectURL(arquivo);
      setPrevia(local);

      const url = await enviarImagem("cliente", profileId, arquivo);
      const resultado = await salvarMinhaFoto(url);

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar a foto.");
        setPrevia(null);
        return;
      }

      void apagarImagemAntiga(urlAtual);
      // `refresh` traz a foto nova pelo caminho normal (servidor), e aí a
      // prévia local pode ser dispensada.
      iniciar(() => router.refresh());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui enviar a foto.");
      setPrevia(null);
    } finally {
      if (local) URL.revokeObjectURL(local);
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar src={previa ?? urlAtual} nome={nome} tamanho="xl" />

        <input
          ref={entrada}
          id="foto-perfil"
          type="file"
          accept={ACCEPT}
          disabled={enviando}
          onChange={(e) => void escolher(e.target.files?.[0])}
          className="sr-only"
        />

        {/* O rótulo É o botão: um <label> ligado ao input de arquivo abre o
            seletor sem uma linha de JavaScript, e continua alcançável pelo
            teclado e pelo leitor de tela. */}
        <label
          htmlFor="foto-perfil"
          aria-label={urlAtual ? "Trocar a foto do perfil" : "Escolher uma foto de perfil"}
          className="absolute -bottom-1 -right-1 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-brass text-brass-ink shadow-card transition-opacity hover:opacity-90"
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-4 w-4" aria-hidden />
          )}
        </label>
      </div>

      {erro ? (
        <p className="max-w-64 text-center text-xs text-danger" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
