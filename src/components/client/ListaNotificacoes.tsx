"use client";

import { Bell, CalendarClock, CheckCheck, Megaphone, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { marcarNotificacaoLida, marcarTodasLidas } from "@/app/actions/client";
import { Button, EmptyState, LinkButton } from "@/components/ui";
import type { AppNotification } from "@/lib/types";
import { cn, tempoRelativo } from "@/lib/utils";

/** Cada tipo tem um ícone, para o olho separar a lista sem ler. */
const ICONES = {
  appointment: CalendarClock,
  reminder: CalendarClock,
  waitlist: Megaphone,
  review: Star,
  system: Bell,
} as const;

export function ListaNotificacoes({ notificacoes }: { notificacoes: AppNotification[] }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();

  const naoLidas = notificacoes.filter((n) => n.read_at == null).length;

  if (notificacoes.length === 0) {
    return (
      <EmptyState
        icone={<Bell aria-hidden />}
        titulo="Nenhuma notificação"
        descricao="Avisos sobre seus agendamentos e sobre vagas que abrirem aparecem aqui."
        acao={<LinkButton href="/app">Voltar para o início</LinkButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {naoLidas > 0 ? (
        <div className="flex justify-end">
          <Button
            variante="ghost"
            tamanho="sm"
            carregando={ocupado}
            onClick={() =>
              iniciar(async () => {
                await marcarTodasLidas();
                router.refresh();
              })
            }
            iconeEsquerda={<CheckCheck className="h-4 w-4" aria-hidden />}
          >
            Marcar todas como lidas
          </Button>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {notificacoes.map((n) => {
          const Icone = ICONES[n.type] ?? Bell;
          const lida = n.read_at != null;

          const conteudo = (
            <>
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-field",
                  lida ? "bg-surface-2 text-ink-faint" : "bg-brass-soft text-brass-deep",
                )}
              >
                <Icone className="h-5 w-5" aria-hidden />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm",
                    lida ? "font-medium text-ink-soft" : "font-semibold text-ink",
                  )}
                >
                  {n.title}
                </span>
                {n.body ? (
                  <span className="block text-xs text-ink-soft">{n.body}</span>
                ) : null}
                <span className="block text-xs text-ink-faint">{tempoRelativo(n.created_at)}</span>
              </span>

              {!lida ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-brass" aria-label="Não lida" />
              ) : null}
            </>
          );

          const classe =
            "flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2";

          return (
            <li key={n.id} className="border-b border-line last:border-b-0">
              {n.link ? (
                <Link
                  href={n.link}
                  className={classe}
                  onClick={() => {
                    // Abrir já marca como lida: é o gesto que diz "eu vi".
                    if (!lida) void marcarNotificacaoLida(n.id);
                  }}
                >
                  {conteudo}
                </Link>
              ) : (
                <button
                  type="button"
                  className={classe}
                  onClick={() =>
                    iniciar(async () => {
                      if (!lida) {
                        await marcarNotificacaoLida(n.id);
                        router.refresh();
                      }
                    })
                  }
                >
                  {conteudo}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
