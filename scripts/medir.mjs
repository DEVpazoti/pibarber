/**
 * Mede o desempenho das rotas em BUILD DE PRODUÇÃO, com login de verdade.
 *
 *   node scripts/medir.mjs duro            # TTFB / FCP / LCP por rota (navegação cheia)
 *   node scripts/medir.mjs macio           # clique no menu → quanto demora a tela reagir
 *   node scripts/medir.mjs duro --amostras 5
 *   node scripts/medir.mjs duro --so painel
 *
 * Pré-requisito, e ele não é negociável — ver §8 do PERFORMANCE.md:
 *
 *   Remove-Item -Recurse -Force .next
 *   npx next build
 *   npx next start --port 3002
 *
 * Medir em `next dev` não vale nada: a compilação sob demanda mistura 1,4 s de
 * primeira visita no número. Esse é o ponto de método do T-1.
 *
 * ------------------------------------------------------------------------
 * POR QUE DOIS MODOS
 *
 * `duro` é o que o T-1 mediu: navegação cheia, servidor devolvendo HTML do
 * zero. É onde aparece o custo da cascata de autenticação (G1) e do cache de
 * `/b/[slug]` (G3).
 *
 * `macio` é a navegação que o dono realmente faz o dia inteiro: já está logado,
 * clica em "Caixa" na lateral. O Next não recarrega a página — busca o payload
 * RSC e troca só o miolo. Sem `loading.tsx` NADA acontece na tela durante essa
 * espera: o navegador mostra a tela anterior, congelada, e é exatamente essa a
 * queixa que originou o G2. Esse tempo não aparece em TTFB nenhum, e é por isso
 * que este modo existe.
 * ------------------------------------------------------------------------
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const SENHA = "pibarber123";
const PORTA_CDP = 9334;

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

/* -------------------------------------------------------------------------- */
/* O que medir                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O painel é desktop-first e o app do cliente é mobile-first (§1 do
 * CONTEXTO_MELHORIAS_V1.md). Medir cada um no aparelho errado muda o número —
 * ver o comentário de `Aba.emular()`.
 */
const COMPUTADOR = { width: 1440, height: 900, mobile: false };
const CELULAR = { width: 390, height: 844, mobile: true };

/**
 * A conta do painel é a do TIÃO, não a da Navalha & Cia — de propósito.
 *
 * O T-6 criou 23 agendamentos de demonstração na Navalha para as capturas da
 * landing, e eles inflam a agenda e a tela Hoje daquela loja. Medir ali seria
 * medir o dado de demonstração junto. (`scripts/dia-de-demonstracao.mjs`.)
 */
const GRUPOS = {
  publico: {
    conta: null,
    // A landing é vista dos dois; o perfil da barbearia chega quase sempre pelo
    // link do Instagram, ou seja, num celular.
    aparelho: CELULAR,
    rotas: ["/", "/entrar", "/b/barbearia-do-tiao", "/b/barbearia-do-tiao/agendar"],
  },
  painel: {
    conta: "dono.campinas@pibarber.dev",
    aparelho: COMPUTADOR,
    rotas: [
      "/painel",
      "/painel/agenda",
      "/painel/caixa",
      "/painel/clientes",
      "/painel/comissoes",
      "/painel/fiado",
      "/painel/relatorios",
    ],
  },
  app: {
    conta: "cliente1@pibarber.dev",
    aparelho: CELULAR,
    // /app/perfil/ajuda é a régua do projeto: ela não faz consulta NENHUMA (o
    // FAQ é um array em TypeScript), então o que ela marcar é 100% custo fixo.
    // É o piso de toda tela logada — comparar sempre por ela.
    rotas: ["/app", "/app/perfil/ajuda", "/app/agendamentos", "/app/buscar", "/app/perfil"],
  },
};

