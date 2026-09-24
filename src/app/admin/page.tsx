import {
  AlertTriangle,
  CalendarClock,
  Clock,
  CreditCard,
  MessageSquare,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, StatCard } from "@/components/ui";
import { variacao, type LinhaBarbearia } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brl, cn, dataBR, dataHoraBR, diaBR, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin da plataforma" };

/**
 * VISÃO GERAL do super admin: como está o negócio hoje, e o que pede ação.
 *
 * Os números vêm de `admin_metricas()` e a lista de `admin_barbearias()`
 * (29_admin_dashboard.sql) — o cálculo mora no banco, a tela só mostra.
 */

type Metricas = {
  mrr: number;
  pagantes: number;
  em_teste: number;
  receita_mes: number;
  receita_mes_anterior: number;
  estornos_mes: number;
  testes_encerrados_30d: number;
  convertidas_30d: number;
  cancelamentos_mes: number;
  cadastros_mes: number;
  cadastros_mes_anterior: number;
  faturas_vencidas: number;
  relatos_novos: number;
};

const DIA = 86_400_000;

export default async function VisaoGeralPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [metricas, barbearias, vencidas] = await Promise.all([
    supabase.rpc("admin_metricas"),
    supabase.rpc("admin_barbearias"),
    supabase
      .from("subscription_payments")
      .select("id, value, due_date, barbershop_id, loja:barbershops(name)")
      .eq("status", "OVERDUE")
      .order("due_date", { ascending: true })
      .limit(20),
  ]);

  for (const r of [metricas, barbearias, vencidas]) {
    if (r.error) console.error("[admin] falha na visão geral:", r.error);
  }

  const m = normalizar(metricas.data);
  const lojas = (barbearias.data ?? []) as LinhaBarbearia[];
  const agora = Date.now();

  // --- Precisa de atenção ------------------------------------------------
  const testesAcabando = lojas
    .filter(
      (l) =>
        l.situacao === "teste" && l.teste_ate && new Date(l.teste_ate).getTime() - agora <= 3 * DIA,
    )
    .sort((a, b) => String(a.teste_ate).localeCompare(String(b.teste_ate)));
  const pausadas = lojas.filter((l) => l.situacao === "pausada" || l.situacao === "atrasada");
  const paradasNoSetup = lojas.filter(
    (l) => l.situacao === "setup" && agora - new Date(l.created_at).getTime() > 2 * DIA,
  );
  const faturasVencidas = vencidas.data ?? [];

  const conversao =
    m.testes_encerrados_30d > 0
      ? Math.round((m.convertidas_30d / m.testes_encerrados_30d) * 100)
      : null;

  const nadaPendente =
    testesAcabando.length === 0 &&
    pausadas.length === 0 &&
    paradasNoSetup.length === 0 &&
    faturasVencidas.length === 0 &&
    m.relatos_novos === 0;

  return (
    <>
      <PageHeader
        titulo="Visão geral"
        descricao={`Como está o PiBarber hoje. Atualizado em ${dataHoraBR(new Date())}.`}
      />

      {/* ---------- Números ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          rotulo="Receita recorrente mensal"
          valor={brl(m.mrr)}
          dica="Assinaturas que renovam, por mês"
          tom="money"
        />
        <StatCard
          rotulo="Recebido no mês"
          valor={brl(m.receita_mes)}
          dica={comparacao(m.receita_mes, m.receita_mes_anterior, "mês passado")}
        />
        <StatCard rotulo="Pagantes" valor={m.pagantes} dica={`${m.em_teste} em teste grátis`} />
        <StatCard
          rotulo="Conversão do teste"
          valor={conversao === null ? "—" : `${conversao}%`}
          dica={
            m.testes_encerrados_30d > 0
              ? `${m.convertidas_30d} de ${m.testes_encerrados_30d} testes (30 dias)`
              : "Nenhum teste acabou nos últimos 30 dias"
          }
        />
        <StatCard
          rotulo="Cadastros no mês"
          valor={m.cadastros_mes}
          dica={comparacao(m.cadastros_mes, m.cadastros_mes_anterior, "mês passado")}
        />
        <StatCard
          rotulo="Cancelamentos no mês"
          valor={m.cancelamentos_mes}
          dica="Cancelou ou foi estornado"
          tom={m.cancelamentos_mes > 0 ? "danger" : "neutro"}
        />
        <StatCard
          rotulo="Estornado no mês"
          valor={brl(m.estornos_mes)}
          tom={m.estornos_mes > 0 ? "danger" : "neutro"}
        />
        <StatCard
          rotulo="Faturas vencidas"
          valor={m.faturas_vencidas}
          tom={m.faturas_vencidas > 0 ? "danger" : "neutro"}
        />
      </section>

      {/* ---------- Precisa de atenção ---------- */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">Precisa de atenção</h2>

        {nadaPendente ? (
          <p className="mt-3 rounded-card border border-line bg-surface p-4 text-sm text-ink-soft">
            Nada pendente agora. 👌
          </p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {testesAcabando.length > 0 ? (
              <Bloco
                Icone={CalendarClock}
                titulo="Teste grátis acabando (3 dias)"
                dica="Boa hora para uma mensagem: ainda não assinaram."
              >
                {testesAcabando.map((l) => (
                  <ItemLoja key={l.id} id={l.id} nome={l.name}>
                    acaba {dataHoraBR(l.teste_ate)}
                  </ItemLoja>
                ))}
              </Bloco>
            ) : null}

            {pausadas.length > 0 ? (
              <Bloco
                Icone={AlertTriangle}
                titulo="Pausadas ou com pagamento atrasado"
                dica="Painel travado e sem agendamento online."
                perigo
              >
                {pausadas.map((l) => (
                  <ItemLoja key={l.id} id={l.id} nome={l.name}>
                    {l.situacao === "atrasada"
                      ? `atrasada desde ${dataBR(l.pago_ate)}`
                      : l.pago_ate
                        ? `venceu em ${dataBR(l.pago_ate)}`
                        : `teste acabou em ${dataBR(l.teste_ate)}`}
                  </ItemLoja>
                ))}
              </Bloco>
            ) : null}

            {faturasVencidas.length > 0 ? (
              <Bloco Icone={CreditCard} titulo="Faturas vencidas" perigo>
                {faturasVencidas.map((f) => (
                  <ItemLoja key={f.id} id={f.barbershop_id} nome={one(f.loja)?.name ?? "Barbearia"}>
                    {brl(f.value)} · venceu {diaBR(f.due_date ?? "")}
                  </ItemLoja>
                ))}
              </Bloco>
            ) : null}

            {paradasNoSetup.length > 0 ? (
              <Bloco
                Icone={Wrench}
                titulo="Paradas no setup há mais de 2 dias"
                dica="Criaram a conta e não terminaram de configurar."
              >
                {paradasNoSetup.map((l) => (
                  <ItemLoja key={l.id} id={l.id} nome={l.name}>
                    cadastrou em {dataBR(l.created_at)}
                  </ItemLoja>
                ))}
              </Bloco>
            ) : null}

            {m.relatos_novos > 0 ? (
              <Bloco Icone={MessageSquare} titulo="Relatos novos">
                <li>
                  <Link
                    href="/admin/feedbacks"
                    className="flex items-center justify-between rounded-field px-2 py-2 text-sm text-ink hover:bg-surface-2"
                  >
                    {m.relatos_novos} {m.relatos_novos === 1 ? "relato" : "relatos"} esperando
                    resposta
                    <span className="text-brass">Ver →</span>
                  </Link>
                </li>
              </Bloco>
            ) : null}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-faint">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        “Mês” é o mês do calendário, no horário de Brasília.
      </p>
    </>
  );
}

/* ==========================================================================
   Pedaços
   ========================================================================== */

function Bloco({
  Icone,
  titulo,
  dica,
  perigo = false,
  children,
}: {
  Icone: typeof Clock;
  titulo: string;
  dica?: string;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icone className={cn("h-4 w-4", perigo ? "text-danger" : "text-brass")} aria-hidden />
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
      </div>
      {dica ? <p className="mt-0.5 text-xs text-ink-faint">{dica}</p> : null}
      <ul className="mt-2 flex flex-col">{children}</ul>
    </div>
  );
}

function ItemLoja({ id, nome, children }: { id: string; nome: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={`/admin/barbearias/${id}`}
        className="flex items-center justify-between gap-3 rounded-field px-2 py-2 text-sm hover:bg-surface-2"
      >
        <span className="min-w-0 truncate font-medium text-ink">{nome}</span>
        <span className="tnum shrink-0 text-xs text-ink-soft">{children}</span>
      </Link>
    </li>
  );
}

/** "+12% vs mês passado" — ou a frase sem número, quando não há com o que comparar. */
function comparacao(atual: number, anterior: number, periodo: string): string {
  const v = variacao(atual, anterior);
  if (v === null) return anterior === 0 && atual > 0 ? `nada no ${periodo}` : `igual ao ${periodo}`;
  return `${v > 0 ? "+" : ""}${v}% vs ${periodo}`;
}

/** O jsonb do banco chega com números como texto em alguns campos. */
function normalizar(dados: unknown): Metricas {
  const d = (dados ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(d[k] ?? 0) || 0;
  return {
    mrr: n("mrr"),
    pagantes: n("pagantes"),
    em_teste: n("em_teste"),
    receita_mes: n("receita_mes"),
    receita_mes_anterior: n("receita_mes_anterior"),
    estornos_mes: n("estornos_mes"),
    testes_encerrados_30d: n("testes_encerrados_30d"),
    convertidas_30d: n("convertidas_30d"),
    cancelamentos_mes: n("cancelamentos_mes"),
    cadastros_mes: n("cadastros_mes"),
    cadastros_mes_anterior: n("cadastros_mes_anterior"),
    faturas_vencidas: n("faturas_vencidas"),
    relatos_novos: n("relatos_novos"),
  };
}
