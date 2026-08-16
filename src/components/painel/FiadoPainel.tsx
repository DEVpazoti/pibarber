"use client";

import { AlertCircle, Check, HandCoins, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { receberFiado } from "@/app/actions/money";
import { Button, Chip, EmptyState, Field, Input, Modal, Select } from "@/components/ui";
import { FORMA_PAGAMENTO, type PaymentMethod } from "@/lib/types";
import { brl, cn, dataBR, diasDesde, hojeISO, linkWhatsApp, lerValor, numeroBR } from "@/lib/utils";

/**
 * FIADO — quem tá devendo.
 *
 * É informação OPERACIONAL: o assistente vê e recebe, porque é ele quem cobra
 * no balcão. O que ele não vê é faturamento acumulado, despesa e comissão.
 *
 * A lista vem do mais antigo para o mais novo, e o vencido fica em destaque —
 * é a ordem em que a cobrança acontece na vida real.
 */

export type DividaAberta = {
  id: string;
  original_amount: number;
  paid_amount: number;
  due_date: string | null;
  created_at: string;
  status: "open" | "partial";
  /** `phone` é nulo quando a dívida é de um cliente avulso, sem ficha completa. */
  cliente: { id: string; full_name: string; phone: string | null } | null;
  barbearia: string;
};

export function FiadoPainel({ dividas }: { dividas: DividaAberta[] }) {
  const router = useRouter();
  const [recebendo, setRecebendo] = useState<DividaAberta | null>(null);
  const hoje = hojeISO();

  if (dividas.length === 0) {
    return (
      <EmptyState
        icone={<HandCoins aria-hidden />}
        titulo="Ninguém devendo"
        descricao="Todo mundo em dia. O fiado aparece aqui quando você conclui um atendimento com essa forma de pagamento."
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {dividas.map((d) => {
          const restante = d.original_amount - d.paid_amount;
          const vencido = d.due_date != null && d.due_date < hoje;
          const dias = diasDesde(d.created_at);

          return (
            <li
              key={d.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-card border bg-surface p-4",
                vencido ? "border-danger/40" : "border-line",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {d.cliente?.full_name ?? "Cliente"}
                  </span>
                  {vencido ? <Chip tom="danger">Vencido</Chip> : null}
                  {d.status === "partial" ? <Chip tom="info">Pagou em parte</Chip> : null}
                </p>
                <p className="tnum text-xs text-ink-soft">
                  há {dias} {dias === 1 ? "dia" : "dias"}
                  {d.due_date ? ` · vence em ${dataBR(d.due_date)}` : " · sem vencimento"}
                  {d.paid_amount > 0 ? ` · já pagou ${brl(d.paid_amount)}` : ""}
                </p>
              </div>

              <p
                className={cn(
                  "tnum shrink-0 text-lg font-semibold",
                  vencido ? "text-danger" : "text-ink",
                )}
              >
                {brl(restante)}
              </p>

              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                {d.cliente?.phone ? (
                  <a
                    href={linkWhatsApp(
                      d.cliente.phone,
                      mensagemDeCobranca(d.cliente.full_name, restante, d.barbearia),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-field bg-money-soft px-4 text-sm font-medium text-money transition-opacity hover:opacity-85 sm:flex-none"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    Cobrar
                  </a>
                ) : null}

                <Button larguraTotal className="sm:w-auto" onClick={() => setRecebendo(d)}>
                  Receber
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ReceberDialog
        divida={recebendo}
        aoFechar={() => setRecebendo(null)}
        aoReceber={() => router.refresh()}
      />
    </>
  );
}

/** Curta, educada e sem constranger. É a mensagem que o barbeiro manda mesmo. */
function mensagemDeCobranca(nome: string, valor: number, barbearia: string): string {
  const primeiro = nome.split(" ")[0] ?? nome;
  return `Oi, ${primeiro}! Tudo bem? Passando para lembrar do valor de ${brl(valor)} aqui na ${barbearia}. Quando puder, é só chegar. Obrigado!`;
}

/* ==========================================================================
   Receber
   ========================================================================== */

const FORMAS_RECEBIMENTO: PaymentMethod[] = ["cash", "pix", "debit", "credit"];

function ReceberDialog({
  divida,
  aoFechar,
  aoReceber,
}: {
  divida: DividaAberta | null;
  aoFechar: () => void;
  aoReceber: () => void;
}) {
  const restante = divida ? divida.original_amount - divida.paid_amount : 0;

  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<PaymentMethod>("cash");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // Já abre com o valor cheio: o caso comum é o cliente quitar tudo.
  useEffect(() => {
    if (!divida) return;
    setValor(numeroBR(divida.original_amount - divida.paid_amount));
    setForma("cash");
    setErro(null);
  }, [divida]);

  const informado = lerValor(valor) ?? 0;
  const parcial = informado > 0 && informado < restante;
  const podeEnviar = informado > 0 && informado <= restante;

  function enviar() {
    if (!divida || !podeEnviar) return;
    setErro(null);

    iniciar(async () => {
      const resultado = await receberFiado({ debtId: divida.id, valor: informado, forma });
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui registrar.");
        return;
      }
      aoReceber();
      aoFechar();
    });
  }

  if (!divida) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Receber fiado"
      descricao={divida.cliente?.full_name}
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
            <span className="text-ink-soft">Em aberto</span>
            <span className="tnum text-xl font-semibold text-ink">{brl(restante)}</span>
          </p>
        </div>

        <Field
          label="Quanto está recebendo"
          htmlFor="fiado-valor"
          obrigatorio
          erro={informado > restante ? "Não dá para receber mais do que ele deve." : undefined}
          dica={parcial ? "Pagamento parcial: o resto continua em aberto." : undefined}
        >
          <Input
            id="fiado-valor"
            inputMode="decimal"
            value={valor}
            erro={informado > restante}
            onChange={(e) => setValor(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="tnum"
          />
        </Field>

        <Field label="Forma de pagamento" htmlFor="fiado-forma" obrigatorio>
          <Select
            id="fiado-forma"
            value={forma}
            onChange={(e) => setForma(e.target.value as PaymentMethod)}
          >
            {FORMAS_RECEBIMENTO.map((f) => (
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
