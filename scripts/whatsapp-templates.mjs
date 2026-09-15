#!/usr/bin/env node
/**
 * Submete e confere os templates de WhatsApp da plataforma na Meta.
 *
 * POR QUE ISTO EXISTE: submeter à mão no WhatsApp Manager é copiar três textos
 * com {{1}}..{{6}} e digitar seis exemplos por template — e um espaço a mais
 * vira um template diferente do que o código envia, que só aparece como erro
 * 132000 no primeiro agendamento. Aqui o texto sai do MESMO catálogo que o
 * código usa para enviar (src/lib/whatsapp/catalogo.ts).
 *
 * E, como o aplicar-sql.mjs, o token sai do .env.local — nunca da linha de
 * comando, onde ficaria no histórico do shell. Nada aqui imprime o token.
 *
 * USO
 *   node --no-warnings scripts/whatsapp-templates.mjs --ver      só MOSTRA o que seria enviado
 *   node --no-warnings scripts/whatsapp-templates.mjs --enviar   submete os três à Meta
 *   node --no-warnings scripts/whatsapp-templates.mjs --listar   status de cada um na Meta
 *
 * Requer Node 22.18+ — o catálogo é TypeScript e é lido direto, com a remoção
 * de tipos nativa do Node. (O --no-warnings só cala o aviso de "module type".)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function erro(mensagem) {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

const [maior, menor] = process.versions.node.split(".").map(Number);
if (maior < 22 || (maior === 22 && menor < 18)) {
  erro(`Node ${process.versions.node} não lê TypeScript direto. Use o Node 22.18 ou mais novo.`);
}

/* ----------------------------------------------------------- ambiente */

function lerEnv() {
  const env = {};
  // .env primeiro, .env.local por cima — mesma precedência do Next.
  for (const nome of [".env", ".env.local"]) {
    const caminho = join(RAIZ, nome);
    if (!existsSync(caminho)) continue;
    for (const linha of readFileSync(caminho, "utf8").split("\n")) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith("#")) continue;
      const i = limpa.indexOf("=");
      if (i < 0) continue;
      env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim();
    }
  }
  return { ...env, ...process.env };
}

const env = lerEnv();
const versao = env.WHATSAPP_GRAPH_VERSION || "v25.0";

/* ----------------------------------------------------------- catálogo */

const { CATALOGO, EVENTOS, corpoParaMeta } = await import(
  pathToFileURL(join(RAIZ, "src/lib/whatsapp/catalogo.ts")).href
);

/* ----------------------------------------------------------- Graph API */

async function graph(metodo, caminho, corpo) {
  if (!env.WHATSAPP_ACCESS_TOKEN) erro("WHATSAPP_ACCESS_TOKEN não está no .env.local.");
  const resposta = await fetch(`https://graph.facebook.com/${versao}/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, json };
}

function exigirWaba() {
  if (!env.WHATSAPP_WABA_ID) erro("WHATSAPP_WABA_ID não está no .env.local.");
  return env.WHATSAPP_WABA_ID;
}

/* ----------------------------------------------------------- comandos */

const comando = process.argv[2];

if (comando === "--ver") {
  for (const evento of EVENTOS) {
    console.log(`\n# ${CATALOGO[evento].rotulo} — ${CATALOGO[evento].nomeMeta}`);
    console.log(JSON.stringify(corpoParaMeta(evento), null, 2));
  }
} else if (comando === "--enviar") {
  const waba = exigirWaba();
  for (const evento of EVENTOS) {
    const corpo = corpoParaMeta(evento);
    const r = await graph("POST", `${waba}/message_templates`, corpo);
    if (r.ok) {
      console.log(`✔ ${corpo.name}: enviado — status ${r.json?.status ?? "?"}`);
    } else {
      const e = r.json?.error ?? {};
      // Reenviar um nome que já existe não é problema: é o script rodado duas vezes.
      const jaExiste = /already exists|já existe/i.test(`${e.message} ${e.error_user_msg ?? ""}`);
      console.log(
        jaExiste
          ? `• ${corpo.name}: já existe na WABA — use --listar para ver o status.`
          : `✖ ${corpo.name}: HTTP ${r.status} · código ${e.code ?? "?"} · ${e.error_user_msg || e.message || "sem mensagem"}`,
      );
    }
  }
  console.log("\nA análise da Meta leva de minutos a dois dias. Confira com --listar.");
} else if (comando === "--listar") {
  const waba = exigirWaba();
  const r = await graph("GET", `${waba}/message_templates?fields=name,status,language,category,rejected_reason&limit=100`);
  if (!r.ok) erro(`HTTP ${r.status}: ${r.json?.error?.message ?? "sem mensagem"}`);
  const nossos = new Set(EVENTOS.map((e) => CATALOGO[e].nomeMeta));
  for (const t of r.json?.data ?? []) {
    if (!nossos.has(t.name)) continue;
    const motivo = t.rejected_reason && t.rejected_reason !== "NONE" ? ` · motivo: ${t.rejected_reason}` : "";
    console.log(`${t.name} [${t.language}] ${t.category}: ${t.status}${motivo}`);
  }
} else {
  console.log("Uso: node --no-warnings scripts/whatsapp-templates.mjs --ver | --enviar | --listar");
  process.exit(comando ? 1 : 0);
}
