"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireShopContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type PaymentMethod } from "@/lib/types";
import { timestampSP } from "@/lib/utils";

/**
 * Ações da agenda — criar, concluir, cancelar e marcar falta.
 *
 * Regra que vale para todas: a validação de verdade mora nas funções do
 * Postgres (`book_appointment`, `complete_appointment`, `cancel_appointment`,
 * `mark_no_show`), que conferem permissão com `has_shop_access` mesmo sendo
 * SECURITY DEFINER. Aqui a gente confere o contexto, chama, e TRADUZ o erro.
 */

/** As telas do painel que precisam se atualizar depois de mexer na agenda. */
function revalidarAgenda() {
  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  revalidatePath("/painel/clientes");
  revalidatePath("/painel/espera");
  // O badge de pendências vive no layout do painel e o contador muda a cada
  // conclusão, falta ou cancelamento — inclusive de atendimento de hoje, que
  // vira pendência à meia-noite se ficar em aberto.
  revalidatePath("/painel/pendencias");
  revalidatePath("/painel", "layout");
}

/* ==========================================================================
   Criar
   ========================================================================== */

export type NovoAgendamento = {
  professionalId: string;
  /** "2026-08-14" — o dia escolhido na tela. */
  dia: string;
  /** "14:30" — a hora escolhida na tela. */
  hora: string;
  serviceIds: string[];
  /**
   * O nome do cliente. VAZIO é válido e significa "ordem de chegada": o banco
   * batiza como "Cliente N" do dia, com o contador da barbearia.
   */
  nome?: string;
  /**
   * O telefone. VAZIO é válido: sem ele a ficha nasce avulsa, sem casar com
   * ninguém. Com ele, `book_appointment` reaproveita a ficha existente.
   */
  telefone?: string;
  observacao?: string;
};

/**
 * Agenda pelo painel (`source = 'manual'`).
 *
 * Manual não passa pela trava de antecedência mínima nem pelo liga/desliga de
 * agendamento online: quem está atrás do balcão encaixa o cliente que acabou
 * de chegar, e isso é o normal do dia.
 *
 * O dia e a hora chegam como texto e viram timestamptz AQUI, com o fuso de São
 * Paulo fixo. O navegador nunca calcula o instante — se calculasse, um celular
 * com fuso errado agendaria na hora errada.
 *
 * NOME E TELEFONE SÃO OPCIONAIS (ajuste nº 6). Sem os dois, é atendimento por
 * ordem de chegada e o banco batiza. Quem valida isso é `book_appointment`,
 * que só aceita a omissão de quem tem `has_shop_access` — pelo agendamento
 * público a regra continua sendo nome + telefone obrigatórios.
 */
export async function criarAgendamento(
  entrada: NovoAgendamento,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { shopId } = await requireShopContext();

    if (!entrada.professionalId) return falha("Escolha o profissional.");
    if (!entrada.dia || !entrada.hora) return falha("Escolha o dia e a hora.");
    if (entrada.serviceIds.length === 0) return falha("Escolha pelo menos um serviço.");

    const nome = entrada.nome?.trim() ?? "";
    const telefone = entrada.telefone?.replace(/\D/g, "") ?? "";

    // Nome de uma letra é engano de digitação, não escolha. Vazio, sim, é
    // escolha: quer dizer "batiza aí".
    if (nome !== "" && nome.length < 2) return falha("Informe o nome do cliente.");

    // Telefone pela metade não acha ninguém e ainda ocupa o lugar do certo.
    if (telefone !== "" && telefone.length < 10) {
      return falha("Informe um celular válido, com DDD — ou deixe em branco.");
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("book_appointment", {
      p_shop: shopId,
      p_professional: entrada.professionalId,
      p_quando: timestampSP(entrada.dia, entrada.hora),
      p_service_ids: entrada.serviceIds,
      // `undefined` some do JSON e o parâmetro cai no default da função. Mandar
      // "" seria diferente: o Postgres receberia texto vazio em vez de nulo.
      p_nome: nome || undefined,
      p_telefone: telefone || undefined,
      p_obs: entrada.observacao?.trim() || undefined,
      p_source: "manual",
    });

    if (error) return falha(traduzirErroBanco(error, "[agenda] book_appointment"));
    if (!data) return falha("Não consegui criar o agendamento.");

    revalidarAgenda();
    return sucesso({ id: data }, "Agendamento criado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agenda] criarAgendamento"));
  }
}

