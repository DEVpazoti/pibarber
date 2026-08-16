/**
 * Constantes do caixa.
 *
 * ⚠️ ESTA LISTA MORAVA EM `src/app/actions/money.ts` E ISSO QUEBRAVA TUDO.
 *
 * Um arquivo com `"use server"` só pode exportar **função async**. Exportar um
 * `const` faz o Next tentar registrá-lo como server action e derrubar o módulo
 * INTEIRO em tempo de execução:
 *
 *   ⨯ A "use server" file can only export async functions, found object.
 *
 * O efeito era `lancarDespesa`, `apagarLancamento`, `pagarComissoes` e
 * `receberFiado` devolverem 500 — todo o caminho de escrita do dinheiro. E
 * `tsc`, `eslint` e `next build` passavam limpos, porque a validação só roda
 * quando a action é invocada.
 *
 * Regra: em `src/app/actions/`, só função async. Constante, tipo e helper
 * moram em `src/lib/`.
 */
export const CATEGORIAS_DESPESA = [
  "Aluguel",
  "Produtos",
  "Energia e água",
  "Internet e telefone",
  "Manutenção",
  "Comissão",
  "Impostos",
  "Marketing",
  "Outros",
] as const;

export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];
