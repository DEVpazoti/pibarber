import { createHmac, timingSafeEqual } from "node:crypto";

import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";

import { envWhatsapp, type EnvWhatsapp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusDeTemplate } from "@/lib/whatsapp/templates";
import { mascararTelefone, telefoneMeta } from "@/lib/whatsapp/telefone";

/**
 * WEBHOOK DA META — status de entrega, status de template e opt-out.
 *
 * Cadastrado no painel do app da Meta (docs/whatsapp.md §2), com os campos
 * `messages` e `message_template_status_update` assinados.
 *
 * TRÊS REGRAS:
 *
 *   1. SEM ASSINATURA VÁLIDA, NADA. `X-Hub-Signature-256` é o HMAC-SHA256 do
 *      corpo com o App Secret. A URL é pública; sem conferir, qualquer um
 *      marcaria mensagem como lida ou poria telefone alheio no opt-out.
 *
 *   2. IDEMPOTENTE. A Meta reenvia o mesmo evento, e manda `read` antes de
 *      `delivered` quando quer. Cada data só é preenchida se estiver nula e o
 *      status só anda para frente (`whatsapp_registrar_status`, no banco).
 *
 *   3. 200 SEMPRE QUE A ASSINATURA BATE. Qualquer outra resposta faz a Meta
 *      reenviar por horas, e depois de muitas falhas ela DESATIVA o webhook.
 *      Erro de processamento vai para o log. Corpo que nem é JSON: 400 —
 *      nunca 500, que é o código de "tente de novo".
 *
 * Mensagem RECEBIDA é lida só para detectar pedido de saída. Não há caixa de
 * entrada, bot nem resposta automática — o resto é descartado.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function lerEnv(): EnvWhatsapp | null {
  try {
    return envWhatsapp();
  } catch (e) {
    unstable_rethrow(e);
    console.error("[webhook whatsapp] configuração incompleta:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Comparação em tempo constante — o tamanho diferente já é "não". */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ==========================================================================
   GET — a verificação que a Meta faz ao cadastrar a URL
   ========================================================================== */

