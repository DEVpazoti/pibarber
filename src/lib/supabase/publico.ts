import "server-only";

import { createClient as criarSupabase } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { envPublico } from "@/lib/env";

/**
 * Cliente Supabase ANÔNIMO — sem cookie, sem sessão.
 *
 * O `@/lib/supabase/server` lê `cookies()`, e isso tem duas consequências que
 * inviabilizam cache: a rota vira dinâmica, e a consulta passa a rodar como o
 * usuário da vez. Este aqui existe para o caminho oposto — dado público, igual
 * para todo mundo, que dá para guardar.
 *
 * O mesmo padrão já era usado em `src/app/sitemap.ts` pelo mesmo motivo; aqui
 * ele virou função para não haver duas formas de montar a mesma coisa.
 *
 * ⚠️ ISTO É REGRA DE SEGURANÇA, NÃO SÓ DE DESEMPENHO.
 *
 * Tudo que for guardado em cache compartilhado PRECISA ser buscado por aqui.
 * Preencher um cache por slug usando o cliente com cookie guardaria o que
 * AQUELE visitante enxerga e depois serviria a mesma resposta para os
 * próximos — inclusive para quem não deveria ver. Com a chave anônima o
 * conteúdo cacheado é, por construção, o que o `anon` já podia ler: a RLS
 * continua sendo quem decide, e o pior caso vira "público vê o que já era
 * público".
 *
 * Nunca use este cliente para ler dado de pessoa logada. Para isso é o
 * `@/lib/supabase/server`, que respeita a sessão.
 */
export function clientePublico() {
  const { url, anonKey } = envPublico();
  return criarSupabase<Database>(url, anonKey);
}
