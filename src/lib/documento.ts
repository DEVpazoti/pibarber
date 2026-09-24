/**
 * CPF e CNPJ: máscara e dígitos verificadores.
 *
 * O Asaas recusa cliente com documento inválido, e a mensagem dele chega em
 * inglês e sem dizer qual campo. Conferir aqui antes deixa a tela apontar o
 * erro. A palavra final continua sendo do Asaas.
 */

export function soDigitosDoc(entrada: string | null | undefined): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/** "123.456.789-09" ou "12.345.678/0001-95", conforme a quantidade de dígitos. */
export function mascaraCpfCnpj(entrada: string): string {
  const d = soDigitosDoc(entrada).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

function cnpjValido(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const t of [12, 13]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * pesos[i + 13 - t]!;
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

/** A mensagem do problema, ou `null` se o documento estiver bom. */
export function erroDeCpfCnpj(entrada: string | null | undefined): string | null {
  const d = soDigitosDoc(entrada);
  if (d.length === 0) return "Informe o CPF ou o CNPJ.";
  if (d.length === 11) return cpfValido(d) ? null : "Esse CPF não é válido. Confira os números.";
  if (d.length === 14) return cnpjValido(d) ? null : "Esse CNPJ não é válido. Confira os números.";
  return "O CPF tem 11 dígitos e o CNPJ, 14.";
}
