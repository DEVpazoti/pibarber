import "server-only";

import { envEmail } from "@/lib/env";

/**
 * O HTTP DO RESEND — uma chamada só: POST /emails.
 *
 * Sem SDK, como o WhatsApp e o Asaas: é um fetch, e o SDK só acrescentaria uma
 * dependência para montar um JSON.
 *
 * `Idempotency-Key` é o id da linha da fila. Se o envio sair e a gravação do
 * `sent` falhar, a linha volta a ser elegível — e o Resend reconhece a chave e
 * não manda de novo (vale por 24h do lado deles).
 */

export type ErroEmail = { codigo: string; mensagem: string; transitorio: boolean };

export class FalhaResend extends Error {
  constructor(public erro: ErroEmail) {
    super(erro.mensagem);
  }
}

export async function enviarEmail(entrada: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  chaveIdempotencia: string;
  cabecalhos?: Record<string, string>;
}): Promise<string> {
  const env = envEmail();
  if (!env)
    throw new FalhaResend({
      codigo: "DESLIGADO",
      mensagem: "Sem RESEND_API_KEY.",
      transitorio: false,
    });

  // Testes E2E (playwright.config.ts): a fila anda até `sent`, mas nada sai
  // para o Resend. É o que deixa o teste conferir QUE e-mail iria para QUEM
  // sem mandar e-mail de verdade.
  if (process.env.EMAIL_SIMULAR === "1") return `simulado-${entrada.chaveIdempotencia}`;

  let resposta: Response;
  try {
    resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": entrada.chaveIdempotencia,
      },
      body: JSON.stringify({
        from: env.remetente,
        to: [entrada.para],
        subject: entrada.assunto,
        html: entrada.html,
        text: entrada.texto,
        ...(env.responderPara ? { reply_to: env.responderPara } : {}),
        ...(entrada.cabecalhos ? { headers: entrada.cabecalhos } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // Rede, DNS, timeout: tenta de novo mais tarde.
    throw new FalhaResend({
      codigo: "REDE",
      mensagem: e instanceof Error ? e.message.slice(0, 300) : "falha de rede",
      transitorio: true,
    });
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    id?: string;
    name?: string;
    message?: string;
  } | null;

  if (resposta.ok && corpo?.id) return corpo.id;

  // 429 (limite de taxa) e 5xx: do lado deles, passa. 4xx: o pedido está
  // errado (domínio não verificado, endereço inválido) e repetir não muda nada.
  throw new FalhaResend({
    codigo: corpo?.name ?? `HTTP_${resposta.status}`,
    mensagem: (corpo?.message ?? `Resend respondeu ${resposta.status}`).slice(0, 300),
    transitorio: resposta.status === 429 || resposta.status >= 500,
  });
}

/** "jo***@gmail.com" — e-mail em log, nunca inteiro. */
export function mascararEmail(email: string): string {
  const [nome = "", dominio] = email.split("@");
  if (!dominio) return "***";
  return `${nome.slice(0, 2)}***@${dominio}`;
}
