/**
 * Gera as capturas de tela do visualizador "veja por dentro" da landing.
 *
 * Ele NÃO monta mockup: abre o sistema de verdade no Chrome, loga com as contas
 * de teste e fotografa a tela como ela é. Todo dado que aparece nas imagens vem
 * do seed, que é inteiramente fictício — nome, telefone e valor são inventados.
 *
 *   node scripts/capturar-telas.mjs                # tudo
 *   node scripts/capturar-telas.mjs painel         # só as telas do dono
 *   node scripts/capturar-telas.mjs cliente        # só as telas do app
 *
 * Pré-requisito: o dev server no ar em http://localhost:3001.
 *
 *   npm run dev -- --port 3001 > dev.log 2>&1
 *
 * As imagens saem em public/capturas/. Os nomes de arquivo são contrato com
 * src/components/landing/VejaPorDentro.tsx — se renomear aqui, renomeie lá.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const SENHA = "pibarber123";
const SAIDA = path.join(process.cwd(), "public", "capturas");
const PORTA_CDP = 9333;

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

/* -------------------------------------------------------------------------- */
/* As telas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * O painel é desktop-first (ver §1 do CONTEXTO_MELHORIAS_V1.md), então é numa
 * tela grande que ele deve ser fotografado — é assim que o dono o conhece.
 *
 * A conta é a do dono da Navalha & Cia: é a loja mais completa do banco
 * (30 avaliações, 6 benefícios, equipe cheia), então nenhuma tela sai vazia.
 */
const PAINEL = {
  conta: "dono.saopaulo@pibarber.dev",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
  telas: [
    { arquivo: "painel-hoje", rota: "/painel" },
    { arquivo: "painel-agenda", rota: "/painel/agenda" },
    // Caixa e Relatórios abrem no mês por padrão, e o mês inclui o aluguel de
    // R$ 1.800 lançado no dia 1º contra meia dúzia de dias de faturamento —
    // "SOBROU −R$ 1.492,50" em vermelho na landing. `?p=semana` é o mesmo dado,
    // no recorte que o dono realmente olha no sábado à tarde.
    { arquivo: "painel-caixa", rota: "/painel/caixa?p=semana" },
    { arquivo: "painel-comissoes", rota: "/painel/comissoes" },
    { arquivo: "painel-relatorios", rota: "/painel/relatorios?p=semana" },
    // As quatro abaixo entraram com o ajuste nº 3: a galeria da landing tinha
    // cinco telas do painel e o dono queria ver o sistema por dentro antes de
    // falar com a gente. Estas são as que respondem "e o resto, como é?".
    { arquivo: "painel-clientes", rota: "/painel/clientes" },
    { arquivo: "painel-fiado", rota: "/painel/fiado" },
    { arquivo: "painel-equipe", rota: "/painel/equipe" },
    { arquivo: "painel-servicos", rota: "/painel/servicos" },
  ],
};

/**
 * O app do cliente é mobile-first, e é num celular que ele vive. 390×844 é o
 * iPhone 14/15 — `mobile: true` importa: sem ele o Chrome usa largura mínima
 * de layout de desktop e a captura sai errada (armadilha nº1 do ESTADO.md).
 */
const CLIENTE = {
  conta: "cliente1@pibarber.dev",
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  telas: [
    { arquivo: "app-inicio", rota: "/app" },
    { arquivo: "app-buscar", rota: "/app/buscar" },
    { arquivo: "app-agendamentos", rota: "/app/agendamentos" },
    { arquivo: "app-perfil", rota: "/app/perfil" },
    // Ajuste nº 3. A página pública e o passo a passo do agendamento são o que
    // o dono manda para o cliente dele — ver as duas na landing responde
    // "como é que o meu cliente marca?" sem precisar perguntar.
    { arquivo: "app-barbearia", rota: "/b/navalha-e-cia" },
    { arquivo: "app-agendar", rota: "/b/navalha-e-cia/agendar" },
  ],
};

/* -------------------------------------------------------------------------- */
/* CDP mínimo — sem dependência nova                                           */
/* -------------------------------------------------------------------------- */

