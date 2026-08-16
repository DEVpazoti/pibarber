/**
 * Monta um sábado movimentado na Navalha & Cia, para as capturas da landing.
 *
 *   node scripts/dia-de-demonstracao.mjs --criar
 *   node scripts/dia-de-demonstracao.mjs --desfazer
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O seed espalha os atendimentos por uma janela que termina antes de hoje, e o
 * dia mais cheio de qualquer uma das quatro lojas tem 4 atendimentos. As telas
 * "Hoje" e "Agenda" saíam praticamente vazias na captura — e a landing precisa
 * mostrar o produto trabalhando, não um grid em branco.
 *
 * COMO ELE ESCREVE
 * ----------------
 * Só pelas funções de verdade — `book_appointment` e `complete_appointment` —,
 * chamadas pela REST API com o token do próprio dono. Nada de INSERT na mão:
 * assim o caixa, a comissão, o fiado e os contadores do cliente ficam
 * exatamente como ficariam se o barbeiro tivesse clicado, e a RLS é exercitada
 * de quebra.
 *
 * ⚠️ ESCREVE NO BANCO DE VERDADE. Não há ambiente de teste.
 *
 * O DESFAZER
 * ----------
 * O `--criar` guarda os ids em scripts/.dia-de-demonstracao.json; o `--desfazer`
 * gera um SQL a partir desse arquivo e o executa por `supabase/aplicar-sql.mjs`.
 *
 * Ele devolve ao estado anterior: agendamentos, serviços do agendamento,
 * comissões, entradas de caixa, fiado e notificações. O que ele NÃO restaura é
 * `customers.total_visits / total_spent / last_visit_at`, que o
 * `complete_appointment` incrementa — recalculá-los daria uma conta que só o
 * próprio banco sabe fazer direito. São contadores de vitrine, e ficam altos.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRO = path.join(RAIZ, "scripts", ".dia-de-demonstracao.json");
const SQL_TEMP = path.join(RAIZ, "supabase", "_desfazer_demonstracao.sql");

const LOJA = "b3a45aab-70f7-4c9e-8622-123da7182a05"; // Navalha & Cia
const DONO = { email: "dono.saopaulo@pibarber.dev", senha: "pibarber123" };

const PROFISSIONAL = {
  Ricardo: "f8a3923c-1337-4a45-b4c5-0f4b2a8b524c",
  Bruninho: "83159fd9-edea-4803-88e0-ccc873b2ef1b",
  Caio: "8c93f6e3-c85d-43d4-a257-873fb96b9997",
};

const SERVICO = {
  platinado: "ee8074d0-3a5e-4b6c-9211-590ff12f862a", // 142,50 · 120min
  corteBarba: "63285b29-a2b0-476c-8b0b-022ef390e2f8", //  66,50 ·  60min
  degrade: "d2969f73-bdc0-4737-a476-9275febbc36d", //  42,75 ·  40min
  social: "7315eca5-a1a4-4e69-9f83-3defb95e93e9", //  38,00 ·  30min
  barbaModelada: "551fb00e-45b0-4a9a-80e7-204855c82684", //  33,25 ·  30min
  barba: "de0615db-a835-4a25-ad4b-50d94e4753e6", //  28,50 ·  25min
  pezinho: "10588a21-d8a5-45ea-847c-00ca74ecd34a", //  14,25 ·  15min
  sobrancelha: "cd0836ec-1155-4bc2-9d97-71d9627e6795", //  14,25 ·  15min
};

// A ficha é casada pelo telefone dentro da barbearia (é o que book_appointment
// faz), então usar os telefones do seed reaproveita os clientes que já existem
// em vez de criar oito fichas novas iguais.
const CLIENTE = {
  diego: { nome: "Diego Ramos", fone: "11910000274" },
  fernando: { nome: "Fernando Costa", fone: "11910000548" },
  gabriel: { nome: "Gabriel Oliveira", fone: "11910000959" },
  lucas: { nome: "Lucas Martins", fone: "11910000822" },
  marcos: { nome: "Marcos Vinícius Souza", fone: "11910000137" },
  paulo: { nome: "Paulo Henrique Lima", fone: "11910000411" },
  rodrigo: { nome: "Rodrigo Alves", fone: "11910000685" },
  tiago: { nome: "Tiago Barbosa", fone: "11910001096" },
};

/**
 * O sábado, hora a hora. A loja abre 08:00 e fecha 17:00.
 *
 * `pago` presente = o atendimento é concluído; ausente = fica agendado, e é o
 * que faz a tela Hoje ter botão "Concluir" e a agenda ter horário à frente.
 * O corte é o relógio: o que já terminou aparece concluído, o que ainda vai
 * acontecer aparece marcado — senão a captura mostraria um 16h já pago às 15h.
 */
