"use client";

import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { concluirAgendamento, type Pagamento } from "@/app/actions/appointments";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { FORMA_PAGAMENTO, type AgendamentoNaAgenda, type PaymentMethod } from "@/lib/types";
import { brl, cn, horaBR, lerValor, numeroBR, somarDias, hojeISO } from "@/lib/utils";

/**
 * CONCLUIR ATENDIMENTO — a tela mais delicada do sistema.
 *
 * Um erro aqui vira dinheiro errado no caixa. Por isso:
 *   - o quanto FALTA somar fica sempre visível, grande, e muda de cor;
 *   - o botão só habilita quando a soma bate exatamente com total − desconto;
 *   - havendo fiado, a data de vencimento é obrigatória.
 *
 * A conferência real acontece no banco, dentro de `complete_appointment`,
 * antes de escrever qualquer linha. O que está aqui é para o barbeiro
 * enxergar o que está fazendo, não para "validar".
 */

type LinhaPagamento = {
  /** Chave estável da linha: o índice mudaria ao remover do meio. */
  chave: number;
  method: PaymentMethod;
  /** Texto do campo, em português: "40,00". Vira número só na hora de somar. */
  valor: string;
};

const FORMAS = Object.keys(FORMA_PAGAMENTO) as PaymentMethod[];

