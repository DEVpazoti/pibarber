"use client";

import { CalendarRange, CreditCard, QrCode } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { assinarPlano } from "@/app/actions/assinatura";
import { Button, Field, Input, Modal } from "@/components/ui";
import { faixaDoPlano, rotuloDoCiclo, type FormaDePagamento } from "@/lib/assinatura";
import { erroDeCpfCnpj, mascaraCpfCnpj } from "@/lib/documento";
import type { Plan, PlanPrice, SubscriptionCycle } from "@/lib/types";
import { brl, cn, dataBR } from "@/lib/utils";

/**
 * O passo entre "escolhi o plano" e a página de pagamento do Asaas.
 *
 * Pede só o que o Asaas exige e o PiBarber não tem: o CPF ou CNPJ de quem
 * paga, e se vai ser cartão ou Pix. O cartão em si é digitado lá, no Asaas —
 * nunca aqui.
 *
 * O que a tela mostra do preço é só para conferência: quem decide o valor é a
 * action, lendo a view `plan_prices`.
 */
export function DialogAssinar({
  plano,
  ciclo,
  preco,
  primeiroVencimento,
  renovando = false,
  aoFechar,
}: {
  plano: Plan;
  ciclo: SubscriptionCycle;
  preco: PlanPrice | undefined;
  /** Fim do teste (ou do período pago, ao renovar). Nulo = vence hoje. */
  primeiroVencimento: string | null;
  /** Renovação do parcelado: a 1ª cobrança vence quando o período atual acaba. */
  renovando?: boolean;
  aoFechar: () => void;
}) {
  const [documento, setDocumento] = useState("");
  const [forma, setForma] = useState<FormaDePagamento>("CREDIT_CARD");
  const [parcelado, setParcelado] = useState(false);
  const [erroDoc, setErroDoc] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const emVoo = useRef(false);
  const refDoc = useRef<HTMLInputElement>(null);

  function continuar() {
    if (emVoo.current) return;

    const problema = erroDeCpfCnpj(documento);
    if (problema) {
      setErroDoc(problema);
      refDoc.current?.focus();
      return;
    }

    emVoo.current = true;
    setErro(null);

    iniciar(async () => {
      const resultado = await assinarPlano({
        planoId: plano.id,
        ciclo,
        forma,
        parcelado: podeParcelar && parcelado,
        cpfCnpj: documento,
      });

      if (!resultado.ok || !resultado.data) {
        emVoo.current = false;
        if (resultado.campo === "cpfCnpj") {
          setErroDoc(resultado.message ?? "Confira o documento.");
          refDoc.current?.focus();
        } else {
          setErro(resultado.message ?? "Não consegui abrir o pagamento.");
        }
        return;
      }

      // Mesma aba: o Asaas tem o botão de voltar, e o dono volta para
      // /assinatura, que mostra a fatura em aberto até o webhook confirmar.
      window.location.href = resultado.data.url;
    });
  }

  const meses = preco?.months ?? 1;
  const total = Number(preco?.total ?? plano.monthly_price);
  // Semestral em 6x, anual em 12x: uma parcela por mês do período.
  const podeParcelar = forma === "CREDIT_CARD" && meses > 1;
  // O Asaas divide e joga o resto de centavos na última parcela — a tela
  // mostra a parcela "cheia", arredondada para baixo.
  const valorDaParcela = Math.floor((total * 100) / meses) / 100;

  return (
    <Modal
      aberto
      aoFechar={enviando ? () => undefined : aoFechar}
      titulo={`Assinar o plano ${plano.name}`}
      descricao={`${faixaDoPlano(plano)} · ${rotuloDoCiclo(ciclo)}`}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variante="ghost" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button carregando={enviando} onClick={continuar}>
            Ir para o pagamento
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-card bg-surface-2 p-4">
          <p className="tnum text-2xl font-semibold text-ink">
            {brl(preco?.total ?? plano.monthly_price)}
            <span className="text-sm font-normal text-ink-soft">
              {meses === 1 ? " por mês" : ` a cada ${meses} meses`}
            </span>
          </p>
          {podeParcelar && parcelado ? (
            <p className="tnum mt-0.5 text-sm font-medium text-money">
              em {meses}x de {brl(valorDaParcela)} sem juros
            </p>
          ) : null}
          <p className="mt-1 text-sm text-ink-soft">
            {renovando && primeiroVencimento
              ? `A cobrança vence em ${dataBR(primeiroVencimento)}, quando o período atual acaba. O novo período começa ali, sem perder nenhum dia.`
              : primeiroVencimento
                ? `A 1ª cobrança vence em ${dataBR(primeiroVencimento)}, quando seu teste acaba — pagar antes não encurta o teste.`
                : "A 1ª cobrança vence hoje. Assim que o pagamento for confirmado, tudo volta a funcionar."}
          </p>
        </div>

        <Field
          label="CPF ou CNPJ de quem paga"
          htmlFor="as-doc"
          obrigatorio
          erro={erroDoc ?? undefined}
          dica="Sai na nota da cobrança. Pode ser o seu CPF ou o CNPJ da barbearia."
        >
          <Input
            id="as-doc"
            ref={refDoc}
            inputMode="numeric"
            autoComplete="off"
            className="tnum"
            placeholder="000.000.000-00"
            value={documento}
            erro={Boolean(erroDoc)}
            onChange={(e) => {
              setDocumento(mascaraCpfCnpj(e.target.value));
              setErroDoc(null);
            }}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Como você quer pagar?</legend>
          <div className="grid grid-cols-2 gap-2">
            <OpcaoForma
              ativa={forma === "CREDIT_CARD"}
              aoEscolher={() => setForma("CREDIT_CARD")}
              Icone={CreditCard}
              titulo="Cartão de crédito"
              texto={meses > 1 ? "À vista ou parcelado sem juros." : "Renova sozinho todo mês."}
            />
            <OpcaoForma
              ativa={forma === "PIX"}
              aoEscolher={() => setForma("PIX")}
              Icone={QrCode}
              titulo="Pix"
              texto="A cada período chega uma cobrança nova. Pague pelo QR Code Pix."
            />
          </div>
        </fieldset>

        {podeParcelar ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">No cartão, como prefere?</legend>
            <div className="grid grid-cols-2 gap-2">
              <OpcaoForma
                ativa={!parcelado}
                aoEscolher={() => setParcelado(false)}
                Icone={CreditCard}
                titulo={`À vista: ${brl(total)}`}
                texto="Renova sozinho no fim do período."
              />
              <OpcaoForma
                ativa={parcelado}
                aoEscolher={() => setParcelado(true)}
                Icone={CalendarRange}
                titulo={`${meses}x de ${brl(valorDaParcela)}`}
                texto="Sem juros. Não renova sozinho: no fim do período você renova por aqui."
              />
            </div>
            {parcelado ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                As {meses} parcelas ficam no seu cartão mesmo se você parar de usar antes do fim do
                período.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {forma === "PIX" ? (
          <p className="rounded-field bg-brass-soft px-3.5 py-3 text-xs leading-relaxed text-ink">
            Na página de pagamento aparecem o <strong>QR Code Pix</strong> e também um boleto.
            Prefira o Pix: ele confirma na hora. O boleto leva até 3 dias úteis para compensar, e a
            barbearia pode ficar pausada até lá se o prazo vencer.
          </p>
        ) : null}

        {erro ? (
          <p role="alert" className="rounded-field bg-danger-soft px-3.5 py-3 text-sm text-danger">
            {erro}
          </p>
        ) : null}

        <p className="text-xs text-ink-faint">
          Você vai para a página de pagamento do Asaas, nosso parceiro de cobrança. Os dados do
          cartão ficam só com ele.
        </p>
      </div>
    </Modal>
  );
}

function OpcaoForma({
  ativa,
  aoEscolher,
  Icone,
  titulo,
  texto,
}: {
  ativa: boolean;
  aoEscolher: () => void;
  Icone: typeof CreditCard;
  titulo: string;
  texto: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      onClick={aoEscolher}
      className={cn(
        "flex flex-col items-start gap-1 rounded-card border p-3 text-left transition-colors",
        ativa ? "border-brass bg-brass-soft" : "border-line bg-surface hover:bg-surface-2",
      )}
    >
      <Icone className={cn("h-5 w-5", ativa ? "text-brass-deep" : "text-ink-soft")} aria-hidden />
      <span className="text-sm font-medium text-ink">{titulo}</span>
      <span className="text-xs leading-snug text-ink-soft">{texto}</span>
    </button>
  );
}
