"use client";

import {
  AlertCircle,
  CalendarCheck,
  Check,
  PartyPopper,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  cancelarAgendamento,
  concluirEmLote,
  marcarFalta,
  type ItemDoLote,
} from "@/app/actions/appointments";
import { CompleteDialog } from "@/components/painel/CompleteDialog";
import { Button, EmptyState, Field, Modal, Select } from "@/components/ui";
import { FORMA_PAGAMENTO, type AgendamentoNaAgenda, type PaymentMethod } from "@/lib/types";
import { brl, cn, diaPorExtenso, horaBR } from "@/lib/utils";

/**
 * PENDÊNCIAS — o que ficou de dias anteriores sem conclusão.
 *
 * O caso de uso que manda no desenho não é "resolver um atendimento": é o
 * barbeiro que atendeu a quinta inteira, esqueceu de registrar, e no sábado
 * precisa fechar seis de uma vez. Por isso a seleção múltipla e o "marcar o dia
 * todo" vêm primeiro, e as ações por item são o caso secundário.
 *
 * DOIS CAMINHOS PARA CONCLUIR, e a diferença entre eles é o ponto da tela:
 *
 *   · UM atendimento  → abre o `CompleteDialog`, o MESMO da agenda e da tela
 *     Hoje: pagamento dividido, desconto e fiado com vencimento. Concluir em
 *     silêncio, chutando "dinheiro", lançaria dinheiro errado no caixa sem o
 *     barbeiro ter dito nada.
 *   · VÁRIOS → diálogo próprio, com UMA forma de pagamento POR ATENDIMENTO.
 *     Valor cheio e sem desconto: quem precisar disso conclui individualmente.
 *
 * Tudo pensado para o polegar: alvo de 44px, ações por item lado a lado, barra
 * de conclusão FIXA no rodapé para não sumir ao rolar uma lista longa.
 */

/**
 * As formas que o lote aceita. `fiado` fica DE FORA: ele exige data de
 * vencimento por atendimento e cria uma dívida por cliente — decisão
 * individual, que não cabe num "concluir tudo com um toque". O banco recusa
 * também, em `complete_appointments_lote`.
 */
const FORMAS: PaymentMethod[] = ["cash", "pix", "debit", "credit"];

export type GrupoPendencia = {
  /** "2026-08-14" */
  dia: string;
  itens: AgendamentoNaAgenda[];
};

