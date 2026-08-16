"use client";

import { Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * "Falta seu telefone" — o complemento de cadastro de quem entrou pelo Google.
 *
 * O Google devolve nome, e-mail e foto; telefone, nunca. Quem cria conta pela
 * senha digita o telefone quando quiser, mas quem entra pelo Google não passa
 * por formulário nenhum e o perfil fica sem ele.
 *
 * É um AVISO, não um bloqueio, e a diferença é proposital: o telefone não é
 * obrigatório para usar o app — o wizard de agendamento pergunta na hora se o
 * perfil não tiver. Barrar a home de quem acabou de entrar para pedir um dado
 * que o sistema sabe contornar seria trocar uma fricção pequena no fim por uma
 * grande no começo, que é justamente o que o agendamento sem login combate.
 *
 * A dispensa fica no localStorage: é preferência de tela, não dado de negócio,
 * e não vale uma coluna no banco nem uma ida ao servidor.
 */

const CHAVE = "pibarber:aviso-telefone-dispensado";

export function AvisoTelefone() {
  // Nasce escondido e só aparece depois da hidratação. Sem isso o servidor
  // renderizaria o aviso para quem já o dispensou, e ele piscaria na tela.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) !== "1") setVisivel(true);
    } catch {
      // Navegador com armazenamento bloqueado: mostra o aviso e segue a vida.
      setVisivel(true);
    }
  }, []);

  if (!visivel) return null;

  function dispensar() {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {
      // Não conseguiu lembrar: volta a aparecer da próxima vez. Tudo bem.
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-card bg-brass-soft px-4 py-3">
      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brass-deep" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-sm text-brass-deep">
          Falta seu telefone. É por ele que a barbearia te encontra se precisar remarcar.
        </p>
        <Link
          href="/app/perfil/dados"
          className="mt-1 inline-block text-sm font-semibold text-brass-deep underline underline-offset-2"
        >
          Completar cadastro
        </Link>
      </div>

      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar aviso"
        className="-mr-1.5 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-chip text-brass-deep/60 transition-colors hover:bg-brass/10 hover:text-brass-deep"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
