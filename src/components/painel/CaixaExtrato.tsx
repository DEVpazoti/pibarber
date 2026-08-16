"use client";

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Minus,
  Trash2,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { apagarLancamento, lancarDespesa } from "@/app/actions/money";
import { CATEGORIAS_DESPESA } from "@/lib/caixa";
import { Button, EmptyState, Field, Input, Modal, Select } from "@/components/ui";
import { FORMA_PAGAMENTO, type PaymentMethod } from "@/lib/types";
import { brl, cn, diaBR, lerValor } from "@/lib/utils";

/**
 * O extrato do caixa: tudo que entrou e tudo que saiu, na mesma lista.
 *
 * Verde é dinheiro que entra, vermelho é que sai — a regra do design system, e
 * a única leitura que funciona de relance.
 */

export type Lancamento = {
  id: string;
  type: "income" | "expense";
  amount: number;
  payment_method: PaymentMethod | null;
  category: string | null;
  description: string | null;
  /** Coluna `date` do Postgres: chega como "2026-08-15", sem hora. */
  occurred_at: string;
  appointment_id: string | null;
};

export function CaixaExtrato({ lancamentos }: { lancamentos: Lancamento[] }) {
  const router = useRouter();
  const [forma, setForma] = useState("");
  const [categoria, setCategoria] = useState("");
  const [despesaAberta, setDespesaAberta] = useState(false);

  const categorias = useMemo(
    () =>
      [...new Set(lancamentos.map((l) => l.category).filter((c): c is string => !!c))].sort(),
    [lancamentos],
  );

  const filtrados = lancamentos.filter(
    (l) =>
      (forma === "" || l.payment_method === forma) &&
      (categoria === "" || l.category === categoria),
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
          Forma de pagamento
          <Select value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(FORMA_PAGAMENTO) as PaymentMethod[]).map((f) => (
              <option key={f} value={f}>
                {FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
          Categoria
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>

        <Button
          variante="secondary"
          onClick={() => setDespesaAberta(true)}
          iconeEsquerda={<Minus className="h-4 w-4" aria-hidden />}
        >
          Lançar despesa
        </Button>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icone={<Wallet aria-hidden />}
          titulo={
            lancamentos.length === 0 ? "Nenhum movimento no período" : "Nada com esse filtro"
          }
          descricao={
            lancamentos.length === 0
              ? "Conclua um atendimento ou lance uma despesa para o caixa começar a contar."
              : "Tente outra forma de pagamento ou outra categoria."
          }
          acao={
            lancamentos.length === 0 ? (
              <Button onClick={() => setDespesaAberta(true)}>Lançar despesa</Button>
            ) : null
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {filtrados.map((l) => {
            const entrada = l.type === "income";

            return (
              <li
                key={l.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-field",
                    entrada ? "bg-money-soft text-money" : "bg-danger-soft text-danger",
                  )}
                  aria-hidden
                >
                  {entrada ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {l.description || l.category || (entrada ? "Recebimento" : "Despesa")}
                  </span>
                  <span className="tnum block text-xs text-ink-soft">
                    {/* diaBR, não dataBR: `occurred_at` já é um dia em texto, e
                        passá-lo por Date o lê como meia-noite UTC — que no
                        Brasil ainda é o dia anterior. Todo lançamento aparecia
                        um dia adiantado. Ver armadilha nº15 do ESTADO.md. */}
                    {diaBR(l.occurred_at)}
                    {l.category ? ` · ${l.category}` : ""}
                    {l.payment_method ? ` · ${FORMA_PAGAMENTO[l.payment_method]}` : ""}
                  </span>
                </span>

                <span
                  className={cn(
                    "tnum shrink-0 text-sm font-semibold",
                    entrada ? "text-money" : "text-danger",
                  )}
                >
                  {entrada ? "+" : "−"} {brl(l.amount)}
                </span>

                {/* Só despesa lançada à mão pode ser apagada. O que veio de um
                    atendimento sai pela agenda, senão o caixa descola dela. */}
                {!entrada && !l.appointment_id ? (
                  <BotaoApagar id={l.id} aoApagar={() => router.refresh()} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <DespesaDialog
        aberto={despesaAberta}
        aoFechar={() => setDespesaAberta(false)}
        aoLancar={() => router.refresh()}
      />
    </>
  );
}

function BotaoApagar({ id, aoApagar }: { id: string; aoApagar: () => void }) {
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
            await apagarLancamento(id);
            aoApagar();
          })
        }
      >
        Apagar
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Apagar despesa"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

/* ==========================================================================
   Lançar despesa
   ========================================================================== */

function DespesaDialog({
  aberto,
  aoFechar,
  aoLancar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoLancar: () => void;
}) {
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_DESPESA[0]);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setValor("");
    setCategoria(CATEGORIAS_DESPESA[0]);
    setDescricao("");
    setData("");
    setErro(null);
  }, [aberto]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await lancarDespesa({
        valor: lerValor(valor) ?? 0,
        categoria,
        descricao,
        // Vazio de propósito: sem data, o servidor usa o hoje dele.
        data: data || undefined,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui lançar.");
        return;
      }
      aoLancar();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Lançar despesa"
      descricao="Tudo que sai do caixa: aluguel, produto, conta de luz."
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
            Lançar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Valor" htmlFor="despesa-valor" obrigatorio>
          <Input
            id="despesa-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="tnum"
          />
        </Field>

        <Field label="Categoria" htmlFor="despesa-categoria" obrigatorio>
          <Select
            id="despesa-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {CATEGORIAS_DESPESA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Descrição" htmlFor="despesa-descricao">
          <Input
            id="despesa-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: pomada e talco do mês"
          />
        </Field>

        <Field label="Data" htmlFor="despesa-data" dica="Vazio = hoje.">
          <Input
            id="despesa-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
