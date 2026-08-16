import "server-only";

import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  AgendamentoNaAgenda,
  ComissaoDoDia,
  ProfissionalNaAgenda,
  ResumoDoPainel,
  ServicoNaAgenda,
} from "@/lib/types";
import { faixaDoDia, inicioDaSemana, many, one, paraDataISO, somarDias } from "@/lib/utils";

/**
 * As consultas da agenda.
 *
 * Elas rodam com a chave anônima mais o cookie da sessão, então a RLS continua
 * valendo: o assistente enxerga a agenda, e não enxerga transações. Nunca use
 * a service role aqui.
 */

/** O que o PostgREST devolve — a relação "para um" às vezes vem como array. */
type LinhaAgendamento = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AgendamentoNaAgenda["status"];
  total_price: number;
  discount: number;
  notes: string | null;
  cliente:
    | { id: string; full_name: string; phone: string | null }[]
    | { id: string; full_name: string; phone: string | null }
    | null;
  profissional:
    | { id: string; name: string; nickname: string | null }[]
    | { id: string; name: string; nickname: string | null }
    | null;
  dependente: { full_name: string }[] | { full_name: string } | null;
  itens:
    | { service: { name: string }[] | { name: string } | null }[]
    | null;
};

const SELECT_AGENDAMENTO = `
  id, starts_at, ends_at, status, total_price, discount, notes,
  cliente:customers!appointments_customer_id_fkey(id, full_name, phone),
  profissional:professionals!appointments_professional_id_fkey(id, name, nickname),
  dependente:dependents!appointments_dependent_id_fkey(full_name),
  itens:appointment_services(service:services(name))
`;

function normalizar(linha: LinhaAgendamento): AgendamentoNaAgenda {
  return {
    id: linha.id,
    starts_at: linha.starts_at,
    ends_at: linha.ends_at,
    status: linha.status,
    total_price: Number(linha.total_price),
    discount: Number(linha.discount),
    notes: linha.notes,
    cliente: one(linha.cliente),
    profissional: one(linha.profissional),
    dependente: one(linha.dependente),
    servicos: many(linha.itens)
      .map((item) => one(item.service)?.name)
      .filter((nome): nome is string => typeof nome === "string"),
  };
}

/* ==========================================================================
   Agendamentos de um intervalo de dias
   ========================================================================== */

/**
 * Os agendamentos entre dois dias, inclusive os dois.
 *
 * O intervalo chega como texto ("2026-08-14") e vira instante aqui, no fuso de
 * São Paulo. Se a data fosse calculada no navegador, o agendamento das 23h
 * apareceria no dia seguinte para quem estivesse com o fuso torto.
 */
export async function carregarAgendamentos(
  shopId: string,
  primeiroDia: string,
  ultimoDia: string = primeiroDia,
): Promise<AgendamentoNaAgenda[]> {
  try {
    const supabase = await createClient();
    const inicio = faixaDoDia(primeiroDia).de;
    const fim = faixaDoDia(ultimoDia).ate;

    const { data, error } = await supabase
      .from("appointments")
      .select(SELECT_AGENDAMENTO)
      .eq("barbershop_id", shopId)
      .gte("starts_at", inicio)
      .lt("starts_at", fim)
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("[agenda] falha ao listar agendamentos:", error);
      return [];
    }

    return (data as unknown as LinhaAgendamento[] | null)?.map(normalizar) ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agenda] erro inesperado ao listar agendamentos:", error);
    return [];
  }
}

/** Um agendamento só, para a tela de detalhe. */
export async function carregarAgendamento(
  shopId: string,
  id: string,
): Promise<AgendamentoNaAgenda | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(SELECT_AGENDAMENTO)
      .eq("barbershop_id", shopId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[agenda] falha ao carregar o agendamento:", error);
      return null;
    }

    return data ? normalizar(data as unknown as LinhaAgendamento) : null;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agenda] erro inesperado ao carregar o agendamento:", error);
    return null;
  }
}

/* ==========================================================================
   Apoio: equipe e catálogo
   ========================================================================== */

export async function carregarProfissionais(shopId: string): Promise<ProfissionalNaAgenda[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("professionals")
      .select("id, name, nickname, avatar_url")
      .eq("barbershop_id", shopId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[agenda] falha ao listar profissionais:", error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agenda] erro inesperado ao listar profissionais:", error);
    return [];
  }
}

export async function carregarServicos(shopId: string): Promise<ServicoNaAgenda[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("barbershop_id", shopId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[agenda] falha ao listar serviços:", error);
      return [];
    }

    return (data ?? []).map((s) => ({ ...s, price: Number(s.price) }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agenda] erro inesperado ao listar serviços:", error);
    return [];
  }
}

/* ==========================================================================
   Resumo do dia — os cards da tela Hoje
   ========================================================================== */

/**
 * Chama `dashboard_summary`.
 *
 * A função devolve as chaves de dinheiro SÓ para quem pode gerenciar dinheiro.
 * O assistente recebe o mesmo JSON sem `receita`, `despesa` e `fiado_aberto` —
 * o dado não é buscado, não é escondido com CSS.
 */
export async function carregarResumo(
  shopId: string,
  de: string,
  ate: string = de,
): Promise<ResumoDoPainel | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("dashboard_summary", {
      p_shop: shopId,
      p_de: de,
      p_ate: ate,
    });

    if (error) {
      console.error("[painel] falha ao carregar o resumo:", error);
      return null;
    }

    return data as unknown as ResumoDoPainel;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[painel] erro inesperado ao carregar o resumo:", error);
    return null;
  }
}

