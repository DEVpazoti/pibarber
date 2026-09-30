import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, ENV_DO_SERVIDOR, PORTA } from "./e2e/ambiente";

/**
 * Testes E2E — ver docs/e2e.md.
 *
 *   npx supabase start     (uma vez; o Supabase local fica no Docker)
 *   npm run e2e            (recria o banco local e roda tudo)
 *   npm run e2e:ui         (a interface para assistir e depurar)
 *
 * O app de teste roda em :3100 com `.next-e2e`, ao lado do `npm run dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/preparar.ts",
  // O `next dev` compila cada página na primeira visita: o primeiro teste de
  // cada tela é lento. Folga no tempo, não em repetição.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // 2, e não mais: navegador + `next dev` + Supabase no Docker cabem em ~7 GB assim.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    {
      name: "celular",
      use: { ...devices["Pixel 7"] },
      // No celular, só os fluxos do cliente — é onde ele está.
      testMatch: /cliente\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORTA}`,
    url: `${BASE_URL}/entrar`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: ENV_DO_SERVIDOR,
    stdout: "ignore",
    stderr: "pipe",
  },
});
