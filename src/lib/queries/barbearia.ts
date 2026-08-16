import "server-only";

import { unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { clientePublico } from "@/lib/supabase/publico";
import type { Amenity, Barbershop, BusinessHour, Professional, Service } from "@/lib/types";
import { minutosDoDia, one } from "@/lib/utils";

/**
 * O perfil público da barbearia — `/b/[slug]`.
 *
 * Tudo aqui é legível por `anon`, e SÓ de loja ativa: é o link que o barbeiro
 * põe na bio do Instagram, e ele precisa abrir para quem nunca fez login.
 *
 * ==========================================================================
 * O CACHE (G3 do PERFORMANCE.md)
 * ==========================================================================
 *
 * Nome, serviços, horários, equipe e benefícios mudam raras vezes por mês, e
 * até o T-7 eram buscados do banco a CADA visitante: 6 idas e voltas ao
 * us-east-2 para desenhar a mesma página.
 *
 * São duas camadas de propósito:
 *
 *   1. slug → id     — muda só quando o dono renomeia a barbearia
 *   2. id  → dados   — tudo o mais
 *
 * A separação existe para a INVALIDAÇÃO. As actions que alteram o perfil
 * (serviços, equipe, horários, benefícios, resposta a avaliação) conhecem o
 * `shopId`, não o slug; com o cache chaveado só por slug, cada uma teria de
 * descobrir o slug antes de invalidar — uma consulta a mais em todo salvamento,
 * exatamente o que este bloco existe para evitar. Com a camada 2 marcada por
 * id, invalidar é `revalidateTag(tagBarbearia(shopId))` e pronto.
 *
 * Em cache frio o custo é o mesmo de antes (as mesmas duas ondas). Em cache
 * quente, nenhuma consulta.
 *
 * O que NÃO entra no cache, e o motivo de cada um:
 *
 *   - O chip "Aberto agora" — `estaAbertaAgora()` continua rodando a cada
 *     requisição sobre os horários guardados, com `new Date()` de verdade. Se a
 *     PÁGINA inteira fosse cacheada (o desenho que o PERFORMANCE.md descreve),
 *     esse chip congelaria em "Aberto" durante a madrugada. Guardando o dado em
 *     vez da página, o problema não chega a existir.
 *   - O coração de favorito, o registro de visita e o perfil de quem olha —
 *     são de cada pessoa e continuam fora daqui, na página.
 */

/** 5 minutos de rede de segurança, para o caso de alguma escrita escapar. */
const SEGUNDOS_DE_CACHE = 300;

/** A marca que as actions usam para derrubar o cache de uma barbearia. */
export function tagBarbearia(shopId: string): string {
  return `barbearia:${shopId}`;
}

/**
 * A marca da tabela slug → id.
 *
 * É uma marca só para todas as lojas, não uma por slug, e isso é de propósito:
 * quem renomeia a barbearia muda o slug NOVO e o VELHO ao mesmo tempo, e uma
 * marca por slug deixaria o antigo apontando para a loja até expirar. Renomear
 * barbearia acontece uma vez na vida; derrubar a tabela inteira nessa hora é
 * mais barato que a contabilidade de invalidar os dois.
 */
export const TAG_SLUGS = "barbearias:slugs";

export type AvaliacaoPublica = {
  id: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  autor: string | null;
  profissional: string | null;
};

export type BarbeariaPublica = {
  loja: Barbershop;
  servicos: Service[];
  profissionais: Professional[];
  horarios: BusinessHour[];
  avaliacoes: AvaliacaoPublica[];
  beneficios: Amenity[];
};

/**
 * Camada 1: o id da loja ativa com aquele slug.
 *
 * Devolve `null` para slug inexistente ou loja desativada — e esse `null`
 * TAMBÉM é guardado, de propósito: sem isso, um endereço errado divulgado por
 * engano bateria no banco a cada acesso.
 */
const idPorSlug = unstable_cache(
  async (slug: string): Promise<string | null> => {
    const { data, error } = await clientePublico()
      .from("barbershops")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[barbearia] falha ao resolver o slug:", error);
      return null;
    }
    return data?.id ?? null;
  },
  ["barbearia-id-por-slug"],
  { revalidate: SEGUNDOS_DE_CACHE, tags: [TAG_SLUGS] },
);

/** Camada 2: tudo o que a página desenha, por id. */
function dadosPorId(shopId: string) {
  return unstable_cache(
    async (): Promise<BarbeariaPublica | null> => {
      const supabase = clientePublico();

      const { data: loja, error } = await supabase
        .from("barbershops")
        .select("*")
        .eq("id", shopId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("[barbearia] falha ao carregar a loja:", error);
        return null;
      }
      if (!loja) return null;

      const [servicos, profissionais, horarios, avaliacoes, beneficios] = await Promise.all([
        carregarServicos(loja.id),
        carregarProfissionais(loja.id),
        carregarHorarios(loja.id),
        carregarAvaliacoes(loja.id),
        carregarBeneficios(loja.id),
      ]);

      return { loja, servicos, profissionais, horarios, avaliacoes, beneficios };
    },
    ["barbearia-dados", shopId],
    { revalidate: SEGUNDOS_DE_CACHE, tags: [tagBarbearia(shopId)] },
  )();
}

