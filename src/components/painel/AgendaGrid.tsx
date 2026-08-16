"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AgendaDoDia } from "@/components/painel/AgendaDoDia";
import { AppointmentSheet } from "@/components/painel/AppointmentSheet";
import { CompleteDialog } from "@/components/painel/CompleteDialog";
import { NewAppointmentDialog } from "@/components/painel/NewAppointmentDialog";
import { Button, EmptyState } from "@/components/ui";
import type {
  AgendamentoNaAgenda,
  AppointmentStatus,
  ProfissionalNaAgenda,
  ServicoNaAgenda,
} from "@/lib/types";
import {
  cn,
  diaDaSemana,
  diaPorExtenso,
  DIAS_SEMANA_CURTOS,
  horaBR,
  minutosDoDia,
  minutosParaHora,
  paraDataISO,
  somarDias,
} from "@/lib/utils";

/**
 * A GRADE DA AGENDA.
 *
 * Desktop, modo dia: uma coluna por profissional, blocos posicionados pelo
 * horário. Celular: a linha do tempo do dia, em `AgendaDoDia` — a grade
 * espremida em 375px vira ilegível, então nem tentamos.
 *
 * A navegação entre datas é feita por URL (`?dia=&modo=`), não por estado: o
 * barbeiro consegue voltar pelo botão do navegador e mandar o link de um dia
 * específico para alguém.
 */

/** Altura de um minuto na grade. 1.6px dá ~48px num corte de 30 minutos. */
const PX_POR_MINUTO = 1.6;
/** Passo dos vazios clicáveis. 30 minutos é o encaixe mais comum. */
const PASSO = 30;

// `confirmed` repete `scheduled` de propósito: os dois são o mesmo estado, e o
// valor só sobrevive no enum do banco. Ver STATUS_AGENDAMENTO em lib/types.ts.
const CORES: Record<AppointmentStatus, string> = {
  scheduled: "bg-info-soft text-info border-info/25",
  confirmed: "bg-info-soft text-info border-info/25",
  completed: "bg-money-soft text-money border-money/25",
  cancelled: "bg-surface-2 text-ink-faint border-line line-through",
  no_show: "bg-danger-soft text-danger border-danger/25",
};

