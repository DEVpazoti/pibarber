import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

import { IntervaloVolta } from "@/components/admin/IntervaloVolta";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { envEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dataHoraBR } from "@/lib/utils";

export const metadata: Metadata = { title: "E-mails · Admin" };

/**
 * Os e-mails da plataforma (31_emails.sql): o intervalo do e-mail de volta,
 * que é da PLATAFORMA, e como está a fila nos últimos 7 dias.
 *
 * A fila é só-servidor (sem policy); a leitura é pela service role, depois de
 * `requireAdmin()`.
 */

const ROTULO: Record<string, string> = {
  novo_agendamento: "Dono · agendamento novo",
  cancelamento_dono: "Dono · cliente cancelou",
  teste_3d: "Dono · teste acaba em 3 dias",
  teste_1d: "Dono · teste acaba amanhã",
  pausada: "Dono · agenda pausada",
  fatura_vencida: "Dono · fatura vencida",
  pagamento: "Dono · pagamento confirmado",
  renovar: "Dono · renovar parcelado",
  confirmacao: "Cliente · confirmação",
  lembrete: "Cliente · lembrete",
  cancelamento: "Cliente · loja cancelou",
  aviso_app: "Cliente · fila de espera / avaliação",
  recorrencia: "Cliente · lembrete de voltar",
};

export default async function EmailsAdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [dias, fila, falhas, lojasVolta, saidas] = await Promise.all([
    supabase.rpc("recorrencia_dias"),
    admin.from("email_messages").select("kind, status").gte("created_at", desde).limit(10_000),
    admin
      .from("email_messages")
      .select("id, kind, failure_reason, created_at")
      .eq("status", "failed")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("barbershops")
      .select("id", { count: "exact", head: true })
      .eq("email_marketing_enabled", true),
    admin.from("email_opt_outs").select("id", { count: "exact", head: true }),
  ]);

  for (const r of [dias, fila, falhas, lojasVolta, saidas]) {
    if (r.error) console.error("[admin emails] falha ao carregar:", r.error);
  }

  const porTipo = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const l of fila.data ?? []) {
    const t = porTipo.get(l.kind) ?? { sent: 0, failed: 0, pending: 0 };
    t[l.status as "sent" | "failed" | "pending"]++;
    porTipo.set(l.kind, t);
  }
  const total = [...porTipo.values()].reduce(
    (s, t) => ({
      sent: s.sent + t.sent,
      failed: s.failed + t.failed,
      pending: s.pending + t.pending,
    }),
    { sent: 0, failed: 0, pending: 0 },
  );

  return (
    <>
      <PageHeader
        titulo="E-mails"
        descricao="O intervalo do lembrete de voltar e como estão os envios nos últimos 7 dias."
      />

      {!envEmail() ? (
        <p className="mb-4 flex items-start gap-2 rounded-card border border-line bg-surface p-3 text-sm text-ink-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />O envio está
          desligado neste ambiente (sem RESEND_API_KEY). Nada entra na fila.
        </p>
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold text-ink">Lembrete de voltar</h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">
          Quantos dias depois da última visita o cliente recebe o e-mail com o botão de agendar.
          Vale para todas as barbearias que ligaram o lembrete ({lojasVolta.count ?? 0} hoje). O
          cliente recebe uma vez por visita, só se não tiver horário marcado, e só até 30 dias
          depois do prazo. {saidas.count ?? 0} pediram para parar de receber.
        </p>
        <IntervaloVolta inicial={dias.data ?? 21} />
      </Card>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <StatCard rotulo="Enviados (7 dias)" valor={total.sent} tom="money" />
        <StatCard rotulo="Na fila" valor={total.pending} />
        <StatCard
          rotulo="Falharam"
          valor={total.failed}
          tom={total.failed > 0 ? "danger" : "neutro"}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-ink">Por tipo (7 dias)</h2>
          {porTipo.size === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Nenhum e-mail nos últimos 7 dias.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
              {[...porTipo.entries()]
                .sort((a, b) => b[1].sent - a[1].sent)
                .map(([tipo, t]) => (
                  <li key={tipo} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-ink">{ROTULO[tipo] ?? tipo}</span>
                    <span className="tnum shrink-0 text-xs text-ink-soft">
                      {t.sent} enviados{t.pending ? ` · ${t.pending} na fila` : ""}
                      {t.failed ? ` · ${t.failed} falhas` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-ink">Últimas falhas</h2>
          {(falhas.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-faint">Nenhuma falha nos últimos 7 dias.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {(falhas.data ?? []).map((f) => (
                <li key={f.id} className="rounded-field bg-surface-2 p-3 text-sm">
                  <p className="text-xs text-ink-faint">
                    {ROTULO[f.kind] ?? f.kind} · {dataHoraBR(f.created_at)}
                  </p>
                  <p className="mt-1 break-words text-ink">{f.failure_reason ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
