import "server-only";

import { envWhatsapp, type EnvWhatsapp } from "@/lib/env";
import { mascararTelefone } from "@/lib/whatsapp/telefone";

/**
 * O CLIENTE HTTP DA GRAPH API DA META — e só isso.
 *
 * `fetch` nativo contra `graph.facebook.com`. Nenhuma biblioteca: a Cloud API
 * é HTTP com JSON, e cada dependência de WhatsApp que não seja da própria Meta
 * é uma porta para as bibliotecas não oficiais que o projeto proíbe (CONTEXT §9).
 *
 * DUAS REGRAS DE LOG, sem exceção:
 *   · o token nunca aparece — nem em erro, nem "só os primeiros caracteres";
 *   · telefone só mascarado, por `mascararTelefone()`.
 */

const TEMPO_LIMITE_MS = 15_000;

/** O erro da Meta, já convertido para a pergunta que interessa: tento de novo? */
export type ErroMeta = {
  /** O `error.code` da Meta, o status HTTP, ou um código nosso em maiúsculo. */
  codigo: string;
  mensagem: string;
  /** `true`: volta para a fila com espera. `false`: a mensagem morre como `failed`. */
  transitorio: boolean;
};

export class FalhaMeta extends Error {
  readonly erro: ErroMeta;

  constructor(erro: ErroMeta) {
    super(`[whatsapp] ${erro.codigo}: ${erro.mensagem}`);
    this.name = "FalhaMeta";
    this.erro = erro;
  }
}

type CorpoDeErro = {
  code?: number;
  error_subcode?: number;
  message?: string;
  error_data?: { details?: string };
};

/* ==========================================================================
   Classificação — é ELA que decide se a mensagem tenta de novo ou morre
   ========================================================================== */

/** Limites de taxa: esperar resolve. */
const CODIGOS_TRANSITORIOS = new Set([
  // Limite de taxa da conta de WhatsApp (mensagens por segundo).
  130429,
  // Limite de spam / muitas mensagens para o MESMO destinatário em pouco tempo.
  131048, 131056,
  // Bloqueio TEMPORÁRIO por política. Some sozinho.
  368,
  // Limite de chamadas do app e da WABA na Graph API. Mesma natureza do 130429 —
  // não estão na tabela original do enunciado, mas tratá-los como permanentes
  // mataria mensagem boa num pico de volume.
  4, 80007,
]);

export function classificarErro(http: number | null, corpo?: CorpoDeErro | null): ErroMeta {
  const codigoMeta = corpo?.code;
  const mensagem =
    corpo?.error_data?.details || corpo?.message || (http ? `HTTP ${http}` : "sem resposta");

  if (codigoMeta != null) {
    // 190 — token inválido ou expirado. NÃO é problema desta mensagem: é a
    // integração INTEIRA parada. Retentar só enche a fila de falhas iguais.
    // O log é alto de propósito — é o erro que alguém precisa ver hoje.
    if (codigoMeta === 190) {
      console.error(
        "[whatsapp] ⚠️ TOKEN DA META INVÁLIDO OU EXPIRADO (190). NENHUMA mensagem sai até trocar " +
          "WHATSAPP_ACCESS_TOKEN por um token de Usuário do Sistema. Ver docs/whatsapp.md §3.",
      );
      return { codigo: "190", mensagem, transitorio: false };
    }

    // 130497 — restrição de país. O número da plataforma e o do cliente
    // precisam ser +55; o número de teste da Meta (+1 555…) cai sempre aqui.
    // Esperar não muda o país de ninguém. Ver CONTEXT §9.
    if (codigoMeta === 130497) return { codigo: "130497", mensagem, transitorio: false };

    // 131026 — o destinatário não tem WhatsApp (ou não aceitou os termos novos).
    if (codigoMeta === 131026) return { codigo: "131026", mensagem, transitorio: false };

    // 132000–132015 — template inexistente, não aprovado, pausado, ou
    // parâmetro em número/formato errado. É defeito nosso ou da análise da Meta;
    // a mesma chamada vai falhar igual daqui a 1 minuto.
    if (codigoMeta >= 132000 && codigoMeta <= 132015) {
      return { codigo: String(codigoMeta), mensagem, transitorio: false };
    }

    if (CODIGOS_TRANSITORIOS.has(codigoMeta)) {
      return { codigo: String(codigoMeta), mensagem, transitorio: true };
    }
  }

  // HTTP 5xx — o problema é do lado de lá.
  if (http != null && http >= 500) {
    return { codigo: String(codigoMeta ?? http), mensagem, transitorio: true };
  }

  // Qualquer outro: falha explícita é melhor que retentativa cega. Um erro
  // desconhecido tentado cinco vezes é o mesmo erro desconhecido, cinco vezes.
  return { codigo: String(codigoMeta ?? http ?? "DESCONHECIDO"), mensagem, transitorio: false };
}

