import { execFileSync, execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTAINER_DB } from "./ambiente";

/**
 * GLOBAL SETUP — roda uma vez antes de todos os testes.
 *
 * Recria o banco LOCAL do zero e aplica supabase/[0-9]*.sql na ordem, com o
 * seed de exemplo (04). Menos a 05 e a 06, que são operações manuais.
 *
 * `E2E_SEM_RESET=1` pula a recriação — útil para rodar um teste só várias
 * vezes seguidas enquanto se escreve ele. Os testes criam dados com nomes
 * únicos, então não se atropelam num banco já usado.
 */
export default function preparar() {
  try {
    execSync(`docker inspect -f "{{.State.Running}}" ${CONTAINER_DB}`, { stdio: "pipe" });
  } catch {
    throw new Error(
      "O Supabase local não está rodando. Suba com `npx supabase start` (ver docs/e2e.md).",
    );
  }

  if (process.env.E2E_SEM_RESET === "1") return;

  execSync("npx supabase db reset --local --no-seed", { stdio: "pipe" });

  const pasta = join(process.cwd(), "supabase");
  const arquivos = readdirSync(pasta)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .filter((f) => !f.startsWith("05_") && !f.startsWith("06_"))
    .sort();

  for (const arquivo of arquivos) {
    try {
      execFileSync(
        "docker",
        ["exec", "-i", CONTAINER_DB, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
        { input: readFileSync(join(pasta, arquivo)), stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      const saida = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
      throw new Error(`Migração ${arquivo} falhou no banco local:\n${saida}`);
    }
  }
}
