import { expect, test } from "@playwright/test";

import { criarAdmin, criarBarbeariaPronta, entrar, executar, sql } from "./apoio";

/**
 * O SUPER ADMIN (/admin): visão geral, lista e ficha das barbearias, notas
 * internas, extensão do teste, bloqueio e os relatos que os barbeiros mandam
 * pelo painel.
 *
 * Fora daqui, de propósito: estorno e cancelamento pelo /admin — os dois
 * chamam a API do Asaas, que o ambiente de teste não tem (e2e/ambiente.ts).
 */

test.describe("Admin", () => {
  test("a visão geral aponta o teste grátis acabando", async ({ page }) => {
    const loja = await criarBarbeariaPronta("Quase Acabando");
    executar(`update subscriptions set trial_ends_at = now() + interval '2 days'
               where barbershop_id = '${loja.id}'`);
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");

    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    const bloco = page
      .getByRole("heading", { name: "Teste grátis acabando (3 dias)" })
      .locator("xpath=../..");
    await expect(bloco.getByRole("link", { name: new RegExp(loja.nome) })).toBeVisible();
  });

  test("busca a barbearia, abre a ficha e registra uma nota interna", async ({ page }) => {
    const loja = await criarBarbeariaPronta("Ficha Teste");
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");

    await page.goto("/admin/barbearias");
    await page.getByRole("textbox", { name: "Buscar barbearia" }).fill(loja.nome);
    await expect(page.getByText(/^1 de \d+ barbearias$/)).toBeVisible();
    await page.getByRole("link", { name: loja.nome }).first().click();

    await expect(page.getByRole("heading", { name: loja.nome, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: loja.dono.email })).toBeVisible();

    const nota = "Liguei hoje — vai assinar na semana que vem (E2E).";
    await page.getByRole("textbox", { name: "Nova nota interna" }).fill(nota);
    await page.getByRole("button", { name: "Adicionar nota" }).click();
    // Salvou: o campo esvazia e a nota aparece na lista (não no campo).
    await expect(page.getByRole("textbox", { name: "Nova nota interna" })).toHaveValue("");
    await expect(page.getByRole("listitem").filter({ hasText: nota })).toBeVisible();
    expect(sql(`select 1 from admin_notes where barbershop_id = '${loja.id}'`)).toHaveLength(1);

    await page.getByRole("button", { name: "Apagar nota" }).click();
    await expect(page.getByText("Nenhuma nota ainda.")).toBeVisible();
  });

  test("estende o teste grátis e fica no histórico", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const [antes] = sql<{ fim: string }>(
      `select trial_ends_at::text as fim from subscriptions where barbershop_id = '${loja.id}'`,
    );
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");

    await page.goto(`/admin/barbearias/${loja.id}`);
    await page.getByRole("button", { name: "Gerenciar assinatura" }).click();
    const janela = page.getByRole("dialog", { name: new RegExp(`Assinatura — ${loja.nome}`) });
    await janela.getByRole("combobox", { name: "Dias a mais" }).selectOption({ label: "+7 dias" });
    await janela
      .getByRole("textbox", { name: "Motivo da extensão" })
      .fill("Pediu mais tempo (E2E)");
    await janela.getByRole("button", { name: "Estender" }).click();

    await expect
      .poll(
        () =>
          sql<{ dias: number }>(`
            select round(extract(epoch from (trial_ends_at - '${antes!.fim}'::timestamptz)) / 86400)::int as dias
              from subscriptions where barbershop_id = '${loja.id}'`)[0]?.dias,
      )
      .toBe(7);
    expect(
      sql(
        `select 1 from subscription_events where barbershop_id = '${loja.id}' and action = 'extend_trial'`,
      ),
    ).toHaveLength(1);
  });

  test("desativa a barbearia: some do público; ativa de novo: volta", async ({ page }) => {
    const loja = await criarBarbeariaPronta("Bloqueio Teste");
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");

    await page.goto(`/admin/barbearias/${loja.id}`);
    await page.getByRole("button", { name: "Desativar" }).click();
    await expect
      .poll(
        () =>
          sql<{ ativa: boolean; bloqueada: boolean }>(
            `select is_active as ativa, blocked_at is not null as bloqueada from barbershops where id = '${loja.id}'`,
          )[0],
      )
      .toEqual({ ativa: false, bloqueada: true });
    await expect(page.getByRole("button", { name: "Ativar" })).toBeVisible();

    // Some do público: a página vira "não encontrada", sem nada da loja. (O
    // status é 200, não 404: com o loading.tsx da rota, o Next começa a mandar
    // a página antes do notFound() — um "404 suave", que ele marca noindex.)
    const fora = await (await page.request.get(`/b/${loja.slug}`)).text();
    expect(fora).toContain("Barbearia não encontrada");
    expect(fora).not.toContain(loja.dono.telefone);

    await page.getByRole("button", { name: "Ativar" }).click();
    await expect
      .poll(
        () =>
          sql<{ ativa: boolean }>(
            `select is_active as ativa from barbershops where id = '${loja.id}'`,
          )[0],
      )
      .toEqual({ ativa: true });
  });

  test("o dono manda um relato pelo painel e o admin marca como resolvido", async ({ page }) => {
    const loja = await criarBarbeariaPronta("Relato Teste");
    const mensagem = `A agenda podia mostrar a semana inteira (E2E ${Date.now()}).`;

    await entrar(page, loja.dono.email, "barbearia");
    // "Precisa de ajuda?" é um <details> no menu lateral.
    await page.getByText("Precisa de ajuda?").first().click();
    await page.getByRole("button", { name: "Reportar problema ou dar sugestão" }).first().click();
    const janela = page.getByRole("dialog", { name: "Reportar problema ou dar sugestão" });
    await janela.getByRole("radio", { name: /Sugestão/ }).click();
    await janela.locator("#fb-msg").fill(mensagem);
    await janela.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("dialog", { name: "Obrigado!" })).toBeVisible();

    const [relato] = sql<{ kind: string; status: string }>(
      `select kind, status from feedbacks where barbershop_id = '${loja.id}'`,
    );
    expect(relato?.kind).toMatch(/sugest/);

    await page.context().clearCookies();
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");
    await page.goto("/admin/feedbacks");
    const cartao = page.locator("li, article").filter({ hasText: mensagem }).first();
    await expect(cartao).toBeVisible();
    await cartao
      .getByRole("combobox", { name: "Situação do relato" })
      .selectOption({ label: "Resolvido" });

    await expect
      .poll(
        () =>
          sql<{ status: string }>(
            `select status from feedbacks where barbershop_id = '${loja.id}'`,
          )[0]?.status,
      )
      .toMatch(/resol/);
  });
});

test.describe("Como conheceram o PiBarber", () => {
  test("a resposta do setup aparece na ficha; loja antiga fica 'Não informado'", async ({
    page,
  }) => {
    const respondeu = await criarBarbeariaPronta("Veio Indicada");
    executar(`insert into barbershop_acquisition (barbershop_id, source, detail)
              values ('${respondeu.id}', 'barber_referral', 'João da Navalha')`);
    const antiga = await criarBarbeariaPronta("Loja Antiga");
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");

    await expect(page.getByRole("heading", { name: "Como conheceram o PiBarber" })).toBeVisible();

    await page.goto(`/admin/barbearias/${respondeu.id}`);
    await expect(
      page.getByText("Indicação de outro barbeiro — João da Navalha"),
    ).toBeVisible();

    await page.goto(`/admin/barbearias/${antiga.id}`);
    await expect(page.getByText("Não informado")).toBeVisible();

    // O filtro da lista.
    await page.goto("/admin/barbearias");
    await page
      .getByRole("combobox", { name: "Filtrar por como conheceu" })
      .selectOption({ label: "Indicação de outro barbeiro" });
    await expect(page.getByRole("link", { name: respondeu.nome }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: antiga.nome })).toHaveCount(0);
  });
});