export async function GET(request: NextRequest) {
  const env = lerEnv();
  const parametros = request.nextUrl.searchParams;

  const modo = parametros.get("hub.mode");
  const token = parametros.get("hub.verify_token") ?? "";
  const desafio = parametros.get("hub.challenge") ?? "";

  if (!env || modo !== "subscribe" || !iguais(token, env.webhookVerifyToken)) {
    return new Response("Forbidden", { status: 403 });
  }

  // TEXTO PURO, só o número. `NextResponse.json` devolveria `"123"` com aspas,
  // e a Meta recusa a verificação sem dizer por quê.
  return new Response(desafio, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/* ==========================================================================
   POST — os eventos
   ========================================================================== */

export async function POST(request: NextRequest) {
  const env = lerEnv();
  if (!env) return new Response("Unauthorized", { status: 401 });

  // OS BYTES CRUS, antes de qualquer parse. O HMAC é sobre os bytes exatos que
  // a Meta mandou: `request.json()` consumiria o corpo (só dá para ler uma
  // vez) e reserializar muda espaço e escape — a assinatura nunca bateria.
  // `arrayBuffer()` e não `text()`: nem a decodificação UTF-8 fica no caminho.
  const cru = Buffer.from(await request.arrayBuffer());

  const assinatura = request.headers.get("x-hub-signature-256") ?? "";
  const esperada = `sha256=${createHmac("sha256", env.appSecret).update(cru).digest("hex")}`;

  if (!iguais(assinatura, esperada)) {
    console.warn("[webhook whatsapp] assinatura ausente ou inválida — ignorado.");
    return new Response("Unauthorized", { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru.toString("utf8"));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const entradas = (corpo as { entry?: unknown } | null)?.entry;
  if (!corpo || typeof corpo !== "object" || !Array.isArray(entradas)) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const admin = createAdminClient();

    for (const entrada of entradas) {
      const mudancas = (entrada as { changes?: unknown } | null)?.changes;
      if (!Array.isArray(mudancas)) continue;

      for (const mudanca of mudancas) {
        // Uma mudança com defeito não pode levar as outras junto.
        try {
          await processarMudanca(admin, mudanca as Mudanca);
        } catch (e) {
          unstable_rethrow(e);
          console.error("[webhook whatsapp] falha ao processar mudança:", e instanceof Error ? e.message : e);
        }
      }
    }
  } catch (e) {
    unstable_rethrow(e);
    console.error("[webhook whatsapp] erro inesperado:", e instanceof Error ? e.message : e);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

/* ==========================================================================
   Processamento
   ========================================================================== */

type Admin = ReturnType<typeof createAdminClient>;

type Mudanca = { field?: string; value?: Record<string, unknown> | null };

type StatusMeta = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

type MensagemRecebida = { from?: string; type?: string; text?: { body?: string } };

async function processarMudanca(admin: Admin, mudanca: Mudanca) {
  const valor = mudanca.value ?? {};

  switch (mudanca.field) {
    case "messages": {
      const statuses = Array.isArray(valor.statuses) ? (valor.statuses as StatusMeta[]) : [];
      for (const s of statuses) await registrarStatus(admin, s);

      const recebidas = Array.isArray(valor.messages) ? (valor.messages as MensagemRecebida[]) : [];
      for (const m of recebidas) await talvezOptOut(admin, m);
      return;
    }

    case "message_template_status_update": {
      const nome = typeof valor.message_template_name === "string" ? valor.message_template_name : null;
      const status = statusDeTemplate(typeof valor.event === "string" ? valor.event : null);
      if (!nome || !status) return;

      const motivo = typeof valor.reason === "string" && valor.reason !== "NONE" ? valor.reason : null;

      const { error } = await admin
        .from("whatsapp_templates")
        .update({ status, reject_reason: motivo, reviewed_at: new Date().toISOString() })
        .eq("meta_name", nome);

      if (error) throw new Error(`atualizar template ${nome}: ${error.message}`);
      return;
    }

    default:
      // Campo que não assinamos, ou que a Meta inventou depois. 200 e segue.
      return;
  }
}

async function registrarStatus(admin: Admin, s: StatusMeta) {
  if (!s.id || !s.status) return;

  const segundos = Number(s.timestamp);
  const quando = Number.isFinite(segundos) && segundos > 0
    ? new Date(segundos * 1000).toISOString()
    : new Date().toISOString();

  const erro = s.errors?.[0];

  const { error } = await admin.rpc("whatsapp_registrar_status", {
    p_external_id: s.id,
    p_status: s.status,
    p_quando: quando,
    p_codigo: erro?.code != null ? String(erro.code) : undefined,
    p_motivo: erro?.error_data?.details || erro?.message || erro?.title || undefined,
  });

  if (error) throw new Error(`whatsapp_registrar_status: ${error.message}`);
  // Não achar a linha (`data === false`) é normal: status de mensagem que não
  // saiu por esta fila, ou que chegou antes de o envio gravar o wamid.
}

/** As palavras que tiram a pessoa da lista. Comparadas sem acento e sem caixa. */
const PALAVRAS_DE_SAIDA = new Set(["parar", "sair", "stop", "cancelar", "descadastrar"]);

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    // "PARAR." e "Parar!" também valem. Só as pontas: "não parar" não é saída.
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

async function talvezOptOut(admin: Admin, m: MensagemRecebida) {
  if (m.type !== "text" || typeof m.text?.body !== "string") return;
  if (!PALAVRAS_DE_SAIDA.has(normalizarTexto(m.text.body))) return;

  // Canoniza: o `from` de celular brasileiro chega muitas vezes SEM o nono
  // dígito, e a fila grava com ele. Ver `telefoneMeta()`.
  const telefone = telefoneMeta(m.from);
  if (!telefone) return;

  const { error } = await admin
    .from("whatsapp_opt_outs")
    .upsert(
      { phone: telefone, reason: normalizarTexto(m.text.body) },
      { onConflict: "phone", ignoreDuplicates: true },
    );
  if (error) throw new Error(`gravar opt-out: ${error.message}`);

  // O que já estava na fila para essa pessoa também não sai. Pedir PARAR e
  // receber o lembrete das 18h meia hora depois é o que faz alguém denunciar
  // o número — e denúncia derruba a qualidade do número da plataforma inteira.
  const { error: erroFila } = await admin
    .from("whatsapp_messages")
    .update({
      status: "failed",
      failure_code: "OPT_OUT",
      failure_reason: "O cliente pediu para não receber mensagens.",
    })
    .eq("recipient", telefone)
    .eq("status", "pending");
  if (erroFila) throw new Error(`limpar fila do opt-out: ${erroFila.message}`);

  console.info("[webhook whatsapp] opt-out registrado:", mascararTelefone(telefone));
}