/**
 * O `cache()` do React por cima do cache de dados resolve o G7 do
 * PERFORMANCE.md: esta função é chamada DUAS vezes por requisição em
 * `/b/[slug]` — uma no `generateMetadata` e outra no componente. O T-1 mediu e
 * não custava nada, porque a memoização de `fetch` do Next deduplicava por
 * acidente. Agora que a busca não passa mais por `fetch` com cookie, esse
 * acidente não vale mais, e a dedupe precisa ser explícita.
 */
export const carregarBarbeariaPorSlug = cache(
  async (slug: string): Promise<BarbeariaPublica | null> => {
    try {
      const shopId = await idPorSlug(slug);
      if (!shopId) return null;
      return await dadosPorId(shopId);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[barbearia] erro inesperado ao carregar:", error);
      return null;
    }
  },
);

async function carregarServicos(shopId: string): Promise<Service[]> {
  const supabase = clientePublico();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("barbershop_id", shopId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[barbearia] falha ao listar serviços:", error);
    return [];
  }
  return data ?? [];
}

async function carregarProfissionais(shopId: string): Promise<Professional[]> {
  const supabase = clientePublico();
  const { data, error } = await supabase
    .from("professionals")
    .select("*")
    .eq("barbershop_id", shopId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[barbearia] falha ao listar profissionais:", error);
    return [];
  }
  return data ?? [];
}

async function carregarHorarios(shopId: string): Promise<BusinessHour[]> {
  const supabase = clientePublico();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("barbershop_id", shopId)
    .order("weekday", { ascending: true });

  if (error) {
    console.error("[barbearia] falha ao listar horários:", error);
    return [];
  }
  return data ?? [];
}

/**
 * As comodidades marcadas pelo dono (T-5).
 *
 * A ordenação sai daqui em JS, e não do `.order()`: o alvo é `sort_order` da
 * tabela EMBUTIDA, e ordenar por coluna de embed "para um" no PostgREST não é
 * confiável. São no máximo doze linhas — ordenar em memória é mais barato que
 * a alternativa e não mente.
 *
 * O `amenity` pode vir nulo mesmo com a junção existindo: a policy
 * `amenities_public_select` filtra `is_active`, então um benefício aposentado
 * some da tela sem que ninguém precise limpar a junção.
 */
async function carregarBeneficios(shopId: string): Promise<Amenity[]> {
  const supabase = clientePublico();
  const { data, error } = await supabase
    .from("barbershop_amenities")
    .select("amenity:amenities(*)")
    .eq("barbershop_id", shopId);

  if (error) {
    console.error("[barbearia] falha ao listar benefícios:", error);
    return [];
  }

  return (data ?? [])
    .map((linha) => one(linha.amenity))
    .filter((a): a is Amenity => a != null)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * As avaliações do perfil público.
 *
 * Passa por uma RPC, e não por `select` com embed, porque o nome de quem
 * avaliou mora em `profiles` — tabela que `anon` NÃO pode ler, e com razão:
 * telefone, e-mail e data de nascimento de todo mundo estão lá.
 *
 * A versão anterior embutia `profiles!reviews_profile_id_fkey(full_name)` e
 * quebrava inteira para visitante deslogado — `42501 permission denied`,
 * engolido por este mesmo `console.error`, devolvendo lista vazia. Resultado:
 * barbearia com 30 avaliações e "4,8 ★" no cabeçalho não mostrava nenhuma para
 * quem chegava pelo Instagram. Ver `supabase/10_avaliacoes_publicas.sql`.
 *
 * `public_reviews` é `security definer`: lê `profiles` por dentro e devolve só
 * o nome abreviado ("Guilherme S."). O recorte é da função, não da RLS.
 */
async function carregarAvaliacoes(shopId: string): Promise<AvaliacaoPublica[]> {
  const supabase = clientePublico();

  const { data, error } = await supabase.rpc("public_reviews", {
    p_shop: shopId,
    limite: 20,
  });

  if (error) {
    console.error("[barbearia] falha ao listar avaliações:", error);
    return [];
  }

  return data ?? [];
}

/* ==========================================================================
   Aberto agora?
   ========================================================================== */

/**
 * Decide o chip "Aberto agora" / "Fechado".
 *
 * A conta é feita com a hora de São Paulo, tanto no servidor quanto no
 * navegador — `minutosDoDia` fixa o fuso. Sem isso, um cliente viajando veria
 * "fechado" numa barbearia aberta.
 */
export function estaAbertaAgora(horarios: BusinessHour[], agora = new Date()): boolean {
  const hoje = horarios.find((h) => h.weekday === indiceDoDia(agora));
  if (!hoje || hoje.is_closed || !hoje.opens_at || !hoje.closes_at) return false;

  const minutos = minutosDoDia(agora);
  const abre = paraMinutos(hoje.opens_at);
  const fecha = paraMinutos(hoje.closes_at);

  if (minutos < abre || minutos >= fecha) return false;

  // No intervalo de almoço a porta está fechada, mesmo dentro do expediente.
  if (hoje.break_start && hoje.break_end) {
    const ini = paraMinutos(hoje.break_start);
    const fim = paraMinutos(hoje.break_end);
    if (minutos >= ini && minutos < fim) return false;
  }

  return true;
}

/** 0 = domingo … 6 = sábado, no fuso de São Paulo. */
export function indiceDoDia(data = new Date()): number {
  const texto = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
  const [ano = 0, mes = 1, dia = 1] = texto.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function paraMinutos(hora: string): number {
  const [h = "0", m = "0"] = hora.split(":");
  return Number(h) * 60 + Number(m);
}
