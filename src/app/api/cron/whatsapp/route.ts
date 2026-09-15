import { timingSafeEqual } from "node:crypto";

import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { envCronSecret, envWhatsapp } from "@/lib/env";
import { despachar, varrerLembretes } from "@/lib/whatsapp/fila";
import { sincronizarTemplates } from "@/lib/whatsapp/templates";

/**
 * O "WORKER" DO WHATSAPP — chamado de 5 em 5 minutos pelo pg_cron.
 *
 * O projeto não tem processo em background. Quem faz as coisas acontecerem
 * sozinhas é o `pg_cron` do Supabase, que dispara um `net.http_post` para cá
 * (ver PARTE 6 de supabase/24_whatsapp.sql). Aceita GET também, que é o que o
 * Vercel Cron manda — assim a troca de gatilho não exige mexer em código.
 *
 * ⚠️ É UMA URL PÚBLICA. Sem o `Authorization: Bearer <CRON_SECRET>`, 401 e
 * nada roda. Sem CRON_SECRET definido, 401 para todo mundo: falha fechada.
 *
 * Rodar duas vezes seguidas, ou duas ao mesmo tempo, não manda nada em dobro:
 * o lembrete tem índice único por agendamento, e o despacho reivindica cada
 * linha com `for update skip locked`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 50 envios em série a ~300ms cada cabem folgados. O teto evita que um
// travamento da Meta segure a função até o limite do plano.
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const segredo = envCronSecret();
  if (!segredo) {
    console.error("[cron whatsapp] CRON_SECRET não definido — recusando toda chamada.");
    return false;
  }

  // Comparação em tempo constante: `===` numa string secreta vaza, pelo tempo
  // de resposta, quantos caracteres do começo estavam certos.
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

async function executar(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    if (!envWhatsapp()) {
      return NextResponse.json({ ok: true, desligado: true });
    }

    // Cada etapa isolada: a Meta fora do ar na sincronização de templates não
    // pode impedir que o lembrete já enfileirado saia, e vice-versa.
    const erros: string[] = [];

    const templates = await sincronizarTemplates().catch((e: unknown) => {
      erros.push("templates");
      console.error("[cron whatsapp] sincronizar templates:", e instanceof Error ? e.message : e);
      return null;
    });

    // Nessa ordem: o lembrete que vence agora entra na fila e já sai nesta
    // mesma rodada, em vez de esperar mais 5 minutos.
    const lembretes = await varrerLembretes().catch((e: unknown) => {
      erros.push("lembretes");
      console.error("[cron whatsapp] varrer lembretes:", e instanceof Error ? e.message : e);
      return null;
    });

    const despacho = await despachar().catch((e: unknown) => {
      erros.push("despacho");
      console.error("[cron whatsapp] despachar:", e instanceof Error ? e.message : e);
      return null;
    });

    return NextResponse.json(
      { ok: erros.length === 0, templates, lembretes, despacho, erros },
      { status: erros.length === 0 ? 200 : 500 },
    );
  } catch (e) {
    unstable_rethrow(e);
    // Variável de WhatsApp pela metade cai aqui. A mensagem de `obrigatoria()`
    // diz o NOME da variável, nunca o valor.
    console.error("[cron whatsapp] erro inesperado:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = executar;
export const GET = executar;