export function PendenciasPainel({
  grupos,
  podeVerDinheiro,
}: {
  grupos: GrupoPendencia[];
  /** O assistente não vê valor — mesma regra do resto do painel. */
  podeVerDinheiro: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  /** O atendimento aberto no diálogo de conclusão completo. */
  const [concluindo, setConcluindo] = useState<AgendamentoNaAgenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const todos = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);

  const selecionados = useMemo(
    () => todos.filter((a) => marcados.has(a.id)),
    [todos, marcados],
  );

  const totalSelecionado = selecionados.reduce(
    (soma, a) => soma + (a.total_price - a.discount),
    0,
  );

  function alternar(id: string) {
    setErro(null);
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /** "Selecionar todos de 14/08" — o gesto mais usado da tela. */
  function alternarDia(grupo: GrupoPendencia) {
    setErro(null);
    const ids = grupo.itens.map((a) => a.id);
    const todosMarcados = ids.every((id) => marcados.has(id));

    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const id of ids) {
        if (todosMarcados) novo.delete(id);
        else novo.add(id);
      }
      return novo;
    });
  }

  /** Uma ação de item só: concluir individual, falta ou cancelar. */
  function agirNoItem(acao: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui.");
        return;
      }
      // A linha some da lista no refresh; tirar do conjunto evita que ela
      // continue contando na barra do rodapé no meio do caminho.
      setMarcados(new Set());
      router.refresh();
    });
  }

  if (grupos.length === 0) {
    return (
      <EmptyState
        icone={<PartyPopper aria-hidden />}
        titulo="Tudo em dia"
        descricao="Nenhum atendimento de dias anteriores esperando conclusão. Seu faturamento está fechado até ontem."
      />
    );
  }

  return (
    <>
      {erro ? (
        <p
          className="mb-3 flex items-start gap-2 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {/* Espaço no fim para a barra fixa não cobrir a última linha. */}
      <div className={cn("flex flex-col gap-5", selecionados.length > 0 && "pb-32")}>
        {grupos.map((grupo) => {
          const ids = grupo.itens.map((a) => a.id);
          const todosDoDia = ids.every((id) => marcados.has(id));

          return (
            <section key={grupo.dia}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">
                  {diaPorExtenso(grupo.dia, true)}
                  <span className="ml-2 font-normal text-ink-faint">
                    {grupo.itens.length}{" "}
                    {grupo.itens.length === 1 ? "atendimento" : "atendimentos"}
                  </span>
                </h2>

                <button
                  type="button"
                  onClick={() => alternarDia(grupo)}
                  className="inline-flex h-11 items-center rounded-field px-3 text-sm font-medium text-brass transition-colors hover:bg-brass-soft"
                >
                  {todosDoDia ? "Desmarcar o dia" : "Selecionar o dia todo"}
                </button>
              </div>

              <ul className="flex flex-col gap-2">
                {grupo.itens.map((a) => (
                  <LinhaPendencia
                    key={a.id}
                    agendamento={a}
                    marcado={marcados.has(a.id)}
                    ocupado={ocupado}
                    podeVerDinheiro={podeVerDinheiro}
                    aoAlternar={() => alternar(a.id)}
                    aoFaltar={() => agirNoItem(() => marcarFalta(a.id))}
                    aoCancelar={() => agirNoItem(() => cancelarAgendamento(a.id))}
                    // Abre o diálogo completo em vez de concluir na hora: um
                    // atendimento só merece a pergunta de como foi pago, com
                    // desconto e fiado à disposição.
                    aoConcluir={() => setConcluindo(a)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* --- Barra fixa de conclusão em lote ---------------------------------
          Fixa porque a lista pode ter 40 linhas: um botão no fim da página
          exigiria rolar até lá depois de selecionar, e no celular isso é o
          suficiente para a pessoa desistir. */}
      {selecionados.length > 0 ? (
        // No celular ela fica ACIMA da barra de navegação do painel (56px +
        // área segura), senão as duas se sobrepõem e o "Concluir" cai em cima
        // do "Clientes". No desktop a navegação é lateral, então vai ao rodapé
        // mesmo, deslocada pela largura da barra.
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur lg:bottom-0 lg:left-60 lg:pb-safe">
          <div className="mx-auto flex max-w-3xl items-center gap-3 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {selecionados.length}{" "}
                {selecionados.length === 1 ? "selecionado" : "selecionados"}
              </p>
              {podeVerDinheiro ? (
                <p className="tnum truncate text-xs text-ink-soft">{brl(totalSelecionado)}</p>
              ) : null}
            </div>

            <Button
              variante="ghost"
              tamanho="sm"
              onClick={() => setMarcados(new Set())}
              disabled={ocupado}
            >
              Limpar
            </Button>

            <Button
              onClick={() => setConfirmando(true)}
              disabled={ocupado}
              iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
            >
              Concluir
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmarLoteDialog
        aberto={confirmando}
        selecionados={selecionados}
        podeVerDinheiro={podeVerDinheiro}
        aoFechar={() => setConfirmando(false)}
        aoConcluir={() => {
          setMarcados(new Set());
          router.refresh();
        }}
      />

      {/* O MESMO diálogo da agenda e da tela Hoje. Reaproveitar em vez de
          inventar outro é o que garante que concluir pela tela de Pendências
          e concluir pela agenda lancem exatamente a mesma coisa no caixa. */}
      <CompleteDialog
        agendamento={concluindo}
        aoFechar={() => setConcluindo(null)}
        aoConcluir={() => {
          setMarcados(new Set());
          router.refresh();
        }}
      />
    </>
  );
}

/* ==========================================================================
   Uma linha
   ========================================================================== */

function LinhaPendencia({
  agendamento: a,
  marcado,
  ocupado,
  podeVerDinheiro,
  aoAlternar,
  aoConcluir,
  aoFaltar,
  aoCancelar,
}: {
  agendamento: AgendamentoNaAgenda;
  marcado: boolean;
  ocupado: boolean;
  podeVerDinheiro: boolean;
  aoAlternar: () => void;
  aoConcluir: () => void;
  aoFaltar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-card border bg-surface transition-colors",
        marcado ? "border-brass bg-brass-soft" : "border-line",
      )}
    >
      {/* A área de seleção é a linha inteira: no celular, mirar numa caixinha
          de 20px com o polegar é o tipo de detalhe que faz desistir. */}
      <button
        type="button"
        onClick={aoAlternar}
        aria-pressed={marcado}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
            marcado ? "border-brass bg-brass" : "border-line-strong",
          )}
          aria-hidden
        >
          {marcado ? <Check className="h-3.5 w-3.5 text-brass-ink" /> : null}
        </span>

        <span className="tnum grid w-14 shrink-0 place-items-center rounded-field bg-surface-2 py-2 text-sm font-semibold text-ink">
          {horaBR(a.starts_at)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {a.dependente?.full_name ?? a.cliente?.full_name ?? "Cliente"}
          </span>
          <span className="block truncate text-xs text-ink-soft">
            {a.servicos.join(", ") || "Atendimento"}
            {a.profissional ? ` · ${a.profissional.nickname || a.profissional.name}` : ""}
          </span>
        </span>

        {podeVerDinheiro ? (
          <span className="tnum shrink-0 text-sm font-semibold text-ink">
            {brl(a.total_price - a.discount)}
          </span>
        ) : null}
      </button>

      {/* Ações do item, resolvíveis com um toque e sem abrir outra tela. */}
      <div className="flex items-stretch gap-1 border-t border-line px-2 py-1.5">
        <AcaoRapida
          rotulo="Concluir"
          Icone={CalendarCheck}
          tom="money"
          disabled={ocupado}
          onClick={aoConcluir}
        />
        <AcaoRapida
          rotulo="Não compareceu"
          rotuloCurto="Faltou"
          Icone={UserX}
          tom="danger"
          disabled={ocupado}
          onClick={aoFaltar}
        />
        <AcaoRapida
          rotulo="Cancelar"
          Icone={X}
          tom="neutro"
          disabled={ocupado}
          onClick={aoCancelar}
        />
      </div>
    </li>
  );
}

function AcaoRapida({
  rotulo,
  rotuloCurto,
  Icone,
  tom,
  disabled,
  onClick,
}: {
  rotulo: string;
  rotuloCurto?: string;
  Icone: LucideIcon;
  tom: "money" | "danger" | "neutro";
  disabled: boolean;
  onClick: () => void;
}) {
  const cor =
    tom === "money"
      ? "text-money hover:bg-money-soft"
      : tom === "danger"
        ? "text-danger hover:bg-danger-soft"
        : "text-ink-soft hover:bg-surface-2 hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-field px-2 text-xs font-medium transition-colors disabled:opacity-50",
        cor,
      )}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden />
      {/* No celular cabe o rótulo curto; a partir de sm entra o completo. */}
      {rotuloCurto ? (
        <>
          <span className="sm:hidden">{rotuloCurto}</span>
          <span className="hidden sm:inline">{rotulo}</span>
        </>
      ) : (
        rotulo
      )}
    </button>
  );
}

/* ==========================================================================
   A confirmação do lote
   ========================================================================== */

/**
 * A confirmação do lote — com UMA FORMA DE PAGAMENTO POR ATENDIMENTO.
 *
 * Por que não uma forma só para o lote: a quinta-feira esquecida teve gente
 * pagando em dinheiro, no débito e no pix. Uma forma única fecharia o caixa com
 * o valor certo e as formas erradas, e o relatório por forma passaria a mentir
 * sem ninguém perceber — porque o TOTAL continuaria batendo.
 *
 * O "aplicar a todos" no topo existe porque o caso mais comum ainda é todo
 * mundo ter pagado igual. Ele preenche as linhas de uma vez; quem for
 * diferente, o barbeiro troca só naquela.
 *
 * A confirmação em si existe porque o desfazer NÃO existe para conclusão:
 * reverter um concluído significaria apagar entrada de caixa, comissão (que
 * pode já ter sido paga) e fiado (que pode já ter recebido). Sem volta atrás, a
 * defesa contra "concluí 20 por engano" tem que estar ANTES, com tudo à vista.
 */
function ConfirmarLoteDialog({
  aberto,
  selecionados,
  podeVerDinheiro,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean;
  selecionados: AgendamentoNaAgenda[];
  podeVerDinheiro: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  /** A forma escolhida para cada atendimento, por id. */
  const [formas, setFormas] = useState<Record<string, PaymentMethod>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  /** Trava síncrona: dois toques no mesmo tique passariam pelo `disabled`. */
  const emVoo = useRef(false);

  // O diálogo fica MONTADO devolvendo null quando fechado, então o estado
  // sobrevive entre uma abertura e outra. Sem este reset, as formas escolhidas
  // no lote anterior reapareceriam num lote de outras pessoas.
  useEffect(() => {
    if (!aberto) return;
    setFormas(Object.fromEntries(selecionados.map((a) => [a.id, "cash" as PaymentMethod])));
    setErro(null);
    emVoo.current = false;
    // `selecionados` fora das dependências de propósito: a lista é recriada a
    // cada render do pai, e incluí-la reiniciaria as formas a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  if (!aberto) return null;

  const total = selecionados.reduce((soma, a) => soma + (a.total_price - a.discount), 0);

  function aplicarATodos(forma: PaymentMethod) {
    setFormas(Object.fromEntries(selecionados.map((a) => [a.id, forma])));
  }

  function enviar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setErro(null);

    const itens: ItemDoLote[] = selecionados.map((a) => ({
      id: a.id,
      // O padrão só entra se algo escapou do reset — nunca no caminho normal.
      forma: formas[a.id] ?? "cash",
    }));

    iniciar(async () => {
      const resultado = await concluirEmLote({ itens });
      emVoo.current = false;

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui concluir.");
        return;
      }
      aoConcluir();
      aoFechar();
    });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={
        selecionados.length === 1
          ? "Concluir 1 atendimento"
          : `Concluir ${selecionados.length} atendimentos`
      }
      descricao="Isso lança o valor no caixa e gera a comissão. Não tem como desfazer."
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button
            tamanho="lg"
            larguraTotal
            carregando={enviando}
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            {podeVerDinheiro ? `Concluir — ${brl(total)}` : "Concluir"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* O atalho do caso comum: quase sempre todo mundo pagou igual. */}
        <Field
          label="Aplicar a todos"
          htmlFor="lote-todos"
          dica="Preenche a lista abaixo de uma vez. Depois é só trocar quem pagou diferente."
        >
          {/* `value=""` fixo, de propósito: este seletor é um GATILHO, não
              guarda escolha nenhuma. Ele dispara e volta sozinho para o texto
              neutro, porque a resposta de "qual forma?" está nas linhas
              abaixo — deixá-lo marcado sugeriria que ele manda nelas depois. */}
          <Select
            id="lote-todos"
            value=""
            onChange={(e) => {
              if (e.target.value) aplicarATodos(e.target.value as PaymentMethod);
            }}
          >
            <option value="">Escolha uma forma…</option>
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Select>
        </Field>

        {/* Uma linha por atendimento, cada uma com a forma dela. */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Como cada um pagou</p>

          <ul className="flex flex-col gap-2">
            {selecionados.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {a.dependente?.full_name ?? a.cliente?.full_name ?? "Cliente"}
                  </p>
                  <p className="tnum truncate text-xs text-ink-soft">
                    {diaPorExtenso(a.starts_at.slice(0, 10))} às {horaBR(a.starts_at)}
                    {podeVerDinheiro ? ` · ${brl(a.total_price - a.discount)}` : ""}
                  </p>
                </div>

                {/* A largura vai no embrulho: o Select renderiza um `div
                    relative` por fora (por causa da seta), e uma classe de
                    largura passada a ele chegaria no `<select>` de dentro,
                    deixando o embrulho livre para esticar no flex. */}
                <div className="w-32 shrink-0">
                  <Select
                    aria-label={`Forma de pagamento de ${a.cliente?.full_name ?? "cliente"}`}
                    value={formas[a.id] ?? "cash"}
                    onChange={(e) =>
                      setFormas((atual) => ({
                        ...atual,
                        [a.id]: e.target.value as PaymentMethod,
                      }))
                    }
                  >
                    {FORMAS.map((f) => (
                      <option key={f} value={f}>
                        {FORMA_PAGAMENTO[f]}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {podeVerDinheiro ? (
          <div className="rounded-card bg-surface-2 p-4">
            <p className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">Total</span>
              <span className="tnum text-xl font-semibold text-ink">{brl(total)}</span>
            </p>
          </div>
        ) : null}

        <p className="text-xs text-ink-faint">
          Valor cheio, sem desconto. Para desconto, pagamento dividido ou{" "}
          <strong>fiado</strong>, feche o lote e conclua aquele atendimento pelo botão
          “Concluir” da linha dele. Cada um entra no faturamento da{" "}
          <strong>data original</strong>, não na de hoje.
        </p>
      </div>
    </Modal>
  );
}