/* ==========================================================================
   Pendências — atendimento de dia anterior que ficou sem conclusão
   ========================================================================== */

/**
 * Quantos atendimentos de DIAS ANTERIORES continuam "agendado".
 *
 * A regra: a data do atendimento já passou E o status ainda é `scheduled`.
 * Atendimento de HOJE que ainda não foi concluído NÃO é pendência — o dia não
 * acabou, e marcá-lo como esquecido às 9h da manhã seria mentira.
 *
 * O corte é o instante em que hoje COMEÇA em São Paulo. Comparar com `now()`
 * em UTC jogaria os atendimentos da noite de ontem para dentro ou fora da
 * conta dependendo da hora em que a tela fosse aberta.
 *
 * `head: true` não traz linha nenhuma: só o cabeçalho com a contagem. É o que
 * permite chamar isto no layout do painel, em toda página, sem pesar.
 */
export async function contarPendencias(shopId: string, hoje: string): Promise<number> {
  try {
    const supabase = await createClient();

    const { count, error } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("barbershop_id", shopId)
      .eq("status", "scheduled")
      .lt("starts_at", faixaDoDia(hoje).de);

    if (error) {
      console.error("[painel] falha ao contar pendências:", error);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[painel] erro inesperado ao contar pendências:", error);
    return 0;
  }
}

/**
 * Os atendimentos pendentes, agrupados por dia, do mais ANTIGO para o mais novo.
 *
 * Mais antigo primeiro de propósito: é o que está há mais tempo fora do
 * faturamento, e é o que o barbeiro tem mais chance de já não lembrar. Deixá-lo
 * no fim da lista seria enterrar justamente o pior caso.
 *
 * Reaproveita o `SELECT_AGENDAMENTO` da agenda — a tela de pendências mostra as
 * mesmas informações de uma linha da agenda, e um select próprio significaria
 * dois lugares para corrigir quando um campo mudasse.
 */
export async function carregarPendencias(
  shopId: string,
  hoje: string,
): Promise<{ dia: string; itens: AgendamentoNaAgenda[] }[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointments")
      .select(SELECT_AGENDAMENTO)
      .eq("barbershop_id", shopId)
      .eq("status", "scheduled")
      .lt("starts_at", faixaDoDia(hoje).de)
      .order("starts_at", { ascending: true })
      // Um teto de segurança. Uma barbearia que nunca concluiu nada teria
      // milhares de linhas aqui, e a tela travaria o celular tentando desenhar
      // todas. O rodapé avisa quando há mais.
      .limit(300);

    if (error) {
      console.error("[pendências] falha ao listar:", error);
      return [];
    }

    const linhas = (data as unknown as LinhaAgendamento[] | null)?.map(normalizar) ?? [];

    // Agrupa por dia no fuso de São Paulo. O `Map` preserva a ordem de
    // inserção, e a consulta já veio ordenada — não precisa reordenar.
    const porDia = new Map<string, AgendamentoNaAgenda[]>();
    for (const item of linhas) {
      const dia = paraDataISO(item.starts_at);
      const atual = porDia.get(dia);
      if (atual) atual.push(item);
      else porDia.set(dia, [item]);
    }

    return [...porDia.entries()].map(([dia, itens]) => ({ dia, itens }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[pendências] erro inesperado ao listar:", error);
    return [];
  }
}

/* ==========================================================================
   Comissão do dia — o bloco no fim da tela Hoje
   ========================================================================== */

/**
 * Chama `comissoes_do_dia`.
 *
 * A permissão é resolvida NO BANCO, não aqui: a função é SECURITY DEFINER e
 * decide, a partir de `auth.uid()`, se devolve a loja inteira (dono) ou só a
 * linha de quem chamou (assistente ligado a um profissional). Lista vazia é
 * resposta legítima — dia sem atendimento concluído, ou assistente que ainda
 * não foi ligado a nenhum profissional em /painel/equipe.
 *
 * Por isso NÃO existe aqui nenhum `if (podeVerDinheiro)`: filtrar na aplicação
 * significaria ter buscado o dado antes de ter direito a ele.
 */
export async function carregarComissoesDoDia(
  shopId: string,
  dia: string,
): Promise<ComissaoDoDia[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("comissoes_do_dia", {
      p_shop: shopId,
      p_dia: dia,
    });

    if (error) {
      console.error("[painel] falha ao carregar a comissão do dia:", error);
      return [];
    }

    // `numeric` do Postgres chega como string no PostgREST quando passa do
    // alcance seguro do float. Number() aqui evita "40.0040.00" na soma.
    return (data ?? []).map((linha) => ({
      professional_id: linha.professional_id,
      nome: linha.nome,
      atendimentos: Number(linha.atendimentos),
      total_gerado: Number(linha.total_gerado),
      percent: Number(linha.percent),
      comissao: Number(linha.comissao),
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[painel] erro inesperado ao carregar a comissão do dia:", error);
    return [];
  }
}

/** Os 7 dias da semana daquele dia — a grade semanal da agenda. */
export function semanaDe(diaISO: string): string[] {
  const domingo = inicioDaSemana(diaISO);
  return Array.from({ length: 7 }, (_, i) => somarDias(domingo, i));
}
