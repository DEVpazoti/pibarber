#!/usr/bin/env node
/**
 * Aplica SQL no Supabase pela Management API, sem colar no SQL Editor.
 *
 * POR QUE ISTO EXISTE: colar o token direto num `curl` põe segredo na linha de
 * comando — é o que dispara o bloqueio de permissão e o que deixa a chave no
 * histórico do shell. Aqui o token sai do `.env.local`, que está no
 * `.gitignore` e nunca é impresso.
 *
 * USO
 *   node supabase/aplicar-sql.mjs 07_minha_migration.sql   roda um arquivo
 *   node supabase/aplicar-sql.mjs -e "select 1 as ok"      roda SQL na hora
 *   node supabase/aplicar-sql.mjs --ver 07_x.sql           só MOSTRA, não roda
 *   node supabase/aplicar-sql.mjs --tipos                  regera database.types.ts
 *   node supabase/aplicar-sql.mjs --seguranca              lint de segurança
 *
 * O caminho do arquivo é relativo à raiz do projeto ou a `supabase/`.
 *
 * ⚠️ ISTO ESCREVE NO BANCO DE VERDADE. Não há ambiente de teste separado.
 *    Antes de rodar migration, leia o plano de rollback que deve acompanhá-la.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------------------------------------- ambiente */

function lerEnv() {
  const caminho = join(RAIZ, ".env.local");
  if (!existsSync(caminho)) {
    erro(`Não achei o .env.local em ${caminho}`);
  }
  const env = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i < 0) continue;
    env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim();
  }
  return env;
}

/**
 * `erro()` LEVANTA em vez de chamar process.exit(): depois de um fetch, sair
 * abruptamente no Windows dispara a asserção do libuv e o processo devolve
 * **127** em vez de 1. Quem trata é o catch no fim do arquivo.
 */
class ErroFatal extends Error {}

function erro(mensagem) {
  throw new ErroFatal(mensagem);
}

let TOKEN = "";
let REF = "";
let URL_SUPABASE = "";

function prepararAmbiente() {
  const env = lerEnv();

  TOKEN = env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!TOKEN) {
    erro(
      "Falta SUPABASE_ACCESS_TOKEN no .env.local.\n" +
        "  Gere em https://supabase.com/dashboard/account/tokens e acrescente:\n" +
        "    SUPABASE_ACCESS_TOKEN=sbp_...\n" +
        "  (o .env.local está no .gitignore — não vai para o repositório)",
    );
  }
  if (!TOKEN.startsWith("sbp_")) {
    erro(
      "SUPABASE_ACCESS_TOKEN não parece um personal access token (deve começar com `sbp_`).\n" +
        "  Cuidado: a service_role key NÃO serve aqui — são coisas diferentes.",
    );
  }

  // A ref do projeto sai da própria URL do Supabase: uma fonte da verdade só.
  URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  REF = URL_SUPABASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? "";
  if (!REF) {
    erro(`Não consegui extrair a ref do projeto de NEXT_PUBLIC_SUPABASE_URL="${URL_SUPABASE}"`);
  }
}

/* ---------------------------------------------------------- chamadas */

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${REF}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(opcoes.headers ?? {}),
    },
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    // A mensagem do Postgres vem aqui dentro — é o que interessa quando a
    // migration quebra. Não engula.
    let detalhe = texto;
    try {
      const j = JSON.parse(texto);
      detalhe = j.message ?? j.error ?? texto;
    } catch {
      /* deixa o texto cru */
    }
    erro(`HTTP ${resposta.status} da Management API:\n  ${detalhe}`);
  }

  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

const rodarSql = (sql) =>
  api("/database/query", { method: "POST", body: JSON.stringify({ query: sql }) });

/* -------------------------------------------------------------- saída */

function mostrarResultado(resultado) {
  if (Array.isArray(resultado)) {
    if (resultado.length === 0) {
      console.log("  ✓ executado (sem linhas de retorno)");
      return;
    }
    console.log(`  ✓ ${resultado.length} linha(s):\n`);
    console.table(resultado.slice(0, 50));
    if (resultado.length > 50) console.log(`  … e mais ${resultado.length - 50} linha(s)`);
    return;
  }
  console.log("  ✓", JSON.stringify(resultado).slice(0, 800));
}

