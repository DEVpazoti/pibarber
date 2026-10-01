import "server-only";

import { unstable_rethrow } from "next/navigation";

import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type MeuAgendamento } from "@/lib/types";
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
  id, starts_at, ends_at, status, total_price, discount, encerrado,
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
  /** Campo calculado `encerrado(appointments)`, 34_encerrado_para_o_cliente.sql. */
  encerrado: boolean | null;
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
    encerrado: linha.encerrado === true,
  };
}

/**
 * Os agendamentos do cliente logado, em todas as barbearias.
 *
 * É a prova de que o PiBarber é um marketplace: a mesma lista mistura lojas
 * diferentes, e é por isso que a tela tem filtro por estabelecimento.
 *
 * Devolve `ActionResult`, e não a lista crua: uma consulta que FALHOU não pode
 * virar lista vazia. "Você não tem agendamentos" para quem tem um horário
 * amanhã é pior do que um aviso de erro — a pessoa acredita e não aparece.
 * Foi o risco que a 34 deixou à vista: num banco sem o campo `encerrado`, o
 * select falha inteiro.
 */
export async function carregarMeusAgendamentos(opcoes?: {
  de?: string;
  ate?: string;
  termo?: string;
  limite?: number;
}): Promise<ActionResult<MeuAgendamento[]>> {
  try {
    const supabase = await createClient();

    // FILTRO EXPLÍCITO pela pessoa, e não só a RLS: quem tem barbearia também
    // é cliente, e a RLS deixa o dono ver a agenda INTEIRA da loja dele — que
    // apareceria aqui como se fosse dele. `meus_agendamentos_ids()`
    // (30_lado_cliente.sql) aplica a regra de "meu, como cliente" no banco,
    // sem o app precisar ler `customers` (que tem o `notes` do barbeiro).
    const { data: ids, error: erroIds } = await supabase.rpc("meus_agendamentos_ids");
    if (erroIds) {
      return falha(traduzirErroBanco(erroIds, "[app] falha ao buscar os meus agendamentos"));
    }
    if (!ids || ids.length === 0) return sucesso([]);

    let consulta = supabase
      .from("appointments")
      .select(SELECT_MEUS)
      .in("id", ids as string[])
      .order("starts_at", { ascending: false })
      .limit(opcoes?.limite ?? 200);

    if (opcoes?.de) consulta = consulta.gte("starts_at", `${opcoes.de}T00:00:00-03:00`);
    if (opcoes?.ate) consulta = consulta.lte("starts_at", `${opcoes.ate}T23:59:59-03:00`);

    const { data, error } = await consulta;

    if (error) {
      return falha(traduzirErroBanco(error, "[app] falha ao listar os agendamentos"));
    }

    const lista = (data as unknown as LinhaMeuAgendamento[] | null)?.map(normalizar) ?? [];

    // O filtro por texto é feito aqui, e não no PostgREST: o termo casa com o
    // nome da barbearia OU com o do serviço, que vêm de tabelas diferentes.
    const termo = opcoes?.termo?.trim().toLowerCase();
    if (!termo) return sucesso(lista);

    return sucesso(
      lista.filter(
        (a) =>
          a.barbearia?.name.toLowerCase().includes(termo) ||
          a.servicos.some((s) => s.toLowerCase().includes(termo)) ||
          (a.profissional?.name ?? "").toLowerCase().includes(termo),
      ),
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[app] erro inesperado ao listar os agendamentos"));
  }
}
