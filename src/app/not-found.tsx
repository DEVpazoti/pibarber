import { Compass } from "lucide-react";

import { LinkButton } from "@/components/ui";

/**
 * O 404 do sistema inteiro.
 *
 * Serve para dois caminhos diferentes: link errado digitado na barra, e
 * `notFound()` chamado de propósito — a ficha de cliente que não existe, a
 * barbearia com slug trocado.
 *
 * Os dois botões cobrem os dois públicos que chegam aqui: quem opera o painel
 * e quem é cliente. Não dá para saber qual é sem consultar a sessão, e uma
 * consulta ao banco numa página de erro é a maneira mais fácil de o erro virar
 * outro erro.
 */
export default function NaoEncontrado() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-faint">
        <Compass className="h-6 w-6" aria-hidden />
      </span>

      <div>
        <p className="font-display text-4xl font-semibold text-brass">404</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Esta página não existe</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Ou o endereço está errado, ou o que estava aqui foi removido.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <LinkButton href="/painel">Ir para o painel</LinkButton>
        <LinkButton href="/app" variante="secondary">
          Ir para o app
        </LinkButton>
      </div>
    </div>
  );
}
