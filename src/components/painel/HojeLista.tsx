"use client";

import { CalendarPlus, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppointmentSheet } from "@/components/painel/AppointmentSheet";
import { CompleteDialog } from "@/components/painel/CompleteDialog";
import { NewAppointmentDialog } from "@/components/painel/NewAppointmentDialog";
import { Button, Chip, EmptyState } from "@/components/ui";
import {
  emAberto,
  STATUS_AGENDAMENTO,
  type AgendamentoNaAgenda,
  type ProfissionalNaAgenda,
  type ServicoNaAgenda,
} from "@/lib/types";
import { brl, horaBR } from "@/lib/utils";

/**
 * A agenda de hoje da tela inicial do painel.
 *
 * Cada linha tem o botão CONCLUIR direto, sem passar pelo detalhe: é o gesto
 * que o barbeiro repete o dia inteiro, e cada toque a menos conta. Tocar no
 * resto da linha abre o detalhe, com cancelar e marcar falta.
 */

export function HojeLista({
  agendamentos,
  profissionais,
  servicos,
  dia,
  podeVerDinheiro,
}: {
  agendamentos: AgendamentoNaAgenda[];
  profissionais: ProfissionalNaAgenda[];
  servicos: ServicoNaAgenda[];
  /** Hoje, calculado no servidor. */
  dia: string;
  podeVerDinheiro: boolean;
}) {
  const router = useRouter();
  const [detalhe, setDetalhe] = useState<AgendamentoNaAgenda | null>(null);
  const [concluindo, setConcluindo] = useState<AgendamentoNaAgenda | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  function atualizar() {
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Agenda de hoje</h2>
        <Button
          tamanho="sm"
          onClick={() => setNovoAberto(true)}
          iconeEsquerda={<CalendarPlus className="h-4 w-4" aria-hidden />}
        >
          Agendar
        </Button>
      </div>

      {agendamentos.length === 0 ? (
        <EmptyState
          icone={<CalendarPlus aria-hidden />}
          titulo="Nenhum atendimento hoje"
          descricao="Dia livre por enquanto. Quando alguém ligar, marque por aqui."
          acao={<Button onClick={() => setNovoAberto(true)}>Agendar alguém</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {agendamentos.map((a) => {
            const status = STATUS_AGENDAMENTO[a.status];
            const aberto = emAberto(a.status);

            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
              >
                <button
                  type="button"
                  onClick={() => setDetalhe(a)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="tnum grid w-14 shrink-0 place-items-center rounded-field bg-surface-2 py-2 text-sm font-semibold text-ink">
                    {horaBR(a.starts_at)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {a.dependente?.full_name ?? a.cliente?.full_name ?? "Cliente"}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {a.servicos.join(", ") || "Atendimento"}
                      {a.profissional
                        ? ` · ${a.profissional.nickname || a.profissional.name}`
                        : ""}
                    </span>
                  </span>

                  {/* O valor é informação de dinheiro: o assistente não vê. */}
                  {podeVerDinheiro ? (
                    <span className="tnum hidden shrink-0 text-sm font-semibold text-ink sm:block">
                      {brl(a.total_price - a.discount)}
                    </span>
                  ) : null}
                </button>

                {aberto ? (
                  <Button
                    tamanho="sm"
                    onClick={() => setConcluindo(a)}
                    iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
                  >
                    <span className="hidden sm:inline">Concluir</span>
                  </Button>
                ) : (
                  <Chip tom={status.tom}>{status.rotulo}</Chip>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AppointmentSheet
        agendamento={detalhe}
        aoFechar={() => setDetalhe(null)}
        aoConcluirPedido={(a) => {
          setDetalhe(null);
          setConcluindo(a);
        }}
        aoMudar={atualizar}
      />

      <CompleteDialog
        agendamento={concluindo}
        aoFechar={() => setConcluindo(null)}
        aoConcluir={atualizar}
      />

      <NewAppointmentDialog
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        aoCriar={atualizar}
        profissionais={profissionais}
        servicos={servicos}
        diaInicial={dia}
      />
    </>
  );
}
