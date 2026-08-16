"use client";

import { Ban, CalendarDays, Check, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { cancelarAgendamento } from "@/app/actions/appointments";
import { Button, Chip, EmptyState } from "@/components/ui";
import { emAberto, STATUS_AGENDAMENTO, type AgendamentoNaAgenda } from "@/lib/types";
import {
  agoraSP,
  brl,
  cn,
  duracao,
  horaBR,
  minutosDoDia,
  minutosParaHora,
} from "@/lib/utils";

/**
 * A AGENDA DO DIA NO CELULAR — a tela que o barbeiro usa de pé, com o cliente
 * na cadeira e a máquina na outra mão.
 *
 * O desktop tem a grade de colunas (uma por profissional) e continua tendo. Ela
 * não cabe em 375px, e a lista que existia no lugar era só um agrupamento por
 * hora cheia: bonita, mas obrigava a caçar "qual é o de agora?" no meio de
 * doze linhas iguais.
 *
 * O que esta tela faz de diferente:
 *
 * 1. O ATENDIMENTO DE AGORA TEM MOLDURA. Quem está na cadeira (ou é o próximo)
 *    ganha borda, rótulo e os botões abertos. O resto do dia fica compacto.
 * 2. OS BURACOS APARECEM. Um horário sem ninguém é uma linha discreta com "+":
 *    é onde o barbeiro encaixa quem acabou de entrar pela porta, e ele precisa
 *    ver que o buraco existe.
 * 3. AS AÇÕES ESTÃO NO CARTÃO. Concluir e cancelar sem abrir outra tela — são
 *    os dois gestos do expediente. O resto mora no detalhe.
 *
 * A régua de "agora" é lida no NAVEGADOR, dentro de um efeito, e por dois
 * motivos: no servidor ela congelaria no instante da renderização (e o card
 * destacado ficaria errado depois de dez minutos de tela aberta), e renderizar
 * hora no HTML do servidor dá divergência de hidratação.
 */

/** De quanto em quanto tempo um buraco vira linha clicável. */
const PASSO = 30;

export function AgendaDoDia({
  agendamentos,
  dia,
  hoje,
  abreEm,
  fechaEm,
  aoAbrir,
  aoConcluir,
  aoAgendar,
  aoMudar,
}: {
  agendamentos: AgendamentoNaAgenda[];
  dia: string;
  /** Hoje calculado no SERVIDOR, no fuso de São Paulo. */
  hoje: string;
  abreEm: number;
  fechaEm: number;
  aoAbrir: (a: AgendamentoNaAgenda) => void;
  aoConcluir: (a: AgendamentoNaAgenda) => void;
  aoAgendar: (hora?: string) => void;
  aoMudar: () => void;
}) {
  const eHoje = dia === hoje;

  // `null` até o navegador assumir: no HTML do servidor não existe "agora".
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    if (!eHoje) {
      setAgora(null);
      return;
    }

    const ler = () => {
      const { hora } = agoraSP();
      const [h = "0", m = "0"] = hora.split(":");
      setAgora(Number(h) * 60 + Number(m));
    };

    ler();
    // Um minuto é a menor unidade que a tela mostra; pesquisar mais que isso
    // não muda pixel nenhum.
    const relogio = setInterval(ler, 60_000);
    return () => clearInterval(relogio);
  }, [eHoje]);

  /** Cancelado e falta não ocupam horário — some do desenho, some dos buracos. */
  const ativos = useMemo(
    () => agendamentos.filter((a) => a.status !== "cancelled" && a.status !== "no_show"),
    [agendamentos],
  );

  /**
   * QUAL É O DE AGORA.
   *
   * Primeiro procura quem está sendo atendido neste minuto; não achando,
   * aponta o próximo em aberto. Fora de hoje não existe "agora" — o dia
   * inteiro é planejamento, e destacar uma linha só confundiria.
   */
  const destaqueId = useMemo(() => {
    if (agora == null) return null;

    const abertos = ativos.filter((a) => emAberto(a.status));

    const naCadeira = abertos.find(
      (a) => minutosDoDia(a.starts_at) <= agora && minutosDoDia(a.ends_at) > agora,
    );
    if (naCadeira) return naCadeira.id;

    const proximo = abertos
      .filter((a) => minutosDoDia(a.starts_at) >= agora)
      .sort((x, y) => minutosDoDia(x.starts_at) - minutosDoDia(y.starts_at))[0];

    return proximo?.id ?? null;
  }, [ativos, agora]);

  /**
   * A LINHA DO TEMPO: atendimentos e buracos, em ordem.
   *
   * Um passo de 30 minutos vira "livre" quando NENHUM atendimento o cruza.
   * Com dois profissionais e um deles ocupado, o horário não aparece como
   * livre — e é o certo: a lista do celular mistura a equipe inteira, então
   * "livre" aqui significa "a loja inteira está parada", que é o que o barbeiro
   * lê quando bate o olho.
   */
  const linha = useMemo(() => {
    const itens: (
      | { tipo: "atendimento"; chave: string; inicio: number; a: AgendamentoNaAgenda }
      | { tipo: "livre"; chave: string; inicio: number }
    )[] = ativos.map((a) => ({
      tipo: "atendimento" as const,
      chave: a.id,
      inicio: minutosDoDia(a.starts_at),
      a,
    }));

    const ocupados = ativos.map((a) => ({
      de: minutosDoDia(a.starts_at),
      ate: minutosDoDia(a.ends_at),
    }));

    for (let m = abreEm; m < fechaEm; m += PASSO) {
      const cruza = ocupados.some((o) => o.de < m + PASSO && o.ate > m);
      if (cruza) continue;
      // Buraco que já passou não é encaixe, é história. Some — a barra de cima
      // continua tendo o botão "Agendar" para o caso raro do lançamento atrasado.
      if (agora != null && m + PASSO <= agora) continue;
      itens.push({ tipo: "livre" as const, chave: `livre-${m}`, inicio: m });
    }

    return itens.sort((x, y) => x.inicio - y.inicio);
  }, [ativos, abreEm, fechaEm, agora]);

  const concluidos = agendamentos.filter((a) => a.status === "completed").length;
  const aAtender = agendamentos.filter((a) => emAberto(a.status)).length;

  if (agendamentos.length === 0) {
    return (
      <EmptyState
        icone={<CalendarDays aria-hidden />}
        titulo={eHoje ? "Nenhum atendimento hoje" : "Nenhum atendimento neste dia"}
        descricao="Dia livre. Quando alguém chegar ou ligar, marque por aqui."
        acao={<Button onClick={() => aoAgendar()}>Agendar</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {linha.map((item) =>
          item.tipo === "livre" ? (
            <li key={item.chave}>
              <button
                type="button"
                onClick={() => aoAgendar(minutosParaHora(item.inicio))}
                className="flex min-h-11 w-full items-center gap-3 rounded-field border border-dashed border-line px-3 text-left text-ink-faint transition-colors hover:border-brass hover:bg-brass-soft/40 hover:text-brass-deep"
              >
                <span className="tnum w-12 shrink-0 text-xs font-medium">
                  {minutosParaHora(item.inicio)}
                </span>
                <span className="flex-1 text-xs">livre</span>
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </li>
          ) : (
            <li key={item.chave}>
              <CartaoAtendimento
                agendamento={item.a}
                destacado={item.a.id === destaqueId}
                emAtendimento={
                  agora != null &&
                  minutosDoDia(item.a.starts_at) <= agora &&
                  minutosDoDia(item.a.ends_at) > agora
                }
                aoAbrir={aoAbrir}
                aoConcluir={aoConcluir}
                aoMudar={aoMudar}
              />
            </li>
          ),
        )}
      </ul>

      {/* O fecho do dia. Fica no fim porque é o que o barbeiro procura quando
          para para respirar, não durante o corte. */}
      <p className="tnum rounded-field bg-surface-2 px-3 py-2.5 text-center text-xs text-ink-soft">
        {agendamentos.length}{" "}
        {agendamentos.length === 1 ? "atendimento" : "atendimentos"} · {concluidos}{" "}
        {concluidos === 1 ? "concluído" : "concluídos"} · {aAtender} a atender
      </p>
    </div>
  );
}

/* ==========================================================================
   O cartão
   ========================================================================== */

function CartaoAtendimento({
  agendamento,
  destacado,
  emAtendimento,
  aoAbrir,
  aoConcluir,
  aoMudar,
}: {
  agendamento: AgendamentoNaAgenda;
  destacado: boolean;
  emAtendimento: boolean;
  aoAbrir: (a: AgendamentoNaAgenda) => void;
  aoConcluir: (a: AgendamentoNaAgenda) => void;
  aoMudar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const status = STATUS_AGENDAMENTO[agendamento.status];
  const aberto = emAberto(agendamento.status);
  const nome =
    agendamento.dependente?.full_name ?? agendamento.cliente?.full_name ?? "Cliente";
  const minutos = minutosDoDia(agendamento.ends_at) - minutosDoDia(agendamento.starts_at);

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await cancelarAgendamento(agendamento.id);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui cancelar.");
        setConfirmando(false);
        return;
      }
      aoMudar();
    });
  }

  return (
    <div
      className={cn(
        "rounded-card border bg-surface transition-colors",
        destacado ? "border-brass shadow-card" : "border-line",
        !aberto && "opacity-75",
      )}
    >
      {destacado ? (
        <p className="rounded-t-card bg-brass px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brass-ink">
          {emAtendimento ? "Na cadeira agora" : "Próximo"}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => aoAbrir(agendamento)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="tnum grid w-14 shrink-0 place-items-center rounded-field bg-surface-2 py-2 text-sm font-semibold text-ink">
          {horaBR(agendamento.starts_at)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{nome}</span>
          <span className="block truncate text-xs text-ink-soft">
            {agendamento.servicos.join(", ") || "Atendimento"} · {duracao(minutos)}
          </span>
          {agendamento.profissional ? (
            <span className="block truncate text-xs text-ink-faint">
              {agendamento.profissional.nickname || agendamento.profissional.name}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="tnum text-sm font-semibold text-ink">
            {brl(agendamento.total_price - agendamento.discount)}
          </span>
          {aberto ? (
            <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
          ) : (
            <Chip tom={status.tom}>{status.rotulo}</Chip>
          )}
        </span>
      </button>

      {erro ? (
        <p className="px-3 pb-2 text-xs text-danger" role="alert">
          {erro}
        </p>
      ) : null}

      {aberto ? (
        <div className="flex gap-2 border-t border-line p-2">
          {confirmando ? (
            <>
              <Button
                variante="dangerSolid"
                tamanho="sm"
                larguraTotal
                carregando={ocupado}
                onClick={cancelar}
                iconeEsquerda={<Ban className="h-4 w-4" aria-hidden />}
              >
                Confirmar
              </Button>
              <Button
                variante="secondary"
                tamanho="sm"
                larguraTotal
                onClick={() => setConfirmando(false)}
              >
                Voltar
              </Button>
            </>
          ) : (
            <>
              <Button
                tamanho="sm"
                larguraTotal
                onClick={() => aoConcluir(agendamento)}
                iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
              >
                Concluir
              </Button>
              <Button
                variante="danger"
                tamanho="sm"
                larguraTotal
                onClick={() => setConfirmando(true)}
              >
                Cancelar
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
