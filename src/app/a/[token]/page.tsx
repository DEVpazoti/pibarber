import { CalendarX2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buscarPorToken } from "@/app/actions/publico";
import { AcompanharAgendamento } from "@/components/booking/AcompanharAgendamento";
import { Logo } from "@/components/Logo";

/**
 * ACOMPANHAR UM AGENDAMENTO SEM CONTA.
 *
 * Quem agendou sem cadastro recebe `/a/<token>` e guarda o endereço. É a única
 * porta de volta para aquele horário — não há login que o recupere.
 *
 * Nunca indexada: o token é a senha, e um endereço destes num buscador seria o
 * agendamento de alguém aberto para o mundo. `noindex` no metadata, e a rota
 * também está fora do `sitemap.ts` (que só lista barbearias).
 */
export const metadata: Metadata = {
  title: "Seu agendamento",
  robots: { index: false, follow: false },
};

export default async function AcompanharPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const agendamento = await buscarPorToken(token);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[560px] items-center px-4 py-3">
          <Link href="/">
            <Logo tamanho="sm" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-6">
        {agendamento ? (
          <AcompanharAgendamento agendamento={agendamento} token={token} />
        ) : (
          /* Não distingue "nunca existiu" de "não é seu", e não há o que
             distinguir: quem tem o link, tem o horário. Responder coisas
             diferentes transformaria a página num oráculo de tokens válidos. */
          <div className="rounded-card border border-line bg-surface p-6 text-center">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-faint">
              <CalendarX2 className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="text-xl text-ink">Não encontrei esse agendamento</h1>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
              O link pode estar incompleto ou o agendamento pode ter sido removido. Confira o
              endereço, ou fale direto com a barbearia.
            </p>
            <Link
              href="/app/buscar"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-field bg-surface-2 px-5 text-sm font-medium text-ink hover:bg-line"
            >
              Buscar barbearias
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
