"use client";

import { CalendarPlus, Clock, MessageCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { marcarEsperaConvertida, removerDaEspera } from "@/app/actions/shop";
import { NewAppointmentDialog } from "@/components/painel/NewAppointmentDialog";
import { Button, Chip, EmptyState } from "@/components/ui";
import {
  PERIODOS,
  type ProfissionalNaAgenda,
  type ServicoNaAgenda,
} from "@/lib/types";
import { diaPorExtenso, linkWhatsApp, mascaraTelefone } from "@/lib/utils";

export type EsperaNoPainel = {
  id: string;
  desired_date: string;
  period: string;
  status: string;
  created_at: string;
  pessoa: { full_name: string | null; phone: string | null } | null;
  profissional: string | null;
  servico: string | null;
};

const ROTULO_PERIODO = Object.fromEntries(PERIODOS.map((p) => [p.valor, p.rotulo]));

/**
 * A fila, agrupada por dia. O botão "Encaixar" abre o novo agendamento já com
 * o dia certo — é o gesto que fecha o ciclo da lista de espera.
 */
export function EsperaPainel({
  entradas,
  profissionais,
  servicos,
}: {
  entradas: EsperaNoPainel[];
  profissionais: ProfissionalNaAgenda[];
  servicos: ServicoNaAgenda[];
}) {
  const router = useRouter();
  const [encaixando, setEncaixando] = useState<EsperaNoPainel | null>(null);

  if (entradas.length === 0) {
    return (
      <EmptyState
        icone={<Clock aria-hidden />}
        titulo="Ninguém na lista de espera"
        descricao="Quando um dia lotar, o cliente entra na fila pelo app — e você encaixa por aqui."
      />
    );
  }

  // Agrupa por dia: é como o dono lê a fila ao abrir a agenda de amanhã.
  const porDia = new Map<string, EsperaNoPainel[]>();
  for (const e of entradas) {
    const lista = porDia.get(e.desired_date) ?? [];
    lista.push(e);
    porDia.set(e.desired_date, lista);
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {[...porDia.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([dia, lista]) => (
            <section key={dia}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                {diaPorExtenso(dia, true)}
              </h2>

              <ul className="flex flex-col gap-2">
                {lista.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {e.pessoa?.full_name ?? "Cliente"}
                        </span>
                        {e.status === "notified" ? <Chip tom="brass">Avisado</Chip> : null}
                      </p>
                      <p className="tnum text-xs text-ink-soft">
                        {ROTULO_PERIODO[e.period] ?? "Qualquer horário"}
                        {e.profissional ? ` · ${e.profissional}` : ""}
                        {e.servico ? ` · ${e.servico}` : ""}
                        {e.pessoa?.phone ? ` · ${mascaraTelefone(e.pessoa.phone)}` : ""}
                      </p>
                    </div>

                    <div className="flex w-full gap-1 sm:w-auto">
                      {e.pessoa?.phone ? (
                        <a
                          href={linkWhatsApp(
                            e.pessoa.phone,
                            `Olá! Abriu um horário aqui na barbearia no dia ${diaPorExtenso(dia)}. Ainda tem interesse?`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Chamar no WhatsApp"
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-field bg-money-soft text-money transition-opacity hover:opacity-85"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden />
                        </a>
                      ) : null}

                      <Button
                        tamanho="sm"
                        larguraTotal
                        className="sm:w-auto"
                        onClick={() => setEncaixando(e)}
                        iconeEsquerda={<CalendarPlus className="h-4 w-4" aria-hidden />}
                      >
                        Encaixar
                      </Button>

                      <BotaoRemover id={e.id} aoRemover={() => router.refresh()} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      <NewAppointmentDialog
        aberto={encaixando !== null}
        aoFechar={() => setEncaixando(null)}
        aoCriar={() => {
          // Encaixou: a entrada vira "convertida" em vez de sumir, para o
          // histórico mostrar que a fila deu resultado.
          if (encaixando) void marcarEsperaConvertida(encaixando.id);
          router.refresh();
        }}
        profissionais={profissionais}
        servicos={servicos}
        diaInicial={encaixando?.desired_date ?? ""}
      />
    </>
  );
}

function BotaoRemover({ id, aoRemover }: { id: string; aoRemover: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (confirmando) {
    return (
      <Button
        variante="dangerSolid"
        tamanho="sm"
        carregando={ocupado}
        onClick={() =>
          iniciar(async () => {
            await removerDaEspera(id);
            aoRemover();
          })
        }
      >
        Tirar
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Tirar da fila"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
