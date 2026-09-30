import { expect, test, type APIRequestContext } from "@playwright/test";

import { CRON_SECRET } from "./ambiente";
import {
  criarAdmin,
  criarAgendamento,
  criarBarbeariaPronta,
  entrar,
  executar,
  sql,
  type Loja,
} from "./apoio";

/**
 * OS E-MAILS QUE SAEM PELO CRON (31_emails.sql): o lembrete de voltar
 * (marketing) com o descadastro, o intervalo que o /admin define, e o lembrete
 * da véspera. Os avisos imediatos (agendar/cancelar) estão em cliente.spec.ts
 * e painel.spec.ts.
 *
 * EM SÉRIE: o intervalo do lembrete de voltar é da PLATAFORMA — mudar ele num
 * teste mudaria o de outro rodando ao lado. O último teste o devolve a 21.
 */
test.describe.configure({ mode: "serial" });

async function rodarCron(request: APIRequestContext) {
  const r = await request.post("/api/cron/emails", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(r.status()).toBe(200);
}

/** Um cliente com e-mail cuja última visita foi há `dias` dias. */
function clienteSumido(loja: Loja, dias: number, email: string): string {
  const [ficha] = sql<{ id: string }>(`
    insert into customers (barbershop_id, full_name, phone, email, last_visit_at, total_visits)
    values ('${loja.id}', 'Sumido da Silva', '169${String(Date.now()).slice(-8)}', '${email}',
            now() - interval '${dias} days', 3)
    returning id`);
  return ficha!.id;
}

function emailsDe(loja: Loja, tipo: string) {
  return sql<{ id: string; recipient: string; status: string }>(
    `select id, recipient, status from email_messages
      where barbershop_id = '${loja.id}' and kind = '${tipo}' order by created_at`,
  );
}

test.describe("Lembrete de voltar", () => {
  test("sai para quem sumiu, e o descadastro funciona e é respeitado", async ({
    page,
    request,
  }) => {
    const loja = await criarBarbeariaPronta("Volta Teste");
    const email = `sumido-${Date.now()}@example.com`;
    const ficha = clienteSumido(loja, 25, email);

    await rodarCron(request);
    const [lembrete] = emailsDe(loja, "recorrencia");
    expect(lembrete).toMatchObject({ recipient: email });

    // Abrir o link NÃO descadastra (antivírus abrem links sozinhos)…
    await page.goto(`/sair/${lembrete!.id}`);
    await expect(page.getByText(email)).toBeVisible();
    expect(sql(`select 1 from email_opt_outs where email = '${email}'`)).toHaveLength(0);

    // …o botão, sim.
    await page.getByRole("button", { name: "Parar de receber desta barbearia" }).click();
    await expect(page.getByRole("heading", { name: "Pronto" })).toBeVisible();
    expect(
      sql<{ loja: string }>(
        `select barbershop_id::text as loja from email_opt_outs where email = '${email}'`,
      ),
    ).toEqual([{ loja: loja.id }]);

    // Voltou e sumiu de novo: um ciclo novo — mas ele saiu da lista.
    executar(
      `update customers set last_visit_at = now() - interval '26 days' where id = '${ficha}'`,
    );
    await rodarCron(request);
    expect(emailsDe(loja, "recorrencia")).toHaveLength(1);
  });

  test("descadastro de um clique (o botão do Gmail) funciona sem login", async ({ request }) => {
    const loja = await criarBarbeariaPronta();
    const email = `umclique-${Date.now()}@example.com`;
    clienteSumido(loja, 22, email);
    await rodarCron(request);
    const [lembrete] = emailsDe(loja, "recorrencia");

    const r = await request.post(`/api/emails/sair/${lembrete!.id}`);
    expect(r.status()).toBe(200);
    expect(sql(`select 1 from email_opt_outs where email = '${email}'`)).toHaveLength(1);
  });

  test("loja que desligou o lembrete não manda nada", async ({ request }) => {
    const loja = await criarBarbeariaPronta();
    executar(`update barbershops set email_marketing_enabled = false where id = '${loja.id}'`);
    clienteSumido(loja, 25, `desligado-${Date.now()}@example.com`);
    await rodarCron(request);
    expect(emailsDe(loja, "recorrencia")).toHaveLength(0);
  });

  test("quem já tem horário marcado não recebe", async ({ request }) => {
    const loja = await criarBarbeariaPronta();
    const email = `marcado-${Date.now()}@example.com`;
    const ficha = clienteSumido(loja, 25, email);
    const ag = criarAgendamento(loja, { cliente: "qualquer", dia: 3, hora: "10:00" });
    executar(`update appointments set customer_id = '${ficha}' where id = '${ag.id}'`);
    await rodarCron(request);
    expect(emailsDe(loja, "recorrencia")).toHaveLength(0);
  });

  test("o intervalo é o do /admin: com 40 dias, quem sumiu há 25 ainda não recebe", async ({
    page,
    request,
  }) => {
    const admin = await criarAdmin();
    await entrar(page, admin.email, "barbearia");
    await page.goto("/admin/emails");
    const campo = page.locator("#volta-dias");
    await campo.fill("40");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Salvo: 40 dias.")).toBeVisible();

    try {
      const loja = await criarBarbeariaPronta();
      clienteSumido(loja, 25, `cedo-${Date.now()}@example.com`);
      await rodarCron(request);
      expect(emailsDe(loja, "recorrencia")).toHaveLength(0);

      clienteSumido(loja, 45, `tarde-${Date.now()}@example.com`);
      await rodarCron(request);
      expect(emailsDe(loja, "recorrencia")).toHaveLength(1);
    } finally {
      // Devolve o padrão, aconteça o que acontecer.
      await campo.fill("21");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo: 21 dias.")).toBeVisible();
    }
  });
});

test.describe("Lembrete da véspera", () => {
  test("quem tem horário amanhã entra na fila para as 18h de hoje", async ({ request }) => {
    const loja = await criarBarbeariaPronta();
    const email = `amanha-${Date.now()}@example.com`;
    criarAgendamento(loja, { cliente: "Amanhã Cedo", dia: 1, hora: "09:00", email });

    await rodarCron(request);
    const [lembrete] = sql<{ recipient: string; as_18h: boolean }>(`
      select recipient,
             to_char(greatest(scheduled_for, created_at) at time zone 'America/Sao_Paulo', 'HH24:MI') >= '18:00'
               or status = 'sent' as as_18h
        from email_messages where barbershop_id = '${loja.id}' and kind = 'lembrete'`);
    expect(lembrete).toEqual({ recipient: email, as_18h: true });

    // Rodar o cron de novo não duplica.
    await rodarCron(request);
    expect(
      sql(`select 1 from email_messages where barbershop_id = '${loja.id}' and kind = 'lembrete'`),
    ).toHaveLength(1);
  });
});
