/**
 * Validação de telefone brasileiro.
 *
 * ⚠️ ISTO É UM ESPELHO, NÃO A REGRA.
 *
 * A regra que vale é a de `book_appointment_publico`, no Postgres
 * (17_agendamento_publico.sql): mesma lista de DDD, mesma checagem do nono
 * dígito. Este arquivo existe para a tela avisar o erro ANTES de o formulário
 * sair — não para decidir nada. O formulário é público, e nada que roda no
 * navegador pode ser a última palavra.
 *
 * Mudou aqui, muda lá. E vice-versa.
 */

/** Os DDDs em uso no Brasil. Mesma lista de `ddd_valido()` no banco. */
const DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Normaliza para só dígitos — é assim que o telefone entra no banco.
 *
 * Sem isso o limite por telefone não funcionaria: "(11) 98765-4321" e
 * "11987654321" contariam como duas pessoas diferentes, e alternar a
 * formatação driblaria o limite sem esforço nenhum.
 */
export function normalizarTelefone(entrada: string | null | undefined): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/**
 * O motivo pelo qual o telefone é inválido, ou `null` se estiver bom.
 *
 * Devolve a mensagem pronta em vez de um booleano: quem chama precisa dizer
 * ao usuário O QUE está errado, e "telefone inválido" não ajuda ninguém a
 * corrigir nada.
 */
export function erroDeTelefone(entrada: string | null | undefined): string | null {
  const digitos = normalizarTelefone(entrada);

  if (digitos.length === 0) return "Informe seu celular com DDD.";
  if (digitos.length < 10) return "Faltam dígitos. Informe o número com DDD.";
  if (digitos.length > 11) return "Dígitos demais. Confira o número.";

  if (!DDDS.has(digitos.slice(0, 2))) return "Esse DDD não existe. Confira o número.";

  // Celular no Brasil tem 11 dígitos e o nono é sempre 9. Com 11 dígitos e o
  // terceiro diferente de 9, o número é impossível — quase sempre é um fixo
  // digitado com um dígito a mais.
  if (digitos.length === 11 && digitos[2] !== "9") {
    return "Esse celular não parece válido. Confira o número.";
  }

  return null;
}
