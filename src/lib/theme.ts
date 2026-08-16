export const CHAVE_TEMA = "pibarber-tema";

export type Tema = "light" | "dark" | "system";

/**
 * Roda antes da primeira pintura, dentro do <head>.
 *
 * Sem isso a página nasce clara e pisca para o escuro no primeiro frame — o
 * chamado "flash of wrong theme". O script lê a escolha salva e carimba o
 * data-theme no <html> antes do CSS ser aplicado.
 *
 * "system" não carimba nada de propósito: aí quem manda é o
 * @media (prefers-color-scheme: dark) do globals.css.
 */
export const SCRIPT_TEMA = `
(function () {
  try {
    var escolha = localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
    if (escolha === "dark" || escolha === "light") {
      document.documentElement.setAttribute("data-theme", escolha);
    }
  } catch (e) {
    // localStorage bloqueado (aba anônima, cookie negado): segue a preferência do sistema.
  }
})();
`;
