/**
 * "VER COMO O DONO" — o admin da plataforma abre o painel de uma barbearia em
 * modo SOMENTE LEITURA.
 *
 * Não é "entrar na conta do dono": o admin continua logado como ele mesmo, e
 * é a RLS que já o deixa LER qualquer loja (`has_shop_access` inclui
 * `is_platform_admin()`). Este cookie só diz QUAL loja o painel deve mostrar.
 *
 * O "somente leitura" é imposto no SERVIDOR, em `requireShopContext()`: com o
 * cookie ativo, toda server action que passa por lá é recusada. Não depende de
 * esconder botão.
 *
 * Mora fora de um arquivo "server-only" porque o middleware (edge) também lê
 * o nome do cookie.
 */

export const COOKIE_VISUALIZACAO = "pibarber-ver-loja";

/** Quanto tempo a visualização dura sem ser renovada. */
export const DURACAO_VISUALIZACAO_SEG = 2 * 60 * 60;

/** O valor do cookie tem de ser um uuid — qualquer outra coisa é ignorada. */
export function lojaDoCookie(valor: string | undefined | null): string | null {
  return valor && /^[0-9a-f-]{36}$/.test(valor) ? valor : null;
}

/**
 * O erro que as actions recebem no modo visualização. `code: "P0001"` faz o
 * `traduzirErroBanco` mostrar a mensagem como está, em vez da genérica.
 */
export class ModoSomenteLeitura extends Error {
  code = "P0001";
  constructor() {
    super("Modo visualização: somente leitura. Nada foi alterado.");
  }
}
