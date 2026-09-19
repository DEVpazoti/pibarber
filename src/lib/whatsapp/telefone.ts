import { normalizarTelefone } from "@/lib/telefone";

/**
 * O telefone no formato que a Meta usa, e na forma CANÔNICA do PiBarber.
 *
 * O banco guarda só DDD + número ("16996022093") — ver `normalizarTelefone()`.
 * A Cloud API quer E.164 sem o "+": "5516996022093".
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O NONO DÍGITO QUE SOME
 * ---------------------------------------------------------------------------
 * Muito celular brasileiro aparece no WhatsApp com o `wa_id` ANTIGO, de antes
 * de 2012–2016, sem o 9: "551696022093" (12 dígitos). É assim que ele chega no
 * `from` do webhook quando a pessoa responde.
 *
 * Se o opt-out gravasse esse valor cru, o "PARAR" nunca casaria com o
 * "5516996022093" da ficha, e a pessoa continuaria recebendo mensagem depois
 * de pedir para sair. Por isso TODO telefone que entra ou sai da integração —
 * destinatário da fila, remetente do webhook, chave do opt-out — passa por
 * aqui e sai com 13 dígitos quando é celular.
 *
 * Enviar para a forma de 13 dígitos funciona nos dois casos: a Meta resolve.
 *
 * Devolve `null` para o que não é número brasileiro. Não é zelo: a Meta bloqueia
 * envio entre países (erro 130497), e o número da plataforma é +55.
 */
export function telefoneMeta(entrada: string | null | undefined): string | null {
  let d = normalizarTelefone(entrada);

  // Como o banco guarda: DDD + número.
  if (d.length === 10 || d.length === 11) d = `55${d}`;

  if (!d.startsWith("55")) return null;

  if (d.length === 12) {
    // 55 + DDD + 8 dígitos. Começando em 6–9 é celular sem o nono dígito;
    // em 2–5 é fixo, que não tem nono dígito nenhum e fica como está.
    const local = d.slice(4);
    if (/^[6-9]/.test(local)) d = `${d.slice(0, 4)}9${local}`;
  }

  if (d.length !== 12 && d.length !== 13) return null;
  return d;
}

/**
 * "5516****2093". O ÚNICO jeito de um telefone aparecer em log.
 *
 * Log de servidor vai para a Vercel, é lido por quem dá suporte e fica lá por
 * dias. Telefone completo de cliente não tem o que fazer ali.
 */
export function mascararTelefone(telefone: string | null | undefined): string {
  const d = normalizarTelefone(telefone);
  if (d.length < 8) return "****";
  return `${d.slice(0, 4)}****${d.slice(-4)}`;
}
