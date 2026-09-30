import { expect, test } from "@playwright/test";

import {
  apiAnonima,
  apiComo,
  criarAdmin,
  criarAgendamento,
  criarAssistente,
  criarAtendimentoConcluido,
  criarBarbeariaPronta,
  criarCliente,
  diaSP,
  entrar,
  sql,
} from "./apoio";

/**
 * SEGURANÇA POR PAPEL — em duas camadas, porque só uma delas vale de verdade:
 *
 *   · A TELA: o que cada papel vê e onde consegue entrar (menu, redirect).
 *   · O BANCO: a mesma pessoa chamando a API do Supabase direto, com a chave
 *     pública e a sessão dela (`apiComo`). Esconder o menu não protege nada;
 *     a RLS é a proteção (CONTEXT §5). Se um teste daqui falhar, é vazamento.
 */

test.describe("Assistente", () => {
  test("não vê os itens de dinheiro nem entra nas telas deles", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const assistente = await criarAssistente(loja);
    await entrar(page, assistente.email, "barbearia");
    await expect(page).toHaveURL(/\/painel/);

    const menu = page.getByRole("navigation").first();
    for (const item of ["Agenda", "Clientes", "Pendências", "Lista de espera", "Fiado"]) {
      await expect(menu.getByRole("link", { name: item })).toBeVisible();
    }
    for (const item of [
      "Caixa",
      "Comissões",
      "Relatórios",
      "Configurações",
      "Equipe",
      "Assinatura",
    ]) {
      await expect(menu.getByRole("link", { name: item })).toHaveCount(0);
    }

    for (const rota of [
      "/painel/caixa",
      "/painel/comissoes",
      "/painel/relatorios",
      "/painel/configuracoes",
      "/painel/equipe",
    ]) {
      await page.goto(rota);
      await expect(page, rota).toHaveURL(/\/painel$/);
    }
  });

  test("pela API, não lê caixa nem comissão, e não altera a loja", async () => {
    const loja = await criarBarbeariaPronta();
    criarAtendimentoConcluido(loja, "Cliente Pagante");
    const assistente = await criarAssistente(loja);
    const api = await apiComo(assistente.email);

    // Enxerga a agenda (é o trabalho dele)…
    const agenda = await api.from("appointments").select("id").eq("barbershop_id", loja.id);
    expect(agenda.error).toBeNull();
    expect(agenda.data).toHaveLength(1);

    // …mas nada de dinheiro. Controle: o DONO, com a mesma consulta, acha —
    // senão o "vazio" do assistente podia ser só uma consulta quebrada.
    const dono = await apiComo(loja.dono.email);
    for (const tabela of ["transactions", "commissions"] as const) {
      const doDono = await dono.from(tabela).select("id").eq("barbershop_id", loja.id);
      expect(doDono.data, `${tabela} (dono)`).toHaveLength(1);
      const r = await api.from(tabela).select("id").eq("barbershop_id", loja.id);
      expect(r.data ?? [], tabela).toHaveLength(0);
    }

    // E não reescreve a loja.
    await api.from("barbershops").update({ name: "Invadida" }).eq("id", loja.id);
    expect(
      sql<{ name: string }>(`select name from barbershops where id = '${loja.id}'`)[0]?.name,
    ).toBe(loja.nome);
  });
});

