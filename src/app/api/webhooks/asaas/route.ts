import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import type { AsaasCobranca } from "@/lib/asaas";
import { registrarCobranca } from "@/lib/assinatura-servidor";
import { envAsaas } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * WEBHOOK DO ASAAS — a única porta que LIBERA acesso pago.
 *
 * O Asaas chama esta URL a cada mudança numa cobrança. O que fazer com ela
 * mora em `registrarCobranca` (src/lib/assinatura-servidor.ts), que a tela de
 * assinatura também usa para conferir direto no Asaas quando o aviso não vem.
 * Cobrança paga empurra `paid_until`; vencida marca `past_due`; o resto só
 * atualiza o espelho em `subscription_payments`.
 *
 * AUTENTICAÇÃO: o Asaas manda, em `asaas-access-token`, o token que foi
 * cadastrado junto com a URL. Sem token igual ao ASAAS_WEBHOOK_TOKEN, 401.
 * Sem o token, esta URL seria um botão público de "me dê um ano pago".
 *
 * RESPOSTA: 200 para tudo que foi entendido — inclusive o que foi ignorado de
 * propósito. O Asaas PAUSA a fila de webhooks de quem responde erro várias
 * vezes seguidas, e aí nenhum pagamento seguinte chega. Erro (500) só quando
 * vale a pena ele tentar de novo: o banco falhou.
 *
 * IDEMPOTENTE: o mesmo evento pode chegar mais de uma vez, e fora de ordem.
 * O espelho é upsert pelo id da cobrança, e o período pago só anda para a
 * frente (`greatest` na função do banco).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type Evento = { id?: string; event?: string; payment?: AsaasCobranca };

export async function POST(request: NextRequest) {
  const env = envAsaas();
  const token = request.headers.get("asaas-access-token") ?? "";

  // Falha FECHADA: sem configuração, ninguém entra.
  if (!env || !iguais(token, env.webhookToken)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let evento: Evento;
  try {
    evento = (await request.json()) as Evento;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const tipo = evento.event ?? "";
  const cobranca = evento.payment;

  // Só interessam cobranças de ASSINATURA ou de PARCELAMENTO (o anual e o
  // semestral em parcelas no cartão). Eventos de outra natureza, ou uma
  // cobrança avulsa criada à mão no painel do Asaas, são reconhecidos e
  // ignorados.
  if (
    !tipo.startsWith("PAYMENT_") ||
    !cobranca?.id ||
    (!cobranca.subscription && !cobranca.installment)
  ) {
    return Response.json({ ok: true, ignorado: tipo || "sem evento" });
  }

  const resultado = await registrarCobranca(createAdminClient(), cobranca, {
    apagada: tipo === "PAYMENT_DELETED",
  });

  if (!resultado.ok) {
    // Falha do banco: 500, para o Asaas tentar de novo mais tarde.
    console.error("[webhook asaas] falha ao registrar a cobrança:", tipo, resultado.erro);
    return new Response("Erro", { status: 500 });
  }
  if (!resultado.shopId) {
    // Assinatura removida ou de outro ambiente — 200, para a fila não travar.
    console.warn(
      "[webhook asaas] assinatura desconhecida:",
      cobranca.subscription ?? cobranca.installment,
      tipo,
    );
    return Response.json({ ok: true, ignorado: "assinatura desconhecida" });
  }

  revalidatePath("/assinatura");
  return Response.json({ ok: true });
}
