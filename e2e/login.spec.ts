import { expect, test } from "@playwright/test";

import { SENHA } from "./ambiente";
import { criarCliente, entrar, linkDoEmail, ultimoEmailDoAuth } from "./apoio";

/**
 * AS DUAS PORTAS (src/lib/lado.ts) e o "Esqueci minha senha".
 *
 * Contas do seed (04_seed.sql): dono.saopaulo é dono da Navalha & Cia;
 * cliente1 é só cliente. Estes testes só LEEM com elas.
 */

test.describe("Login pelas duas portas", () => {
  test("dono pela porta da barbearia cai no painel", async ({ page }) => {
    await entrar(page, "dono.saopaulo@pibarber.dev", "barbearia");
    await expect(page).toHaveURL(/\/painel/);
  });

  test("dono pela porta do cliente cai no app e não entra no painel", async ({ page }) => {
    await entrar(page, "dono.saopaulo@pibarber.dev", "cliente");
    await expect(page).toHaveURL(/\/app/);

    await page.goto("/painel");
    await expect(page).toHaveURL(/\/app/);
  });

  test("cliente pela porta da barbearia recebe o convite para criar a loja", async ({ page }) => {
    await entrar(page, "cliente1@pibarber.dev", "barbearia");
    await expect(page).toHaveURL(/\/app\/perfil\/barbearia\?pela=porta-da-barbearia/);
    await expect(page.getByText("Sua conta ainda não tem barbearia")).toBeVisible();
  });

  test("senha errada mostra o erro e não entra", async ({ page }) => {
    await page.goto("/entrar");
    await page.locator("#email").fill("cliente1@pibarber.dev");
    await page.locator("#senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("sem login, o painel manda para a porta da barbearia", async ({ page }) => {
    await page.goto("/painel/agenda");
    await expect(page).toHaveURL(/\/entrar\?.*tipo=barbearia/);
  });
});

test.describe("Esqueci minha senha", () => {
  test("pede o link, recebe o e-mail, cria a senha nova e entra com ela", async ({
    page,
    request,
  }) => {
    const cliente = await criarCliente("Ana Esquecida");

    await page.goto("/entrar");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha/);

    await page.locator("#email").fill(cliente.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByText("Se houver uma conta com este e-mail")).toBeVisible();

    // O e-mail que o Supabase mandou, com o NOSSO modelo (supabase/emails/).
    const email = await ultimoEmailDoAuth(request, cliente.email);
    expect(email.assunto).toBe("Crie uma nova senha no PiBarber");
    const link = linkDoEmail(email.html);
    expect(link).toContain("token_hash=");
    expect(link).toContain("type=recovery");

    await page.goto(link);
    await expect(page).toHaveURL(/\/redefinir-senha/);
    await expect(page.getByRole("heading", { name: "Criar nova senha" })).toBeVisible();

    const novaSenha = `${SENHA}-nova`;
    await page.locator("#senha").fill(novaSenha);
    await page.locator("#confirmacao").fill(novaSenha);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/app/);

    // A senha nova vale num login novo, do zero.
    await page.context().clearCookies();
    await page.goto("/entrar");
    await page.locator("#email").fill(cliente.email);
    await page.locator("#senha").fill(novaSenha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
  });

  test("link já usado ou sem sessão mostra 'Link expirado'", async ({ page }) => {
    await page.goto("/redefinir-senha");
    await expect(page.getByRole("heading", { name: "Link expirado" })).toBeVisible();
  });
});
