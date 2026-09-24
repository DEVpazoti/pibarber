"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  cancelarAssinaturaAdmin,
  carregarAssinaturaAdmin,
  estenderTeste,
  estornarFatura,
  type AssinaturaNoAdmin,
} from "@/app/actions/admin-assinatura";
import { Button, Chip, Field, Input, Select, Sheet } from "@/components/ui";
import { rotuloDoCiclo, situacaoDaFatura } from "@/lib/assinatura";
import type { Subscription, SubscriptionPayment } from "@/lib/types";
import { brl, dataBR, dataHoraBR, diaBR } from "@/lib/utils";

/**
 * A assinatura de UMA barbearia, vista pela PiSystem no /admin.
 *
 * Os botões ficam junto do que é preciso para decidir: o que foi pago,
 * quando, e se ainda está nos 7 dias de arrependimento (Termos, item 5). As
 * regras moram nas actions (src/app/actions/admin-assinatura.ts) — a tela só
 * pede confirmação e mostra o que o servidor respondeu.
 */

type Linha = Pick<
  Subscription,
  | "status"
  | "plan_id"
  | "cycle"
  | "trial_ends_at"
  | "paid_until"
  | "asaas_subscription_id"
  | "asaas_installment_id"
>;

const PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];
const DIAS_ARREPENDIMENTO = 7;

/** A situação numa etiqueta, para a lista do /admin. */
export function ChipAssinatura({ assinatura }: { assinatura: Linha | null }) {
  if (!assinatura) return <Chip tom="neutro">Sem assinatura</Chip>;
  const agora = Date.now();
  const pagoAte = assinatura.paid_until ? new Date(assinatura.paid_until).getTime() : null;

  if (pagoAte && pagoAte > agora) {
    return (
      <Chip tom={assinatura.status === "canceled" ? "neutro" : "money"}>
        {assinatura.status === "canceled" ? "Cancelada, " : ""}
        {rotuloDoCiclo(assinatura.cycle)} até {dataBR(assinatura.paid_until)}
      </Chip>
    );
  }
  if (new Date(assinatura.trial_ends_at).getTime() > agora) {
    return <Chip tom="brass">Teste até {dataBR(assinatura.trial_ends_at)}</Chip>;
  }
  if (assinatura.status === "pending") return <Chip tom="info">Aguardando pagamento</Chip>;
  return <Chip tom="danger">Vencida</Chip>;
}

