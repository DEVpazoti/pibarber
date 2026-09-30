"use client";

import { AlertCircle, ArrowLeft, Check, Clock, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelarRenovacao } from "@/app/actions/assinatura";
import { sair } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DialogAssinar } from "@/components/assinatura/DialogAssinar";
import { Button, Chip } from "@/components/ui";
import {
  CICLOS,
  DIAS_PARA_RENOVAR,
  situacaoDaFatura,
  diasAte,
  faixaDoPlano,
  fimDaTolerancia,
  rotuloDoCiclo,
} from "@/lib/assinatura";
import { WHATSAPP_COMERCIAL } from "@/lib/config";
import type {
  Plan,
  PlanPrice,
  Subscription,
  SubscriptionCycle,
  SubscriptionPayment,
} from "@/lib/types";
import { brl, cn, dataBR, dataHoraBR, diaBR, linkWhatsApp } from "@/lib/utils";

/**
 * A tela de ASSINATURA do dono.
 *
 * Três blocos, de cima para baixo: onde ele está (teste, plano, vencido), os
 * planos com a escolha do período, e as faturas. O plano sugerido é o que
 * cabe na equipe ATIVA de hoje; planos menores que ela aparecem desabilitados,
 * dizendo por quê — o banco recusaria o limite do mesmo jeito
 * (`professionals_limite_do_plano`), mas a tela não deve deixar ele tentar.
 *
 * "Assinar" abre o DialogAssinar: CPF/CNPJ e forma de pagamento, e daí para a
 * página de pagamento do Asaas. Voltar de lá NÃO libera nada — quem libera é
 * o webhook, quando o dinheiro entra.
 */
