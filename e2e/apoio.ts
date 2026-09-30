import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  ASAAS_WEBHOOK_TOKEN,
  BASE_URL,
  CONTAINER_DB,
  MAILPIT_URL,
  SENHA,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "./ambiente";

/**
 * Ajudantes dos testes E2E: criar dados prontos direto no banco local, entrar
 * pela tela, simular o que vem de fora (pagamento do Asaas, e-mail do Auth).
 *
 * Regra: cada teste cria O QUE PRECISA, com nome único. Nada de depender de
 * um dado que outro teste criou ou apagou — assim eles rodam em qualquer
 * ordem e em paralelo.
 */

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** "e2e-lx3k9a2f" — sufixo para e-mail, slug e nome não colidirem. */
export function unico(prefixo = "e2e"): string {
  return `${prefixo}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

/** Celular com DDD válido e único (o índice de dono não aceita repetido). */
export function celularUnico(): string {
  return `169${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

/**
 * SQL direto no Postgres local, como superusuário. Devolve as linhas em JSON.
 * Para o que a API não faz ou faria devagar: mexer no relógio da assinatura,
 * criar uma loja inteira, conferir a fila de e-mail.
 */
export function sql<T = Record<string, unknown>>(consulta: string): T[] {
  // CTE, e não subconsulta: `insert ... returning` só é aceito dentro de WITH.
  const envelope = `with t as (${consulta.trim().replace(/;$/, "")}) select coalesce(json_agg(t), '[]'::json) from t`;
  const saida = psql(["-At"], envelope);
  return JSON.parse(saida.trim() || "[]") as T[];
}

/** Comando sem retorno (update, delete). */
export function executar(comando: string): void {
  psql([], comando);
}

/** O psql do container, com o erro do Postgres na mensagem quando falha. */
function psql(opcoes: string[], entrada: string): string {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER_DB,
        "psql",
        "-q",
        ...opcoes,
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
      ],
      { input: entrada, stdio: ["pipe", "pipe", "pipe"] },
    ).toString();
  } catch (e) {
    const erro = (e as { stderr?: Buffer }).stderr?.toString().trim() || String(e);
    throw new Error(`SQL falhou: ${erro}\n--- consulta ---\n${entrada.slice(0, 600)}`);
  }
}

/* ==========================================================================
   Contas e barbearias
   ========================================================================== */

export type Conta = { id: string; email: string; nome: string; telefone: string };

/** Conta de cliente confirmada, com nome e celular (o que o agendar exige). */
export async function criarCliente(nome = "Cliente E2E"): Promise<Conta> {
  const email = `${unico("cliente")}@example.com`;
  const telefone = celularUnico();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (error || !data.user) throw new Error(`criarCliente: ${error?.message}`);
  executar(
    `update profiles set phone = '${telefone}', full_name = '${nome}' where id = '${data.user.id}'`,
  );
  return { id: data.user.id, email, nome, telefone };
}

export type Loja = {
  id: string;
  slug: string;
  nome: string;
  dono: Conta;
  profissionalId: string;
  servicoId: string;
};

/**
 * Uma barbearia PRONTA: setup concluído, no ar, aberta todos os dias das 8h
 * às 21h, um profissional e dois serviços. A assinatura nasce no teste grátis
 * (trigger da 26).
 */