/* ------------------------------------------------------------ comandos */

/**
 * Tudo roda dentro de main() e NINGUÉM chama process.exit() depois de um
 * fetch: no Windows isso dispara `Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)` no libuv e o processo sai com **código 127**, como se
 * tivesse falhado — mesmo com o SQL aplicado com sucesso. Em automação isso é
 * pior do que um erro de verdade, porque mente na direção errada.
 *
 * Saída limpa: define `process.exitCode` e deixa o Node encerrar sozinho.
 */
async function main(args) {
  if (args.length === 0 || args.includes("--ajuda") || args.includes("-h")) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("*/")[0]
        .replace("#!/usr/bin/env node\n", ""),
    );
    return;
  }

  prepararAmbiente();
  console.log(`\nProjeto: ${REF}  (${URL_SUPABASE})`);

  // --- regerar os tipos do banco ---
  if (args.includes("--tipos")) {
    const r = await api("/types/typescript");
    const conteudo = typeof r === "string" ? r : r.types;
    if (!conteudo) erro("A API não devolveu os tipos.");

    // O cabeçalho é reescrito toda vez: a API devolve o arquivo cru, e sem
    // isto o aviso de "não edite na mão" se perde a cada regeração.
    const cabecalho =
      "// GERADO pelo Supabase a partir do schema real. Nao edite na mao.\n" +
      "// Para regerar: node supabase/aplicar-sql.mjs --tipos\n\n";

    const destino = join(RAIZ, "src", "lib", "database.types.ts");
    writeFileSync(destino, cabecalho + conteudo, "utf8");
    console.log(`  ✓ src/lib/database.types.ts regerado (${conteudo.length} bytes)`);
    console.log("  → rode `npx tsc --noEmit` para ver o que quebrou com o schema novo.\n");
    return;
  }

  // --- lint de segurança do Supabase ---
  if (args.includes("--seguranca")) {
    const r = await api("/advisors/security");
    const achados = r.lints ?? r ?? [];
    if (!Array.isArray(achados) || achados.length === 0) {
      console.log("  ✓ nenhum achado de segurança.\n");
      return;
    }
    console.log(`  ${achados.length} achado(s):\n`);
    for (const a of achados) {
      console.log(`  [${(a.level ?? "?").toUpperCase()}] ${a.title ?? a.name}`);
      if (a.detail) console.log(`      ${String(a.detail).replace(/\s+/g, " ").slice(0, 200)}`);
    }
    console.log();
    return;
  }

  // --- SQL inline ---
  const iInline = args.findIndex((a) => a === "-e" || a === "--executar");
  if (iInline >= 0) {
    const sql = args[iInline + 1];
    if (!sql) erro("Faltou o SQL depois de -e.");
    console.log(`SQL inline:\n  ${sql.slice(0, 200)}\n`);
    mostrarResultado(await rodarSql(sql));
    console.log();
    return;
  }

  // --- arquivo ---
  const soVer = args.includes("--ver");
  const nomeArquivo = args.find((a) => !a.startsWith("-"));
  if (!nomeArquivo) erro('Diga qual arquivo .sql rodar, ou use -e "...".');

  const candidatos = [
    resolve(RAIZ, nomeArquivo),
    resolve(RAIZ, "supabase", nomeArquivo),
    resolve(process.cwd(), nomeArquivo),
  ];
  const caminho = candidatos.find((c) => existsSync(c));
  if (!caminho) erro(`Não achei o arquivo. Procurei em:\n  ${candidatos.join("\n  ")}`);

  const sql = readFileSync(caminho, "utf8");

  console.log(`Arquivo: ${caminho}`);
  console.log(`         ${sql.split("\n").length} linhas, ${sql.length} caracteres\n`);

  if (soVer) {
    console.log("--- MODO --ver: nada foi executado ---\n");
    console.log(sql);
    return;
  }

  console.log("Executando…");
  mostrarResultado(await rodarSql(sql));
  console.log();
}

try {
  await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof ErroFatal) {
    console.error(`\n✖ ${e.message}\n`);
  } else {
    console.error(`\n✖ Falha inesperada:\n`, e);
  }
  // Sem process.exit(): só marca o código e deixa o Node encerrar sozinho.
  process.exitCode = 1;
}
