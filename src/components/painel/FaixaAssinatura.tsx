import { AlertCircle, CalendarClock, Sparkles } from "lucide-react";
import Link from "next/link";

import { DIAS_PARA_RENOVAR, diasAte, fimDaTolerancia } from "@/lib/assinatura";
import type { ShopContext } from "@/lib/types";
import { cn, dataHoraBR } from "@/lib/utils";

/**
 * A faixa no topo do painel: quanto falta do teste, ou que o pagamento está
 * pendente. Só o dono vê — é ele quem assina.
 *
 * Com a assinatura vencida esta faixa nem aparece: o layout já mandou para
 * /assinatura. Ela existe para avisar ANTES.
 */
export function FaixaAssinatura({ assinatura }: { assinatura: ShopContext["assinatura"] }) {
  if (!assinatura) return null;

  const agora = new Date();

  // Período pago vencido, dentro do 1 dia de tolerância: a barbearia pausa
  // quando ele acabar.
  if (assinatura.paidUntil && new Date(assinatura.paidUntil) < agora) {
    return (
      <Faixa tom="perigo">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          Pagamento pendente. Pague até {dataHoraBR(fimDaTolerancia(assinatura.paidUntil))} para a
          barbearia não pausar.
        </span>
      </Faixa>
    );
  }

  // Parcelado no cartão perto do fim: ele não renova sozinho, e sem renovar a
  // barbearia pausa. Avisa desde que a renovação abre.
  if (assinatura.paidUntil && !assinatura.renovaSozinho) {
    const dias = diasAte(assinatura.paidUntil, agora);
    if (dias <= DIAS_PARA_RENOVAR) {
      return (
        <Faixa tom={dias <= 3 ? "perigo" : "alerta"}>
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Seu plano vence em {dias === 1 ? "1 dia" : `${dias} dias`}. Renove para a barbearia não
            pausar.
          </span>
        </Faixa>
      );
    }
    return null;
  }

  // No teste, sem plano pago: sempre visível, mais forte nos 3 últimos dias.
  if (!assinatura.paidUntil) {
    const dias = diasAte(assinatura.trialEndsAt, agora);
    if (dias <= 0) return null;
    return (
      <Faixa tom={dias <= 3 ? "alerta" : "neutro"}>
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span>Teste grátis: {dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}.</span>
      </Faixa>
    );
  }

  return null;
}

function Faixa({
  tom,
  children,
}: {
  tom: "neutro" | "alerta" | "perigo";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card px-4 py-2.5 text-sm",
        tom === "neutro" && "bg-surface-2 text-ink-soft",
        tom === "alerta" && "bg-brass-soft text-ink",
        tom === "perigo" && "bg-danger-soft text-danger",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <Link href="/assinatura" className="font-medium text-brass hover:text-brass-deep">
        Ver planos
      </Link>
    </div>
  );
}
