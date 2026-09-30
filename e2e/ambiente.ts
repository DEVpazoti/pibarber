/**
 * O ambiente dos testes E2E — um lugar só.
 *
 * Supabase LOCAL (Docker, `npx supabase start`): as chaves abaixo são as de
 * demonstração que o CLI usa em toda máquina. Não são segredo e não abrem
 * nada fora do seu computador.
 *
 * ⚠️ Toda variável que o app lê e que pode vir do seu `.env.local` está aqui,
 * mesmo vazia: o Next só completa com o arquivo o que o processo NÃO definiu.
 * Sem isso, o servidor de teste herdaria a chave real do Resend ou do Asaas.
 */

export const PORTA = 3100;
export const BASE_URL = `http://localhost:${PORTA}`;

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Onde o Supabase local guarda os e-mails do Auth (Mailpit). */
export const MAILPIT_URL = "http://127.0.0.1:54324";

/** O container do Postgres local (project_id "pibarber" em supabase/config.toml). */
export const CONTAINER_DB = "supabase_db_pibarber";

export const CRON_SECRET = "e2e-cron";
export const ASAAS_WEBHOOK_TOKEN = "e2e-webhook";

/** Senha das contas do seed (04_seed.sql) e das que os testes criam. */
export const SENHA = "pibarber123";

export const ENV_DO_SERVIDOR: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_ACCESS_TOKEN: "",
  // E-mail ligado, mas simulado: a fila anda e nada sai (src/lib/email/resend.ts).
  RESEND_API_KEY: "re_e2e_simulado",
  EMAIL_REMETENTE: "PiBarber E2E <e2e@example.com>",
  EMAIL_RESPONDER_PARA: "",
  EMAIL_SIMULAR: "1",
  // Asaas: só o webhook é exercitado. A chave é falsa (e de "sandbox" pelo
  // prefixo); qualquer ida à API deles falha e é tratada como falha de rede.
  // Sem "$" no começo: o Next expandiria "$aact…" como variável e a chave
  // chegaria vazia (a mesma armadilha do .env — ver .env.example).
  ASAAS_API_KEY: "aact_hmlg_e2e_simulado",
  ASAAS_WEBHOOK_TOKEN,
  CRON_SECRET,
  // Sem Google: a localização do setup vem do GPS simulado do navegador.
  GOOGLE_MAPS_API_KEY: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  WHATSAPP_WABA_ID: "",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_APP_SECRET: "",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "",
};
