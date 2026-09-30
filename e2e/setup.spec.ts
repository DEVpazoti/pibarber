import { expect, test } from "@playwright/test";

import { SENHA } from "./ambiente";
import { celularUnico, sql, unico } from "./apoio";

/**
 * O DONO CHEGANDO: "Criar conta" da landing → cadastro da barbearia → as seis
 * etapas do setup (src/components/setup/SetupGuiado.tsx) → loja no ar.
 *
 * No Supabase local a confirmação de e-mail está desligada (config.toml),
 * então o cadastro já entra com sessão — o link do e-mail é testado no
 * "Esqueci minha senha" (login.spec.ts), que usa o mesmo caminho.
 */

// A etapa "Onde fica" usa o GPS do navegador: Ribeirão Preto, sem internet.
test.use({
  geolocation: { latitude: -21.1775, longitude: -47.8103 },
  permissions: ["geolocation"],
});

test("dono se cadastra, passa pelo setup e a barbearia vai ao ar", async ({ page }) => {
  const nomeLoja = `Barbearia ${unico("setup")}`;
  const email = `${unico("dono")}@example.com`;

  // --- Da landing ao cadastro ------------------------------------------------
  await page.goto("/");
  await page
    .getByRole("link", { name: /criar conta/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/criar-conta\?tipo=barbearia/);

  await page.locator("#nomeBarbearia").fill(nomeLoja);
  await page.locator("#nome").fill("Rafael Dono Teste");
  await page.locator("#telefone").fill(celularUnico());
  await page.locator("#email").fill(email);
  await page.locator("#senha").fill(SENHA);
  await page.locator("#confirmacao").fill(SENHA);
  await page.getByRole("button", { name: /criar/i }).click();

  await expect(page).toHaveURL(/\/configurar/, { timeout: 30_000 });

  // --- 1. Sua barbearia --------------------------------------------------------
  await expect(page.locator("#st-nome")).toHaveValue(nomeLoja);
  await page.getByRole("button", { name: "Continuar" }).click();

  // --- 2. Onde fica ------------------------------------------------------------
  await expect(page.locator("#st-rua")).toBeVisible();
  await page.locator("#st-rua").fill("Rua dos Testes");
  await page.locator("#st-numero").fill("100");
  await page.locator("#st-bairro").fill("Centro");
  await page.locator("#st-cidade").fill("Ribeirão Preto");
  await page.locator("#st-estado").selectOption("SP");
  await page.getByRole("button", { name: "Usar minha localização atual" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // --- 3. Horário (o modelo que já vem) ----------------------------------------
  await expect(page.getByRole("heading", { name: /hor[aá]rio/i }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // --- 4. Serviços (as sugestões que já vêm) -----------------------------------
  await expect(page.getByRole("textbox", { name: "Nome do serviço" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // --- 5. Quem atende ----------------------------------------------------------
  await expect(page.getByText("Eu também atendo clientes")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // --- 6. Regras de agendamento → abrir ----------------------------------------
  await expect(page.locator("#st-max")).toBeVisible();
  await page.getByRole("button", { name: "Concluir e abrir a barbearia" }).click();
  await expect(page).toHaveURL(/\/configurar\/pronto/);
  await expect(page.getByRole("heading", { name: "Sua barbearia está no ar!" })).toBeVisible();

  // --- No banco: no ar, com o que o setup gravou --------------------------------
  const [loja] = sql<{
    slug: string;
    is_active: boolean;
    setup: boolean;
    lat: number | null;
    servicos: number;
    profissionais: number;
    dias_abertos: number;
    teste: boolean;
  }>(`
    select b.slug, b.is_active, b.setup_completed_at is not null as setup, b.latitude as lat,
           (select count(*) from services s where s.barbershop_id = b.id and s.is_active)::int as servicos,
           (select count(*) from professionals p where p.barbershop_id = b.id and p.is_active)::int as profissionais,
           (select count(*) from business_hours h where h.barbershop_id = b.id and not h.is_closed)::int as dias_abertos,
           (select s.trial_ends_at > now() + interval '13 days' from subscriptions s where s.barbershop_id = b.id) as teste
      from barbershops b join profiles p on p.id = b.owner_id
     where p.email = '${email}'`);

  expect(loja).toMatchObject({ is_active: true, setup: true, teste: true });
  expect(loja!.lat).not.toBeNull();
  expect(loja!.servicos).toBeGreaterThan(0);
  expect(loja!.profissionais).toBeGreaterThan(0);
  expect(loja!.dias_abertos).toBeGreaterThan(0);

  // A página pública abre para quem não tem conta.
  await page.context().clearCookies();
  await page.goto(`/b/${loja!.slug}`);
  await expect(page.getByRole("heading", { name: nomeLoja })).toBeVisible();
});

test("o mesmo celular não cadastra duas barbearias", async ({ page }) => {
  const celular = celularUnico();

  for (const [i, esperado] of [
    [1, /\/configurar/],
    [2, null],
  ] as const) {
    await page.context().clearCookies();
    await page.goto("/criar-conta?tipo=barbearia");
    await page.locator("#nomeBarbearia").fill(`Barbearia ${unico(`dup${i}`)}`);
    await page.locator("#nome").fill("Dono Duplicado");
    await page.locator("#telefone").fill(celular);
    await page.locator("#email").fill(`${unico("dup")}@example.com`);
    await page.locator("#senha").fill(SENHA);
    await page.locator("#confirmacao").fill(SENHA);
    await page.getByRole("button", { name: /criar/i }).click();

    if (esperado) {
      await expect(page).toHaveURL(esperado, { timeout: 30_000 });
    } else {
      await expect(
        page.getByText("Este telefone já está cadastrado em outra barbearia."),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/criar-conta/);
    }
  }
});