const DIA = [
  // --- Ricardo (45% de comissão) -------------------------------------------
  { prof: "Ricardo", hora: "08:00", cliente: "marcos", servicos: ["corteBarba"], pago: [["cash", 66.5]] },
  { prof: "Ricardo", hora: "09:15", cliente: "diego", servicos: ["degrade"], pago: [["pix", 42.75]] },
  { prof: "Ricardo", hora: "10:00", cliente: "gabriel", servicos: ["social"], pago: [["debit", 38]] },
  { prof: "Ricardo", hora: "11:00", cliente: "rodrigo", servicos: ["platinado"], pago: [["credit", 142.5]] },
  { prof: "Ricardo", hora: "13:15", cliente: "tiago", servicos: ["corteBarba"], pago: [["pix", 66.5]] },
  { prof: "Ricardo", hora: "14:30", cliente: "fernando", servicos: ["degrade"], pago: [["cash", 42.75]] },
  { prof: "Ricardo", hora: "15:30", cliente: "paulo", servicos: ["social"] },
  { prof: "Ricardo", hora: "16:15", cliente: "lucas", servicos: ["barba"] },

  // --- Bruninho (40%) -------------------------------------------------------
  { prof: "Bruninho", hora: "09:45", cliente: "paulo", servicos: ["social"], pago: [["pix", 38]] },
  { prof: "Bruninho", hora: "10:30", cliente: "fernando", servicos: ["corteBarba"], pago: [["cash", 66.5]] },
  { prof: "Bruninho", hora: "11:45", cliente: "marcos", servicos: ["degrade"], pago: [["credit", 42.75]] },
  { prof: "Bruninho", hora: "13:00", cliente: "diego", servicos: ["barbaModelada"], pago: [["cash", 33.25]] },
  // Pagamento dividido: é a funcionalidade que a landing vende em "Caixa que
  // fecha" ("R$ 40 no pix e R$ 20 no fiado"), então precisa existir no extrato.
  { prof: "Bruninho", hora: "14:00", cliente: "rodrigo", servicos: ["social"], pago: [["cash", 20], ["fiado", 18]], vencimento: 20 },
  { prof: "Bruninho", hora: "15:30", cliente: "gabriel", servicos: ["corteBarba"] },
  { prof: "Bruninho", hora: "16:30", cliente: "tiago", servicos: ["pezinho"] },

  // --- Caio (40%) -----------------------------------------------------------
  { prof: "Caio", hora: "08:30", cliente: "rodrigo", servicos: ["degrade"], pago: [["pix", 42.75]] },
  { prof: "Caio", hora: "09:30", cliente: "tiago", servicos: ["social"], pago: [["cash", 38]] },
  { prof: "Caio", hora: "10:15", cliente: "paulo", servicos: ["corteBarba"], pago: [["credit", 66.5]] },
  { prof: "Caio", hora: "11:30", cliente: "gabriel", servicos: ["barba"], pago: [["pix", 28.5]] },
  { prof: "Caio", hora: "12:15", cliente: "marcos", servicos: ["degrade"], pago: [["cash", 42.75]] },
  { prof: "Caio", hora: "14:00", cliente: "diego", servicos: ["social"], pago: [["pix", 38]] },
  { prof: "Caio", hora: "15:20", cliente: "fernando", servicos: ["corteBarba"] },
  { prof: "Caio", hora: "16:30", cliente: "lucas", servicos: ["sobrancelha"] },
];

/* -------------------------------------------------------------------------- */

