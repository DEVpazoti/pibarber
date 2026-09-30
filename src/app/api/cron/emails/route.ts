import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { cronAutorizado } from "@/lib/cron";
import {
  despacharEmails,
  varrerCobranca,
  varrerLembretesEmail,
  varrerNotificacoes,
  varrerRecorrencia,
} from "@/lib/email/fila";
import { envEmail } from "@/lib/env";

/**
 * O "WORKER" DOS E-MAILS — chamado de 5 em 5 minutos pelo pg_cron, como o do
 * WhatsApp (ver docs/emails.md). Mesma proteção: `Authorization: Bearer
 * <CRON_SECRET>`, falha fechada.
 *
 * Primeiro VARRE (põe na fila o que venceu: lembretes, cobrança, sininho,
 * volta do cliente), depois DESPACHA — o que acabou de entrar já sai nesta
 * rodada. Rodar duas vezes não manda nada em dobro: cada linha tem chave única
 * e a reivindicação usa `for update skip locked`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function executar(request: NextRequest) {
  if (!cronAutorizado(request, "emails")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    if (!envEmail()) return NextResponse.json({ ok: true, desligado: true });

    // Cada etapa isolada: uma falhar não impede as outras.
    const erros: string[] = [];
    const etapa = <T>(nome: string, fazer: () => Promise<T>) =>
      fazer().catch((e: unknown) => {
        erros.push(nome);
        console.error(`[cron emails] ${nome}:`, e instanceof Error ? e.message : e);
        return null;
      });

    const lembretes = await etapa("lembretes", varrerLembretesEmail);
    const cobranca = await etapa("cobranca", varrerCobranca);
    const notificacoes = await etapa("notificacoes", varrerNotificacoes);
    const recorrencia = await etapa("recorrencia", varrerRecorrencia);
    const despacho = await etapa("despacho", () => despacharEmails(50));

    return NextResponse.json(
      { ok: erros.length === 0, lembretes, cobranca, notificacoes, recorrencia, despacho, erros },
      { status: erros.length === 0 ? 200 : 500 },
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[cron emails] erro inesperado:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const POST = executar;
export const GET = executar;
