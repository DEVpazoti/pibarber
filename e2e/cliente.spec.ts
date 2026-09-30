import { expect, test, type Page } from "@playwright/test";

import { celularUnico, criarBarbeariaPronta, criarCliente, entrar, executar, sql } from "./apoio";

/**
 * O CLIENTE — o que paga a conta de todo mundo: achar a barbearia, agendar,
 * cancelar e avaliar. Roda também no projeto "celular" (playwright.config.ts).
 */

/** Percorre o assistente até a confirmação: serviço → quem → amanhã, 1º horário. */
async function escolherHorario(page: Page, servico: string) {
  await page.getByRole("button", { name: new RegExp(servico) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // "Com quem?" — tanto faz.
  await expect(page.getByRole("heading", { name: "Com quem?" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // "Quando?" — amanhã (o 2º dia da tira), para não depender da hora de hoje.
  await expect(page.getByRole("heading", { name: "Quando?" })).toBeVisible();
  const dias = page
    .locator("ul")
    .filter({ has: page.locator("button[aria-pressed] .tnum") })
    .first();
  await dias.locator("button").nth(1).click();
  const primeiroHorario = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await expect(primeiroHorario).toBeVisible();
  const hora = (await primeiroHorario.textContent())!.trim();
  await primeiroHorario.click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Confirme" })).toBeVisible();
  return hora;
}

test.describe("Cliente", () => {
  test("acha a barbearia na busca e abre a página dela", async ({ page }) => {
    const loja = await criarBarbeariaPronta("Busca Teste");
    const cliente = await criarCliente();
    await entrar(page, cliente.email, "cliente");

    await page.goto("/app/buscar");
    await page.getByPlaceholder("Nome da barbearia").fill(loja.nome);
    await page
      .getByRole("link", { name: new RegExp(loja.nome) })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/b/${loja.slug}`));
    await expect(page.getByRole("heading", { name: loja.nome })).toBeVisible();
  });

  test("agenda logado, vê em Meus agendamentos, e o dono recebe o aviso", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const cliente = await criarCliente("Bruno Agendador");
    await entrar(page, cliente.email, "cliente");

    await page.goto(`/b/${loja.slug}/agendar`);
    const hora = await escolherHorario(page, "Corte E2E");
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("heading", { name: "Agendado!" })).toBeVisible();

    await page.getByRole("link", { name: "Ver meus agendamentos" }).click();
    await expect(page).toHaveURL(/\/app\/agendamentos/);
    await expect(page.getByText(loja.nome).first()).toBeVisible();
    await expect(page.getByText(hora).first()).toBeVisible();

    // O agendamento existe, é online e é do cliente.
    const [ag] = sql<{ status: string; source: string }>(`
      select a.status, a.source from appointments a join customers c on c.id = a.customer_id
       where a.barbershop_id = '${loja.id}' and c.profile_id = '${cliente.id}'`);
    expect(ag).toMatchObject({ status: "scheduled", source: "online" });

    // Os e-mails: confirmação para o cliente e "agendamento novo" para o dono.
    await expect
      .poll(() =>
        sql<{ kind: string; recipient: string }>(
          `select kind, recipient from email_messages where barbershop_id = '${loja.id}' order by kind`,
        ),
      )
      .toEqual([
        { kind: "confirmacao", recipient: cliente.email },
        { kind: "novo_agendamento", recipient: loja.dono.email },
      ]);
  });

  test("cancela pelo app e o horário volta a ficar livre", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const cliente = await criarCliente();
    await entrar(page, cliente.email, "cliente");

    await page.goto(`/b/${loja.slug}/agendar`);
    await escolherHorario(page, "Barba E2E");
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("heading", { name: "Agendado!" })).toBeVisible();

    await page.goto("/app/agendamentos");
    await page.getByRole("button", { name: "Cancelar", exact: true }).first().click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(page.getByText("Cancelado").first()).toBeVisible();

    const [ag] = sql<{ status: string }>(
      `select status from appointments where barbershop_id = '${loja.id}'`,
    );
    expect(ag?.status).toBe("cancelled");

    // O dono é avisado do cancelamento.
    await expect
      .poll(
        () =>
          sql(
            `select 1 from email_messages where barbershop_id = '${loja.id}' and kind = 'cancelamento_dono'`,
          ).length,
      )
      .toBe(1);
  });

  test("avalia um atendimento concluído e a nota entra na barbearia", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const cliente = await criarCliente("Carla Avaliadora");

    // Um atendimento de ontem, já concluído, na ficha do cliente.
    const [ficha] = sql<{ id: string }>(`
      insert into customers (barbershop_id, profile_id, full_name, phone)
      values ('${loja.id}', '${cliente.id}', '${cliente.nome}', '${cliente.telefone}') returning id`);
    executar(`
      with a as (
        insert into appointments (barbershop_id, professional_id, customer_id, starts_at, ends_at,
          status, total_price, source, created_by, completed_at)
        values ('${loja.id}', '${loja.profissionalId}', '${ficha!.id}',
          date_trunc('hour', now()) - interval '1 day', date_trunc('hour', now()) - interval '1 day' + interval '30 minutes',
          'completed', 40, 'online', '${cliente.id}', now() - interval '1 day')
        returning id)
      insert into appointment_services (appointment_id, service_id, price, duration_minutes)
      select id, '${loja.servicoId}', 40, 30 from a;`);

    await entrar(page, cliente.email, "cliente");
    await page.goto("/app/agendamentos");
    await page.getByRole("button", { name: "Avaliar" }).first().click();
    await expect(page.getByRole("heading", { name: "Como foi o atendimento?" })).toBeVisible();
    await page.getByRole("button", { name: "5 estrelas" }).click();
    await page.getByLabel("Comentário").fill("Atendimento excelente — teste E2E.");
    await page.getByRole("button", { name: "Enviar avaliação" }).click();

    await expect
      .poll(
        () =>
          sql<{ rating_count: number }>(
            `select rating_count from barbershops where id = '${loja.id}'`,
          )[0]?.rating_count,
      )
      .toBe(1);
    await expect(page.getByRole("button", { name: "Avaliar" })).toHaveCount(0);
  });

  test("agenda SEM conta pelo link público e recebe o link de acompanhamento", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    executar(`update barbershops set allow_public_booking = true where id = '${loja.id}'`);
    // Um IP só deste teste: o agendamento sem conta aceita um por origem a cada
    // 30 segundos (17_agendamento_publico.sql), e todos os testes saem do
    // mesmo computador. É o que a Vercel manda no x-forwarded-for.
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
    });

    await page.goto(`/b/${loja.slug}/agendar`);
    await escolherHorario(page, "Corte E2E");
    await page.locator("#conf-nome").fill("Diego Sem Conta");
    // Celular único: o app limita agendamentos sem conta seguidos do mesmo
    // número (20_link_expira_e_rajada.sql), e o projeto "celular" repete o teste.
    await page.locator("#conf-telefone").fill(celularUnico());
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("heading", { name: "Agendado!" })).toBeVisible();
    await expect(page.getByText("Guarde este link")).toBeVisible();

    // O link /a/<token> abre o agendamento sem login.
    const [ag] = sql<{ public_token: string }>(
      `select public_token from appointments where barbershop_id = '${loja.id}'`,
    );
    await page.goto(`/a/${ag!.public_token}`);
    await expect(page.getByText(loja.nome).first()).toBeVisible();
  });

  test("barbearia que NÃO aceita agendamento sem conta pede para entrar", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    await page.goto(`/b/${loja.slug}/agendar`);
    await escolherHorario(page, "Corte E2E");
    await expect(page.getByText("Falta só entrar na sua conta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar agendamento" })).toHaveCount(0);
  });
});
