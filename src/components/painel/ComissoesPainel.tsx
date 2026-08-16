"use client";

import { AlertCircle, Check, ChevronDown, HandCoins, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { estornarPagamentoComissao, pagarComissao } from "@/app/actions/money";
import { Button, Chip, EmptyState, Field, Input, Modal, Select } from "@/components/ui";
import { FORMA_PAGAMENTO, type PaymentMethod } from "@/lib/types";
import { brl, cn, dataBR, lerValor, numeroBR, pct } from "@/lib/utils";

/**
 * COMISSÕES por profissional.
 *
 * O pagamento é contra o SALDO do profissional, não por atendimento: o dono
 * paga "R$ 100 hoje, o resto sexta". Quem distribui o valor pelas comissões
 * pendentes — da mais antiga para a mais nova — é `pay_commissions`, no banco,
 * que lança a saída no caixa na mesma transação. Comissão paga sem saída
 * lançada faria o lucro do mês mentir.
 *
 * O extrato mostra o que já foi pago no período, e o pagamento mais recente de
 * cada profissional pode ser estornado — os dois lados voltam juntos.
 */

export type ItemComissao = {
  id: string;
  amount: number;
  paid_amount: number;
  base_amount: number;
  percent: number;
  status: "pending" | "partial" | "paid";
  paid_at: string | null;
  created_at: string;
  cliente: string | null;
  quando: string | null;
};

export type PagamentoComissao = {
  id: string;
  amount: number;
  payment_method: PaymentMethod;
  paid_at: string;
  /** Só o mais recente do profissional, e só se tem saída de caixa vinculada. */
  estornavel: boolean;
};

export type ComissaoPorProfissional = {
  professionalId: string;
  nome: string;
  pendentes: ItemComissao[];
  pagas: ItemComissao[];
  pagamentos: PagamentoComissao[];
  /** Já é o SALDO: soma de `amount - paid_amount`. */
  totalPendente: number;
  totalPago: number;
};

export function ComissoesPainel({ grupos }: { grupos: ComissaoPorProfissional[] }) {
  const router = useRouter();
  const [pagando, setPagando] = useState<ComissaoPorProfissional | null>(null);

  if (grupos.length === 0) {
    return (
      <EmptyState
        icone={<HandCoins aria-hidden />}
        titulo="Nenhuma comissão no período"
        descricao="A comissão nasce quando o atendimento é concluído, com o percentual do profissional."
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {grupos.map((g) => (
          <li key={g.professionalId}>
            <CartaoProfissional grupo={g} aoPagar={() => setPagando(g)} />
          </li>
        ))}
      </ul>

      <PagarDialog
        grupo={pagando}
        aoFechar={() => setPagando(null)}
        aoPagar={() => router.refresh()}
      />
    </>
  );
}

function CartaoProfissional({
  grupo,
  aoPagar,
}: {
  grupo: ComissaoPorProfissional;
  aoPagar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const parciais = grupo.pendentes.filter((c) => c.status === "partial").length;

  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{grupo.nome}</span>
            {parciais > 0 ? <Chip tom="info">Pagou em parte</Chip> : null}
          </p>
          <p className="tnum text-xs text-ink-soft">
            {grupo.pendentes.length} em aberto · {grupo.pagas.length} quitada(s) no período
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-ink-faint">A pagar</p>
          <p className="tnum text-xl font-semibold text-brass-deep">{brl(grupo.totalPendente)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex h-11 items-center gap-1.5 rounded-field px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")}
            aria-hidden
          />
          {aberto ? "Esconder o detalhe" : "Ver o que compõe"}
        </button>

        <span className="flex-1" />

        {grupo.totalPendente > 0 ? (
          <Button onClick={aoPagar}>Pagar comissão</Button>
        ) : (
          <Chip tom="money">Sem pendências</Chip>
        )}
      </div>

      {aberto ? (
        <div className="border-t border-line">
          <Detalhe titulo="Em aberto" itens={grupo.pendentes} />
          <Detalhe titulo="Quitadas no período" itens={grupo.pagas} />
          <Extrato pagamentos={grupo.pagamentos} />
        </div>
      ) : null}
    </div>
  );
}

function Detalhe({ titulo, itens }: { titulo: string; itens: ItemComissao[] }) {
  if (itens.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{titulo}</p>
      <ul className="flex flex-col gap-1.5">
        {itens.map((c) => (
          <li key={c.id} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">{c.cliente ?? "Atendimento"}</span>
              <span className="tnum block text-xs text-ink-soft">
                {c.quando ? dataBR(c.quando) : dataBR(c.created_at)} · {brl(c.base_amount)} ×{" "}
                {pct(c.percent, 0)}
                {c.status === "partial" ? ` · já pago ${brl(c.paid_amount)}` : ""}
                {c.paid_at ? ` · pago em ${dataBR(c.paid_at)}` : ""}
              </span>
            </span>
            <span className="tnum shrink-0 font-semibold text-ink">
              {/* Em aberto, o número que importa é o que falta pagar. */}
              {brl(c.status === "paid" ? c.amount : c.amount - c.paid_amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
   Extrato de pagamentos
   ========================================================================== */

function Extrato({ pagamentos }: { pagamentos: PagamentoComissao[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, iniciar] = useTransition();

  if (pagamentos.length === 0) return null;

  function estornar(id: string) {
    setErro(null);
    iniciar(async () => {
      const resultado = await estornarPagamentoComissao(id);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui estornar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Pagamentos no período
      </p>

      {erro ? (
        <p className="mb-2 flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {pagamentos.map((p) => (
          <li key={p.id} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="tnum block text-xs text-ink-soft">
                {dataBR(p.paid_at)} · {FORMA_PAGAMENTO[p.payment_method]}
              </span>
            </span>
            <span className="tnum shrink-0 font-semibold text-ink">{brl(p.amount)}</span>
            {p.estornavel ? (
              <button
                type="button"
                disabled={estornando}
                onClick={() => estornar(p.id)}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                Estornar
              </button>
            ) : (
              // Espaço reservado para as linhas não dançarem entre si.
              <span className="h-11 w-px shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
   Pagar
   ========================================================================== */

const FORMAS_PAGAMENTO: PaymentMethod[] = ["cash", "pix", "debit", "credit"];

function PagarDialog({
  grupo,
  aoFechar,
  aoPagar,
}: {
  grupo: ComissaoPorProfissional | null;
  aoFechar: () => void;
  aoPagar: () => void;
}) {
  const restante = grupo?.totalPendente ?? 0;

  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<PaymentMethod>("cash");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  /**
   * A chave que faz dois cliques virarem um pagamento só. Nasce a cada abertura
   * do modal, então pagar de novo depois de fechar e reabrir é um pagamento
   * novo — mas reenviar o MESMO formulário nunca cobra duas vezes.
   */
  const idempotencia = useRef<string>("");

  /**
   * Trava síncrona. `enviando` só fica verdadeiro depois que o React
   * re-renderiza, e dois cliques no mesmo tique passam os dois pelo botão
   * desabilitado. Um ref fecha a porta na hora. A chave acima é a defesa no
   * servidor; esta evita a ida e volta à toa.
   */
  const emVoo = useRef(false);

  // Já abre com o saldo cheio: o caso comum é fechar tudo.
  useEffect(() => {
    if (!grupo) return;
    setValor(numeroBR(grupo.totalPendente));
    setForma("cash");
    setErro(null);
    idempotencia.current = crypto.randomUUID();
    emVoo.current = false;
  }, [grupo]);

  const informado = lerValor(valor) ?? 0;
  const parcial = informado > 0 && informado < restante;
  const podeEnviar = informado > 0 && informado <= restante;

  function enviar() {
    if (!grupo || !podeEnviar || emVoo.current) return;
    emVoo.current = true;
    setErro(null);

    iniciar(async () => {
      const resultado = await pagarComissao({
        professionalId: grupo.professionalId,
        valor: informado,
        forma,
        idempotencia: idempotencia.current,
      });
      if (!resultado.ok) {
        // Libera para o dono corrigir o valor e tentar de novo. A chave NÃO
        // muda: se a falha foi de rede e o pagamento entrou, o reenvio devolve
        // o mesmo pagamento em vez de lançar outro.
        emVoo.current = false;
        setErro(resultado.message ?? "Não consegui registrar.");
        return;
      }
      aoPagar();
      aoFechar();
    });
  }

  if (!grupo) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Pagar comissão"
      descricao={grupo.nome}
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
            disabled={!podeEnviar}
            carregando={enviando}
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            Registrar {brl(informado)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-card bg-surface-2 p-4">
          <p className="flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">A pagar</span>
            <span className="tnum text-xl font-semibold text-ink">{brl(restante)}</span>
          </p>
        </div>

        <Field
          label="Quanto está pagando"
          htmlFor="comissao-valor"
          obrigatorio
          erro={informado > restante ? "Não dá para pagar mais do que ele tem a receber." : undefined}
          dica={
            parcial
              ? "Pagamento parcial: o resto continua a pagar, das comissões mais antigas para as mais novas."
              : undefined
          }
        >
          <Input
            id="comissao-valor"
            inputMode="decimal"
            value={valor}
            erro={informado > restante}
            onChange={(e) => setValor(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="tnum"
          />
        </Field>

        <Field label="Forma de pagamento" htmlFor="comissao-forma" obrigatorio>
          <Select
            id="comissao-forma"
            value={forma}
            onChange={(e) => setForma(e.target.value as PaymentMethod)}
          >
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>
                {FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
