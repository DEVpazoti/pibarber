import { expect, test } from "@playwright/test";

import { criarAgendamento, criarBarbeariaPronta, executar, sql, type Loja } from "./apoio";

/**
 * QUEM RECEBE O LEMBRETE DO WHATSAPP — a função `whatsapp_lembretes_pendentes`,
 * que o cron (/api/cron/whatsapp) consulta a cada 5 minutos.
 *
 * O envio em si não roda aqui: sem credencial da Meta o WhatsApp fica
 * desligado no ambiente de teste (e2e/ambiente.ts). O que decide QUEM recebe
 * é esta função, e é ela que testamos direto no banco.
 */

/** Um atendimento que começa daqui a `horas`, criado `criadoHaHoras` atrás. */
let proximaHora = 8;
function atendimento(loja: Loja, horas: number, criadoHaHoras: number): string {
  // Um horário de partida diferente por atendimento: o mesmo profissional não
  // pode ter dois sobrepostos (appointments_no_overlap).
  const hora = `${String(proximaHora++ % 20).padStart(2, "0")}:00`;
  const ag = criarAgendamento(loja, { cliente: "Cliente do Lembrete", dia: 2, hora });
  executar(`
    update appointments
       set starts_at  = now() + interval '${horas} hours',
           ends_at    = now() + interval '${horas} hours 30 minutes',
           created_at = now() - interval '${criadoHaHoras} hours'
     where id = '${ag.id}'`);
  return ag.id;
}

function pendentes(): string[] {
  return sql<{ id: string }>(`select id from whatsapp_lembretes_pendentes(1000) as id`).map(
    (r) => r.id,
  );
}

test.describe("Lembrete do WhatsApp", () => {
  test("quem marca DEPOIS das 18h da véspera recebe (33_lembrete_de_quem_marca_tarde)", async () => {
    const loja = await criarBarbeariaPronta();
    // Começa daqui a 3h e foi marcado há 10 minutos: sempre depois das 18h da
    // véspera. Antes da 33, este ficava sem mensagem nenhuma.
    const id = atendimento(loja, 3, 0.2);
    expect(pendentes()).toContain(id);
  });

  test("quem marca com antecedência continua recebendo", async () => {
    const loja = await criarBarbeariaPronta();
    const id = atendimento(loja, 20, 72);
    expect(pendentes()).toContain(id);
  });

  test("os filtros de sempre continuam: loja desligada, cancelado, sem celular, já enviado", async () => {
    const loja = await criarBarbeariaPronta();
    const desligada = await criarBarbeariaPronta();
    executar(
      `update barbershops set whatsapp_reminder_enabled = false where id = '${desligada.id}'`,
    );

    const naLojaDesligada = atendimento(desligada, 5, 1);
    const cancelado = atendimento(loja, 4, 1);
    executar(`update appointments set status = 'cancelled' where id = '${cancelado}'`);
    const semCelular = atendimento(loja, 6, 1);
    // Sem celular só existe como cliente avulso (customers_avulso_sem_telefone).
    executar(`update customers set is_walk_in = true, phone = null
               where id = (select customer_id from appointments where id = '${semCelular}')`);
    const jaNaFila = atendimento(loja, 8, 1);
    executar(`update appointments set reminder_sent_at = now() where id = '${jaNaFila}'`);
    const foraDaJanela = atendimento(loja, 60, 1);

    const lista = pendentes();
    for (const [nome, id] of Object.entries({
      naLojaDesligada,
      cancelado,
      semCelular,
      jaNaFila,
      foraDaJanela,
    })) {
      expect(lista, nome).not.toContain(id);
    }
  });
});
