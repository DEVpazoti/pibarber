"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireShopContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * A ficha do cliente DENTRO desta barbearia (`customers`).
 *
 * Não confunda com `profiles`, que é o perfil global da pessoa na plataforma.
 * Uma pessoa tem 1 perfil e N fichas — uma por barbearia onde já foi atendida.
 * Quem edita a ficha é o barbeiro; quem edita o perfil é o próprio cliente.
 *
 * `notes` é o campo "máquina 2 nas laterais". É do barbeiro e NUNCA aparece
 * para o cliente — nem aqui, nem na RLS (o cliente não lê `customers`).
 */

export type ClienteResumo = {
  id: string;
  full_name: string;
  /** Nulo no cliente avulso: ele não deixou telefone, e não precisa deixar. */
  phone: string | null;
  total_visits: number;
  last_visit_at: string | null;
};

/** As colunas do resumo, num lugar só — usadas em três consultas daqui. */
const COLUNAS_RESUMO = "id, full_name, phone, total_visits, last_visit_at";

/* ==========================================================================
   Buscar — alimenta o campo de cliente do novo agendamento
   ========================================================================== */

/**
 * Busca por nome OU telefone dentro da barbearia de quem chamou.
 *
 * O termo é limpo antes de virar filtro: `%` e `,` quebram o `or()` do
 * PostgREST, que separa as condições por vírgula.
 */
export async function buscarClientes(termo: string): Promise<ActionResult<ClienteResumo[]>> {
  try {
    const { shopId } = await requireShopContext();
    const supabase = await createClient();

    const limpo = termo.trim().replace(/[%,()]/g, "");
    const digitos = limpo.replace(/\D/g, "");

    let consulta = supabase
      .from("customers")
      .select(COLUNAS_RESUMO)
      .eq("barbershop_id", shopId)
      // O avulso fica FORA da busca do novo agendamento: "Cliente 3" de
      // ontem não é ninguém que o barbeiro queira reencontrar por nome, e
      // ele poluiria a lista de quem tem ficha de verdade.
      .eq("is_walk_in", false)
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .limit(20);

    if (limpo !== "") {
      consulta =
        digitos.length >= 3
          ? consulta.or(`full_name.ilike.%${limpo}%,phone.ilike.%${digitos}%`)
          : consulta.ilike("full_name", `%${limpo}%`);
    }

    const { data, error } = await consulta;

    if (error) return falha(traduzirErroBanco(error, "[clientes] busca"));

    return sucesso(data ?? []);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[clientes] buscarClientes"));
  }
}

/* ==========================================================================
   O nome sugerido do atendimento por ordem de chegada
   ========================================================================== */

/**
 * "Cliente 1", "Cliente 2", "Cliente 3"… — o que o formulário de agendamento já
 * mostra preenchido quando abre.
 *
 * É só uma SUGESTÃO: não consome o número. Se dois barbeiros abrirem o
 * formulário ao mesmo tempo, os dois veem "Cliente 4" — e é por isso que a tela
 * manda o nome VAZIO quando ninguém editou o campo. Aí quem carimba o número
 * definitivo é o banco, dentro da mesma transação do agendamento, e não sai
 * repetido.
 *
 * Falhou? Devolve `null` e a tela segue com o campo em branco. Sugestão de nome
 * não é motivo para impedir um atendimento de ser registrado.
 */
export async function sugerirNomeAvulso(): Promise<string | null> {
  try {
    const { shopId } = await requireShopContext();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("proximo_nome_avulso", { p_shop: shopId });

    if (error) {
      console.error("[clientes] falha ao sugerir o nome avulso:", error);
      return null;
    }

    return data ?? null;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[clientes] erro inesperado em sugerirNomeAvulso:", error);
    return null;
  }
}

/* ==========================================================================
   Criar e editar
   ========================================================================== */

export type DadosCliente = {
  id?: string;
  nome: string;
  telefone: string;
  email?: string;
  nascimento?: string;
  /** A observação do barbeiro. Só ele lê. */
  observacoes?: string;
};

