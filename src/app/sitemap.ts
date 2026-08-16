import { createClient } from "@supabase/supabase-js";
import type { MetadataRoute } from "next";

import type { Database } from "@/lib/database.types";
import { absoluta, envPublico } from "@/lib/env";

/**
 * O sitemap.
 *
 * Duas metades: as páginas fixas de venda e **o perfil público de cada
 * barbearia ativa** — que é o que realmente traz cliente pela busca. Uma
 * barbearia nova precisa aparecer no Google sem ninguém editar arquivo nenhum.
 *
 * Rotas logadas (`/painel`, `/app`) ficam de fora por definição: o robô não tem
 * sessão, então tudo que ele encontraria lá é o redirect para /entrar.
 *
 * O cliente aqui é o `supabase-js` cru com a chave anônima, NÃO o
 * `@/lib/supabase/server`: aquele lê `cookies()`, e ler cookie tornaria o
 * sitemap dinâmico — recalculado a cada visita do robô, com uma ida ao banco por
 * visita. Aqui não há sessão para respeitar; a lista de barbearias ativas é
 * pública, e a policy de `barbershops` já entrega só as ativas para `anon`.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixas: MetadataRoute.Sitemap = [
    { url: absoluta("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluta("/criar-conta"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluta("/entrar"), changeFrequency: "monthly", priority: 0.3 },
  ];

  return [...fixas, ...(await barbearias())];
}

async function barbearias(): Promise<MetadataRoute.Sitemap> {
  try {
    const { url, anonKey } = envPublico();
    const supabase = createClient<Database>(url, anonKey);

    // Sem `lastModified`: `barbershops` não tem coluna de atualização, e
    // `created_at` diria ao robô que a página nunca muda desde que a loja
    // nasceu — pior que omitir, porque é uma informação errada.
    const { data, error } = await supabase
      .from("barbershops")
      .select("slug")
      .eq("is_active", true)
      .order("slug");

    if (error) {
      // O sitemap não pode derrubar o build por causa do banco. Sem as lojas ele
      // ainda vale — as páginas fixas continuam lá, e o robô volta em uma hora.
      console.error("sitemap: falha ao listar barbearias", error);
      return [];
    }

    return (data ?? []).map((loja) => ({
      url: absoluta(`/b/${loja.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (erro) {
    console.error("sitemap: falha ao listar barbearias", erro);
    return [];
  }
}
