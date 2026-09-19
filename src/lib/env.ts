/**
 * Lê as variáveis de ambiente reclamando alto quando falta alguma.
 *
 * Sem isso o erro aparece lá na frente como "Invalid API key" ou uma tela em
 * branco, e você perde tempo procurando no lugar errado.
 */

function obrigatoria(
  nome: string,
  valor: string | undefined,
  onde = "com os dados do seu projeto Supabase",
): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variável de ambiente ${nome} não está definida. ` +
        `Copie o .env.example para .env.local e preencha ${onde}.`,
    );
  }
  return valor;
}

/** URL e chave anônima: podem ir para o navegador. */
export function envPublico() {
  return {
    url: obrigatoria("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: obrigatoria(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/** SEGREDO. Só no servidor, e só dentro de createAdminClient(). */
export function envServiceRole(): string {
  return obrigatoria("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Base do site. Usada no redirect do login com Google, no link público que o
 * dono copia em /painel/configuracoes e — desde o T-6 — em tudo que é SEO:
 * `metadataBase`, canonical, Open Graph, `sitemap.ts` e `robots.ts`.
 *
 * ⚠️ Falha em silêncio. Sem `NEXT_PUBLIC_SITE_URL` no painel da Vercel, o site
 * sobe funcionando e anuncia `localhost` para o Google em toda tag canonical e
 * em todo endereço do sitemap. Nada quebra na tela; o site só não é indexado.
 *
 * O padrão é a porta 3001 porque é nela que este projeto roda em
 * desenvolvimento — a 3000 está ocupada por outro projeto.
 */
export function urlDoSite(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "http://localhost:3001";
}

/** URL absoluta de uma rota: `absoluta("/b/navalha-e-cia")`. */
export function absoluta(rota: string): string {
  return `${urlDoSite()}${rota.startsWith("/") ? rota : `/${rota}`}`;
}

/* ==========================================================================
   WhatsApp oficial (Meta Cloud API) — agente 01
   ========================================================================== */

export type EnvWhatsapp = {
  phoneNumberId: string;
  wabaId: string;
  /** SEGREDO. Token de Usuário do Sistema — nunca o de 24h do painel. */
  accessToken: string;
  /** SEGREDO. É com ele que o webhook confere que a requisição veio da Meta. */
  appSecret: string;
  /** SEGREDO. A frase que a Meta devolve na verificação do webhook. */
  webhookVerifyToken: string;
  graphVersion: string;
};

/**
 * As credenciais do WhatsApp, ou `null` quando a integração não está ligada.
 *
 * ⚠️ DIFERENTE DAS OUTRAS: a ausência NÃO é erro. Quem roda local não tem
 * número registrado na Meta, e o projeto precisa subir, agendar e cancelar do
 * mesmo jeito — só sem mandar mensagem. O interruptor é
 * `WHATSAPP_PHONE_NUMBER_ID`: sem ele, tudo desliga em silêncio.
 *
 * Com ele, as demais passam a ser obrigatórias e a falta grita. Meia
 * configuração é o pior dos mundos: o código acha que está ligado, a Meta
 * recusa cada envio, e a fila enche de falhas que parecem culpa do cliente.
 *
 * SÓ NO SERVIDOR. Nenhuma destas tem prefixo NEXT_PUBLIC_, e nenhuma pode ter.
 */
export function envWhatsapp(): EnvWhatsapp | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) return null;

  const onde = "conforme docs/whatsapp.md";
  return {
    phoneNumberId,
    wabaId: obrigatoria("WHATSAPP_WABA_ID", process.env.WHATSAPP_WABA_ID, onde).trim(),
    accessToken: obrigatoria(
      "WHATSAPP_ACCESS_TOKEN",
      process.env.WHATSAPP_ACCESS_TOKEN,
      onde,
    ).trim(),
    appSecret: obrigatoria("WHATSAPP_APP_SECRET", process.env.WHATSAPP_APP_SECRET, onde).trim(),
    webhookVerifyToken: obrigatoria(
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      onde,
    ).trim(),
    // A versão da Graph API muda a cada trimestre e as antigas expiram. Fica
    // em variável para trocar sem deploy de código.
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0",
  };
}

/**
 * SEGREDO. Protege `/api/cron/whatsapp`, que é uma URL pública.
 *
 * `null` quando não definido — e aí o endpoint recusa TODO mundo. Falhar
 * fechado é a única opção: um cron sem senha é um botão público de "dispare
 * todas as mensagens da fila agora".
 */
export function envCronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}