/** Os cliques do modo `macio`: de onde, para onde, e o que esperar aparecer. */
const CLIQUES = {
  painel: {
    conta: "dono.campinas@pibarber.dev",
    aparelho: COMPUTADOR,
    partida: "/painel",
    saltos: [
      { href: "/painel/agenda", rotulo: "Hoje → Agenda" },
      { href: "/painel/clientes", rotulo: "Hoje → Clientes" },
      { href: "/painel/servicos", rotulo: "Hoje → Serviços" },
      { href: "/painel/espera", rotulo: "Hoje → Espera" },
      { href: "/painel/equipe", rotulo: "Hoje → Equipe" },
      { href: "/painel/avaliacoes", rotulo: "Hoje → Avaliações" },
      { href: "/painel/caixa", rotulo: "Hoje → Caixa" },
      { href: "/painel/comissoes", rotulo: "Hoje → Comissões" },
      { href: "/painel/fiado", rotulo: "Hoje → Fiado" },
      { href: "/painel/relatorios", rotulo: "Hoje → Relatórios" },
      { href: "/painel/configuracoes", rotulo: "Hoje → Configurações" },
    ],
  },
  app: {
    conta: "cliente1@pibarber.dev",
    aparelho: CELULAR,
    partida: "/app",
    saltos: [
      { href: "/app/agendamentos", rotulo: "Início → Agendamentos" },
      { href: "/app/buscar", rotulo: "Início → Buscar" },
      { href: "/app/perfil", rotulo: "Início → Perfil" },
      { href: "/app/notificacoes", rotulo: "Início → Notificações" },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* CDP mínimo — copiado de scripts/capturar-telas.mjs                          */
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
      throw new Error(`JS quebrou na página: ${r.exceptionDetails.text} — ${expressao.slice(0, 90)}`);
    }
    return r.result.value;
  }

  async irPara(rota) {
    await this.chamar("Page.navigate", { url: `${BASE}${rota}` });
    for (let t = 0; t < 200; t++) {
      const pronta = await this.avaliar("document.readyState === 'complete'").catch(() => false);
      if (pronta) break;
      await dormir(100);
    }
  }

  caminho() {
    return this.avaliar("location.pathname");
  }

  /**
   * Emular o aparelho certo NÃO é enfeite aqui — muda o número medido.
   *
   * O Chrome headless abre em 800×600, abaixo do breakpoint `lg`. Nessa
   * largura a lateral do painel está com `display:none` e só a barra inferior
   * do celular existe, com 4 links. O `next/link` não prefetcha link invisível,
   * então 8 das 12 rotas do painel apareciam como "não prefetchadas" só porque
   * a janela era estreita demais para o menu que o dono realmente usa.
   *
   * O painel é desktop-first (§1 do CONTEXTO_MELHORIAS_V1.md) e o app do
   * cliente é mobile-first — cada um se mede no seu.
   */
  async emular({ width, height, mobile }) {
    await this.chamar("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    if (mobile) {
      await this.chamar("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Coleta de métricas                                                          */
/* -------------------------------------------------------------------------- */

/**
 * ARMADILHA nº23 do ESTADO.md — meia hora perdida no T-6.
 *
 * `performance.getEntriesByType('largest-contentful-paint')` devolve array
 * VAZIO, sempre. O LCP não fica no buffer que essa função lê. Só um
 * PerformanceObserver com `buffered: true`, registrado ANTES da primeira
 * pintura, o enxerga — o que por CDP quer dizer
 * `Page.addScriptToEvaluateOnNewDocument`, e não `Runtime.evaluate` depois de
 * navegar.
 *
 * O `element` vai junto do número de propósito: saber que o LCP da landing é o
 * H1 (e não a imagem) foi o que decidiu a questão do `priority` no T-6.
 */
const ESPIAO_LCP = `
  (() => {
    window.__lcp = null;
    window.__lcpElemento = null;
    try {
      new PerformanceObserver((lista) => {
        const entradas = lista.getEntries();
        const ultima = entradas[entradas.length - 1];
        if (!ultima) return;
        window.__lcp = ultima.startTime;
        const el = ultima.element;
        window.__lcpElemento = el
          ? el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string"
              ? "." + el.className.trim().split(/\\s+/)[0]
              : "")
          : (ultima.url ? "img:" + ultima.url.split("/").pop() : "?");
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}
  })();
`;

const LER_METRICAS = `
  (async () => {
    // O LCP só se estabiliza depois que a página para de pintar. Sem esta
    // espera o número sai baixo e otimista.
    await new Promise((r) => setTimeout(r, 900));
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.startTime) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp === null ? null : Math.round(window.__lcp),
      elemento: window.__lcpElemento,
    };
  })()
`;

/**
 * O modo `macio`, e ele é o coração do G2.
 *
 * Marca o instante do clique, observa o <main> e resolve na PRIMEIRA mutação —
 * ou seja, no primeiro momento em que alguma coisa muda na tela. Sem
 * `loading.tsx` esse instante é o da resposta inteira do servidor (a tela fica
 * congelada até o dado chegar). Com `loading.tsx`, é o esqueleto aparecendo.
 *
 * `pronto` é o segundo número: quando o conteúdo de verdade substituiu o
 * esqueleto. A soma não muda com o G2 — o servidor não ficou mais rápido. O que
 * muda é `reagiu`, e é isso que o usuário chama de "o site está lento".
 */
function scriptDeClique(href) {
  return `
    (async () => {
      const alvo = document.querySelector('a[href="${href}"]');
      if (!alvo) return { erro: 'link ${href} não achado na navegação' };

      const main = document.querySelector('main');
      if (!main) return { erro: 'sem <main> na página' };

      const antes = main.innerHTML;
      let reagiu = null;
      const t0 = performance.now();

      const obs = new MutationObserver(() => {
        if (reagiu === null && main.innerHTML !== antes) reagiu = performance.now() - t0;
      });
      obs.observe(main, { childList: true, subtree: true, characterData: true });

      alvo.click();

      /* "Pronto" = a URL virou a nova, NÃO HÁ MAIS ESQUELETO na tela, e o miolo
         parou de mudar por 250 ms.

         A condição do esqueleto não é detalhe — é o que impede este número de
         mentir. Sem ela, depois do G2 o script marcava "pronto" aos 16 ms:
         o esqueleto aparecia instantaneamente e ficava PARADO esperando o
         servidor, e "parou de mudar" dava por concluída uma tela que ainda não
         tinha dado nenhum. O G2 não deixou servidor algum mais rápido, e um
         número dizendo que sim teria invertido a conclusão da sessão. */
      let pronto = null;
      let ultimaMudanca = performance.now();
      const marcar = new MutationObserver(() => { ultimaMudanca = performance.now(); });
      marcar.observe(main, { childList: true, subtree: true, characterData: true });

      const aindaCarregando = () =>
        !!main.querySelector('[aria-busy="true"], .skeleton');

      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (
          location.pathname === '${href}' &&
          !aindaCarregando() &&
          performance.now() - ultimaMudanca > 250
        ) {
          pronto = ultimaMudanca - t0;
          break;
        }
      }
      obs.disconnect();
      marcar.disconnect();

      return {
        reagiu: reagiu === null ? null : Math.round(reagiu),
        pronto: pronto === null ? null : Math.round(pronto),
        chegou: location.pathname,
      };
    })()
  `;
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

async function entrar(aba, email) {
  // O Chrome guarda a sessão entre execuções: sem limpar, trocar de conta cai
  // no painel da anterior e o formulário nem existe (armadilha nº13).
  await aba.chamar("Network.clearBrowserCookies");
  await aba.irPara("/entrar");

  const achou = await aba.avaliar(`!!document.querySelector('input[name="email"]')`);
  if (!achou) throw new Error("o formulário de login não apareceu em /entrar");

  await aba.avaliar(`
    (() => {
      const f = document.querySelector('form');
      f.querySelector('input[name="email"]').value = ${JSON.stringify(email)};
      f.querySelector('input[name="senha"]').value = ${JSON.stringify(SENHA)};
      f.requestSubmit();
      return true;
    })()
  `);

  for (let t = 0; t < 120; t++) {
    await dormir(500);
    const onde = await aba.caminho();
    if (onde && !onde.startsWith("/entrar")) return onde;
    const erro = await aba.avaliar(`(document.querySelector('[role="alert"]')?.textContent ?? '').trim()`);
    if (erro) throw new Error(`login recusado para ${email}: ${erro}`);
  }
  throw new Error(`login de ${email} não saiu de /entrar em 60s`);
}

/* -------------------------------------------------------------------------- */
/* Estatística                                                                 */
/* -------------------------------------------------------------------------- */

function mediana(valores) {
  const v = valores.filter((n) => typeof n === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

const faixa = (valores) => {
  const v = valores.filter((n) => typeof n === "number");
  return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : "—";
};

/* -------------------------------------------------------------------------- */

async function medirDuro(aba, amostras, so) {
  const linhas = [];

  for (const [nome, grupo] of Object.entries(GRUPOS)) {
    if (so && so !== nome) continue;
    const ap = grupo.aparelho;
    console.log(
      `\n▸ ${nome}${grupo.conta ? ` — ${grupo.conta}` : " — sem login"}` +
        ` · ${ap.width}×${ap.height}${ap.mobile ? " (celular)" : ""}`,
    );
    await aba.emular(ap);

    if (grupo.conta) {
      const destino = await entrar(aba, grupo.conta);
      console.log(`  login ok → ${destino}`);
    } else {
      await aba.chamar("Network.clearBrowserCookies");
    }

    for (const rota of grupo.rotas) {
      const colhidas = [];
      // +1 porque a PRIMEIRA amostra é descartada: ela paga TLS frio e o
      // aquecimento do servidor. Sem descartar, o número aponta para o
      // culpado errado (método nº5 do ESTADO.md).
      for (let i = 0; i < amostras + 1; i++) {
        await aba.chamar("Network.clearBrowserCache");
        await aba.irPara(rota);
        const m = await aba.avaliar(LER_METRICAS);
        if (i > 0) colhidas.push(m);
      }
      const onde = await aba.caminho();
      const linha = {
        rota,
        desviouPara: onde === rota.split("?")[0] ? null : onde,
        ttfb: mediana(colhidas.map((c) => c.ttfb)),
        ttfbFaixa: faixa(colhidas.map((c) => c.ttfb)),
        fcp: mediana(colhidas.map((c) => c.fcp)),
        lcp: mediana(colhidas.map((c) => c.lcp)),
        elemento: colhidas.map((c) => c.elemento).find(Boolean) ?? "?",
      };
      linhas.push(linha);
      console.log(
        `  ${rota.padEnd(32)} TTFB ${String(linha.ttfb).padStart(5)} ms (${linha.ttfbFaixa})` +
          `  FCP ${String(linha.fcp).padStart(5)} ms  LCP ${String(linha.lcp).padStart(5)} ms  ← ${linha.elemento}` +
          (linha.desviouPara ? `   ⚠ DESVIOU para ${linha.desviouPara}` : ""),
      );
    }
  }
  return linhas;
}

async function medirMacio(aba, amostras, so, espera) {
  const linhas = [];

  for (const [nome, grupo] of Object.entries(CLIQUES)) {
    if (so && so !== nome) continue;
    const ap = grupo.aparelho;
    console.log(
      `\n▸ navegação macia: ${nome} — ${grupo.conta}` +
        ` · ${ap.width}×${ap.height}${ap.mobile ? " (celular)" : ""}`,
    );
    await aba.emular(ap);
    await entrar(aba, grupo.conta);

    for (const salto of grupo.saltos) {
      const reagiu = [];
      const pronto = [];
      for (let i = 0; i < amostras + 1; i++) {
        // Sempre partindo da mesma tela, senão o salto mede outra coisa.
        await aba.irPara(grupo.partida);
        /* Quanto tempo a pessoa fica na tela antes de clicar — e isso MUDA o
           resultado, então é parâmetro, não constante.

           O `next/link` prefetcha o destino quando o link entra no viewport, e
           o navegador só abre ~6 conexões ao mesmo tempo. A lateral do painel
           tem 12 links: os 6 primeiros ficam prontos rápido, o resto espera a
           segunda leva. Com --espera 400 os saltos para Caixa (8º item do menu)
           e Relatórios (11º) apareciam em ~400 ms enquanto Agenda (2º) e
           Clientes (3º) apareciam em 15 ms — e isso é a fila de prefetch, não o
           esqueleto. Quem usa o sistema de verdade fica mais que 400 ms numa
           tela antes de clicar na próxima. */
        await dormir(espera);
        const r = await aba.avaliar(scriptDeClique(salto.href));
        if (r.erro) throw new Error(`${salto.rotulo}: ${r.erro}`);
        if (i > 0) {
          reagiu.push(r.reagiu);
          pronto.push(r.pronto);
        }
      }
      const linha = {
        rotulo: salto.rotulo,
        href: salto.href,
        reagiu: mediana(reagiu),
        reagiuFaixa: faixa(reagiu),
        pronto: mediana(pronto),
      };
      linhas.push(linha);
      console.log(
        `  ${linha.rotulo.padEnd(30)} reagiu em ${String(linha.reagiu).padStart(5)} ms (${linha.reagiuFaixa})` +
          `   pronto em ${String(linha.pronto).padStart(5)} ms`,
      );
    }
  }
  return linhas;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const modo = args.find((a) => !a.startsWith("--")) ?? "duro";
  if (!["duro", "macio"].includes(modo)) {
    throw new Error(`modo desconhecido: ${modo} (use "duro" ou "macio")`);
  }
  const amostras = Number(args[args.indexOf("--amostras") + 1]) || 4;
  const so = args.includes("--so") ? args[args.indexOf("--so") + 1] : null;
  const espera = Number(args[args.indexOf("--espera") + 1]) || 400;

  const r = await fetch(`${BASE}/entrar`, { redirect: "manual" }).catch(() => null);
  if (!r) {
    throw new Error(
      `nada respondeu em ${BASE}.\n` +
        `  Suba o BUILD DE PRODUÇÃO — medir em next dev não vale nada:\n` +
        `    Remove-Item -Recurse -Force .next ; npx next build ; npx next start --port 3002`,
    );
  }

  const chrome = CHROMES.find((c) => existsSync(c));
  if (!chrome) throw new Error("Chrome não encontrado. Aponte com CHROME_PATH=...");

  const perfil = await mkdtemp(path.join(tmpdir(), "pibarber-medir-"));
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
    for (let t = 0; t < 60; t++) {
      await dormir(300);
      const v = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`).catch(() => null);
      if (v?.ok) {
        endpoint = (await v.json()).webSocketDebuggerUrl;
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
    await aba.chamar("Page.addScriptToEvaluateOnNewDocument", { source: ESPIAO_LCP });

    console.log(`Medindo ${BASE} · modo "${modo}" · ${amostras} amostras (a 1ª descartada)`);
    const linhas =
      modo === "duro"
        ? await medirDuro(aba, amostras, so)
        : await medirMacio(aba, amostras, so, espera);

    console.log(`\n--- JSON ---\n${JSON.stringify(linhas, null, 2)}`);
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
