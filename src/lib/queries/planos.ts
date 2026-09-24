import "server-only";

import { unstable_cache } from "next/cache";

import { clientePublico } from "@/lib/supabase/publico";
import type { Plan, PlanPrice } from "@/lib/types";

/**
 * Os planos com os preços de cada período, para a LANDING.
 *
 * Lidos da MESMA tabela que cobra (`plans` + a view `plan_prices`, em
 * 26_assinaturas.sql). Antes a landing tinha o preço escrito à mão em
 * `PRECO.mensal`, e ele já estava diferente do que o sistema passou a cobrar —
 * a página anunciava um valor e a tela de assinatura pedia outro.
 *
 * Cache de 1 hora: preço muda raramente, e a landing é a página mais acessada.
 * Mudou o preço no banco, `revalidateTag(TAG_PLANOS)` atualiza na hora.
 *
 * Nunca lança: sem os planos, a landing mostra a seção sem os cartões de
 * preço, em vez de quebrar a página inteira.
 */

export const TAG_PLANOS = "planos";

export type PlanoPublico = Plan & { precos: PlanPrice[] };

export const carregarPlanosPublicos = unstable_cache(
  async (): Promise<PlanoPublico[]> => {
    try {
      const supabase = clientePublico();
      const [planos, precos] = await Promise.all([
        supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("plan_prices").select("*"),
      ]);

      if (planos.error || precos.error) {
        console.error("[planos] falha ao carregar:", planos.error ?? precos.error);
        return [];
      }

      return (planos.data ?? []).map((p) => ({
        ...p,
        precos: (precos.data ?? []).filter((x) => x.plan_id === p.id),
      }));
    } catch (error) {
      console.error("[planos] erro inesperado:", error);
      return [];
    }
  },
  ["planos-publicos"],
  { revalidate: 3600, tags: [TAG_PLANOS] },
);
