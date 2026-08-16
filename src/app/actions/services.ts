"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireOwnerContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { tagBarbearia } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * O catálogo de serviços.
 *
 * O ASSISTENTE vê, mas não edita. Isso é imposto aqui com `requireRole` e no
 * banco pela RLS de `services`, que exige `can_manage_money` para escrita —
 * mexer em preço é mexer em dinheiro.
 */

export type DadosServico = {
  id?: string;
  nome: string;
  descricao?: string;
  /** Em reais. Chega como número já lido pelo formulário. */
  preco: number;
  duracaoMinutos: number;
  ativo: boolean;
};

export async function salvarServico(dados: DadosServico): Promise<ActionResult<{ id: string }>> {
  try {
    const { shopId } = await requireOwnerContext();

    const nome = dados.nome.trim();
    if (nome.length < 2) return falha("Escreva o nome do serviço.");
    if (!(dados.preco >= 0)) return falha("Informe um preço válido.");
    if (!(dados.duracaoMinutos >= 5)) return falha("A duração precisa ter pelo menos 5 minutos.");

    const supabase = await createClient();

    const campos = {
      name: nome,
      description: dados.descricao?.trim() || null,
      price: Math.round(dados.preco * 100) / 100,
      duration_minutes: Math.round(dados.duracaoMinutos),
      is_active: dados.ativo,
    };

    if (dados.id) {
      const { data, error } = await supabase
        .from("services")
        .update(campos)
        .eq("id", dados.id)
        .eq("barbershop_id", shopId)
        .select("id")
        .maybeSingle();

      if (error) return falha(traduzirErroBanco(error, "[serviços] atualizar"));
      if (!data) return falha("Não encontrei esse serviço.");

      revalidatePath("/painel/servicos");
      revalidateTag(tagBarbearia(shopId));
      return sucesso({ id: data.id }, "Serviço atualizado.");
    }

    // Entra no fim da lista. A ordem manual é o que o dono usa para colocar o
    // corte simples em cima e a barba com toalha quente embaixo.
    const { data: ultimo, error: erroOrdem } = await supabase
      .from("services")
      .select("sort_order")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroOrdem) console.error("[serviços] falha ao ler a ordem:", erroOrdem);

    const { data, error } = await supabase
      .from("services")
      .insert({ barbershop_id: shopId, ...campos, sort_order: (ultimo?.sort_order ?? 0) + 1 })
      .select("id")
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[serviços] criar"));
    if (!data) return falha("Não consegui cadastrar o serviço.");

    revalidatePath("/painel/servicos");
    revalidateTag(tagBarbearia(shopId));
    return sucesso({ id: data.id }, "Serviço cadastrado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[serviços] salvarServico"));
  }
}

/**
 * Liga e desliga o serviço.
 *
 * Desativar não apaga: o histórico dos atendimentos antigos continua apontando
 * para ele, e `appointment_services` já congelou preço e duração.
 */
export async function alternarServico(id: string, ativo: boolean): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
    const supabase = await createClient();

    const { error } = await supabase
      .from("services")
      .update({ is_active: ativo })
      .eq("id", id)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[serviços] alternar"));

    revalidatePath("/painel/servicos");
    revalidateTag(tagBarbearia(shopId));
    return sucesso(undefined, ativo ? "Serviço ativado." : "Serviço desativado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[serviços] alternarServico"));
  }
}

/**
 * Sobe ou desce um serviço na lista, trocando de lugar com o vizinho.
 *
 * Troca em duas escritas em vez de renumerar tudo: são poucos serviços, e o
 * efeito na tela é exatamente o que o dono espera do botão.
 */
export async function moverServico(id: string, direcao: "cima" | "baixo"): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
    const supabase = await createClient();

    const { data: lista, error } = await supabase
      .from("services")
      .select("id, sort_order")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return falha(traduzirErroBanco(error, "[serviços] ler ordem"));
    if (!lista) return falha("Não consegui ler a lista de serviços.");

    const posicao = lista.findIndex((s) => s.id === id);
    const destino = direcao === "cima" ? posicao - 1 : posicao + 1;
    const atual = lista[posicao];
    const vizinho = lista[destino];

    if (posicao < 0 || !atual || !vizinho) return sucesso(undefined); // já está na ponta

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("services").update({ sort_order: vizinho.sort_order }).eq("id", atual.id),
      supabase.from("services").update({ sort_order: atual.sort_order }).eq("id", vizinho.id),
    ]);

    if (e1 || e2) return falha(traduzirErroBanco(e1 ?? e2, "[serviços] reordenar"));

    revalidatePath("/painel/servicos");
    revalidateTag(tagBarbearia(shopId));
    return sucesso(undefined);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[serviços] moverServico"));
  }
}