export function AssinaturaAdminSheet({
  shopId,
  aoFechar,
  aoMudar,
}: {
  shopId: string | null;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [dados, setDados] = useState<AssinaturaNoAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async (id: string) => {
    setCarregando(true);
    const r = await carregarAssinaturaAdmin(id);
    setCarregando(false);
    if (!r.ok || !r.data) {
      setErro(r.message ?? "Não consegui carregar.");
      return;
    }
    setErro(null);
    setDados(r.data);
  }, []);

  useEffect(() => {
    setDados(null);
    setAviso(null);
    setErro(null);
    if (shopId) void recarregar(shopId);
  }, [shopId, recarregar]);

  /** Depois de qualquer ação: mensagem, dados novos e a lista atrás atualizada. */
  function depois(mensagem: string | undefined) {
    setAviso(mensagem ?? "Feito.");
    if (shopId) void recarregar(shopId);
    aoMudar();
  }

  return (
    <Sheet
      aberto={shopId !== null}
      aoFechar={aoFechar}
      lado="right"
      titulo={dados ? `Assinatura — ${dados.nomeBarbearia}` : "Assinatura"}
    >
      {carregando && !dados ? (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando…
        </p>
      ) : null}

      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}
      {aviso ? <Mensagem tom="ok">{aviso}</Mensagem> : null}

      {dados && shopId ? (
        <div className="flex flex-col gap-6">
          <Resumo assinatura={dados.assinatura} />

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Faturas</h3>
            {dados.faturas.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhuma fatura ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dados.faturas.map((f) => (
                  <FaturaAdmin
                    key={f.id}
                    fatura={f}
                    nomeBarbearia={dados.nomeBarbearia}
                    aoEstornar={depois}
                  />
                ))}
              </ul>
            )}
          </section>

          <EstenderTeste shopId={shopId} aoFeito={depois} />
          <CancelarAssinatura shopId={shopId} assinatura={dados.assinatura} aoFeito={depois} />

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Histórico</h3>
            {dados.eventos.length === 0 ? (
              <p className="text-sm text-ink-soft">Nenhuma ação registrada.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {dados.eventos.map((e) => (
                  <li key={e.id} className="text-ink-soft">
                    <span className="tnum text-ink-faint">{dataHoraBR(e.created_at)}</span> ·{" "}
                    <strong className="text-ink">{ROTULO_EVENTO[e.action] ?? e.action}</strong>
                    {e.quem ? ` por ${e.quem}` : " (sistema)"}
                    {e.reason ? ` — ${e.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Sheet>
  );
}

const ROTULO_EVENTO: Record<string, string> = {
  refund: "Estorno",
  external_refund: "Estorno feito fora do PiBarber",
  cancel: "Cancelada pela PiSystem",
  owner_cancel: "Renovação cancelada pelo dono",
  extend_trial: "Teste estendido",
};

/* ==========================================================================
   Pedaços
   ========================================================================== */

function Resumo({ assinatura }: { assinatura: Subscription | null }) {
  if (!assinatura) return <p className="text-sm text-ink-soft">Sem assinatura.</p>;
  const parcelado = Boolean(assinatura.asaas_installment_id && !assinatura.asaas_subscription_id);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-card bg-surface-2 p-4 text-sm">
      <dt className="text-ink-faint">Situação</dt>
      <dd className="text-ink">{ROTULO_STATUS[assinatura.status] ?? assinatura.status}</dd>
      <dt className="text-ink-faint">Plano</dt>
      <dd className="capitalize text-ink">
        {assinatura.plan_id ?? "—"}
        {assinatura.cycle ? ` · ${rotuloDoCiclo(assinatura.cycle)}` : ""}
        {assinatura.plan_id ? (parcelado ? " · parcelado" : " · renova sozinho") : ""}
      </dd>
      <dt className="text-ink-faint">Teste até</dt>
      <dd className="tnum text-ink">{dataHoraBR(assinatura.trial_ends_at)}</dd>
      <dt className="text-ink-faint">Pago até</dt>
      <dd className="tnum text-ink">
        {assinatura.paid_until ? dataHoraBR(assinatura.paid_until) : "—"}
      </dd>
    </dl>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  trialing: "Teste grátis",
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
};

function FaturaAdmin({
  fatura,
  nomeBarbearia,
  aoEstornar,
}: {
  fatura: SubscriptionPayment;
  nomeBarbearia: string;
  aoEstornar: (mensagem: string | undefined) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const paga = PAGO.includes(fatura.status);
  const pagaEm = fatura.paid_at ? new Date(fatura.paid_at) : null;
  const limite = pagaEm ? new Date(pagaEm.getTime() + DIAS_ARREPENDIMENTO * 86_400_000) : null;
  const noPrazo = limite ? limite.getTime() > Date.now() : false;
  // No parcelado o estorno é do parcelamento inteiro: o botão fica só na 1ª.
  const podeEstornar = paga && (fatura.installment_number ?? 1) === 1;

  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="tnum text-ink">{diaBR(fatura.due_date ?? "")}</span>
        <span className="tnum font-medium text-ink">{brl(fatura.value)}</span>
        <span className="text-ink-soft">
          {fatura.billing_type === "CREDIT_CARD"
            ? "Cartão"
            : fatura.billing_type === "PIX"
              ? "Pix"
              : fatura.billing_type === "BOLETO"
                ? "Boleto"
                : fatura.billing_type}
          {fatura.installment_number ? ` · parcela ${fatura.installment_number}` : ""}
        </span>
        <Chip tom={situacaoDaFatura(fatura.status).tom}>
          {situacaoDaFatura(fatura.status).texto}
        </Chip>
      </div>

      {paga && limite ? (
        <p className={noPrazo ? "mt-1 text-xs text-money" : "mt-1 text-xs text-ink-faint"}>
          {noPrazo
            ? `Dentro dos ${DIAS_ARREPENDIMENTO} dias de arrependimento (até ${dataBR(limite)}).`
            : `Fora dos ${DIAS_ARREPENDIMENTO} dias (terminaram em ${dataBR(limite)}).`}
        </p>
      ) : null}

      {podeEstornar ? (
        aberto ? (
          <FormEstorno
            fatura={fatura}
            nomeBarbearia={nomeBarbearia}
            foraDoPrazo={!noPrazo}
            aoCancelar={() => setAberto(false)}
            aoFeito={(m) => {
              setAberto(false);
              aoEstornar(m);
            }}
          />
        ) : (
          <Button variante="danger" tamanho="sm" className="mt-1" onClick={() => setAberto(true)}>
            {fatura.installment_number ? "Estornar o parcelamento" : "Estornar"}
          </Button>
        )
      ) : null}
    </li>
  );
}

const MOTIVOS = [
  "Arrependimento (7 dias)",
  "Cobrança indevida",
  "Problema no serviço",
  "Outro",
] as const;

function FormEstorno({
  fatura,
  nomeBarbearia,
  foraDoPrazo,
  aoCancelar,
  aoFeito,
}: {
  fatura: SubscriptionPayment;
  nomeBarbearia: string;
  foraDoPrazo: boolean;
  aoCancelar: () => void;
  aoFeito: (mensagem: string | undefined) => void;
}) {
  const [motivo, setMotivo] = useState<string>(foraDoPrazo ? "Outro" : MOTIVOS[0]);
  const [detalhe, setDetalhe] = useState("");
  const [nome, setNome] = useState("");
  const [excecao, setExcecao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await estornarFatura({
        asaasPaymentId: fatura.asaas_payment_id,
        motivo: detalhe.trim() ? `${motivo}: ${detalhe.trim()}` : motivo,
        nomeConfirmacao: nome,
        foraDoPrazo: excecao,
      });
      if (!r.ok) {
        setErro(r.message ?? "Não consegui estornar.");
        return;
      }
      aoFeito(r.message);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-field bg-danger-soft p-3">
      <p className="text-sm text-ink">
        Devolve <strong>{brl(fatura.value)}</strong>
        {fatura.installment_number ? " (e todas as parcelas do parcelamento)" : ""} e{" "}
        <strong>encerra o acesso pago agora</strong>. Não dá para desfazer.
      </p>

      <Field label="Motivo" htmlFor={`est-mot-${fatura.id}`}>
        <Select
          id={`est-mot-${fatura.id}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        >
          {MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Detalhe (opcional)" htmlFor={`est-det-${fatura.id}`}>
        <Input
          id={`est-det-${fatura.id}`}
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          placeholder="Ex.: pediu por WhatsApp em 23/09"
        />
      </Field>
      <Field label={`Digite "${nomeBarbearia}" para confirmar`} htmlFor={`est-nome-${fatura.id}`}>
        <Input
          id={`est-nome-${fatura.id}`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="off"
        />
      </Field>

      {foraDoPrazo ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={excecao}
            onChange={(e) => setExcecao(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brass"
          />
          Estou fazendo uma exceção: fora dos {DIAS_ARREPENDIMENTO} dias, os Termos não obrigam a
          devolver.
        </label>
      ) : null}

      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}

      <div className="flex justify-end gap-2">
        <Button variante="ghost" tamanho="sm" onClick={aoCancelar} disabled={enviando}>
          Voltar
        </Button>
        <Button
          variante="dangerSolid"
          tamanho="sm"
          carregando={enviando}
          disabled={
            nome.trim().toLowerCase() !== nomeBarbearia.trim().toLowerCase() ||
            (foraDoPrazo && !excecao)
          }
          onClick={confirmar}
        >
          Confirmar estorno
        </Button>
      </div>
    </div>
  );
}

function EstenderTeste({
  shopId,
  aoFeito,
}: {
  shopId: string;
  aoFeito: (mensagem: string | undefined) => void;
}) {
  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Estender o teste grátis</h3>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <Select value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Dias a mais">
          {[3, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              +{d} dias
            </option>
          ))}
        </Select>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo"
          aria-label="Motivo da extensão"
        />
      </div>
      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}
      <Button
        variante="secondary"
        tamanho="sm"
        className="self-start"
        carregando={enviando}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await estenderTeste({ shopId, dias: Number(dias), motivo });
            if (!r.ok) return setErro(r.message ?? "Não consegui estender.");
            setMotivo("");
            aoFeito(r.message);
          })
        }
      >
        Estender
      </Button>
    </section>
  );
}

function CancelarAssinatura({
  shopId,
  assinatura,
  aoFeito,
}: {
  shopId: string;
  assinatura: Subscription | null;
  aoFeito: (mensagem: string | undefined) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!assinatura || assinatura.status === "trialing" || assinatura.status === "canceled") {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Cancelar a assinatura</h3>
      <p className="text-xs text-ink-soft">
        Sem estorno: para de renovar e a barbearia segue até o fim do período pago. No parcelado já
        pago, as parcelas continuam. Para devolver dinheiro, use o estorno da fatura.
      </p>
      <Input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo"
        aria-label="Motivo do cancelamento"
      />
      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}
      {confirmando ? (
        <div className="flex gap-2">
          <Button variante="ghost" tamanho="sm" onClick={() => setConfirmando(false)}>
            Voltar
          </Button>
          <Button
            variante="dangerSolid"
            tamanho="sm"
            carregando={enviando}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await cancelarAssinaturaAdmin({ shopId, motivo });
                if (!r.ok) return setErro(r.message ?? "Não consegui cancelar.");
                setConfirmando(false);
                aoFeito(r.message);
              })
            }
          >
            Confirmar cancelamento
          </Button>
        </div>
      ) : (
        <Button
          variante="danger"
          tamanho="sm"
          className="self-start"
          onClick={() => setConfirmando(true)}
        >
          Cancelar assinatura
        </Button>
      )}
    </section>
  );
}

function Mensagem({ tom, children }: { tom: "erro" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={tom === "erro" ? "alert" : "status"}
      className={
        tom === "erro"
          ? "mb-3 flex items-start gap-2 rounded-field bg-danger-soft px-3 py-2 text-sm text-danger"
          : "mb-3 flex items-start gap-2 rounded-field bg-money-soft px-3 py-2 text-sm text-money"
      }
    >
      {tom === "erro" ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {children}
    </p>
  );
}
