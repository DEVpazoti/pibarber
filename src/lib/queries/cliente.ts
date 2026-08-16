import "server-only";

import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { MeuAgendamento } from "@/lib/types";
import { many, one } from "@/lib/utils";

/**
 * As consultas do app do cliente.
 *
 * O cliente NÃO lê a tabela `customers` — a RLS não deixa, de propósito: a
 * policy não filtra coluna, então quem lesse a própria ficha leria também
 * `customers.notes`, a observação privada do barbeiro. Por isso o caminho aqui
 * é sempre `appointments → customers(profile_id)` como FILTRO, nunca como
 * dado devolvido.
 */

const SELECT_MEUS = `
  id, starts_at, ends_at, status, total_price, discount,
  barbearia:barbershops!appointments_barbershop_id_fkey(
    id, name, slug, logo_url, street, number, neighborhood, city, cancel_deadline_hours
  ),
  profissional:professionals!appointments_professional_id_fkey(name, nickname),
  itens:appointment_services(service:services(name)),
  avaliacao:reviews!reviews_appointment_id_fkey(id)
`;

type LinhaMeuAgendamento = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: MeuAgendamento["status"];
  total_price: number | string;
  discount: number | string;
  barbearia: unknown;
  profissional: unknown;
  itens: { service: { name: string } | { name: string }[] | null }[] | null;
  avaliacao: { id: string }[] | { id: string } | null;
};

function normalizar(linha: LinhaMeuAgendamento): MeuAgendamento {
  return {
    id: linha.id,
    starts_at: linha.starts_at,
    ends_at: linha.ends_at,
    status: linha.status,
    total_price: Number(linha.total_price),
    discount: Number(linha.discount),
    barbearia: one(linha.barbearia as MeuAgendamento["barbearia"] | MeuAgendamento["barbearia"][]),
    profissional: one(
      linha.profissional as MeuAgendamento["profissional"] | MeuAgendamento["profissional"][],
    ),
    servicos: many(linha.itens)
      .map((i) => one(i.service)?.name)
      .filter((n): n is string => typeof n === "string"),
    avaliado: many(linha.avaliacao).length > 0,
  };
}

/**
 * Os agendamentos do cliente logado, em todas as barbearias.
 *
 * É a prova de que o PiBarber é um marketplace: a mesma lista mistura lojas
 * diferentes, e é por isso que a tela tem filtro por estabelecimento.
 */
export async function carregarMeusAgendamentos(
  opcoes?: { de?: string; ate?: string; termo?: string; limite?: number },
): Promise<MeuAgendamento[]> {
  try {
    const supabase = await createClient();

    // Sem filtro por cliente, e é de propósito: a policy `appointments_select`
    // usa `owns_customer(customer_id)`, então o Postgres já devolve só os
    // agendamentos desta pessoa. Filtrar aqui exigiria ler `customers` — o que
    // o cliente NÃO pode fazer, senão leria junto o `notes` do barbeiro.
    let consulta = supabase
      .from("appointments")
      .select(SELECT_MEUS)
      .order("starts_at", { ascending: false })
      .limit(opcoes?.limite ?? 200);

    if (opcoes?.de) consulta = consulta.gte("starts_at", `${opcoes.de}T00:00:00-03:00`);
    if (opcoes?.ate) consulta = consulta.lte("starts_at", `${opcoes.ate}T23:59:59-03:00`);

    const { data, error } = await consulta;

    if (error) {
      console.error("[app] falha ao listar os agendamentos:", error);
      return [];
    }

    const lista = (data as unknown as LinhaMeuAgendamento[] | null)?.map(normalizar) ?? [];

    // O filtro por texto é feito aqui, e não no PostgREST: o termo casa com o
    // nome da barbearia OU com o do serviço, que vêm de tabelas diferentes.
    const termo = opcoes?.termo?.trim().toLowerCase();
    if (!termo) return lista;

    return lista.filter(
      (a) =>
        a.barbearia?.name.toLowerCase().includes(termo) ||
        a.servicos.some((s) => s.toLowerCase().includes(termo)) ||
        (a.profissional?.name ?? "").toLowerCase().includes(termo),
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app] erro inesperado ao listar os agendamentos:", error);
    return [];
  }
}
