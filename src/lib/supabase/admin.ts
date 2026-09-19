import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { envPublico, envServiceRole } from "@/lib/env";

/**
 * Cliente ADMINISTRATIVO — a service role.
 *
 * >>> ELE IGNORA A RLS POR COMPLETO. <<<
 *
 * Os usos legítimos no PiBarber:
 *   1. /admin criando a conta do dono junto com a barbearia
 *   2. /painel/equipe criando a conta do assistente
 *   3. o agendamento sem cadastro (src/app/actions/publico.ts — o porquê está lá)
 *   4. o WhatsApp (src/lib/whatsapp/, /api/cron/whatsapp, /api/webhooks/whatsapp):
 *      as tabelas da fila não têm policy para ninguém, e cron e webhook não
 *      têm sessão. A tela do dono lê o histórico por aqui DEPOIS de
 *      requireOwnerContext(), filtrando pela loja dele.
 *
 * REGRA: confirme o papel de quem chamou ANTES de instanciar isto.
 *
 *   const perfil = await requireRole(["owner"]);
 *   // só depois de confirmar que é o dono DAQUELA barbearia:
 *   const admin = createAdminClient();
 *
 * O import "server-only" acima faz o build quebrar se alguém tentar importar
 * este arquivo de um componente de cliente. É de propósito: um vazamento da
 * service role para o navegador entrega o banco inteiro.
 */
export function createAdminClient() {
  const { url } = envPublico();

  return createSupabaseClient<Database>(url, envServiceRole(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
