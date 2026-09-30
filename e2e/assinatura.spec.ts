import { expect, test } from "@playwright/test";

import { ASAAS_WEBHOOK_TOKEN, CRON_SECRET } from "./ambiente";
import { criarBarbeariaPronta, entrar, executar, simularPagamento, sql, unico } from "./apoio";

/**
 * A ASSINATURA (26_assinaturas.sql): o teste grátis acaba e a loja pausa; o
 * pagamento chega pelo webhook do Asaas e ela volta na hora. E os avisos de
 * cobrança por e-mail, que saem pelo cron.
 */

test.describe("Assinatura", () => {
  test("teste acabou: painel pausa e a página pública para de agendar; pagou: volta", async ({
    page,
    request,
  }) => {
    const loja = await criarBarbeariaPronta("Loja Vencida");
    // O teste grátis acabou ontem, sem plano pago. Antes de qualquer visita:
    // a página pública guarda "aceita agendamento" em cache.
    executar(`update subscriptions set trial_ends_at = now() - interval '1 day'
               where barbershop_id = '${loja.id}'`);

    // --- Pausada ---------------------------------------------------------------
    await page.goto(`/b/${loja.slug}`);
    await expect(page.getByRole("heading", { name: loja.nome })).toBeVisible();
    await expect(page.locator(`a[href="/b/${loja.slug}/agendar"]`)).toHaveCount(0);

    await entrar(page, loja.dono.email, "barbearia");
    await page.goto("/painel/agenda");
    await expect(page).toHaveURL(/\/assinatura/);

    // --- O Asaas avisa que pagou ------------------------------------------------
    await simularPagamento(loja.id, request);

    const [assinatura] = sql<{ status: string; pago: boolean }>(`
      select status, paid_until > now() + interval '25 days' as pago
        from subscriptions where barbershop_id = '${loja.id}'`);
    expect(assinatura).toEqual({ status: "active", pago: true });

    await page.goto("/painel/agenda");
    await expect(page).toHaveURL(/\/painel\/agenda/);

    await page.context().clearCookies();
    await page.goto(`/b/${loja.slug}`);
    await expect(page.locator(`a[href="/b/${loja.slug}/agendar"]`).first()).toBeVisible();

    // E o dono recebe o "pagamento confirmado" na próxima rodada do cron.
    const cron = await request.post("/api/cron/emails", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cron.status()).toBe(200);
    expect(
      sql(`select 1 from email_messages where barbershop_id = '${loja.id}' and kind = 'pagamento'`),
    ).toHaveLength(1);
  });

  test("teste acabando em 3 dias: o cron avisa o dono por e-mail, uma vez só", async ({
    request,
  }) => {
    const loja = await criarBarbeariaPronta("Loja Quase");
    executar(`update subscriptions set trial_ends_at = now() + interval '2 days 12 hours'
               where barbershop_id = '${loja.id}'`);

    for (let i = 0; i < 2; i++) {
      const r = await request.post("/api/cron/emails", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      expect(r.status()).toBe(200);
    }

    const emails = sql<{ kind: string; recipient: string; status: string }>(`
      select kind, recipient, status from email_messages where barbershop_id = '${loja.id}'`);
    expect(emails).toEqual([{ kind: "teste_3d", recipient: loja.dono.email, status: "sent" }]);
  });

  test("webhook do Asaas sem o token certo é recusado e não libera nada", async ({ request }) => {
    const loja = await criarBarbeariaPronta();
    const assinatura = unico("sub");
    executar(`update subscriptions set asaas_subscription_id = '${assinatura}', trial_ends_at = now() - interval '1 day'
               where barbershop_id = '${loja.id}'`);

    for (const token of [undefined, "token-errado"]) {
      const r = await request.post("/api/webhooks/asaas", {
        headers: token ? { "asaas-access-token": token } : {},
        data: {
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: unico("pay"),
            subscription: assinatura,
            status: "CONFIRMED",
            value: 1,
            dueDate: "2026-01-01",
          },
        },
      });
      expect(r.status()).toBe(401);
    }

    const [s] = sql<{ paid_until: string | null }>(
      `select paid_until from subscriptions where barbershop_id = '${loja.id}'`,
    );
    expect(s?.paid_until).toBeNull();
    expect(ASAAS_WEBHOOK_TOKEN).not.toBe("token-errado");
  });

  test("cron sem o segredo é recusado", async ({ request }) => {
    for (const rota of ["/api/cron/emails", "/api/cron/whatsapp"]) {
      const sem = await request.post(rota);
      expect(sem.status(), rota).toBe(401);
      const errado = await request.post(rota, { headers: { Authorization: "Bearer errado" } });
      expect(errado.status(), rota).toBe(401);
    }
  });
});
