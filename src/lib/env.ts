/**
 * Lê as variáveis de ambiente reclamando alto quando falta alguma.
 *
 * Sem isso o erro aparece lá na frente como "Invalid API key" ou uma tela em
 * branco, e você perde tempo procurando no lugar errado.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variável de ambiente ${nome} não está definida. ` +
        `Copie o .env.example para .env.local e preencha com os dados do seu projeto Supabase.`,
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
