"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { envPublico } from "@/lib/env";

/**
 * Cliente do NAVEGADOR. Usa a chave anônima, então tudo que ele faz passa
 * pela RLS. É o único dos três que pode aparecer num componente "use client".
 */
export function createClient() {
  const { url, anonKey } = envPublico();
  return createBrowserClient<Database>(url, anonKey);
}