/** Compara dinheiro em centavos — 0.1 + 0.2 nunca é 0.3 em ponto flutuante. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

export function CompleteDialog({
  agendamento,
  aoFechar,
  aoConcluir,
}: {
  /** Null fecha o diálogo. É o mesmo estado que abre. */
  agendamento: AgendamentoNaAgenda | null;
  aoFechar: () => void;
  aoConcluir?: () => void;
}) {
  const total = agendamento?.total_price ?? 0;

  const [desconto, setDesconto] = useState("0,00");
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([]);
  const [vencimento, setVencimento] = useState(somarDias(hojeISO(), 30));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // Cada atendimento aberto começa do zero: uma linha só, já com o total
  // inteiro em dinheiro. O caso comum é pagar tudo de uma vez.
  useEffect(() => {
    if (!agendamento) return;
    setDesconto("0,00");
    setLinhas([{ chave: 1, method: "cash", valor: numeroBR(agendamento.total_price) }]);
    setVencimento(somarDias(hojeISO(), 30));
    setErro(null);
  }, [agendamento]);

  const valorDesconto = Math.max(0, lerValor(desconto) ?? 0);
  const liquido = Math.max(0, total - valorDesconto);

  const soma = useMemo(
    () => linhas.reduce((acc, l) => acc + Math.max(0, lerValor(l.valor) ?? 0), 0),
    [linhas],
  );

  const falta = centavos(liquido) - centavos(soma);
  const bate = falta === 0;
  const temFiado = linhas.some((l) => l.method === "fiado" && (lerValor(l.valor) ?? 0) > 0);
  const descontoMaiorQueTotal = centavos(valorDesconto) > centavos(total);

  const podeConcluir =
    bate &&
    !descontoMaiorQueTotal &&
    linhas.length > 0 &&
    linhas.every((l) => (lerValor(l.valor) ?? 0) > 0) &&
    (!temFiado || vencimento !== "");

  function adicionarLinha() {
    // A linha nova já nasce com o que falta — é o gesto mais comum:
    // "40 no pix e o resto fiado".
    const restante = Math.max(0, liquido - soma);
    setLinhas((atual) => [
      ...atual,
      {
        chave: Math.max(0, ...atual.map((l) => l.chave)) + 1,
        method: "pix",
        valor: numeroBR(restante),
      },
    ]);
  }

  function removerLinha(chave: number) {
    setLinhas((atual) => atual.filter((l) => l.chave !== chave));
  }

  function alterarLinha(chave: number, campos: Partial<LinhaPagamento>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  function enviar() {
    if (!agendamento || !podeConcluir) return;
    setErro(null);

    const pagamentos: Pagamento[] = linhas.map((l) => ({
      method: l.method,
      amount: lerValor(l.valor) ?? 0,
    }));

    iniciar(async () => {
      const resultado = await concluirAgendamento({
        appointmentId: agendamento.id,
        pagamentos,
        desconto: valorDesconto,
        vencimento: temFiado ? vencimento : null,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui concluir.");
        return;
      }

      aoConcluir?.();
      aoFechar();
    });
  }

  if (!agendamento) return null;

  const nomeCliente = agendamento.dependente?.full_name ?? agendamento.cliente?.full_name ?? "Cliente";

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Concluir atendimento"
      descricao={`${nomeCliente} · ${horaBR(agendamento.starts_at)}`}
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
            disabled={!podeConcluir}
            carregando={enviando}
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            {bate ? `Concluir e receber ${brl(liquido)}` : "Some o valor exato para concluir"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --- O que está sendo cobrado -------------------------------------- */}
        <div className="rounded-card bg-surface-2 p-4">
          <p className="text-sm text-ink-soft">{agendamento.servicos.join(" + ") || "Atendimento"}</p>
          <p className="mt-1 flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">Total do atendimento</span>
            <span className="tnum text-xl font-semibold text-ink">{brl(total)}</span>
          </p>
        </div>

        {/* --- Desconto ------------------------------------------------------ */}
        <Field
          label="Desconto"
          htmlFor="desconto"
          dica="Deixe zerado se não houve desconto."
          erro={descontoMaiorQueTotal ? "O desconto não pode passar do total." : undefined}
        >
          <Input
            id="desconto"
            inputMode="decimal"
            value={desconto}
            erro={descontoMaiorQueTotal}
            onChange={(e) => setDesconto(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="tnum"
          />
        </Field>

        {/* --- Pagamentos ---------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Como o cliente pagou</p>
            <Button
              variante="ghost"
              tamanho="sm"
              onClick={adicionarLinha}
              iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
            >
              Dividir
            </Button>
          </div>

          {linhas.map((linha) => (
            <div key={linha.chave} className="flex items-end gap-2">
              <Field label="Forma" className="flex-1" htmlFor={`forma-${linha.chave}`}>
                <Select
                  id={`forma-${linha.chave}`}
                  value={linha.method}
                  onChange={(e) =>
                    alterarLinha(linha.chave, { method: e.target.value as PaymentMethod })
                  }
                >
                  {FORMAS.map((forma) => (
                    <option key={forma} value={forma}>
                      {FORMA_PAGAMENTO[forma]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Valor" className="w-32" htmlFor={`valor-${linha.chave}`}>
                <Input
                  id={`valor-${linha.chave}`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => alterarLinha(linha.chave, { valor: e.target.value })}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tnum"
                />
              </Field>

              {linhas.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removerLinha(linha.chave)}
                  aria-label={`Remover ${FORMA_PAGAMENTO[linha.method]}`}
                  className="mb-0 grid h-12 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {/* --- Vencimento do fiado ------------------------------------------ */}
        {temFiado ? (
          <Field
            label="Vencimento do fiado"
            htmlFor="vencimento"
            obrigatorio
            dica="A dívida entra em /painel/fiado com essa data."
          >
            <Input
              id="vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </Field>
        ) : null}

        {/* --- O placar. É a linha que evita dinheiro errado no caixa. ------- */}
        <div
          className={cn(
            "rounded-card border p-4",
            bate ? "border-money/30 bg-money-soft" : "border-danger/30 bg-danger-soft",
          )}
        >
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">A receber</span>
            <span className="tnum font-semibold text-ink">{brl(liquido)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">Somado</span>
            <span className="tnum font-semibold text-ink">{brl(soma)}</span>
          </div>

          <p
            className={cn(
              "tnum mt-2 border-t pt-2 text-base font-semibold",
              bate ? "border-money/20 text-money" : "border-danger/20 text-danger",
            )}
          >
            {bate
              ? "Conferido — pode concluir"
              : falta > 0
                ? `Faltam ${brl(falta / 100)}`
                : `Passou ${brl(-falta / 100)}`}
          </p>
        </div>
      </div>
    </Modal>
  );
}