export function AgendaGrid({
  dia,
  modo,
  diasDaSemana,
  agendamentos,
  profissionais,
  servicos,
  abreEm,
  fechaEm,
  hoje,
}: {
  dia: string;
  modo: "dia" | "semana";
  diasDaSemana: string[];
  agendamentos: AgendamentoNaAgenda[];
  profissionais: ProfissionalNaAgenda[];
  servicos: ServicoNaAgenda[];
  /** Minutos desde a meia-noite: o começo e o fim da grade. */
  abreEm: number;
  fechaEm: number;
  /** Hoje calculado no SERVIDOR, no fuso de São Paulo. */
  hoje: string;
}) {
  const router = useRouter();

  const [detalhe, setDetalhe] = useState<AgendamentoNaAgenda | null>(null);
  const [concluindo, setConcluindo] = useState<AgendamentoNaAgenda | null>(null);
  const [novo, setNovo] = useState<{ dia: string; hora?: string; profissional?: string } | null>(
    null,
  );

  const linhasDeHora = useMemo(() => {
    const linhas: number[] = [];
    for (let m = Math.floor(abreEm / 60) * 60; m <= fechaEm; m += 60) linhas.push(m);
    return linhas;
  }, [abreEm, fechaEm]);

  const alturaGrade = (fechaEm - abreEm) * PX_POR_MINUTO;

  /** Os vazios clicáveis de uma coluna: de 30 em 30 minutos. */
  const encaixes = useMemo(() => {
    const lista: number[] = [];
    for (let m = abreEm; m < fechaEm; m += PASSO) lista.push(m);
    return lista;
  }, [abreEm, fechaEm]);

  function irPara(novoDia: string, novoModo: "dia" | "semana" = modo) {
    router.push(`/painel/agenda?dia=${novoDia}&modo=${novoModo}`);
  }

  const passo = modo === "dia" ? 1 : 7;

  /** Só os que ocupam lugar na grade — cancelado e falta somem do desenho. */
  const visiveis = agendamentos.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );

  function atualizar() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ==================================================================
          Barra de navegação
          ================================================================== */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => irPara(somarDias(dia, -passo))}
            aria-label={modo === "dia" ? "Dia anterior" : "Semana anterior"}
            className="grid h-11 w-11 place-items-center rounded-field bg-surface-2 text-ink-soft transition-colors hover:bg-line hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => irPara(somarDias(dia, passo))}
            aria-label={modo === "dia" ? "Próximo dia" : "Próxima semana"}
            className="grid h-11 w-11 place-items-center rounded-field bg-surface-2 text-ink-soft transition-colors hover:bg-line hover:text-ink"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
          {modo === "dia"
            ? diaPorExtenso(dia, true)
            : `${diaPorExtenso(diasDaSemana[0] ?? dia)} a ${diaPorExtenso(diasDaSemana[6] ?? dia, true)}`}
        </p>

        {dia !== hoje ? (
          <Button variante="secondary" tamanho="sm" onClick={() => irPara(hoje)}>
            Hoje
          </Button>
        ) : null}

        {/* Alternância dia/semana. Link em vez de botão: dá para abrir em
            outra aba, e o estado vive na URL. */}
        <div className="flex overflow-hidden rounded-chip bg-surface-2">
          {(["dia", "semana"] as const).map((m) => (
            <Link
              key={m}
              href={`/painel/agenda?dia=${dia}&modo=${m}`}
              aria-current={modo === m ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center px-4 text-sm font-medium transition-colors",
                modo === m ? "bg-brass text-brass-ink" : "text-ink-soft hover:text-ink",
              )}
            >
              {m === "dia" ? "Dia" : "Semana"}
            </Link>
          ))}
        </div>

        <Button
          onClick={() => setNovo({ dia })}
          iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
        >
          Agendar
        </Button>
      </div>

      {/* ==================================================================
          Sem profissional não existe agenda
          ================================================================== */}
      {profissionais.length === 0 ? (
        <EmptyState
          icone={<CalendarDays aria-hidden />}
          titulo="Nenhum profissional cadastrado"
          descricao="A agenda é montada por profissional. Cadastre a equipe para começar a marcar."
          acao={
            <Link
              href="/painel/equipe"
              className="inline-flex h-12 items-center rounded-field bg-brass px-5 text-sm font-medium text-brass-ink"
            >
              Cadastrar profissional
            </Link>
          }
        />
      ) : modo === "semana" ? (
        <VisaoSemana
          dias={diasDaSemana}
          agendamentos={agendamentos}
          hoje={hoje}
          aoAbrir={(a) => setDetalhe(a)}
          aoAgendar={(d) => setNovo({ dia: d })}
        />
      ) : (
        <>
          {/* ---------- Celular: o dia em linha do tempo ------------------- */}
          <div className="lg:hidden">
            <AgendaDoDia
              agendamentos={agendamentos}
              dia={dia}
              hoje={hoje}
              abreEm={abreEm}
              fechaEm={fechaEm}
              aoAbrir={(a) => setDetalhe(a)}
              aoConcluir={(a) => setConcluindo(a)}
              aoAgendar={(hora) => setNovo({ dia, hora })}
              aoMudar={atualizar}
            />
          </div>

          {/* ---------- Desktop: a grade de verdade ------------------------ */}
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface lg:block">
            <div className="min-w-[640px]">
              {/* Cabeçalho: uma coluna por profissional */}
              <div
                className="grid border-b border-line"
                style={{
                  gridTemplateColumns: `64px repeat(${profissionais.length}, minmax(0, 1fr))`,
                }}
              >
                <div />
                {profissionais.map((p) => (
                  <div
                    key={p.id}
                    className="border-l border-line px-3 py-2.5 text-center text-sm font-semibold text-ink"
                  >
                    {p.nickname || p.name}
                  </div>
                ))}
              </div>

              {/* Corpo */}
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `64px repeat(${profissionais.length}, minmax(0, 1fr))`,
                }}
              >
                {/* Régua de horas */}
                <div className="relative" style={{ height: alturaGrade }}>
                  {linhasDeHora.map((m) => (
                    <span
                      key={m}
                      className="tnum absolute right-2 -translate-y-1/2 text-xs text-ink-faint"
                      style={{ top: (m - abreEm) * PX_POR_MINUTO }}
                    >
                      {minutosParaHora(m)}
                    </span>
                  ))}
                </div>

                {profissionais.map((p) => (
                  <div
                    key={p.id}
                    className="relative border-l border-line"
                    style={{ height: alturaGrade }}
                  >
                    {/* Camada 1: os vazios clicáveis. Clicar num deles abre o
                        novo agendamento JÁ naquele horário e profissional. */}
                    {encaixes.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setNovo({ dia, hora: minutosParaHora(m), profissional: p.id })
                        }
                        aria-label={`Agendar ${minutosParaHora(m)} com ${p.nickname || p.name}`}
                        className={cn(
                          "absolute inset-x-0 transition-colors hover:bg-brass-soft/60",
                          m % 60 === 0 ? "border-t border-line" : "border-t border-line/40",
                        )}
                        style={{
                          top: (m - abreEm) * PX_POR_MINUTO,
                          height: PASSO * PX_POR_MINUTO,
                        }}
                      />
                    ))}

                    {/* Camada 2: os atendimentos, por cima dos vazios. */}
                    {visiveis
                      .filter((a) => a.profissional?.id === p.id)
                      .map((a) => {
                        const inicio = minutosDoDia(a.starts_at);
                        const fim = minutosDoDia(a.ends_at);
                        const altura = Math.max(28, (fim - inicio) * PX_POR_MINUTO - 2);

                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setDetalhe(a)}
                            className={cn(
                              "absolute inset-x-1 overflow-hidden rounded-field border px-2 py-1 text-left",
                              "transition-transform hover:z-10 hover:scale-[1.01]",
                              CORES[a.status],
                            )}
                            style={{ top: (inicio - abreEm) * PX_POR_MINUTO + 1, height: altura }}
                          >
                            <span className="tnum block text-[11px] font-semibold">
                              {horaBR(a.starts_at)}
                            </span>
                            <span className="block truncate text-xs font-medium">
                              {a.dependente?.full_name ?? a.cliente?.full_name ?? "Cliente"}
                            </span>
                            {altura > 52 ? (
                              <span className="block truncate text-[11px] opacity-80">
                                {a.servicos.join(", ")}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================================================================
          Diálogos
          ================================================================== */}
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
        aberto={novo !== null}
        aoFechar={() => setNovo(null)}
        aoCriar={atualizar}
        profissionais={profissionais}
        servicos={servicos}
        diaInicial={novo?.dia ?? dia}
        horaInicial={novo?.hora}
        profissionalInicial={novo?.profissional}
      />
    </div>
  );
}

/* ==========================================================================
   Semana — 7 colunas compactas
   ========================================================================== */

function VisaoSemana({
  dias,
  agendamentos,
  hoje,
  aoAbrir,
  aoAgendar,
}: {
  dias: string[];
  agendamentos: AgendamentoNaAgenda[];
  hoje: string;
  aoAbrir: (a: AgendamentoNaAgenda) => void;
  aoAgendar: (dia: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {dias.map((d) => {
        const doDia = agendamentos.filter((a) => mesmoDia(a, d));
        const eHoje = d === hoje;

        return (
          <div
            key={d}
            className={cn(
              "flex flex-col gap-2 rounded-card border p-3",
              eHoje ? "border-brass bg-brass-soft/40" : "border-line bg-surface",
            )}
          >
            <div className="flex items-baseline justify-between">
              <p className={cn("text-sm font-semibold", eHoje ? "text-brass-deep" : "text-ink")}>
                {DIAS_SEMANA_CURTOS[diaDaSemana(d)]}
              </p>
              <p className="tnum text-xs text-ink-faint">{d.slice(8, 10)}</p>
            </div>

            {doDia.length === 0 ? (
              <button
                type="button"
                onClick={() => aoAgendar(d)}
                className="min-h-[44px] rounded-field bg-surface-2 text-xs text-ink-faint transition-colors hover:bg-line hover:text-ink"
              >
                Livre — agendar
              </button>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {doDia.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => aoAbrir(a)}
                      className={cn(
                        "w-full rounded-field border px-2 py-1.5 text-left",
                        CORES[a.status],
                      )}
                    >
                      <span className="tnum block text-[11px] font-semibold">
                        {horaBR(a.starts_at)}
                      </span>
                      <span className="block truncate text-xs">
                        {a.dependente?.full_name ?? a.cliente?.full_name ?? "Cliente"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O agendamento cai neste dia, lido no fuso de São Paulo. */
function mesmoDia(a: AgendamentoNaAgenda, diaISO: string): boolean {
  return paraDataISO(a.starts_at) === diaISO;
}