/* ==========================================================================
   A chamada
   ========================================================================== */

function exigirEnv(): EnvWhatsapp {
  const env = envWhatsapp();
  if (!env) {
    throw new FalhaMeta({
      codigo: "NAO_CONFIGURADO",
      mensagem: "WHATSAPP_PHONE_NUMBER_ID não está definido.",
      transitorio: false,
    });
  }
  return env;
}

async function chamar<T>(
  env: EnvWhatsapp,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`https://graph.facebook.com/${env.graphVersion}/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${env.accessToken}`,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      cache: "no-store",
    });
  } catch (erro) {
    // Timeout e rede fora: transitório. A mensagem de erro do fetch não leva
    // o token (ele vai no cabeçalho, não na URL), mas mesmo assim não é
    // repassada inteira — não há por que arriscar.
    const abortou = erro instanceof Error && erro.name === "AbortError";
    throw new FalhaMeta({
      codigo: abortou ? "TEMPO_ESGOTADO" : "SEM_CONEXAO",
      mensagem: abortou ? `Sem resposta em ${TEMPO_LIMITE_MS / 1000}s.` : "Falha de rede.",
      transitorio: true,
    });
  } finally {
    clearTimeout(relogio);
  }

  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // Página de erro HTML de proxy no meio do caminho. Fica `null`, e a
    // classificação cai no status HTTP.
  }

  if (!resposta.ok) {
    const corpoErro = (json as { error?: CorpoDeErro } | null)?.error ?? null;
    throw new FalhaMeta(classificarErro(resposta.status, corpoErro));
  }

  return json as T;
}

/* ==========================================================================
   As três operações
   ========================================================================== */

/**
 * Envia um template. Devolve o `wamid` — a chave que o webhook usa depois
 * para dizer "entregue" e "lido".
 */
export async function enviarTemplate(entrada: {
  to: string;
  name: string;
  language: string;
  params: readonly string[];
}): Promise<string> {
  const env = exigirEnv();

  try {
    const resposta = await chamar<{ messages?: { id?: string }[] }>(
      env,
      "POST",
      `${env.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: entrada.to,
        type: "template",
        template: {
          name: entrada.name,
          language: { code: entrada.language },
          components:
            entrada.params.length > 0
              ? [
                  {
                    type: "body",
                    parameters: entrada.params.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
        },
      },
    );

    const wamid = resposta?.messages?.[0]?.id;
    if (!wamid) {
      throw new FalhaMeta({
        codigo: "SEM_WAMID",
        mensagem: "A Meta respondeu 200 sem o id da mensagem.",
        // A Meta aceitou — reenviar poderia duplicar. Melhor morrer visível.
        transitorio: false,
      });
    }
    return wamid;
  } catch (erro) {
    if (erro instanceof FalhaMeta) {
      console.warn("[whatsapp] envio recusado:", {
        para: mascararTelefone(entrada.to),
        template: entrada.name,
        codigo: erro.erro.codigo,
        transitorio: erro.erro.transitorio,
      });
    }
    throw erro;
  }
}

/** Submete um template para análise. Ver `corpoParaMeta()` no catálogo. */
export async function criarTemplate(
  corpo: unknown,
): Promise<{ id?: string; status?: string; category?: string }> {
  const env = exigirEnv();
  return chamar(env, "POST", `${env.wabaId}/message_templates`, corpo);
}

export type TemplateNaMeta = {
  name: string;
  status: string;
  language?: string;
  category?: string;
  rejected_reason?: string;
};

/** O que existe na WABA — para sincronizar o espelho local sem depender do webhook. */
export async function listarTemplates(): Promise<TemplateNaMeta[]> {
  const env = exigirEnv();
  const resposta = await chamar<{ data?: TemplateNaMeta[] }>(
    env,
    "GET",
    `${env.wabaId}/message_templates?fields=name,status,language,category,rejected_reason&limit=100`,
  );
  return resposta?.data ?? [];
}