export async function salvarCliente(
  dados: DadosCliente,
): Promise<ActionResult<ClienteResumo>> {
  try {
    const { shopId } = await requireShopContext();

    const nome = dados.nome.trim();
    const telefone = dados.telefone.replace(/\D/g, "");

    if (nome.length < 2) return falha("Escreva o nome do cliente.");

    if (telefone !== "" && telefone.length !== 10 && telefone.length !== 11) {
      return falha("Informe um celular válido, com DDD.");
    }

    // Telefone em branco só é aceito num caso: EDITAR uma ficha avulsa que
    // continua avulsa (renomear "Cliente 3" para "o rapaz do mercado", anotar
    // uma observação). Ficha comum precisa de telefone — é ele que a torna
    // reencontrável no próximo agendamento. Ver a constraint
    // `customers_avulso_sem_telefone` em supabase/13_agendamento_avulso.sql.
    if (telefone === "" && !dados.id) {
      return falha("Informe um celular válido, com DDD.");
    }

    const supabase = await createClient();

    const campos = {
      full_name: nome,
      phone: telefone || null,
      email: dados.email?.trim() || null,
      birth_date: dados.nascimento || null,
      notes: dados.observacoes?.trim() || null,
    };

    if (dados.id) {
      let consulta = supabase
        .from("customers")
        .update({
          ...campos,
          // GANHOU TELEFONE = deixou de ser avulso. "Cliente 3" que voltou e
          // deu o número vira ficha de verdade: passa a aparecer na busca do
          // novo agendamento e a ser reencontrado pelo telefone na próxima vez.
          //
          // Sem telefone, `is_walk_in` não é tocado — senão editar só a
          // observação de um avulso apagaria a origem dele.
          ...(telefone !== "" ? { is_walk_in: false } : {}),
        })
        .eq("id", dados.id)
        .eq("barbershop_id", shopId);

      // Salvar sem telefone só vale para ficha avulsa. O filtro é o que impede
      // — no BANCO, não na tela — apagar o telefone de um cliente comum e
      // deixá-lo impossível de reencontrar. Sem linha correspondente, o
      // `maybeSingle` volta vazio e cai na mensagem abaixo.
      if (telefone === "") consulta = consulta.eq("is_walk_in", true);

      const { data, error } = await consulta.select(COLUNAS_RESUMO).maybeSingle();

      if (error) return falha(traduzirErroBanco(error, "[clientes] atualizar"));
      if (!data) {
        return falha(
          telefone === ""
            ? "Este cliente precisa de um celular com DDD."
            : "Não encontrei esse cliente.",
        );
      }

      revalidatePath("/painel/clientes");
      revalidatePath(`/painel/clientes/${dados.id}`);
      return sucesso(data, "Cliente atualizado.");
    }

    // Cadastro pelo formulário NUNCA é avulso, mesmo sem telefone: o barbeiro
    // parou para digitar o nome dessa pessoa, então é ficha da casa.
    const { data, error } = await supabase
      .from("customers")
      .insert({ barbershop_id: shopId, ...campos, is_walk_in: false })
      .select(COLUNAS_RESUMO)
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[clientes] criar"));
    if (!data) return falha("Não consegui cadastrar o cliente.");

    revalidatePath("/painel/clientes");
    return sucesso(data, "Cliente cadastrado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[clientes] salvarCliente"));
  }
}

/**
 * Só a observação — o campo que o barbeiro mais mexe.
 *
 * Fica separado do `salvarCliente` de propósito: na ficha ele é editado
 * sozinho, sem obrigar o barbeiro a reenviar nome e telefone.
 */
export async function salvarObservacoes(
  customerId: string,
  observacoes: string,
): Promise<ActionResult> {
  try {
    const { shopId } = await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase
      .from("customers")
      .update({ notes: observacoes.trim() || null })
      .eq("id", customerId)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[clientes] observações"));

    revalidatePath(`/painel/clientes/${customerId}`);
    return sucesso(undefined, "Observações salvas.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[clientes] salvarObservacoes"));
  }
}
