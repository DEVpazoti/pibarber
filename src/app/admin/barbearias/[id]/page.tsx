import { ArrowLeft, ExternalLink, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcoesDaFicha, NotasInternas, type Nota } from "@/components/admin/FichaBarbearia";
import { ChipSituacao } from "@/components/admin/ListaBarbearias";
import { Card, StatCard } from "@/components/ui";
import type { LinhaBarbearia } from "@/lib/admin";
import { rotuloDoCiclo } from "@/lib/assinatura";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionCycle } from "@/lib/types";
import { brl, dataBR, dataHoraBR, linkWhatsApp, mascaraTelefone, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Barbearia · Admin" };

/**
 * A FICHA de uma barbearia no /admin: tudo o que antes estava espalhado —
 * dono, assinatura, uso, notas internas, relatos e a linha do tempo — com as
 * ações (ver como o dono, gerenciar assinatura, bloquear) no topo.
 */

type Evento = { quando: string; texto: string; tom?: "perigo" | "bom" };

const ROTULO_EVENTO: Record<string, string> = {
  refund: "Estorno feito pelo admin",
  external_refund: "Estorno feito fora do PiBarber",
  cancel: "Assinatura cancelada pelo admin",
  owner_cancel: "Dono cancelou a renovação",
  extend_trial: "Teste grátis estendido",
};

const PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const [loja, notas, relatos, pagamentos, eventos, auditoria] = await Promise.all([
    supabase.rpc("admin_barbearias", { p_shop: id }),
    supabase
      .from("admin_notes")
      .select("id, body, created_at, autor:profiles(full_name)")
      .eq("barbershop_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("feedbacks")
      .select("id, kind, message, status, created_at")
      .eq("barbershop_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("subscription_payments")
      .select("value, status, paid_at, plan_id, cycle, installment_number")
      .eq("barbershop_id", id)
      .in("status", PAGO)
      .order("paid_at", { ascending: false }),
    supabase
      .from("subscription_events")
      .select("action, reason, created_at, quem:profiles(full_name)")
      .eq("barbershop_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_audit")
      .select("action, created_at, quem:profiles(full_name)")
      .eq("barbershop_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  for (const r of [loja, notas, relatos, pagamentos, eventos, auditoria]) {
    if (r.error) console.error("[admin] falha na ficha:", r.error);
  }

  const l = ((loja.data ?? []) as LinhaBarbearia[])[0];
  if (!l) notFound();

  // --- Linha do tempo ------------------------------------------------------
  const linha: Evento[] = [
    { quando: l.created_at, texto: "Barbearia cadastrada" },
    ...(l.setup_em ? [{ quando: l.setup_em, texto: "Setup concluído", tom: "bom" as const }] : []),
    ...(pagamentos.data ?? [])
      // No parcelado, uma linha só (a 1ª parcela) — não 12.
      .filter((p) => p.paid_at && (p.installment_number ?? 1) === 1)
      .map((p) => ({
        quando: p.paid_at!,
        texto: `Pagamento de ${brl(p.value)} (${p.plan_id ?? "plano"}, ${rotuloDoCiclo(p.cycle as SubscriptionCycle).toLowerCase()}${p.installment_number ? ", parcelado" : ""})`,
        tom: "bom" as const,
      })),
    ...(eventos.data ?? []).map((e) => ({
      quando: e.created_at,
      texto: `${ROTULO_EVENTO[e.action] ?? e.action}${one(e.quem)?.full_name ? ` · ${one(e.quem)?.full_name}` : ""}${e.reason ? ` — ${e.reason}` : ""}`,
      tom: ["refund", "external_refund", "cancel", "owner_cancel"].includes(e.action)
        ? ("perigo" as const)
        : undefined,
    })),
    ...(relatos.data ?? []).map((r) => ({
      quando: r.created_at,
      texto: `Enviou um relato (${r.kind})`,
    })),
    ...(auditoria.data ?? []).map((a) => ({
      quando: a.created_at,
      texto:
        a.action === "view_as_owner"
          ? `Painel visualizado por ${one(a.quem)?.full_name ?? "admin"}`
          : a.action,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  const notasFormatadas: Nota[] = (notas.data ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    autor: one(n.autor)?.full_name ?? null,
  }));

  const totalPago = (pagamentos.data ?? []).reduce((s, p) => s + Number(p.value), 0);

  return (
    <>
      <Link
        href="/admin/barbearias"
        className="mb-3 inline-flex h-11 items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Barbearias
      </Link>

      {/* ---------- Cabeçalho ---------- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl text-ink sm:text-3xl">{l.name}</h1>
            <ChipSituacao linha={l} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {[l.city, l.state].filter(Boolean).join("/") || "Sem cidade"} · cadastrada em{" "}
            {dataBR(l.created_at)} ·{" "}
            <a
              href={`/b/${l.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brass hover:underline"
            >
              /b/{l.slug}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </p>
        </div>
        <AcoesDaFicha shopId={l.id} bloqueada={l.situacao === "bloqueada"} />
      </div>

      {/* ---------- Uso ---------- */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Agendamentos (30 dias)" valor={l.agendamentos_30d} />
        <StatCard rotulo="Profissionais ativos" valor={l.profissionais} />
        <StatCard rotulo="Clientes" valor={l.clientes} />
        <StatCard
          rotulo="Avaliação"
          valor={l.avaliacoes ? `★ ${Number(l.nota).toFixed(1)}` : "—"}
          dica={l.avaliacoes ? `${l.avaliacoes} avaliações` : "Sem avaliações"}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* ---------- Dono ---------- */}
        <Card>
          <h2 className="text-sm font-semibold text-ink">Dono</h2>
          <p className="mt-2 font-medium text-ink">{l.dono_nome ?? "—"}</p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {l.dono_email ? (
              <a
                href={`mailto:${l.dono_email}`}
                className="inline-flex items-center gap-2 text-ink-soft hover:text-ink"
              >
                <Mail className="h-4 w-4" aria-hidden />
                {l.dono_email}
              </a>
            ) : null}
            {l.dono_telefone ? (
              <a
                href={linkWhatsApp(l.dono_telefone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-money hover:underline"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {mascaraTelefone(l.dono_telefone)} · WhatsApp
              </a>
            ) : (
              <span className="text-ink-faint">Sem celular cadastrado</span>
            )}
          </div>
        </Card>

        {/* ---------- Assinatura ---------- */}
        <Card>
          <h2 className="text-sm font-semibold text-ink">Assinatura</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-faint">Plano</dt>
            <dd className="text-ink">
              {l.plano_nome
                ? `${l.plano_nome} · ${rotuloDoCiclo(l.ciclo as SubscriptionCycle)}${l.parcelado ? " (parcelado)" : ""}`
                : "Nenhum"}
            </dd>
            <dt className="text-ink-faint">Teste grátis até</dt>
            <dd className="tnum text-ink">{dataHoraBR(l.teste_ate) || "—"}</dd>
            <dt className="text-ink-faint">Pago até</dt>
            <dd className="tnum text-ink">{dataHoraBR(l.pago_ate) || "—"}</dd>
            <dt className="text-ink-faint">Total já pago</dt>
            <dd className="tnum text-ink">{brl(totalPago)}</dd>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            Faturas, estorno, cancelamento e extensão do teste ficam em “Gerenciar assinatura”.
          </p>
        </Card>

        {/* ---------- Notas internas ---------- */}
        <Card>
          <h2 className="text-sm font-semibold text-ink">Notas internas</h2>
          <p className="mb-3 text-xs text-ink-faint">Só os admins veem. O dono nunca vê.</p>
          <NotasInternas shopId={l.id} notas={notasFormatadas} />
        </Card>

        {/* ---------- Relatos ---------- */}
        <Card>
          <h2 className="text-sm font-semibold text-ink">Relatos enviados</h2>
          {(relatos.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Nenhum relato desta barbearia.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(relatos.data ?? []).map((r) => (
                <li key={r.id} className="rounded-field bg-surface-2 p-3 text-sm">
                  <p className="text-xs text-ink-faint">
                    {r.kind} · {r.status} · {dataHoraBR(r.created_at)}
                  </p>
                  <p className="mt-1 line-clamp-3 text-ink">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/feedbacks"
            className="mt-3 inline-block text-sm font-medium text-brass"
          >
            Ver todos os relatos →
          </Link>
        </Card>
      </div>

      {/* ---------- Linha do tempo ---------- */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Linha do tempo</h2>
        <ol className="mt-3 border-l border-line pl-4">
          {linha.map((e, i) => (
            <li key={i} className="relative pb-4 last:pb-0">
              <span
                className={
                  "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full " +
                  (e.tom === "perigo"
                    ? "bg-danger"
                    : e.tom === "bom"
                      ? "bg-money"
                      : "bg-line-strong")
                }
                aria-hidden
              />
              <p className="text-sm text-ink">{e.texto}</p>
              <p className="tnum text-xs text-ink-faint">{dataHoraBR(e.quando)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