class CDP {
  #ws;
  #proximoId = 1;
  #pendentes = new Map();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener("message", (evento) => {
      const msg = JSON.parse(evento.data);
      const espera = this.#pendentes.get(msg.id);
      if (!espera) return;
      this.#pendentes.delete(msg.id);
      if (msg.error) espera.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
      else espera.resolve(msg.result);
    });
  }

  static async conectar(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("WebSocket do Chrome recusou a conexão")), { once: true });
    });
    return new CDP(ws);
  }

  enviar(method, params = {}, sessionId) {
    const id = this.#proximoId++;
    const pacote = sessionId ? { id, method, params, sessionId } : { id, method, params };
    this.#ws.send(JSON.stringify(pacote));
    return new Promise((resolve, reject) => this.#pendentes.set(id, { resolve, reject }));
  }

  fechar() {
    this.#ws.close();
  }
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* A aba                                                                       */
/* -------------------------------------------------------------------------- */

class Aba {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sid = sessionId;
  }

  chamar(method, params) {
    return this.cdp.enviar(method, params, this.sid);
  }

  async avaliar(expressao) {
    const r = await this.chamar("Runtime.evaluate", {
      expression: expressao,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`JS quebrou na página: ${r.exceptionDetails.text} — ${expressao.slice(0, 80)}`);
    }
    return r.result.value;
  }

  async irPara(rota) {
    await this.chamar("Page.navigate", { url: `${BASE}${rota}` });
    await this.esperarPronta();
  }

  /**
   * `readyState === complete` sozinho não basta: as fontes do next/font chegam
   * depois e a primeira pintura sai com fallback, o que estraga a captura. Daí
   * o document.fonts.ready e a folga extra — em dev o servidor ainda compila a
   * rota sob demanda.
   */
  async esperarPronta({ folga = 1200 } = {}) {
    for (let tentativa = 0; tentativa < 120; tentativa++) {
      const pronta = await this.avaliar("document.readyState === 'complete'").catch(() => false);
      if (pronta) break;
      await dormir(250);
    }
    await this.avaliar("document.fonts.ready.then(() => true)").catch(() => {});
    await dormir(folga);
  }

  async caminho() {
    return this.avaliar("location.pathname");
  }

  async emular({ width, height, deviceScaleFactor, mobile }) {
    await this.chamar("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    if (mobile) {
      await this.chamar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    }
  }

  async fotografar(arquivo) {
    const { data } = await this.chamar("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const destino = path.join(SAIDA, `${arquivo}.png`);
    await writeFile(destino, Buffer.from(data, "base64"));
    return destino;
  }
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O Chrome guarda a sessão entre navegações: sem limpar os cookies, trocar de
 * conta cai direto no painel da conta anterior e o formulário nem existe —
 * é a armadilha nº13 do ESTADO.md, e ela falha com um erro que não explica nada.
 */
async function entrar(aba, email) {
  await aba.chamar("Network.clearBrowserCookies");
  await aba.irPara("/entrar");

  const achou = await aba.avaliar(`!!document.querySelector('input[name="email"]')`);
  if (!achou) throw new Error("o formulário de login não apareceu em /entrar");

  // Os dois campos são inputs não controlados (FormEntrar usa useActionState com
  // <form action>), então atribuir .value direto basta — não é preciso mexer no
  // setter nativo do React.
  await aba.avaliar(`
    (() => {
      const f = document.querySelector('form');
      f.querySelector('input[name="email"]').value = ${JSON.stringify(email)};
      f.querySelector('input[name="senha"]').value = ${JSON.stringify(SENHA)};
      f.requestSubmit();
      return true;
    })()
  `);

  for (let tentativa = 0; tentativa < 120; tentativa++) {
    await dormir(500);
    const onde = await aba.caminho();
    if (onde && !onde.startsWith("/entrar")) {
      await aba.esperarPronta();
      return onde;
    }
    const erro = await aba.avaliar(
      `(document.querySelector('[role="alert"]')?.textContent ?? '').trim()`,
    );
    if (erro) throw new Error(`login recusado para ${email}: ${erro}`);
  }
  throw new Error(`login de ${email} não saiu de /entrar em 60s`);
}

/* -------------------------------------------------------------------------- */
/* Uma rodada                                                                  */
/* -------------------------------------------------------------------------- */

async function capturar(aba, grupo, rotulo) {
  console.log(`\n▸ ${rotulo} — ${grupo.conta}`);
  await aba.emular(grupo.viewport);
  const destino = await entrar(aba, grupo.conta);
  console.log(`  login ok → ${destino}`);

  for (const tela of grupo.telas) {
    await aba.irPara(tela.rota);
    const onde = await aba.caminho();
    const esperado = tela.rota.split("?")[0];
    if (onde !== esperado) {
      // Desvio quer dizer guarda de papel barrando a conta. Capturar assim
      // publicaria a tela errada na landing, então é erro, não aviso.
      throw new Error(`${tela.rota} desviou para ${onde} — conta sem acesso?`);
    }
    const arquivo = await aba.fotografar(tela.arquivo);
    console.log(`  ✓ ${tela.rota} → ${path.relative(process.cwd(), arquivo)}`);
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const alvo = process.argv[2] ?? "tudo";
  if (!["tudo", "painel", "cliente"].includes(alvo)) {
    throw new Error(`alvo desconhecido: ${alvo} (use painel, cliente ou nada)`);
  }

  const resposta = await fetch(`${BASE}/entrar`, { redirect: "manual" }).catch(() => null);
  if (!resposta) throw new Error(`o dev server não respondeu em ${BASE} — suba com: npm run dev -- --port 3001`);

  const chrome = CHROMES.find((c) => existsSync(c));
  if (!chrome) throw new Error("Chrome não encontrado. Aponte com CHROME_PATH=...");

  await mkdir(SAIDA, { recursive: true });
  const perfil = await mkdtemp(path.join(tmpdir(), "pibarber-cdp-"));

  const processo = spawn(chrome, [
    "--headless=new",
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${perfil}`,
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });

  let cdp;
  try {
    let endpoint;
    for (let tentativa = 0; tentativa < 60; tentativa++) {
      await dormir(300);
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`).catch(() => null);
      if (r?.ok) {
        endpoint = (await r.json()).webSocketDebuggerUrl;
        break;
      }
    }
    if (!endpoint) throw new Error("o Chrome não abriu a porta de depuração");

    cdp = await CDP.conectar(endpoint);
    const { targetId } = await cdp.enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.enviar("Target.attachToTarget", { targetId, flatten: true });
    const aba = new Aba(cdp, sessionId);

    await aba.chamar("Page.enable");
    await aba.chamar("Runtime.enable");
    await aba.chamar("Network.enable");

    // O tema é escolha do visitante e vive no localStorage, lido por um script
    // no <head> antes da primeira pintura. Carimbar "light" aqui, também antes
    // do documento existir, é o que garante captura no mesmo tema toda vez —
    // senão o Chrome herda o prefers-color-scheme da máquina e as imagens da
    // landing saem metade claras e metade escuras.
    await aba.chamar("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("pibarber-tema", "light"); } catch (e) {}`,
    });

    // O emblema do overlay de desenvolvimento do Next fica fixo no canto e
    // entrou em todas as capturas da primeira rodada. Ele não existe em
    // produção, então esconder aqui não maquia nada — só evita publicar na
    // landing um enfeite de dev server.
    await aba.chamar("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        addEventListener("DOMContentLoaded", () => {
          const estilo = document.createElement("style");
          estilo.textContent = "nextjs-portal { display: none !important }";
          document.head.appendChild(estilo);
        });
      `,
    });
    await aba.chamar("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });

    if (alvo === "tudo" || alvo === "painel") await capturar(aba, PAINEL, "Painel do dono");
    if (alvo === "tudo" || alvo === "cliente") await capturar(aba, CLIENTE, "App do cliente");

    console.log(`\n✓ capturas em ${path.relative(process.cwd(), SAIDA)}`);
  } finally {
    cdp?.fechar();
    processo.kill();
    await rm(perfil, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((erro) => {
  console.error(`\n✖ ${erro.message}`);
  process.exit(1);
});