/* ==========================================================================
   Concluir — a operação mais delicada do sistema
   ========================================================================== */

export type Pagamento = { method: PaymentMethod; amount: number };

export type ConclusaoAtendimento = {
  appointmentId: string;
  pagamentos: Pagamento[];
  desconto: number;
  /** Obrigatório quando há fiado: a data de vencimento da dívida. */
  vencimento?: string | null;
};

/**
 * Conclui e acerta o dinheiro numa transação só.
 *
 * A soma dos pagamentos tem que bater com `total_price - desconto`. Quem
 * confere é a função do banco, ANTES de escrever qualquer coisa — a tela
 * também confere, mas só para não deixar o botão habilitado à toa.
 */
export async function concluirAgendamento(
  entrada: ConclusaoAtendimento,
): Promise<ActionResult> {
  try {
    await requireShopContext();

    if (entrada.pagamentos.length === 0) return falha("Informe como o cliente pagou.");
    if (entrada.pagamentos.some((p) => !(p.amount > 0))) {
      return falha("Todo pagamento precisa ter valor maior que zero.");
    }

    const temFiado = entrada.pagamentos.some((p) => p.method === "fiado");
    if (temFiado && !entrada.vencimento) {
      return falha("Escolha a data de vencimento do fiado.");
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc("complete_appointment", {
      p_appointment: entrada.appointmentId,
      // O jsonb chega como array de { method, amount } — o formato que a
      // função espera. Arredonda aqui para não mandar 19.999999 do teclado.
      p_pagamentos: entrada.pagamentos.map((p) => ({
        method: p.method,
        amount: Math.round(p.amount * 100) / 100,
      })),
      p_desconto: Math.round(entrada.desconto * 100) / 100,
      p_vencimento: temFiado ? (entrada.vencimento ?? undefined) : undefined,
    });

    if (error) return falha(traduzirErroBanco(error, "[agenda] complete_appointment"));

    revalidarAgenda();
    revalidatePath("/painel/caixa");
    revalidatePath("/painel/comissoes");
    revalidatePath("/painel/fiado");
    return sucesso(undefined, "Atendimento concluído.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agenda] concluirAgendamento"));
  }
}

/* ==========================================================================
   Cancelar e faltar
   ========================================================================== */

export async function cancelarAgendamento(
  appointmentId: string,
  motivo?: string,
): Promise<ActionResult> {
  try {
    const { profile } = await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase.rpc("cancel_appointment", {
      p_appointment: appointmentId,
      p_motivo: motivo?.trim() || undefined,
      p_por_quem: profile.id,
    });

    if (error) return falha(traduzirErroBanco(error, "[agenda] cancel_appointment"));

    revalidarAgenda();
    return sucesso(undefined, "Agendamento cancelado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agenda] cancelarAgendamento"));
  }
}

export async function marcarFalta(appointmentId: string): Promise<ActionResult> {
  try {
    await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase.rpc("mark_no_show", { p_appointment: appointmentId });

    if (error) return falha(traduzirErroBanco(error, "[agenda] mark_no_show"));

    revalidarAgenda();
    return sucesso(undefined, "Falta registrada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agenda] marcarFalta"));
  }
}

/* ==========================================================================
   Pendências — o que ficou de dias anteriores sem conclusão (ajuste nº 2)
   ========================================================================== */

