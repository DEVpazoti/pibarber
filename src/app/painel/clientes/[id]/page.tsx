import { CalendarDays, HandCoins, MessageCircle, UserX, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import {
  BotaoEditarCliente,
  ObservacoesCliente,
} from "@/components/painel/ObservacoesCliente";
import { Chip, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_AGENDAMENTO } from "@/lib/types";
import { brl, dataBR, dataHoraBR, diaBR, linkWhatsApp, many, mascaraTelefone, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Ficha do cliente" };

/**
 * A ficha do cliente DENTRO desta barbearia.
 *
 * Lembre do modelo: `profiles` é o perfil global da pessoa na plataforma;
 * `customers` é a ficha dela nesta loja. Uma pessoa tem 1 perfil e N fichas.
 * Tudo nesta tela — histórico, quanto gastou, faltas, observações — é DESTA
 * barbearia, e some se a barbearia sumir.
 */

type Historico = {
  id: string;
  starts_at: string;
  status: keyof typeof STATUS_AGENDAMENTO;
  total_price: number;
  discount: number;
  profissional: { name: string; nickname: string | null } | null;
  itens: { service: { name: string } | null }[];
};

export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireShopContext();
  const { id } = await params;

  const supabase = await createClient();

  const { data: cliente, error } = await supabase
    .from("customers")
    .select(
      "id, full_name, phone, email, birth_date, notes, total_visits, total_spent, no_show_count, last_visit_at",
    )
    .eq("id", id)
    .eq("barbershop_id", shopId)
    .maybeSingle();

  if (error) console.error("[clientes] falha ao carregar a ficha:", error);
  if (!cliente) notFound();

  // O histórico e o fiado saem em paralelo: são duas consultas independentes.
  const [historico, aberto] = await Promise.all([
    carregarHistorico(id),
    carregarFiadoAberto(id),
  ]);

  return (
    <>
      <PageHeader
        titulo={cliente.full_name}
        descricao={
          <span className="tnum">
            {mascaraTelefone(cliente.phone)}
            {/* diaBR: birth_date é coluna `date`, e dataBR a leria como
                meia-noite UTC — um dia a menos no Brasil (armadilha nº15). */}
            {cliente.birth_date ? ` · nasceu em ${diaBR(cliente.birth_date)}` : ""}
          </span>
        }
        voltarPara="/painel/clientes"
        acao={
          <BotaoEditarCliente
            cliente={{
              id: cliente.id,
              nome: cliente.full_name,
              telefone: cliente.phone ?? "",
              email: cliente.email ?? "",
              nascimento: cliente.birth_date ?? "",
              observacoes: cliente.notes ?? "",
            }}
          />
        }
      />

      {/* Sem telefone não há WhatsApp — é o caso do atendimento por ordem de
          chegada. Em vez do botão, o convite para completar a ficha: é assim
          que "Cliente 3" vira alguém que dá para chamar de volta. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {cliente.phone ? (
          <a
            href={linkWhatsApp(cliente.phone, `Olá, ${cliente.full_name.split(" ")[0]}!`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-field bg-money-soft px-5 text-sm font-medium text-money transition-opacity hover:opacity-85"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
          </a>
        ) : (
          <p className="flex min-h-12 items-center gap-2 rounded-field bg-surface-2 px-4 text-sm text-ink-soft">
            <MessageCircle className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            Sem celular na ficha. Toque em Editar para acrescentar.
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          rotulo="Total gasto"
          valor={brl(Number(cliente.total_spent))}
          tom="money"
          icone={<Wallet className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          rotulo="Visitas"
          valor={cliente.total_visits}
          dica={cliente.last_visit_at ? `Última: ${dataBR(cliente.last_visit_at)}` : "Nunca veio"}
          icone={<CalendarDays className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          rotulo="Faltas"
          valor={cliente.no_show_count}
          tom={cliente.no_show_count > 0 ? "danger" : "neutro"}
          icone={<UserX className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          rotulo="Deve"
          valor={brl(aberto)}
          tom={aberto > 0 ? "danger" : "neutro"}
          dica={aberto > 0 ? "Cobre em Fiado" : "Sem fiado em aberto"}
          icone={<HandCoins className="h-4 w-4" aria-hidden />}
        />
      </div>

      <div className="mb-6">
        <ObservacoesCliente customerId={cliente.id} inicial={cliente.notes} />
      </div>

      <h2 className="mb-3 text-base font-semibold text-ink">Histórico de atendimentos</h2>

      {historico.length === 0 ? (
        <EmptyState
          icone={<CalendarDays aria-hidden />}
          titulo="Nenhum atendimento ainda"
          descricao="Quando este cliente for atendido, o histórico aparece aqui."
        />
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {historico.map((a) => {
            const status = STATUS_AGENDAMENTO[a.status];
            const servicos = a.itens
              .map((i) => i.service?.name)
              .filter((n): n is string => typeof n === "string");

            return (
              <li
                key={a.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-sm font-medium text-ink">
                    {dataHoraBR(a.starts_at)}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">
                    {servicos.join(", ") || "Atendimento"}
                    {a.profissional
                      ? ` · ${a.profissional.nickname || a.profissional.name}`
                      : ""}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-sm font-semibold text-ink">
                    {brl(a.total_price - a.discount)}
                  </span>
                  <Chip tom={status.tom}>{status.rotulo}</Chip>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ==========================================================================
   Consultas de apoio
   ========================================================================== */

async function carregarHistorico(customerId: string): Promise<Historico[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `id, starts_at, status, total_price, discount,
         profissional:professionals!appointments_professional_id_fkey(name, nickname),
         itens:appointment_services(service:services(name))`,
      )
      .eq("customer_id", customerId)
      .order("starts_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[clientes] falha ao carregar o histórico:", error);
      return [];
    }

    return (data ?? []).map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      status: a.status,
      total_price: Number(a.total_price),
      discount: Number(a.discount),
      profissional: one(a.profissional),
      itens: many(a.itens).map((i) => ({ service: one(i.service) })),
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[clientes] erro inesperado no histórico:", error);
    return [];
  }
}

/** Quanto este cliente ainda deve nesta barbearia. */
async function carregarFiadoAberto(customerId: string): Promise<number> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("debts")
      .select("original_amount, paid_amount")
      .eq("customer_id", customerId)
      .in("status", ["open", "partial"]);

    if (error) {
      console.error("[clientes] falha ao somar o fiado:", error);
      return 0;
    }

    return (data ?? []).reduce(
      (acc, d) => acc + (Number(d.original_amount) - Number(d.paid_amount)),
      0,
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("[clientes] erro inesperado ao somar o fiado:", error);
    return 0;
  }
}
