import { expect, test, type Page } from "@playwright/test";

import {
  criarAgendamento,
  criarAssistente,
  criarBarbeariaPronta,
  criarCliente,
  diaSP,
  entrar,
  executar,
  sql,
  type Loja,
} from "./apoio";

/**
 * O DIA A DIA DO BARBEIRO no painel: encaixar pelo balcão, concluir e
 * receber, falta, cancelar, fiado, comissão, pendências, equipe e a lista de
 * espera. Cada teste monta a própria loja com os atendimentos que precisa
 * (e2e/apoio.ts) e confere na tela E no banco.
 */

async function abrirAgenda(page: Page, loja: Loja, dia: number) {
  await entrar(page, loja.dono.email, "barbearia");
  await page.goto(`/painel/agenda?dia=${diaSP(dia)}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
}

/** Abre o atendimento na grade e conclui com a forma dada, pelo valor cheio. */
async function concluir(page: Page, cliente: string, forma: string) {
  await page
    .getByRole("button", { name: new RegExp(cliente) })
    .first()
    .click();
  await page.getByRole("button", { name: "Concluir atendimento" }).click();
  const dialogo = page.getByRole("dialog", { name: "Concluir atendimento" });
  await dialogo.getByRole("combobox", { name: "Forma" }).selectOption({ label: forma });
  await dialogo.getByRole("button", { name: /^Concluir e receber/ }).click();
  await expect(dialogo).toBeHidden();
}

test.describe("Agenda", () => {
  test("encaixa um cliente pelo balcão num horário vago", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    await abrirAgenda(page, loja, 1);

    await page.getByRole("button", { name: "Agendar 11:00 com Prof" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo agendamento" });
    await expect(dialogo.locator("#hora")).toHaveValue("11:00");
    await dialogo.locator("#novo-nome").fill("Encaixe Balcão");
    await dialogo.getByRole("button", { name: /Corte E2E/ }).click();
    await dialogo.getByRole("button", { name: "Agendar", exact: true }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole("button", { name: "11:00 Encaixe Balcão" })).toBeVisible();
    const [ag] = sql<{ source: string; status: string }>(
      `select source, status from appointments where barbershop_id = '${loja.id}'`,
    );
    expect(ag).toEqual({ source: "manual", status: "scheduled" });
  });

  test("conclui no Pix: entra no caixa e gera a comissão, que depois é paga", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const ag = criarAgendamento(loja, { cliente: "Pedro Pix", dia: -1, hora: "10:00" });
    await abrirAgenda(page, loja, -1);

    await concluir(page, "Pedro Pix", "Pix");

    const [feito] = sql<{ status: string; caixa: string; forma: string; comissao: string }>(`
      select a.status,
             (select sum(amount)::text from transactions t where t.appointment_id = a.id) as caixa,
             (select string_agg(distinct payment_method::text, ',') from transactions t where t.appointment_id = a.id) as forma,
             (select sum(amount)::text from commissions c where c.appointment_id = a.id) as comissao
        from appointments a where a.id = '${ag.id}'`);
    expect(feito).toEqual({ status: "completed", caixa: "40.00", forma: "pix", comissao: "16.00" });

    // Comissão em aberto → pagar.
    await page.goto("/painel/comissoes");
    await page.getByRole("button", { name: "Pagar comissão" }).first().click();
    const pagar = page.getByRole("dialog", { name: "Pagar comissão" });
    await expect(pagar.locator("#comissao-valor")).toHaveValue(/16/);
    await pagar
      .getByRole("button", { name: /^(Pagar|Registrar)/ })
      .last()
      .click();
    await expect(pagar).toBeHidden();

    await expect
      .poll(
        () =>
          sql<{ aberto: string }>(`
            select coalesce(sum(amount) filter (where status = 'pending'), 0)::text as aberto
              from commissions where appointment_id = '${ag.id}'`)[0]?.aberto,
      )
      .toBe("0");
  });

  test("marca falta", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const ag = criarAgendamento(loja, { cliente: "Fábio Faltou", dia: -1, hora: "15:00" });
    await abrirAgenda(page, loja, -1);

    await page.getByRole("button", { name: /Fábio Faltou/ }).click();
    await page.getByRole("button", { name: "Marcar falta" }).click();
    await expect
      .poll(
        () =>
          sql<{ status: string }>(`select status from appointments where id = '${ag.id}'`)[0]
            ?.status,
      )
      .toBe("no_show");
  });

  test("cancela pelo painel e o cliente é avisado por e-mail", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const email = `aviso-${Date.now()}@example.com`;
    const ag = criarAgendamento(loja, { cliente: "Carla Cancelada", dia: 1, hora: "16:00", email });
    await abrirAgenda(page, loja, 1);

    await page.getByRole("button", { name: /Carla Cancelada/ }).click();
    await page.getByRole("button", { name: "Cancelar agendamento" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();

    await expect
      .poll(
        () =>
          sql<{ status: string }>(`select status from appointments where id = '${ag.id}'`)[0]
            ?.status,
      )
      .toBe("cancelled");
    await expect
      .poll(() =>
        sql<{ kind: string; recipient: string }>(
          `select kind, recipient from email_messages where appointment_id = '${ag.id}'`,
        ),
      )
      .toEqual([{ kind: "cancelamento", recipient: email }]);
  });
});

test.describe("Fiado e pendências", () => {
  test("conclui no fiado, aparece na lista e é recebido depois", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    criarAgendamento(loja, { cliente: "Fernando Fiado", dia: -1, hora: "11:00" });
    await abrirAgenda(page, loja, -1);

    await concluir(page, "Fernando Fiado", "Fiado");

    await page.goto("/painel/fiado");
    await expect(page.getByText("Fernando Fiado").first()).toBeVisible();
    await page
      .getByRole("button", { name: /^Receber/ })
      .first()
      .click();
    const receber = page.getByRole("dialog", { name: "Receber fiado" });
    await receber.locator("#fiado-forma").selectOption({ label: "Dinheiro" });
    await receber.getByRole("button", { name: /^Registrar R\$/ }).click();
    await expect(receber).toBeHidden();

    await expect
      .poll(
        () =>
          sql<{ status: string }>(`
            select d.status from debts d join customers c on c.id = d.customer_id
             where c.barbershop_id = '${loja.id}'`)[0]?.status,
      )
      .toBe("paid");
    await expect(page.getByText("Ninguém devendo")).toBeVisible();
  });

  test("atendimentos esquecidos de ontem são concluídos em lote nas pendências", async ({
    page,
  }) => {
    const loja = await criarBarbeariaPronta();
    criarAgendamento(loja, { cliente: "Lote Um", dia: -1, hora: "09:00" });
    criarAgendamento(loja, { cliente: "Lote Dois", dia: -1, hora: "09:30" });
    await entrar(page, loja.dono.email, "barbearia");

    await page.goto("/painel/pendencias");
    await expect(page.getByText("Lote Um")).toBeVisible();
    await page.getByRole("button", { name: "Selecionar o dia todo" }).click();
    await expect(page.getByText("2 selecionados")).toBeVisible();
    // A barra de baixo abre a janela do lote; é nela que vai o valor.
    await page.getByRole("button", { name: "Concluir", exact: true }).last().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Concluir — R\$ 80,00/ })
      .click();

    await expect(page.getByText("Tudo em dia")).toBeVisible();
    const [total] = sql<{ concluidos: number; caixa: string }>(`
      select count(*) filter (where status = 'completed')::int as concluidos,
             (select sum(t.amount)::text from transactions t where t.barbershop_id = '${loja.id}') as caixa
        from appointments where barbershop_id = '${loja.id}'`);
    expect(total).toEqual({ concluidos: 2, caixa: "80.00" });
  });
});

test.describe("Equipe e lista de espera", () => {
  test("no plano Solo, não dá para ativar um segundo profissional", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    // Plano Solo pago e em dia: limite de 1 profissional ativo.
    executar(`
      update subscriptions set plan_id = 'solo', cycle = 'monthly', status = 'active',
             paid_until = now() + interval '20 days', trial_ends_at = now() - interval '1 day'
       where barbershop_id = '${loja.id}'`);
    await entrar(page, loja.dono.email, "barbearia");

    await page.goto("/painel/equipe");
    await page.getByRole("button", { name: "Novo profissional" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.locator("#prof-nome").fill("Segundo Barbeiro");
    await dialogo
      .getByRole("button", { name: /Salvar|Cadastrar|Adicionar/ })
      .last()
      .click();

    await expect(dialogo.getByRole("alert")).toContainText(/plano/i);
    expect(
      sql(`select 1 from professionals where barbershop_id = '${loja.id}' and is_active`),
    ).toHaveLength(1);
  });

  test("quem entrou na lista de espera aparece no painel e pode ser tirado", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const cliente = await criarCliente("Wagner Esperando");
    executar(`
      insert into waitlist_entries (barbershop_id, profile_id, desired_date, period)
      values ('${loja.id}', '${cliente.id}', '${diaSP(2)}', 'morning')`);
    await entrar(page, loja.dono.email, "barbearia");

    await page.goto("/painel/espera");
    await expect(page.getByText("Wagner Esperando")).toBeVisible();
    await page.getByRole("button", { name: "Tirar da fila" }).click();
    await page.getByRole("button", { name: "Tirar", exact: true }).click();
    await expect(page.getByText("Ninguém na lista de espera")).toBeVisible();
  });
});

test.describe("Detalhe do agendamento", () => {
  /**
   * Uma ficha com histórico: visitas, uma falta, observação, fiado em aberto e
   * e-mail (que NÃO pode aparecer no detalhe — a conta é da plataforma).
   */
  function fichaComHistorico(loja: Loja, cliente: string) {
    const ag = criarAgendamento(loja, {
      cliente,
      dia: 1,
      hora: "10:00",
      email: `${cliente.toLowerCase().replace(/ /g, ".")}@e2e.dev`,
    });
    executar(`
      update customers
         set total_visits = 3, total_spent = 120, no_show_count = 1,
             last_visit_at = now() - interval '10 days',
             notes = 'Máquina 2 nas laterais'
       where id = '${ag.customerId}';
      insert into debts (barbershop_id, customer_id, original_amount)
      values ('${loja.id}', '${ag.customerId}', 25);`);
    return ag;
  }

  async function abrirDetalhe(page: Page, cliente: string) {
    await page
      .getByRole("button", { name: new RegExp(cliente) })
      .first()
      .click();
    const painel = page.getByRole("dialog", { name: cliente });
    await expect(painel).toBeVisible();
    return painel;
  }

  test("no computador abre como painel lateral, com a ficha do cliente", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    fichaComHistorico(loja, "Diego Detalhe");
    await abrirAgenda(page, loja, 1);

    const painel = await abrirDetalhe(page, "Diego Detalhe");

    // Painel à direita, de ~440px e da altura da tela — não a gaveta de baixo.
    const caixa = await painel.boundingBox();
    const tela = page.viewportSize();
    expect(caixa && tela).toBeTruthy();
    expect(Math.round(caixa!.width)).toBe(440);
    expect(Math.round(caixa!.x + caixa!.width)).toBe(tela!.width);
    expect(Math.round(caixa!.height)).toBe(tela!.height);

    await expect(painel.getByText("Visitas")).toBeVisible();
    await expect(painel.getByText("Máquina 2 nas laterais")).toBeVisible();
    await expect(painel.getByRole("link", { name: /Fiado em aberto/ })).toHaveAttribute(
      "href",
      "/painel/fiado",
    );
    await expect(painel.getByText("Total gasto")).toBeVisible();
    await expect(painel.getByRole("link", { name: "Ver ficha completa" })).toBeVisible();
    await expect(painel.getByRole("button", { name: "Copiar telefone" })).toBeVisible();
    await expect(painel.getByText("@e2e.dev")).toHaveCount(0);

    // Esc fecha.
    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();
  });

  test("o assistente não recebe dado financeiro do cliente, mas vê o fiado", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    fichaComHistorico(loja, "Ana Assistida");
    const assistente = await criarAssistente(loja);
    await entrar(page, assistente.email, "barbearia");
    await page.goto(`/painel/agenda?dia=${diaSP(1)}`);

    const painel = await abrirDetalhe(page, "Ana Assistida");
    await expect(painel.getByText("Visitas")).toBeVisible();
    await expect(painel.getByText("Total gasto")).toHaveCount(0);
    await expect(painel.getByText("Ticket médio")).toHaveCount(0);
    await expect(painel.getByRole("link", { name: /Fiado em aberto/ })).toBeVisible();
  });

  test("cliente avulso (sem conta e sem celular) abre sem quebrar", async ({ page }) => {
    const loja = await criarBarbeariaPronta();
    const ag = criarAgendamento(loja, { cliente: "Cliente Avulso 7", dia: 1, hora: "15:00" });
    executar(
      `update customers set phone = null, is_walk_in = true where id = '${ag.customerId}'`,
    );
    await abrirAgenda(page, loja, 1);

    const painel = await abrirDetalhe(page, "Cliente Avulso 7");
    await expect(painel.getByText("Sem celular na ficha")).toBeVisible();
    await expect(painel.getByRole("button", { name: "Copiar telefone" })).toHaveCount(0);
    await expect(painel.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
    await expect(painel.getByRole("button", { name: "Concluir atendimento" })).toBeVisible();
  });
});