/**
 * Conclui vários atendimentos de uma vez, COM A FORMA DE PAGAMENTO DE CADA UM.
 *
 * O caso real: o barbeiro atendeu a quinta inteira e só esqueceu de registrar.
 * Abrir seis modais completos para isso é o motivo de ele nunca ter feito.
 *
 * Mas a forma de pagamento NÃO pode ser uma só para o lote: a quinta-feira teve
 * gente pagando em dinheiro, no débito e no pix. Uma forma única fecharia o
 * caixa com o valor certo e as formas erradas — e o relatório por forma de
 * pagamento passaria a mentir sem ninguém perceber, porque o total continuaria
 * batendo. Por isso cada item traz a sua.
 *
 * Valor cheio e sem desconto continuam sendo a regra do lote: desconto e fiado
 * são decisão individual e vivem no diálogo de conclusão completo.
 *
 * É TUDO OU NADA. `complete_appointments_lote` roda numa transação só: se um
 * falhar, nenhum entra. Melhor do que "concluí 6 e 3 passaram", porque nesse
 * caso o barbeiro não teria como saber quais.
 */
export type ItemDoLote = { id: string; forma: PaymentMethod };

export async function concluirEmLote(entrada: {
  itens: ItemDoLote[];
}): Promise<ActionResult<{ quantos: number }>> {
  try {
    await requireShopContext();

    if (entrada.itens.length === 0) return falha("Selecione pelo menos um atendimento.");
    if (entrada.itens.length > 100) {
      return falha("Dá para concluir até 100 atendimentos de uma vez.");
    }
    if (entrada.itens.some((i) => i.forma === "fiado")) {
      return falha(
        "Fiado precisa ser lançado atendimento por atendimento, com a data de vencimento.",
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_appointments_lote", {
      // O formato que a função espera: [{ id, method }]. `method`, e não
      // `forma` — é o nome da coluna no banco, e traduzir só aqui evita um
      // apelido a mais viajando pelo SQL.
      p_itens: entrada.itens.map((i) => ({ id: i.id, method: i.forma })),
    });

    if (error) return falha(traduzirErroBanco(error, "[pendências] complete_appointments_lote"));

    const quantos = Number(data ?? 0);

    revalidarAgenda();
    revalidatePath("/painel/caixa");
    revalidatePath("/painel/comissoes");
    revalidatePath("/painel/relatorios");

    return sucesso(
      { quantos },
      quantos === 1 ? "1 atendimento concluído." : `${quantos} atendimentos concluídos.`,
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[pendências] concluirEmLote"));
  }
}

/**
 * Desfaz uma falta ou um cancelamento, devolvendo o atendimento para "agendado".
 *
 * NÃO desfaz conclusão, e isso é decisão de projeto, não limitação: reverter um
 * `completed` significaria apagar entrada de caixa, comissão (que pode já ter
 * sido PAGA, com saída própria) e dívida de fiado (que pode já ter recebido
 * pagamento parcial). Cada um tem um caminho de "já foi usado depois" que
 * transformaria o desfazer em dinheiro errado silencioso. A função do banco
 * recusa com uma mensagem que explica o caminho certo.
 *
 * Pode falhar por colisão de horário: se alguém ocupou o lugar depois do
 * cancelamento, a constraint `appointments_no_overlap` recusa a volta — e o
 * tradutor de erro já transforma isso em português.
 */
export async function reverterStatus(appointmentId: string): Promise<ActionResult> {
  try {
    await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase.rpc("reverter_status_agendamento", {
      p_appointment: appointmentId,
    });

    if (error) {
      return falha(traduzirErroBanco(error, "[pendências] reverter_status_agendamento"));
    }

    revalidarAgenda();
    return sucesso(undefined, "Voltou para agendado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[pendências] reverterStatus"));
  }
}

/*
 * NÃO EXISTE MAIS `confirmarAgendamento`.
 *
 * O status `confirmed` era indistinguível de `scheduled` em todo o sistema —
 * mesma constraint de sobreposição, mesmos filtros, mesma regra de
 * cancelamento — e o botão que o escrevia não disparava nada. Restava só uma
 * ambiguidade na tela do cliente: dois rótulos para o mesmo estado.
 *
 * Ver `STATUS_AGENDAMENTO` em src/lib/types.ts e a migração
 * supabase/12_status_agendado.sql.
 */