function lerEnv() {
  const arquivo = path.join(RAIZ, ".env.local");
  if (!existsSync(arquivo)) throw new Error(".env.local não encontrado");
  const env = {};
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Hoje no fuso de São Paulo. Nunca `new Date().toISOString()` — ver armadilha nº15. */
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function somarDias(diaISO, dias) {
  const t = Date.parse(`${diaISO}T12:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

class Api {
  constructor(url, anon, token) {
    this.url = url;
    this.anon = anon;
    this.token = token;
  }

  static async entrar(url, anon, { email, senha }) {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "content-type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    });
    const corpo = await r.json();
    if (!r.ok) throw new Error(`login falhou (${r.status}): ${JSON.stringify(corpo)}`);
    return new Api(url, anon, corpo.access_token);
  }

  async rpc(nome, args) {
    const r = await fetch(`${this.url}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: {
        apikey: this.anon,
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${nome} devolveu ${r.status}: ${texto}`);
    return texto ? JSON.parse(texto) : null;
  }
}

/* -------------------------------------------------------------------------- */

async function criar() {
  if (existsSync(REGISTRO)) {
    throw new Error(
      `já existe um dia de demonstração criado (${path.relative(RAIZ, REGISTRO)}).\n` +
        `  Rode --desfazer antes de criar outro.`,
    );
  }

  const env = lerEnv();
  const api = await Api.entrar(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DONO);
  const hoje = hojeSP();
  console.log(`Dia: ${hoje} · loja: Navalha & Cia\n`);

  const criados = [];
  let concluidos = 0;
  let entrou = 0;

  for (const item of DIA) {
    const cliente = CLIENTE[item.cliente];
    const id = await api.rpc("book_appointment", {
      p_shop: LOJA,
      p_professional: PROFISSIONAL[item.prof],
      // -03:00 fixo: o fuso resolvido no servidor é o de São Paulo, e string
      // de data sem offset viraria UTC (armadilha nº15).
      p_quando: `${hoje}T${item.hora}:00-03:00`,
      p_service_ids: item.servicos.map((s) => SERVICO[s]),
      p_nome: cliente.nome,
      p_telefone: cliente.fone,
      p_source: "manual",
    });

    criados.push(id);
    let marca = "agendado";

    if (item.pago) {
      await api.rpc("complete_appointment", {
        p_appointment: id,
        p_pagamentos: item.pago.map(([method, amount]) => ({ method, amount })),
        p_desconto: 0,
        p_vencimento: item.vencimento ? somarDias(hoje, item.vencimento) : null,
      });
      concluidos++;
      entrou += item.pago
        .filter(([metodo]) => metodo !== "fiado")
        .reduce((soma, [, valor]) => soma + valor, 0);
      marca = `concluído · ${item.pago.map(([m, v]) => `${m} ${v.toFixed(2)}`).join(" + ")}`;
    }

    console.log(`  ${item.hora} ${item.prof.padEnd(9)} ${cliente.nome.padEnd(23)} ${marca}`);
  }

  writeFileSync(REGISTRO, JSON.stringify({ dia: hoje, loja: LOJA, agendamentos: criados }, null, 2));

  console.log(`\n✓ ${criados.length} agendamentos · ${concluidos} concluídos`);
  console.log(`  entrou no caixa hoje: R$ ${entrou.toFixed(2)}`);
  console.log(`  registro: ${path.relative(RAIZ, REGISTRO)}`);
}

async function desfazer() {
  if (!existsSync(REGISTRO)) throw new Error("não há dia de demonstração registrado para desfazer");
  const { agendamentos } = JSON.parse(readFileSync(REGISTRO, "utf8"));
  const lista = agendamentos.map((id) => `'${id}'`).join(",\n    ");

  // A ordem importa: `transactions` e `debts` referenciam o agendamento com
  // `on delete set null`, então sobreviveriam à cascata — a entrada de caixa
  // continuaria somando, agora sem origem. As duas saem antes.
  //
  // `notifications` não tem FK para o agendamento: o vínculo é o `link`, que é
  // a URL do atendimento. Daí o casamento por texto.
  const sql = `-- Gerado por scripts/dia-de-demonstracao.mjs --desfazer. Descartável.
begin;

create temporary table alvo (id uuid primary key) on commit drop;
insert into alvo (id) values
  ${agendamentos.map((id) => `('${id}')`).join(",\n  ")};

delete from debt_payments where debt_id in (
  select id from debts where appointment_id in (select id from alvo));
delete from debts        where appointment_id in (select id from alvo);
delete from transactions where appointment_id in (select id from alvo);
delete from notifications n
 where exists (select 1 from alvo a where n.link like '%' || a.id::text || '%');

-- commissions, appointment_services e reviews saem por cascata.
delete from appointments where id in (select id from alvo);

do $$
declare v_sobrou integer;
begin
  select count(*) into v_sobrou from appointments where id in (
    ${lista}
  );
  if v_sobrou > 0 then
    raise exception 'sobraram % agendamentos de demonstração', v_sobrou;
  end if;
end $$;

commit;
`;

  writeFileSync(SQL_TEMP, sql);
  const r = spawnSync("node", [path.join(RAIZ, "supabase", "aplicar-sql.mjs"), SQL_TEMP], {
    stdio: "inherit",
    cwd: RAIZ,
  });
  unlinkSync(SQL_TEMP);
  if (r.status !== 0) throw new Error("o SQL de desfazer falhou — o registro foi mantido");

  unlinkSync(REGISTRO);
  console.log(`\n✓ ${agendamentos.length} agendamentos de demonstração removidos`);
  console.log("  os contadores de visita/gasto dos clientes NÃO foram revertidos (ver cabeçalho)");
}

/* -------------------------------------------------------------------------- */

const modo = process.argv[2];
const acao = modo === "--criar" ? criar : modo === "--desfazer" ? desfazer : null;

if (!acao) {
  console.error("uso: node scripts/dia-de-demonstracao.mjs --criar | --desfazer");
  process.exit(1);
}

acao().catch((erro) => {
  console.error(`\n✖ ${erro.message}`);
  process.exit(1);
});
