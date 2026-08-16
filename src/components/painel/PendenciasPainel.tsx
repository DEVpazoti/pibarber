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
} from "@/app/actions/appointments";
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
 * Tudo pensado para o polegar: alvo de 44px, ações por item lado a lado, barra
 * de conclusão FIXA no rodapé para não sumir ao rolar uma lista longa.
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
                    aoConcluir={() =>
                      agirNoItem(() => concluirEmLote({ ids: [a.id], forma: "cash" }))
                    }
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
        quantidade={selecionados.length}
        total={totalSelecionado}
        podeVerDinheiro={podeVerDinheiro}
        aoFechar={() => setConfirmando(false)}
        aoConcluir={() => {
          setMarcados(new Set());
          router.refresh();
        }}
        ids={selecionados.map((a) => a.id)}
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
 * A confirmação existe porque o desfazer NÃO existe para conclusão.
 *
 * Reverter um atendimento concluído significaria apagar entrada de caixa,
 * comissão (que pode já ter sido paga) e fiado (que pode já ter recebido) — a
 * função do banco recusa isso de propósito. Sem volta atrás, a defesa contra
 * "concluí 20 por engano" tem que estar ANTES, com o número e o total à vista.
 */
function ConfirmarLoteDialog({
  aberto,
  ids,
  quantidade,
  total,
  podeVerDinheiro,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean;
  ids: string[];
  quantidade: number;
  total: number;
  podeVerDinheiro: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [forma, setForma] = useState<PaymentMethod>("cash");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  /** Trava síncrona: dois toques no mesmo tique passariam pelo `disabled`. */
  const emVoo = useRef(false);

  // O diálogo fica MONTADO devolvendo null quando fechado, então o estado
  // sobrevive entre uma abertura e outra. Sem este reset, o erro da tentativa
  // anterior apareceria já na abertura seguinte, falando de um lote que nem
  // existe mais.
  useEffect(() => {
    if (!aberto) return;
    setForma("cash");
    setErro(null);
    emVoo.current = false;
  }, [aberto]);

  if (!aberto) return null;

  function enviar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setErro(null);

    iniciar(async () => {
      const resultado = await concluirEmLote({ ids, forma });
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
      titulo={quantidade === 1 ? "Concluir 1 atendimento" : `Concluir ${quantidade} atendimentos`}
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
        {podeVerDinheiro ? (
          <div className="rounded-card bg-surface-2 p-4">
            <p className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">Total</span>
              <span className="tnum text-xl font-semibold text-ink">{brl(total)}</span>
            </p>
          </div>
        ) : null}

        <Field
          label="Como foi pago"
          htmlFor="lote-forma"
          obrigatorio
          dica="Vale para todos os selecionados, com o valor cheio. Para desconto ou fiado, conclua um por um."
        >
          <Select
            id="lote-forma"
            value={forma}
            onChange={(e) => setForma(e.target.value as PaymentMethod)}
          >
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-xs text-ink-faint">
          Cada atendimento entra no faturamento da <strong>data original</strong> dele, não da
          data de hoje.
        </p>
      </div>
    </Modal>
  );
}
