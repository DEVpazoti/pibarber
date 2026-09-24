import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AssinaturaPainel } from "@/components/assinatura/AssinaturaPainel";
import { AssinaturaVencidaAssistente } from "@/components/assinatura/AssinaturaVencidaAssistente";
import { requireShopContext } from "@/lib/auth";
import { sincronizarComAsaas, temPagamentoConfirmado } from "@/lib/assinatura-servidor";
import { envAsaas } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Plan, PlanPrice, SubscriptionPayment } from "@/lib/types";

export const metadata: Metadata = {
  title: "Assinatura",
  robots: { index: false, follow: false },
};

/**
 * A ASSINATURA da barbearia: os planos, o plano atual e as faturas.
 *
 * Mora FORA de /painel pelo mesmo motivo do /configurar: o layout do painel
 * manda para cá quando a assinatura vence, e um redirect para dentro do
 * próprio grupo roda de novo e trava em loop. Por isso esta página não passa
 * pelo layout do painel e tem a própria moldura.
 *
 * Com a assinatura em dia, é a tela de gerenciar (ver plano, trocar, faturas),
 * aberta pelo item "Assinatura" do menu. Vencida, é a única tela do painel.
 */
export default async function AssinaturaPage() {
  const { profile, shopId, shopName, setupConcluido, assinaturaLiberada } =
    await requireShopContext();

  // Setup antes de tudo: sem ele não há o que assinar (e a contagem de
  // profissionais que sugere o plano sairia zerada).
  if (profile.role === "owner" && !setupConcluido) redirect("/configurar");

  if (profile.role !== "owner") {
    // O assistente não assina nada. Em dia, não tem o que fazer aqui.
    if (assinaturaLiberada) redirect("/painel");
    return <AssinaturaVencidaAssistente nomeBarbearia={shopName ?? "sua barbearia"} />;
  }

  const supabase = await createClient();

  // Fatura pendente: confere direto no Asaas antes de desenhar. É a rede de
  // segurança do webhook — o dono pagou, voltou para cá, e o aviso ainda não
  // chegou (ou nunca vai chegar: webhook mal cadastrado, fila pausada). Em
  // dia, não confere: não vale uma ida ao Asaas a cada visita.
  let liberada = assinaturaLiberada;
  const { data: situacao } = await supabase
    .from("subscriptions")
    .select("status, asaas_subscription_id, asaas_installment_id")
    .eq("barbershop_id", shopId)
    .maybeSingle();

  if (
    (situacao?.asaas_subscription_id || situacao?.asaas_installment_id) &&
    (situacao.status === "pending" || situacao.status === "past_due") &&
    cobrancaLigada()
  ) {
    await sincronizarComAsaas({
      assinatura: situacao.asaas_subscription_id,
      parcelamento: situacao.asaas_installment_id,
    });
    // O contexto foi lido ANTES da conferência: quem estava pausado e acabou
    // de pagar precisa ver a tela já liberada.
    const { data } = await supabase.rpc("assinatura_liberada", { shop: shopId });
    liberada = data !== false;
  }

  const [assinatura, planos, precos, ativos, faturas] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("barbershop_id", shopId).maybeSingle(),
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("plan_prices").select("*"),
    supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", shopId)
      .eq("is_active", true),
    supabase
      .from("subscription_payments")
      .select("*")
      .eq("barbershop_id", shopId)
      // Fatura cancelada antes de ser paga (o dono trocou de plano ou de forma
      // de pagamento, ou cancelou) nunca foi cobrada: na lista do dono só
      // confunde. O /admin continua vendo, como "Cancelada".
      .neq("status", "DELETED")
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  for (const r of [assinatura, planos, precos, ativos, faturas]) {
    if (r.error) console.error("[assinatura] falha ao carregar:", r.error);
  }

  // Escolha feita com período pago sobrando e ainda não paga (reativou depois
  // de cancelar, ou renovou o parcelado): o dono pode trocar plano e forma de
  // pagamento até pagar. Só pergunta ao Asaas quando há fatura em aberto — sem
  // ela não há o que trocar, e não vale uma chamada a cada visita.
  const a = assinatura.data;
  const temFaturaAberta = (faturas.data ?? []).some((f) =>
    ["PENDING", "OVERDUE"].includes(f.status),
  );
  const podeTrocar =
    !!a &&
    a.status === "active" &&
    a.paid_until != null &&
    new Date(a.paid_until) > new Date() &&
    Boolean(a.asaas_subscription_id || a.asaas_installment_id) &&
    temFaturaAberta &&
    cobrancaLigada() &&
    !(await temPagamentoConfirmado({
      assinatura: a.asaas_subscription_id,
      parcelamento: a.asaas_installment_id,
    }));

  return (
    <AssinaturaPainel
      nomeBarbearia={shopName ?? "Sua barbearia"}
      liberada={liberada}
      assinatura={assinatura.data ?? null}
      planos={(planos.data ?? []) as Plan[]}
      precos={(precos.data ?? []) as PlanPrice[]}
      profissionaisAtivos={ativos.count ?? 0}
      faturas={(faturas.data ?? []) as SubscriptionPayment[]}
      pagamentoDisponivel={cobrancaLigada()}
      podeTrocar={podeTrocar}
    />
  );
}

/** Sem chave (ou com a configuração pela metade), a tela abre mas não cobra. */
function cobrancaLigada(): boolean {
  try {
    return envAsaas() !== null;
  } catch (error) {
    console.error("[assinatura] configuração do Asaas incompleta:", error);
    return false;
  }
}