export function AssinaturaPainel({
  nomeBarbearia,
  liberada,
  assinatura,
  planos,
  precos,
  profissionaisAtivos,
  faturas,
  pagamentoDisponivel,
  podeTrocar = false,
}: {
  nomeBarbearia: string;
  liberada: boolean;
  assinatura: Subscription | null;
  planos: Plan[];
  precos: PlanPrice[];
  profissionaisAtivos: number;
  faturas: SubscriptionPayment[];
  /** Falso quando o ambiente não tem ASAAS_API_KEY: a tela abre, mas não cobra. */
  pagamentoDisponivel: boolean;
  /**
   * Há uma escolha agendada e ainda não paga (reativação ou renovação): os
   * planos voltam a ter botão, e escolher de novo substitui a anterior.
   */
  podeTrocar?: boolean;
}) {
  const [ciclo, setCiclo] = useState<SubscriptionCycle>(assinatura?.cycle ?? "annual");
  const [escolhido, setEscolhido] = useState<Plan | null>(null);

  // Plano pago em dia: trocar de plano ainda não é self-service.
  const pagoEmDia =
    assinatura?.status === "active" &&
    assinatura.paid_until != null &&
    new Date(assinatura.paid_until) > new Date();

  const periodoPagoEmVigor =
    assinatura?.paid_until != null && new Date(assinatura.paid_until) > new Date();

  // Parcelado no cartão: não renova sozinho. Nos últimos DIAS_PARA_RENOVAR
  // dias do período, os planos voltam a ter botão — de "Renovar".
  const parcelado = Boolean(assinatura?.asaas_installment_id && !assinatura.asaas_subscription_id);
  const podeRenovar =
    pagoEmDia && parcelado && diasAte(assinatura!.paid_until!) <= DIAS_PARA_RENOVAR;

  // A fatura que o dono gerou e ainda não pagou — para ele voltar a ela. No
  // parcelado, só a 1ª parcela: é o link dela que cobra o cartão pelas N.
  const emAberto = faturas.find(
    (f) =>
      f.invoice_url &&
      ["PENDING", "OVERDUE"].includes(f.status) &&
      (f.installment_number ?? 1) === 1,
  );

  const maximo = Math.max(0, ...planos.map((p) => p.max_professionals));
  const sugerido = planos.find(
    (p) => profissionaisAtivos >= p.min_professionals && profissionaisAtivos <= p.max_professionals,
  );

  function preco(planoId: string) {
    return precos.find((p) => p.plan_id === planoId && p.cycle === ciclo);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <form action={sair}>
            <button
              type="submit"
              className="inline-flex h-11 items-center px-3 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-2 sm:px-6">
        {liberada ? (
          <Link
            href="/painel"
            className="mb-4 inline-flex h-11 items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar ao painel
          </Link>
        ) : null}

        <h1 className="text-3xl text-ink">Assinatura</h1>
        <p className="mt-1 text-sm text-ink-soft">{nomeBarbearia}</p>

        <div className="mt-6">
          <Situacao
            assinatura={assinatura}
            liberada={liberada}
            planos={planos}
            parcelado={parcelado}
          />
          {/* Só a assinatura que renova sozinha tem o que cancelar. O
              parcelado não renova; o cancelado já está cancelado. */}
          {assinatura?.status === "active" && assinatura.asaas_subscription_id ? (
            <CancelarRenovacao pagoAte={assinatura.paid_until} />
          ) : null}
        </div>

        {emAberto ? (
          <div className="mt-3 flex flex-col gap-3 rounded-card border border-brass bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-ink">Você tem uma fatura em aberto</p>
              <p className="tnum text-sm text-ink-soft">
                {planos.find((p) => p.id === emAberto.plan_id)?.name} ·{" "}
                {rotuloDoCiclo(emAberto.cycle)} · {brl(emAberto.value)} · vence em{" "}
                {diaBR(emAberto.due_date ?? "")}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Pagou há pouco? A confirmação do Pix é na hora; a do cartão pode levar alguns
                minutos. Recarregue esta página.
              </p>
              {!pagoEmDia || podeTrocar ? (
                <p className="mt-1 text-xs text-ink-faint">
                  Escolheu o plano ou a forma de pagamento errada? É só escolher de novo abaixo —
                  esta fatura é cancelada.
                </p>
              ) : null}
            </div>
            <a
              href={emAberto.invoice_url ?? "#"}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-field bg-brass px-5 text-sm font-medium text-brass-ink transition-colors hover:bg-brass-deep"
            >
              Pagar agora
            </a>
          </div>
        ) : null}

        {/* --- Período ---------------------------------------------------- */}
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl text-ink">Escolha seu plano</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Pelo número de profissionais ativos. Hoje você tem{" "}
              <strong className="text-ink">{profissionaisAtivos}</strong>.
            </p>
          </div>

          {/* O período escolhido muda TODOS os preços abaixo, então ele
              precisa saltar aos olhos: preenchido em latão, como o botão
              principal — não um cinza sutil que some no tema escuro. */}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <div
              role="radiogroup"
              aria-label="Período de pagamento"
              className="grid grid-cols-3 gap-1 rounded-field border border-line bg-surface-2 p-1"
            >
              {CICLOS.map((c) => {
                const ativo = ciclo === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setCiclo(c.id)}
                    className={cn(
                      "inline-flex h-11 items-center justify-center gap-1.5 rounded-chip px-3 text-sm font-semibold transition-colors",
                      ativo
                        ? "bg-brass text-brass-ink shadow-card"
                        : "font-medium text-ink-soft hover:bg-surface hover:text-ink",
                    )}
                  >
                    {ativo ? <Check className="h-4 w-4" aria-hidden /> : null}
                    {c.rotulo}
                    {c.selo ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                          ativo ? "bg-brass-ink/15 text-brass-ink" : "bg-money-soft text-money",
                        )}
                      >
                        {c.selo}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-soft" aria-live="polite">
              {ciclo === "monthly"
                ? "Cobrado todo mês. Cancele quando quiser."
                : ciclo === "semiannual"
                  ? "Pago a cada 6 meses, com 10% de desconto."
                  : "Pago uma vez por ano, com 20% de desconto."}
            </p>
          </div>
        </div>

        {/* --- Planos ----------------------------------------------------- */}
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {planos.map((plano) => {
            const p = preco(plano.id);
            const cabe = profissionaisAtivos <= plano.max_professionals;
            const ehSugerido = sugerido?.id === plano.id;
            // "Seu plano" é o plano PAGO. O escolhido-e-não-pago é só a fatura
            // em aberto — marcá-lo como atual travaria o dono fora dele.
            const ehAtual =
              pagoEmDia && assinatura?.plan_id === plano.id && assinatura.cycle === ciclo;
            const cheio = Number(plano.monthly_price) * (p?.months ?? 1);
            const economia = p ? cheio - Number(p.total) : 0;

            return (
              <li
                key={plano.id}
                className={cn(
                  "flex flex-col rounded-card border bg-surface p-5",
                  ehSugerido ? "border-brass shadow-card" : "border-line",
                  !cabe && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-ink">{plano.name}</h3>
                  {ehAtual ? (
                    <Chip tom="money">Seu plano</Chip>
                  ) : ehSugerido ? (
                    <Chip tom="brass">Para sua equipe</Chip>
                  ) : null}
                </div>
                <p className="text-sm text-ink-soft">{faixaDoPlano(plano)}</p>

                <p className="mt-4">
                  <span className="tnum text-3xl font-semibold text-ink">
                    {brl(p?.per_month ?? plano.monthly_price)}
                  </span>
                  <span className="text-sm text-ink-soft">/mês</span>
                </p>

                <p className="tnum mt-1 min-h-[2.5rem] text-xs text-ink-faint">
                  {p && (p.months ?? 1) > 1 ? (
                    <>
                      {brl(p.total)} a cada {p.months} meses
                      <br />
                      <span className="text-money">Você economiza {brl(economia)}</span>
                    </>
                  ) : (
                    "Cobrado todo mês"
                  )}
                </p>

                <div className="mt-4 flex-1" />

                {cabe ? (
                  ehAtual && !podeRenovar && !podeTrocar ? (
                    <Button tamanho="lg" larguraTotal variante="secondary" disabled>
                      Plano atual
                    </Button>
                  ) : pagoEmDia && !podeRenovar && !podeTrocar ? (
                    <p className="rounded-field bg-surface-2 px-3 py-2.5 text-center text-xs text-ink-soft">
                      {parcelado
                        ? "Na renovação você pode escolher outro plano."
                        : "Para trocar de plano, fale com a gente — pelo painel chega em breve."}
                    </p>
                  ) : (
                    <>
                      <Button
                        tamanho="lg"
                        larguraTotal
                        disabled={!pagamentoDisponivel}
                        onClick={() => setEscolhido(plano)}
                      >
                        {podeTrocar ? "Escolher este" : podeRenovar ? "Renovar" : "Assinar"}
                      </Button>
                      <p className="mt-2 text-center text-xs text-ink-faint">
                        {pagamentoDisponivel
                          ? "Cartão de crédito ou Pix."
                          : "Pagamento indisponível no momento."}
                      </p>
                    </>
                  )
                ) : (
                  <p className="rounded-field bg-surface-2 px-3 py-2.5 text-center text-xs text-ink-soft">
                    Você tem {profissionaisAtivos} profissionais ativos. Este plano é para até{" "}
                    {plano.max_professionals}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* --- Mais de 8 ---------------------------------------------------- */}
        <div className="mt-3 flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink">Mais de {maximo} profissionais?</p>
            <p className="text-sm text-ink-soft">
              A gente monta um plano para a sua barbearia. Fale direto com a gente.
            </p>
          </div>
          <a
            href={linkWhatsApp(
              WHATSAPP_COMERCIAL,
              `Olá! Minha barbearia (${nomeBarbearia}) tem mais de ${maximo} profissionais e quero assinar o PiBarber.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Falar com a gente
          </a>
        </div>

        {/* --- Faturas ----------------------------------------------------- */}
        {faturas.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl text-ink">Faturas</h2>
            <ul className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
              {faturas.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <span className="tnum w-24 text-sm text-ink">{diaBR(f.due_date ?? "")}</span>
                  <span className="min-w-0 flex-1 text-sm text-ink-soft">
                    {planos.find((p) => p.id === f.plan_id)?.name ?? "Plano"} ·{" "}
                    {rotuloDoCiclo(f.cycle)}
                    {f.installment_number
                      ? ` · parcela ${f.installment_number}/${CICLOS.find((c) => c.id === f.cycle)?.meses ?? "?"}`
                      : ""}
                  </span>
                  <span className="tnum text-sm font-medium text-ink">{brl(f.value)}</span>
                  <StatusFatura status={f.status} />
                  {f.invoice_url ? (
                    <a
                      href={f.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brass"
                    >
                      Ver
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      {escolhido ? (
        <DialogAssinar
          plano={escolhido}
          ciclo={ciclo}
          preco={precos.find((p) => p.plan_id === escolhido.id && p.cycle === ciclo)}
          primeiroVencimento={
            // Ainda há período pago (renovação do parcelado, ou quem cancelou
            // e voltou): a cobrança vence quando ele acaba — mesma regra da
            // action `assinarPlano`.
            periodoPagoEmVigor
              ? assinatura!.paid_until
              : assinatura && new Date(assinatura.trial_ends_at) > new Date()
                ? assinatura.trial_ends_at
                : null
          }
          renovando={periodoPagoEmVigor}
          aoFechar={() => setEscolhido(null)}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Onde ele está
   ========================================================================== */

function Situacao({
  assinatura,
  liberada,
  planos,
  parcelado,
}: {
  assinatura: Subscription | null;
  liberada: boolean;
  planos: Plan[];
  parcelado: boolean;
}) {
  if (!assinatura) return null;

  const emTeste = new Date(assinatura.trial_ends_at) > new Date();

  if (!liberada) {
    const quando = assinatura.paid_until
      ? fimDaTolerancia(assinatura.paid_until)
      : assinatura.trial_ends_at;
    return (
      <Caixa tom="perigo" Icone={AlertCircle} titulo="Sua barbearia está pausada">
        {assinatura.paid_until ? "O período pago" : "O teste grátis"} acabou em {dataHoraBR(quando)}
        . O painel e os agendamentos online voltam assim que você assinar — nada foi apagado, e os
        horários que já estavam marcados continuam valendo.
      </Caixa>
    );
  }

  if (emTeste && !assinatura.paid_until) {
    const dias = diasAte(assinatura.trial_ends_at);
    return (
      <Caixa
        tom={dias <= 3 ? "alerta" : "neutro"}
        Icone={Sparkles}
        titulo={`Teste grátis: ${dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}`}
      >
        Você pode usar tudo até {dataHoraBR(assinatura.trial_ends_at)}. Assine antes disso para não
        pausar o painel nem os agendamentos online.
      </Caixa>
    );
  }

  if (assinatura.paid_until) {
    const venceu = new Date(assinatura.paid_until) < new Date();
    if (venceu) {
      return (
        <Caixa tom="perigo" Icone={Clock} titulo="Pagamento pendente">
          O período pago acabou em {dataBR(assinatura.paid_until)}. Pague até{" "}
          {dataHoraBR(fimDaTolerancia(assinatura.paid_until))} para a barbearia não pausar.
        </Caixa>
      );
    }

    const plano = planos.find((p) => p.id === assinatura.plan_id)?.name ?? "";
    return (
      <Caixa tom="sucesso" Icone={Check} titulo="Assinatura em dia">
        Plano <strong>{plano}</strong>, {rotuloDoCiclo(assinatura.cycle).toLowerCase()}.{" "}
        {assinatura.status === "canceled"
          ? `Cancelada: vale até ${dataBR(assinatura.paid_until)} e não renova.`
          : parcelado
            ? diasAte(assinatura.paid_until) <= DIAS_PARA_RENOVAR
              ? `Pago até ${dataBR(assinatura.paid_until)}. Parcelado no cartão não renova sozinho: renove abaixo para não pausar.`
              : `Pago até ${dataBR(assinatura.paid_until)}, parcelado no cartão. Não renova sozinho: ${DIAS_PARA_RENOVAR} dias antes do fim, a renovação abre aqui.`
            : `Pago até ${dataBR(assinatura.paid_until)}. Renova sozinho.`}
      </Caixa>
    );
  }

  return null;
}

const TONS = {
  neutro: "border-line bg-surface text-ink-soft",
  sucesso: "border-money/30 bg-money-soft text-ink",
  alerta: "border-amber/40 bg-brass-soft text-ink",
  perigo: "border-danger/30 bg-danger-soft text-ink",
} as const;

const ICONES = {
  neutro: "text-brass",
  sucesso: "text-money",
  alerta: "text-amber",
  perigo: "text-danger",
} as const;

function Caixa({
  tom,
  Icone,
  titulo,
  children,
}: {
  tom: keyof typeof TONS;
  Icone: typeof Check;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3 rounded-card border p-4", TONS[tom])}>
      <Icone className={cn("mt-0.5 h-5 w-5 shrink-0", ICONES[tom])} aria-hidden />
      <div>
        <p className="font-medium text-ink">{titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</p>
      </div>
    </div>
  );
}

function StatusFatura({ status }: { status: string }) {
  const { texto, tom } = situacaoDaFatura(status);
  return <Chip tom={tom}>{texto}</Chip>;
}

/* ==========================================================================
   Cancelar a renovação — o dono, sozinho
   ========================================================================== */

/**
 * Os Termos prometem "no mensal, cancele quando quiser" — este é o botão.
 * Não devolve dinheiro nem corta o acesso: vale até o fim do período pago.
 * Devolução (os 7 dias de arrependimento) é pedida à PiSystem, e o texto
 * diz isso, para o dono não achar que cancelar já devolve.
 */
function CancelarRenovacao({ pagoAte }: { pagoAte: string | null }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (feito) {
    return <p className="mt-3 text-sm text-money">{feito}</p>;
  }

  return (
    <div className="mt-3">
      {confirmando ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink">
            Cancelar a renovação automática?{" "}
            {pagoAte
              ? `Sua barbearia continua funcionando até ${dataBR(pagoAte)}, e depois pausa.`
              : "Depois do período atual, sua barbearia pausa."}
          </p>
          <p className="text-xs text-ink-faint">
            Cancelar não devolve o que já foi pago. Pagou há menos de 7 dias e quer o dinheiro de
            volta? Fale com a gente — é o seu direito de arrependimento.
          </p>
          {erro ? (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variante="ghost" tamanho="sm" onClick={() => setConfirmando(false)}>
              Manter meu plano
            </Button>
            <Button
              variante="dangerSolid"
              tamanho="sm"
              carregando={enviando}
              onClick={() =>
                iniciar(async () => {
                  setErro(null);
                  const r = await cancelarRenovacao();
                  if (!r.ok) return setErro(r.message ?? "Não consegui cancelar.");
                  setFeito(r.message ?? "Renovação cancelada.");
                  router.refresh();
                })
              }
            >
              Cancelar renovação
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex h-11 items-center text-sm font-medium text-ink-soft underline-offset-2 hover:text-danger hover:underline"
        >
          Cancelar renovação
        </button>
      )}
    </div>
  );
}