export async function criarBarbeariaPronta(nome = "Barbearia E2E"): Promise<Loja> {
  const dono = await criarCliente("Dono E2E");
  const slug = unico("loja");
  const nomeLoja = `${nome} ${slug.slice(-6)}`;
  executar(`update profiles set phone = '${dono.telefone}' where id = '${dono.id}'`);

  const [loja] = sql<{ id: string }>(`
    insert into barbershops (owner_id, name, slug, phone, whatsapp, zip_code, street, number,
      neighborhood, city, state, latitude, longitude, accepts_online_booking,
      min_advance_minutes, max_advance_days, cancel_deadline_hours, is_active, setup_completed_at)
    values ('${dono.id}', '${nomeLoja}', '${slug}', '${dono.telefone}', '${dono.telefone}',
      '14000-000', 'Rua dos Testes', '100', 'Centro', 'Ribeirão Preto', 'SP',
      -21.1775, -47.8103, true, 0, 15, 1, true, now())
    returning id`);
  const shopId = loja!.id;

  executar(`
    insert into business_hours (barbershop_id, weekday, opens_at, closes_at, is_closed)
    select '${shopId}', d, '08:00', '21:00', false from generate_series(0, 6) d;`);

  const [prof] = sql<{ id: string }>(`
    insert into professionals (barbershop_id, name, nickname, commission_percent, is_active)
    values ('${shopId}', 'Profissional E2E', 'Prof', 40, true) returning id`);
  const [serv] = sql<{ id: string }>(`
    insert into services (barbershop_id, name, price, duration_minutes, is_active, sort_order)
    values ('${shopId}', 'Corte E2E', 40, 30, true, 1),
           ('${shopId}', 'Barba E2E', 30, 30, true, 2)
    returning id`);

  // A loja nasceu com o dono como `owner` (trigger da 02).
  return {
    id: shopId,
    slug,
    nome: nomeLoja,
    dono: { ...dono, nome: "Dono E2E" },
    profissionalId: prof!.id,
    servicoId: serv!.id,
  };
}

/* ==========================================================================
   Tela
   ========================================================================== */

/**
 * Entra pela tela. `porta` é a do login (src/lib/lado.ts): "barbearia" é o
 * "Entrar" da landing; "cliente" é o "Sou cliente".
 */
export async function entrar(page: Page, email: string, porta: "barbearia" | "cliente") {
  await page.goto(porta === "barbearia" ? "/entrar?tipo=barbearia" : "/entrar");
  await page.locator("#email").fill(email);
  await page.locator("#senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
}

/* ==========================================================================
   O que vem de fora
   ========================================================================== */

/**
 * O Asaas avisando que a mensalidade foi paga — o mesmo POST que ele faz em
 * produção, com o token do webhook. Antes, liga a loja a uma "assinatura" do
 * Asaas inventada, como a tela de assinar faria.
 */
export async function simularPagamento(
  shopId: string,
  request: import("@playwright/test").APIRequestContext,
) {
  const assinatura = unico("sub");
  executar(`
    update subscriptions
       set asaas_subscription_id = '${assinatura}', plan_id = 'solo', cycle = 'monthly', status = 'pending'
     where barbershop_id = '${shopId}'`);

  const hoje = new Date().toISOString().slice(0, 10);
  const resposta = await request.post(`${BASE_URL}/api/webhooks/asaas`, {
    headers: { "asaas-access-token": ASAAS_WEBHOOK_TOKEN },
    data: {
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: unico("pay"),
        subscription: assinatura,
        status: "CONFIRMED",
        value: 69.99,
        billingType: "CREDIT_CARD",
        dueDate: hoje,
        confirmedDate: hoje,
      },
    },
  });
  expect(resposta.status()).toBe(200);
}

/** O e-mail mais recente que o Supabase Auth mandou para `para` (Mailpit). */
export async function ultimoEmailDoAuth(
  request: import("@playwright/test").APIRequestContext,
  para: string,
): Promise<{ assunto: string; html: string }> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const r = await request.get(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${para}`)}`,
        );
        const corpo = (await r.json()) as { messages?: { ID: string }[] };
        id = corpo.messages?.[0]?.ID;
        return id;
      },
      { timeout: 15_000, message: `nenhum e-mail do Auth chegou para ${para}` },
    )
    .toBeTruthy();
  const m = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  const corpo = (await m.json()) as { Subject: string; HTML: string };
  return { assunto: corpo.Subject, html: corpo.HTML };
}

/** O primeiro link do botão (o `href` do e-mail), já sem os `&amp;`. */
export function linkDoEmail(html: string): string {
  const achado = html.match(/href="([^"]+)"/);
  if (!achado) throw new Error("e-mail sem link");
  return achado[1]!.replace(/&amp;/g, "&");
}
