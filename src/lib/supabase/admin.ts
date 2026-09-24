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
 *   5. a barbearia criada pelo próprio barbeiro (src/lib/nova-barbearia.ts):
 *      confere se o telefone já é de outro dono e insere a loja, que a RLS só
 *      aceita do admin. Dois caminhos: o cadastro novo (`criarContaBarbearia`,
 *      antes de existir sessão, para o usuário que o `signUp` acabou de criar)
 *      e o cliente logado que abre a dele (`abrirMinhaBarbearia`).
 *   6. o cadastro do cliente (`criarConta`): grava o telefone no perfil que o
 *      `signUp` acabou de criar — o trigger não o copia, e sem sessão (e-mail
 *      por confirmar) o próprio usuário ainda não pode gravar.
 *   7. a assinatura (src/app/actions/assinatura.ts e /api/webhooks/asaas):
 *      `subscriptions` não tem escrita para ninguém com sessão — senão o dono
 *      se daria um período pago pela REST. A action grava depois de
 *      requireOwnerContext(); o webhook, depois de conferir o token do Asaas.
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
