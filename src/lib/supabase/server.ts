import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { envPublico } from "@/lib/env";

/**
 * Cliente do SERVIDOR — Server Components, Server Actions e Route Handlers.
 *
 * Usa a chave anônima com o cookie da sessão, então continua respeitando a
 * RLS: quem consulta é o usuário logado, não o banco inteiro.
 */
export async function createClient() {
  const { url, anonKey } = envPublico();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(paraGravar) {
        try {
          for (const { name, value, options } of paraGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie — e não precisa:
          // o middleware já renovou a sessão antes de chegar aqui.
        }
      },
    },
  });
}