test.describe("Admin vendo como o dono", () => {
  test("abre o painel da loja, mas nada que fizer é salvo — e fica registrado", async ({
    page,
  }) => {
    const loja = await criarBarbeariaPronta();
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");
    await expect(page).toHaveURL(/\/admin/);

    await page.goto(`/admin/barbearias/${loja.id}`);
    await page.getByRole("button", { name: "Ver como o dono" }).click();
    await expect(page).toHaveURL(/\/painel/);
    await expect(page.getByText("somente leitura").first()).toBeVisible();
    await expect(page.getByText(loja.nome).first()).toBeVisible();

    // Tenta encaixar um cliente: o servidor recusa.
    await page.goto(`/painel/agenda?dia=${diaSP(1)}`);
    await page.getByRole("button", { name: "Agendar 11:00 com Prof" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo agendamento" });
    await dialogo.locator("#novo-nome").fill("Tentativa do Admin");
    await dialogo.getByRole("button", { name: /Corte E2E/ }).click();
    await dialogo.getByRole("button", { name: "Agendar", exact: true }).click();
    await expect(dialogo.getByRole("alert")).toContainText("somente leitura");

    expect(sql(`select 1 from appointments where barbershop_id = '${loja.id}'`)).toHaveLength(0);
    expect(
      sql(
        `select 1 from admin_audit where barbershop_id = '${loja.id}' and action = 'view_as_owner'`,
      ),
    ).toHaveLength(1);
  });
});

test.describe("Isolamento entre contas", () => {
  test("o dono, pelo lado cliente, não vê a agenda da própria loja como se fosse dele", async ({
    page,
  }) => {
    const loja = await criarBarbeariaPronta();
    criarAgendamento(loja, { cliente: "Horário da Loja", dia: 1, hora: "10:00" });
    await entrar(page, loja.dono.email, "cliente");

    await page.goto("/app/agendamentos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Horário da Loja")).toHaveCount(0);
    await expect(page.getByText(loja.nome)).toHaveCount(0);
  });

  test("dono de uma loja não lê nem altera outra loja pela API", async () => {
    const minha = await criarBarbeariaPronta("Minha");
    const outra = await criarBarbeariaPronta("Outra");
    criarAtendimentoConcluido(minha, "Cliente da Minha");
    criarAtendimentoConcluido(outra, "Cliente da Outra");
    const api = await apiComo(minha.dono.email);

    for (const tabela of ["appointments", "customers", "transactions", "commissions"] as const) {
      // Controle: a própria loja ele lê.
      const daMinha = await api.from(tabela).select("id").eq("barbershop_id", minha.id);
      expect(daMinha.data, `${tabela} (minha)`).toHaveLength(1);
      const r = await api.from(tabela).select("id").eq("barbershop_id", outra.id);
      expect(r.data ?? [], tabela).toHaveLength(0);
    }
    await api.from("barbershops").update({ description: "hackeada" }).eq("id", outra.id);
    await api.from("services").update({ price: 1 }).eq("barbershop_id", outra.id);
    const [depois] = sql<{ description: string | null; preco_min: string }>(`
      select b.description, (select min(price)::text from services s where s.barbershop_id = b.id) as preco_min
        from barbershops b where b.id = '${outra.id}'`);
    expect(depois).toEqual({ description: null, preco_min: "30.00" });
  });

  test("um cliente não lê os agendamentos nem a ficha de outro cliente", async () => {
    const loja = await criarBarbeariaPronta();
    const ana = await criarCliente("Ana Cliente");
    const bruno = await criarCliente("Bruno Cliente");
    const [fichaBruno] = sql<{ id: string }>(`
      insert into customers (barbershop_id, profile_id, full_name, phone)
      values ('${loja.id}', '${bruno.id}', 'Bruno Cliente', '${bruno.telefone}') returning id`);
    criarAgendamento(loja, { cliente: "outro", dia: 1, hora: "09:00" });

    const api = await apiComo(ana.email);
    // Controle: o próprio perfil ela lê.
    const meu = await api.from("profiles").select("phone").eq("id", ana.id);
    expect(meu.data).toEqual([{ phone: ana.telefone }]);
    const fichas = await api.from("customers").select("id, phone").eq("id", fichaBruno!.id);
    expect(fichas.data ?? []).toHaveLength(0);
    const agenda = await api.from("appointments").select("id").eq("barbershop_id", loja.id);
    expect(agenda.data ?? []).toHaveLength(0);
    const perfil = await api.from("profiles").select("phone").eq("id", bruno.id);
    expect(perfil.data ?? []).toHaveLength(0);
  });

  test("sem login, a chave pública não lê dado de ninguém", async () => {
    const loja = await criarBarbeariaPronta();
    criarAtendimentoConcluido(loja, "Cliente Anônimo");
    const api = apiAnonima();
    // Controle: o que É público (a loja no ar) a chave pública lê.
    const publica = await api.from("barbershops").select("id").eq("id", loja.id);
    expect(publica.data).toHaveLength(1);

    for (const tabela of [
      "appointments",
      "customers",
      "transactions",
      "commissions",
      "profiles",
      "subscriptions",
      "email_messages",
      "whatsapp_messages",
    ] as const) {
      const r = await api.from(tabela).select("*").limit(5);
      expect(r.data ?? [], tabela).toHaveLength(0);
    }
  });

  test("cliente não entra no painel nem no admin", async ({ page }) => {
    const cliente = await criarCliente();
    await entrar(page, cliente.email, "cliente");
    for (const rota of ["/painel", "/painel/caixa", "/admin", "/admin/barbearias", "/assinatura"]) {
      await page.goto(rota);
      await expect(page, rota).toHaveURL(/\/app/);
    }
  });
});
