import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { envCronSecret } from "@/lib/env";

/**
 * A porta dos endpoints de cron (`/api/cron/*`), que são URLs públicas.
 *
 * Exige `Authorization: Bearer <CRON_SECRET>`. Sem CRON_SECRET definido,
 * recusa TODO mundo: falha fechada — um cron sem senha é um botão público de
 * "dispare tudo agora".
 */
export function cronAutorizado(request: NextRequest, rotulo: string): boolean {
  const segredo = envCronSecret();
  if (!segredo) {
    console.error(`[cron ${rotulo}] CRON_SECRET não definido — recusando toda chamada.`);
    return false;
  }

  // Comparação em tempo constante: `===` numa string secreta vaza, pelo tempo
  // de resposta, quantos caracteres do começo estavam certos.
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
