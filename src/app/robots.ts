import type { MetadataRoute } from "next";

import { absoluta } from "@/lib/env";

/**
 * O robots.txt.
 *
 * As rotas bloqueadas já são inalcançáveis para o robô — sem cookie de sessão o
 * middleware desvia tudo para /entrar. Elas estão aqui pelo motivo oposto: para
 * o Google não gastar o orçamento de rastreio pedindo página atrás de página e
 * colecionando redirect. `/callback` entra na lista porque carrega código de
 * autenticação na URL, e isso não tem por que virar item de índice.
 *
 * O que precisa ser indexado é o oposto disso: a landing e `/b/[slug]`, o perfil
 * público das barbearias.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/app", "/admin", "/callback", "/sem-barbearia"],
    },
    sitemap: absoluta("/sitemap.xml"),
  };
}
