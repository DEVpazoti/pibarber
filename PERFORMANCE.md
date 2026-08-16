# PiBarber — diagnóstico de performance (T-1) e correção (T-7)

> Medido em 15/08/2026. O corpo do documento é o **diagnóstico do T-1**, que não
> alterou nenhuma linha de código. A **seção 9, no fim, é o T-7**: o que foi
> corrigido, o que cada correção rendeu medido antes e depois, e o que ficou.
>
> **Se você está começando uma sessão de performance agora, leia a seção 9
> primeiro** — vários números do meio deste documento já não valem.

---

## Resposta em cinco linhas

O site está lento, **e não é o modo de desenvolvimento**. Em build de produção, toda página
logada leva de **870 ms a 1240 ms** para devolver o primeiro byte. O gargalo não é o bundle
(102 kB compartilhados, saudável), não é query pesada, não é falta de índice e não é N+1.

É **latência de rede multiplicada por chamadas em série**: cada ida e volta ao Supabase custa
~175 ms daqui, e toda página logada faz **quatro dessas só para descobrir quem é o usuário** —
sendo que **duas são repetição literal do que o middleware acabou de fazer**.

A prova está numa página só: `/app/perfil/ajuda` não faz **nenhuma** consulta ao banco (o FAQ
é um array em TypeScript) e mesmo assim leva **878 ms**. Esse é o piso de toda tela logada.

---

## 1. Como foi medido

- `next build` limpo (`.next` apagado antes) + `next start` na porta 3002. Dev server derrubado.
- Navegador de verdade (Chrome headless via CDP), login real pelo formulário com as contas de
  teste, 4 amostras por rota **descartando a primeira** (aquecimento).
- Rotas públicas confirmadas com 15 amostras via `curl` (`time_starttransfer`).
- Depois, o mesmo em `next dev` para separar o que é modo de desenvolvimento.
- Latência ao Supabase medida direto, fora do Next, para separar "custo por chamada" de
  "número de chamadas".

Os scripts usados estão no scratchpad da sessão (`medir.mjs`, `cascata.mjs`) — a seção 8
explica como repetir a medição no T-7.

---

## 2. O número que explica tudo

O projeto está em **us-east-2**; o desenvolvimento é no Brasil. Cada ida e volta ao Supabase:

| Chamada | Tempo |
|---|---|
| REST simples (`select` por chave primária, 44 bytes de resposta) | **157–231 ms** |
| `/auth/v1/user` (o que `auth.getUser()` faz) | **177–259 ms** |
| Handshake TLS numa conexão nova | +40 ms |

O trabalho do Postgres nessas consultas é de 1 a 5 ms. **Mais de 97% do tempo é rede.**

> Consequência que orienta toda correção do T-7: **otimizar a query não adianta — o que vale é
> reduzir o NÚMERO de chamadas em série.** Uma consulta a menos vale mais do que dez consultas
> mais rápidas.

Isso também significa que **em produção na Vercel os números vão mudar**: se o deploy ficar numa
região perto de `us-east-2`, cada ida e volta cai para ~10–30 ms e o custo fixo desaparece quase
todo. Ver a seção 7 — isso muda a prioridade das correções, e é o único item que precisa de
decisão sua antes do T-7.

---

## 3. O que foi medido, rota a rota

### Produção (`next build && next start`) — TTFB, mediana

| Rota | TTFB | LCP | Observação |
|---|---:|---:|---|
| `/` | **9 ms** | 74 ms | estática, pré-renderizada. Nada a fazer aqui |
| `/entrar` | **24 ms** | 76 ms | dinâmica mas sem banco |
| `/b/barbearia-do-tiao` | **364 ms** | 848 ms | pública, 2 ondas de consulta |
| `/b/barbearia-do-tiao/agendar` | **358 ms** | 426 ms | pública, mesma carga |
| `/app/perfil/ajuda` | **878 ms** | 934 ms | **zero consultas próprias** |
| `/app/perfil/dados` | 866 ms | 930 ms | |
| `/app/perfil/seguranca` | 873 ms | 938 ms | |
| `/app/buscar` | 873 ms | 930 ms | |
| `/app` | 879 ms | 956 ms | |
| `/app/notificacoes` | 887 ms | 936 ms | |
| `/app/perfil/favoritos` | 888 ms | 952 ms | |
| `/app/agendamentos` | 987 ms | 1052 ms | |
| `/app/perfil` | 1161 ms | 1220 ms | menu estático de 9 links |
| `/painel/caixa` | 1068 ms | 1150 ms | |
| `/painel/agenda` | 1076 ms | 1148 ms | |
| `/painel` | 1097 ms | 1168 ms | a tela aberta 50× por dia |
| `/painel/comissoes` | 1115 ms | 1184 ms | |
| `/painel/clientes` | 1121 ms | 1188 ms | |
| `/painel/fiado` | 1215 ms | 1276 ms | |
| `/painel/relatorios` | 1243 ms | 1332 ms | |

**Leia a coluna do TTFB de cima para baixo.** As páginas do painel variam só 175 ms entre a mais
leve e a mais pesada, apesar de fazerem trabalhos completamente diferentes. Uniformidade assim
é assinatura de **custo fixo pago por toda requisição**, não de consulta cara.

### Build — tamanho

39 rotas. **102 kB compartilhados por todas** — saudável para Next 15. Nenhuma rota problemática
exceto uma:

| Rota | First Load JS |
|---|---:|
| a maioria | 110–123 kB |
| `/painel/relatorios` | **222 kB** (Recharts) |
| Middleware | 93,5 kB |

Estáticas (6): `/`, `/_not-found`, `/criar-conta`, `/icon.svg`, `/manifest.webmanifest`,
`/sem-barbearia`. **Todas as outras 33 são renderizadas sob demanda** — inclusive `/b/[slug]`,
que é conteúdo público e praticamente imutável.

---

## 4. Os gargalos, em ordem de impacto

### G1 — A cascata de autenticação: ~700 ms fixos em toda página logada 🔴

**O maior de longe.** Toda página protegida paga esta sequência, **em série**, antes de buscar
um único dado próprio:

| # | Onde | Chamada | Custo |
|---|---|---|---:|
| 1 | [middleware.ts:60](src/middleware.ts#L60) | `auth.getUser()` → rede até o Supabase | ~190 ms |
| 2 | [middleware.ts:85](src/middleware.ts#L85) | `profiles(role, is_platform_admin)` | ~175 ms |
| 3 | [auth.ts:40](src/lib/auth.ts#L40) | `auth.getUser()` — **repete a nº 1** | ~180 ms |
| 4 | [auth.ts:44](src/lib/auth.ts#L44) | `profiles(*)` — **repete a nº 2** | ~200 ms |
| 5 | [auth.ts:106](src/lib/auth.ts#L106) | `barbershops(id)` por `owner_id` (só painel) | ~195 ms |

**~740 ms no app do cliente, ~940 ms no painel** — antes da primeira linha de dado da tela.

O `cache()` do React em `getProfile` está correto e já evita repetição *dentro* do render. O que
ele não alcança é o middleware: ele roda num runtime separado, antes, e refaz o mesmo trabalho.

**As chamadas 3 e 4 são pura duplicação.** O middleware já validou o token e já leu o perfil
milissegundos antes, na mesma requisição.

**Por que a nº 3 é redundante mesmo do ponto de vista de segurança:** o argumento no código
("`getUser()` valida o token no servidor, `getSession()` só lê o cookie") está certo e não deve
ser abandonado — mas ele não obriga a uma chamada de rede. Quando a consulta nº 4 vai ao
PostgREST, **o PostgREST verifica a assinatura do JWT antes de aplicar a RLS**. Uma linha
devolvida por `profiles` com policy `id = auth.uid()` já é prova criptográfica de que o token é
válido. A validação separada não acrescenta segurança, só uma ida e volta.

**Correção recomendada:** o `@supabase/auth-js` instalado é o **2.112.3**, que tem
**`getClaims()`** — verifica a assinatura do JWT **localmente** (JWKS em cache), sem rede, com a
mesma garantia de `getUser()`. Trocando `getUser()` por `getClaims()` no middleware e em
`getProfile`, e passando o perfil do middleware para o render (header de requisição) ou
aceitando uma única leitura de `profiles`:

> **4 idas e voltas → 1.** Economia estimada: **~520 ms em toda página logada.**

- **Custo:** médio. Mexe em `middleware.ts` e `lib/auth.ts` — os dois arquivos mais sensíveis do
  projeto. **Exige reteste completo da matriz de permissão** (dono, assistente, cliente, admin,
  anônimo) contra a RLS, como já foi feito na etapa 9.
- **Risco:** o mais alto do documento. Se `getClaims()` for mal usado, vira brecha de
  autorização. Fazer sozinho, numa sessão limpa, com os testes de RLS refeitos ao final.
- **Ganho:** ~520 ms × toda navegação do sistema.

---

### G2 — Nenhum `loading.tsx`, nenhum `<Suspense>` em 39 rotas 🔴

Zero ocorrências das duas coisas em todo o `src/`. Consequência: durante os ~900 ms de TTFB o
navegador mostra **a tela anterior, congelada**. Não há esqueleto, não há spinner, não há sinal
de que algo está acontecendo. É exatamente a sensação que se descreve como "o site está lento" —
e é a metade do problema que **independe** de o servidor ficar mais rápido.

Hoje a página inteira espera o dado mais lento porque não existe fronteira de streaming nenhuma.

- **Correção:** um `loading.tsx` por área (`/painel`, `/app`, `/b/[slug]`) com o esqueleto do
  layout, e `<Suspense>` isolando os blocos lentos das telas mais pesadas (a lista de `/painel`,
  as avaliações de `/b/[slug]`).
- **Custo:** baixo. Arquivos novos, não altera lógica nem consulta.
- **Risco:** baixíssimo. Não toca em permissão nem em dado.
- **Ganho:** não reduz um milissegundo de TTFB, e **é a correção com melhor relação
  ganho/risco do documento** — porque muda a percepção, que é o que o usuário reclamou.

> Fazer esta **antes** do G1. É barata, é segura, e melhora a experiência mesmo que o G1 nunca
> seja feito.

---

### G3 — `/b/[slug]` é dinâmica, sendo conteúdo público e quase imutável 🟠

O perfil público da barbearia — o link da bio do Instagram, a porta de entrada de cliente novo —
é renderizado do zero a cada visita: **364 ms**, em 2 ondas de consulta ([barbearia.ts:41](src/lib/queries/barbearia.ts#L41)
e o `Promise.all` da linha 54). Nome, serviços, horários e equipe mudam raramente; hoje são
buscados do banco a cada visitante.

O que impede o cache não é a página em si, são três coisas pequenas coladas nela:
`registrarVisita()`, `getProfile()` e `jaEFavorita()` (`src/app/b/[slug]/page.tsx`, linhas 71–74)
— todas dependem de cookie, o que torna a rota inteira dinâmica.

- **Correção:** separar a casca pública (cacheável com `revalidate`) das partes pessoais
  (coração de favorito e registro de visita, que podem ir para um componente cliente ou rodar
  depois da pintura). `revalidate` de alguns minutos com invalidação quando o dono salva as
  configurações.
- **Custo:** médio. Mexe na estrutura da página, não na lógica.
- **Risco:** baixo — mas há um detalhe de correção a respeitar: o chip **"Aberto agora"** é
  calculado com a hora atual ([barbearia.ts:165](src/lib/queries/barbearia.ts#L165)). Cachear a
  página inteira congelaria esse chip. Ele precisa virar cálculo de cliente ou ficar fora do
  bloco cacheado.
- **Ganho:** 364 ms → dezenas de milissegundos para visitante novo. **É a página que converte** —
  e é a única deste documento em que a lentidão custa cliente, não só paciência.

---

### G4 — O layout do painel busca de novo a barbearia que o `requireShopContext` acabou de buscar 🟡

[requireShopContext](src/lib/auth.ts#L106) consulta `barbershops` para descobrir o `id`.
Logo em seguida, [painel/layout.tsx:21](src/app/painel/layout.tsx#L21) consulta `barbershops`
**de novo, pela mesma linha**, só para pegar a coluna `name`.

- **Correção:** `requireShopContext` já devolve o `id`; passar a devolver `id, name` num
  `select` só. Uma consulta some.
- **Custo:** trivial — poucas linhas, tipo `ShopContext` ganha um campo.
- **Risco:** baixo.
- **Ganho:** ~175 ms em toda página do painel. Rodar em paralelo com a página, isso hoje se
  esconde parcialmente atrás das consultas da tela — mas some do caminho crítico quando o G1
  encurtar a cascata.

---

### G5 — `/painel/relatorios`: 222 kB de First Load JS 🟡

O dobro de qualquer outra rota. É o Recharts, importado estaticamente em
[RevenueChart.tsx](src/components/charts/RevenueChart.tsx) — que é `"use client"` e é o único
lugar do sistema que usa a biblioteca.

- **Correção:** `next/dynamic` com um esqueleto do gráfico enquanto carrega.
- **Custo:** baixo.
- **Risco:** baixo.
- **Ganho:** modesto e restrito a uma tela. **O TTFB de 1243 ms não vem daqui** — vem do G1. Não
  confunda tamanho de bundle com lentidão de servidor: são problemas diferentes e este é o menor.

---

### G6 — Imagens sem `next/image` 🟡

Zero uso de `next/image` no projeto. Três `<img>` crus:

- `src/app/b/[slug]/page.tsx`, linha 90 — a **capa da barbearia**, que é o
  elemento de LCP da página pública, sem dimensões declaradas (causa deslocamento de layout),
  sem `lazy`, sem formato moderno.
- [ShopCard.tsx:45](src/components/client/ShopCard.tsx#L45) — já tem `loading="lazy"`. Aceitável.
- [Avatar.tsx:40](src/components/ui/Avatar.tsx#L40) — **tem justificativa escrita no código**
  (URL de texto livre na v1). Deixe como está.

- **Correção:** `next/image` na capa, com `width`/`height` e `priority`. O `next.config.ts` já
  libera qualquer host `https` em `remotePatterns`, então nada de configuração nova.
- **Custo:** baixo.
- **Risco:** baixo — mas as URLs são texto livre digitado pelo dono; uma imagem quebrada não pode
  derrubar a página.
- **Ganho:** LCP e estabilidade visual de `/b/[slug]`, não TTFB. Faz par natural com o G3.

---

### G7 — Fragilidade latente (não é gargalo hoje) ⚪

`carregarBarbeariaPorSlug()` é chamada **duas vezes** por requisição em `/b/[slug]`: uma em
`generateMetadata` ([linha 36](src/app/b/[slug]/page.tsx#L36)) e outra no componente
([linha 63](src/app/b/[slug]/page.tsx#L63)). Diferente de `getProfile`, ela **não** está
envolvida em `cache()`.

**Medi antes de acusar, e a acusação não se sustentou:** `/b/[slug]` (dois pontos de chamada)
leva 364 ms e `/b/[slug]/agendar` (um ponto de chamada, mesma carga) leva 358 ms. São iguais — a
memoização de requisição do Next está deduplicando os `fetch` idênticos. **Hoje não custa nada.**

Fica registrado porque funciona por acidente: basta a segunda chamada passar a diferir num
detalhe para virar 350 ms silenciosos. Envolver em `cache()` torna a intenção explícita.

- **Custo:** trivial. **Ganho hoje:** zero. Fazer junto do G3, não sozinho.

---

## 5. Suspeitos investigados e DESCARTADOS

Tão importante quanto a lista acima — para o T-7 não gastar sessão nisto:

| Suspeito do T-1 | Veredito | Evidência |
|---|---|---|
| `"use client"` alto demais na árvore | **Descartado** | 45 arquivos usam `"use client"`, e **nenhum** é `page.tsx` ou `layout.tsx`. Toda rota é Server Component. A arquitetura está correta |
| Queries em cascata / N+1 | **Descartado como N+1** | Nenhum `await` dentro de laço em todo o `src/`. Os laços encontrados são transformação de dado já carregado. As páginas usam `Promise.all` corretamente. **A cascata existe, mas é a de autenticação (G1), não N+1 de lista** |
| Falta de índice (`agendamentos` por barbearia + data) | **Descartado** | Os 21 índices de `01_schema.sql` cobrem exatamente as colunas usadas em filtro e ordenação, incluindo `appointments (barbershop_id, starts_at)`. As respostas voltam em 1–5 ms de trabalho de banco |
| Cliente Supabase instanciado a cada render | **Descartado como custo** | `createClient()` é chamado com frequência, mas **não abre conexão** — só monta um objeto sobre `fetch`. Custo desprezível |
| `force-dynamic` / `revalidate = 0` matando cache | **Descartado** | Nenhuma ocorrência no projeto. O problema é **o oposto**: falta `revalidate` onde caberia (G3) |
| Bibliotecas pesadas importadas inteiras | **Descartado** | `lucide-react` em 62 arquivos, todos com import nomeado (tree-shaking funciona — o compartilhado é 102 kB). Recharts é importado por peça. Só o G5 sobra, e é pequeno |
| Ausência de `loading.tsx` / Suspense | **CONFIRMADO** | É o G2 |
| Imagens sem `next/image` | **CONFIRMADO, pequeno** | É o G6 |

---

## 6. Dev vs. produção — resposta à pergunta em aberto nº 4

O `CONTEXTO_MELHORIAS_V1.md` levantou a hipótese de que parte da lentidão fosse só o modo de
desenvolvimento. **Medido: em parte sim, mas na parte que menos importa.**

| Rota | `next dev` | `next start` | Quanto era dev |
|---|---:|---:|---|
| `/` | 288 ms | **9 ms** | **97%** — era tudo dev |
| `/entrar` | 201 ms | **24 ms** | 88% |
| `/b/barbearia-do-tiao` | 818 ms | **364 ms** | 55% |
| `/b/.../agendar` | 697 ms | **358 ms** | 49% |
| `/painel` | 1305 ms | **1097 ms** | **16%** |
| `/painel/agenda` | 1385 ms | **1076 ms** | 22% |
| `/painel/caixa` | 1373 ms | **1068 ms** | 22% |
| `/painel/relatorios` | 1533 ms | **1243 ms** | 19% |

Mais: o **primeiro** acesso a uma rota em dev paga a compilação sob demanda — `/criar-conta`
levou **1438 ms** na primeira visita e 182 ms depois. É o que faz o dev *parecer* muito pior do
que é.

**Conclusão:** na landing, a lentidão percebida era ilusão do dev server. **No painel e no app do
cliente — onde o barbeiro trabalha — mais de 80% da lentidão é real e sobrevive em produção.**
A hipótese otimista está descartada para as telas que importam.

Como não existe deploy no ar (`ESTADO.md`), toda a percepção de lentidão até hoje veio de
`localhost:3001` em `next dev`. Os números desta seção são a primeira medição honesta do projeto.

---

## 7. Priorização para o T-7

| # | Correção | Ganho | Custo | Risco | Ordem |
|---|---|---|---|---|---|
| G2 | `loading.tsx` + `<Suspense>` | percepção (a queixa original) | baixo | baixíssimo | **1º** |
| G4 | `requireShopContext` devolver `name` | ~175 ms no painel | trivial | baixo | **2º** |
| G1 | Colapsar a cascata de auth com `getClaims()` | **~520 ms em tudo** | médio | **alto** | **3º** |
| G3 | Cachear `/b/[slug]` | 364 ms → dezenas, na página que converte | médio | baixo | 4º |
| G6 | `next/image` na capa | LCP de `/b/[slug]` | baixo | baixo | 5º (com o G3) |
| G5 | Recharts sob demanda | 222 kB → ~120 kB numa tela | baixo | baixo | 6º |
| G7 | `cache()` em `carregarBarbeariaPorSlug` | zero hoje | trivial | baixo | junto do G3 |

Começar pelos baratos e seguros (G2 e G4) dá ganho imediato e deixa o terreno preparado para
medir o G1 isoladamente, que é o único com risco de segurança.

### ⚠️ Uma decisão sua antes de começar o T-7

**Boa parte destes 900 ms pode evaporar sozinha no deploy.** O custo é distância física até
`us-east-2`. Se o projeto for para a Vercel numa região próxima ao banco, cada ida e volta cai
de ~175 ms para ~10–30 ms, e a cascata do G1 deixa de custar ~740 ms para custar ~80 ms.

Isso não torna o G1 errado — quatro chamadas de rede para descobrir quem é o usuário continua
sendo desperdício, e o custo volta a aparecer em qualquer região mais distante. Mas muda a
urgência, e o G1 é justamente a correção mais arriscada do documento.

**Duas ordens possíveis:**

1. **Publicar primeiro** (depois do T-8), medir de novo lá, e só então decidir se o G1 vale o
   risco. Mais barato e mais seguro.
2. **Corrigir antes de publicar**, se a intenção é desenvolver com conforto e não depender da
   região do deploy.

O G2 é urgente nas duas ordens: ele resolve a percepção, e a percepção é o que foi reclamado.

---

## 8. Como repetir a medição no T-7

A regra é medir antes e depois de **cada** frente, isoladamente.

```powershell
# 1. Derrube o dev server. Nunca builde com ele no ar (armadilha nº10 do ESTADO.md)
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }

# 2. Build limpo
Remove-Item -Recurse -Force .next
npx next build          # anote First Load JS de cada rota
npx next start --port 3002
```

Para as rotas públicas, `curl` resolve — 15 amostras, use a mediana:

```bash
curl -s -o /dev/null -w "%{time_starttransfer}\n" http://localhost:3002/b/barbearia-do-tiao
```

Para as rotas logadas, `curl` **não serve**: sem sessão elas devolvem 307 em 3 ms e você mede o
redirect, não a página. É preciso navegador com login de verdade — o `medir.mjs` desta sessão
faz isso via CDP (Chrome headless, login pelo formulário, `PerformanceObserver` para o LCP).

**Duas armadilhas que já custaram tempo aqui:**

- O Chrome **guarda a sessão** entre execuções. Medir com outra conta sem limpar os cookies leva
  o script a cair em `/painel` no lugar do formulário de login e falhar sem explicar por quê.
- `next dev` e `next start` **dividem o mesmo `.next`**. Alternar entre os dois sem apagar a
  pasta traz de volta a armadilha nº10 do `ESTADO.md` (500 em todas as rotas). Apague sempre.

E o mais importante: **se uma otimização não produzir melhora mensurável, reverta.** Com ~175 ms
por ida e volta dominando tudo, é fácil uma mudança parecer boa no papel e não mover o número.

---

## Apêndice — números brutos

**Latência ao Supabase** (`ovhzyyhopvrcowwvbqdk`, us-east-2), 5 amostras, conexão nova:
`dns≈15 ms · tcp≈25 ms · tls≈45 ms · ttfb 231/234/250/258/439 ms`.
Reaproveitando a conexão TLS: `231/163/158/175/160 ms`.

**A cascata de autenticação, cronometrada chamada a chamada** (conta do dono, conexões novas):

```
  190ms  middleware: auth.getUser()
  531ms  middleware: profiles(role, is_platform_admin)     (primeira, TLS a frio)
  177ms  getProfile: auth.getUser()                         <- REPETIDA
  204ms  getProfile: profiles(*)                            <- REPETIDA
  194ms  requireShopContext: barbershops(id) por owner_id
  -----
 1296ms  antes de a página buscar uma linha própria
  202ms  painel/layout: barbershops(name) pelo MESMO id     (G4)
```

**`carregarBarbeariaPorSlug()`, uma execução:** onda 1 (`barbershops` por slug) 188 ms +
onda 2 (`services` + `professionals` + `business_hours` + `reviews` em `Promise.all`) 259 ms =
**447 ms** com conexões frias; ~350 ms com o servidor aquecido.

**Ambiente:** Windows 11, Node v24.19.0, Next 15.5.23, Chrome 151 headless.
Build: compilação 26,3 s, total 62,8 s, 38 páginas estáticas geradas.

---

# 9. O T-7 — a correção

> 15/08/2026. Cinco frentes, **uma por vez, medindo antes e depois de cada uma**.
> O G1 **não foi feito**, por decisão — ver o fim desta seção.

## 9.1 Como as medições desta seção foram feitas

Nasceu daqui a ferramenta que faltava: **`scripts/medir.mjs`**, agora no
repositório (o T-1 deixou os dele no scratchpad da sessão e eles se perderam).

```bash
# build de produção — medir em next dev não vale nada
Remove-Item -Recurse -Force .next ; npx next build ; npx next start --port 3002

node scripts/medir.mjs duro                    # TTFB / FCP / LCP por rota
node scripts/medir.mjs macio                   # clique no menu → quanto a tela demora a reagir
node scripts/medir.mjs macio --espera 3000     # tempo parado na tela antes de clicar
node scripts/medir.mjs duro --so painel --amostras 5
```

**Três armadilhas de medição descobertas aqui, e as três mudaram uma conclusão
antes de serem corrigidas.** Estão detalhadas nas armadilhas nº25, nº26 e nº27
do `ESTADO.md`, e resumidas:

1. **O modo `macio` não existia, e é ele que mede a queixa original.** O TTFB não
   enxerga a navegação entre telas de quem já está logado — que é o que o dono
   faz o dia inteiro.
2. **Medir o painel em janela estreita mede outro sistema.** O Chrome headless
   abre em 800×600, abaixo do `lg`: a lateral do painel fica em `display:none` e
   só a barra do celular existe, com 4 links. Como o `next/link` não prefetcha
   link invisível, 8 das 12 rotas pareciam lentas por um motivo que não era o
   delas. O script agora emula **1440×900 no painel** e **390×844 no app**.
3. **Um detector de "pronto" ingênuo passa a mentir depois que existe esqueleto.**
   Ver 9.2.

## 9.2 G2 — `loading.tsx` (a queixa original)

**O que era:** clicar em qualquer item do menu deixava a tela **anterior
congelada por ~1,4 s**, sem esqueleto, sem spinner, sem nada. Não havia um único
`loading.tsx` nem um `<Suspense>` em 39 rotas.

**O que foi feito:** `src/app/painel/loading.tsx`, `src/app/app/loading.tsx` e
`src/app/b/[slug]/loading.tsx`, mais as primitivas em
`src/components/ui/Skeleton.tsx` (que reaproveitam o utilitário `skeleton` que já
existia no `globals.css`). Um `loading.tsx` cobre o segmento **e todos os
descendentes**, então três arquivos cobrem as três áreas inteiras.

**Medido**, painel, 1440×900, 3 s parado na tela antes de clicar, 3 amostras:

| Salto (a partir de Hoje) | reagiu antes | reagiu depois | pronto antes | pronto depois |
|---|---:|---:|---:|---:|
| → Agenda | 1209 ms | **26 ms** | 1209 | 1403 |
| → Clientes | 1354 ms | **27 ms** | 1354 | 1305 |
| → Serviços | 1337 ms | **27 ms** | 1337 | 1274 |
| → Espera | 1298 ms | **24 ms** | 1298 | 1316 |
| → Equipe | 1276 ms | **27 ms** | 1276 | 1391 |
| → Avaliações | 1520 ms | **24 ms** | 1520 | 1512 |
| → Caixa | 1337 ms | **25 ms** | 1337 | 1338 |
| → Comissões | 1240 ms | **25 ms** | 1240 | 1280 |
| → Fiado | 1559 ms | **25 ms** | 1559 | 1509 |
| → Relatórios | 1580 ms | **26 ms** | 1630 | 1668 |
| → Configurações | 1734 ms | **26 ms** | 1734 | 1763 |

> **`pronto` NÃO melhorou, e tem que ser assim.** O G2 não deixa servidor nenhum
> mais rápido — ele faz a tela responder. Um número dizendo que o conteúdo
> passou a chegar 50× mais rápido estaria errado, e **chegou a aparecer**: o
> detector de "pronto" do script marcava o instante em que o `<main>` parava de
> mudar, e depois do G2 o esqueleto aparecia em 16 ms e ficava parado esperando o
> servidor. O script dava a tela por concluída sem nenhum dado na tela. Hoje ele
> exige que o esqueleto tenha SAÍDO. Armadilha nº27.

**De brinde, no TTFB de navegação cheia:** com uma fronteira de streaming, o
servidor despacha a casca antes de o dado chegar. `/b/[slug]` caiu de **486 ms
para 22 ms** de TTFB só com isto, e no painel o **FCP descolou do LCP** (≈990 vs
≈1310 ms) — antes os dois eram o mesmo instante, porque nada pintava até tudo
estar pronto.

## 9.3 G4 — uma consulta a menos em toda página do painel

`requireShopContext` passou a trazer `name` no mesmo `select` do `id`, e
`painel/layout.tsx` deixou de consultar `barbershops` uma segunda vez pela mesma
linha. `ShopContext` ganhou `shopName`.

**O ramo do assistente foi preservado de propósito:** o `shopId` dele continua
vindo de `profiles.barbershop_id`, não do resultado da consulta. Derivá-lo da
linha devolvida mudaria comportamento — uma barbearia escondida pela RLS passaria
a mandar o assistente para `/sem-barbearia`. O G4 é para tirar uma chamada do
caminho, não para mexer em quem entra.

**Medido** com o G2 já aplicado nos dois lados, para isolar só o G4 (5 amostras):

| Rota | sem G4 | com G4 | ganho |
|---|---:|---:|---:|
| `/painel` | 1129 ms | **1008 ms** | −121 |
| `/painel/agenda` | 1097 ms | **918 ms** | −179 |
| `/painel/caixa` | 1076 ms | **910 ms** | −166 |
| `/painel/clientes` | 1112 ms | **922 ms** | −190 |
| `/painel/comissoes` | 1094 ms | **912 ms** | −182 |
| `/painel/fiado` | 1089 ms | **914 ms** | −175 |
| `/painel/relatorios` | 1129 ms | **921 ms** | −208 |

Mediana **−179 ms** — exatamente uma ida e volta ao `us-east-2`, que é o que a
seção 4 previu.

**Conferido na tela para os dois papéis** (eles passam por ramos diferentes da
função): dono e assistente veem "Barbearia do Tião" na lateral, o assistente
continua sendo desviado de `/painel/caixa` para `/painel` e continua com os 6
itens de menu.

## 9.4 G3 + G6 + G7 — o perfil público

**O desenho mudou em relação ao que a seção 4 propunha, e o motivo importa.** A
proposta era cachear a PÁGINA com `revalidate`, separando as partes pessoais. O
que foi feito foi cachear os **DADOS**, com `unstable_cache`. Três razões:

1. **O chip "Aberto agora" deixa de ser problema.** Cachear a página congelaria
   o chip; cacheando o dado, `estaAbertaAgora()` continua rodando a cada
   requisição com `new Date()` de verdade, sobre horários guardados.
2. **`registrarVisita()`, `getProfile()` e `jaEFavorita()` ficam onde estão** —
   nada precisou virar componente de cliente nem sair da página.
3. **O cache é preenchido pelo cliente ANÔNIMO** (`src/lib/supabase/publico.ts`,
   o mesmo padrão que o `sitemap.ts` já usava). Isso não é detalhe de
   desempenho, é **segurança**: preencher um cache compartilhado com o cliente
   que lê cookie guardaria o que *aquele* visitante enxerga e serviria a mesma
   resposta aos próximos. Com a chave anônima, o conteúdo cacheado é por
   construção o que o `anon` já podia ler.

São duas camadas — `slug → id` e `id → dados` — e a segunda existe pela
**invalidação**: as actions conhecem o `shopId`, não o slug. Onze pontos de
`revalidateTag` foram adicionados (configurações, benefícios, horários, resposta
a avaliação, os quatro de serviços, os dois de equipe, e a criação de avaliação
pelo cliente). **`salvarBeneficios` perdeu uma consulta de brinde** — ela
buscava `barbershops` só para descobrir o slug e chamar `revalidatePath` numa
rota dinâmica, que não guardava nada.

**G7** virou consequência: `carregarBarbeariaPorSlug` está agora em `cache()` do
React. O T-1 mediu que a chamada dupla (`generateMetadata` + componente) não
custava nada porque a memoização de `fetch` do Next deduplicava **por acidente**.
Sem o cliente de cookie, esse acidente deixou de valer.

**G6:** a capa virou `next/image` com `fill`, `priority` e `sizes`.

**Medido** (390×844, 6 amostras) — o alvo aqui é FCP/LCP, porque o TTFB já tinha
caído com o G2:

| Rota | antes (fim do G2) | depois | |
|---|---:|---:|---|
| `/b/barbearia-do-tiao` FCP/LCP | 786 ms | **120 ms** | −85% |
| `/b/barbearia-do-tiao/agendar` FCP/LCP | 444 ms | **108 ms** | −76% |

> ⚠️ **O G6 quase foi entregue sem nunca ter rodado.** **Nenhuma das 4
> barbearias do banco tem `cover_url`** — o ramo `{loja.cover_url ? … : null}`
> nunca executa, e `tsc`, `eslint` e `build` passaram limpos sobre código morto.
> Foi preciso preencher uma capa de teste para exercitá-lo. Conferido então:
> `/_next/image` servindo, `srcset` presente, `preload` no `<head>`, 390×160 na
> caixa certa, sem rolagem horizontal, e a capa some sem derrubar nada quando a
> URL não presta. A capa e a descrição de teste foram **revertidas**.
>
> **A invalidação foi testada pela tela, e é o teste que importa nesta frente:**
> o dono alterou a descrição em `/painel/configuracoes`, salvou, e o perfil
> público — **deslogado, cookies limpos** — já mostrava o texto novo. Sem isso o
> dono salvaria e o cliente veria o dado velho por até 5 minutos, em silêncio.

## 9.5 G5 — Recharts sob demanda

`src/components/charts/RevenueChartLazy.tsx`, com `ssr: false` e um esqueleto da
mesma altura. A casca existe porque `relatorios/page.tsx` é Server Component e
`ssr: false` só pode ser declarado dentro de um Client Component — mesmo padrão
do Leaflet no T-4.

| | antes | depois |
|---|---:|---:|
| `/painel/relatorios` First Load JS | **222 kB** | **115 kB** |

Entrou na faixa de 110–123 kB de todas as outras rotas. **Conferido na tela:**
o gráfico desenha, a curva e as 21 marcas de eixo estão lá, `/painel/caixa` não
baixa Recharts nenhum, e o console fica limpo.

## 9.6 O quadro final

TTFB mediano, build de produção, 5 amostras descartando a primeira. A coluna
"antes" é a linha de base do início do T-7.

| Rota | antes | depois | |
|---|---:|---:|---|
| `/` | 21 ms | 17 ms | estática, nada a fazer |
| `/entrar` | 33 ms | 29 ms | |
| `/b/barbearia-do-tiao` | 486 ms | **37 ms** | FCP 592 → **120 ms** |
| `/b/…/agendar` | 445 ms | **31 ms** | FCP 544 → **108 ms** |
| `/painel` | 1324 ms | **917 ms** | |
| `/painel/agenda` | 1281 ms | **901 ms** | |
| `/painel/caixa` | 1279 ms | **938 ms** | |
| `/painel/clientes` | 1423 ms | **903 ms** | |
| `/painel/comissoes` | 1988 ms | **912 ms** | |
| `/painel/fiado` | 1759 ms | **909 ms** | |
| `/painel/relatorios` | 1706 ms | **953 ms** | e 222 → 115 kB |
| `/app` | 1571 ms | **993 ms** | |
| `/app/perfil/ajuda` | 1152 ms | **896 ms** | a régua: zero consultas próprias |
| `/app/agendamentos` | 1246 ms | **901 ms** | |
| `/app/buscar` | 1558 ms | **1155 ms** | |
| `/app/perfil` | 1817 ms | **1200 ms** | |

> A linha de base foi medida antes de o script emular aparelho, então os números
> "antes" das rotas logadas carregam mais ruído que os "depois" (repare em
> `/painel/comissoes`, com amostras indo a 4560 ms). **Os números confiáveis são
> os das seções 9.2 a 9.5**, medidos isoladamente, uma frente por vez, com o
> resto do sistema parado. Nenhuma otimização foi revertida: todas produziram
> melhora mensurável.

E a navegação macia no estado final — que é o que o dono sente o dia inteiro
(3 amostras, 3 s parado na tela antes de clicar):

| Salto | reagiu | pronto |
|---|---:|---:|
| Hoje → Agenda | 13 ms | 1348 ms |
| Hoje → Clientes | 18 ms | 1072 ms |
| Hoje → Serviços | 17 ms | 1098 ms |
| Hoje → Espera | 16 ms | 1142 ms |
| Hoje → Equipe | 12 ms | 1139 ms |
| Hoje → Avaliações | 13 ms | 1257 ms |
| Hoje → Caixa | 17 ms | 1091 ms |
| Hoje → Comissões | 14 ms | 1124 ms |
| Hoje → Fiado | 16 ms | 1268 ms |
| Hoje → Relatórios | 7 ms | 1637 ms |
| Hoje → Configurações | 15 ms | 1508 ms |
| Início → Agendamentos | 10 ms | 1102 ms |
| Início → Buscar | 9 ms | 700 ms |
| Início → Perfil | 9 ms | 783 ms |
| Início → Notificações | 8 ms | 938 ms |

**A coluna `pronto` é a agenda do G1.** Ela não se moveu no T-7 e não vai se
mover sem atacar a cascata de autenticação ou encurtar a distância até o banco.

## 9.7 O que sobrou, e é o mais importante

**O piso de toda tela logada continua em ~900 ms, e ele é o G1** — a cascata de
autenticação, quatro idas e voltas ao Supabase para descobrir quem é o usuário,
das quais duas repetem o que o middleware acabou de fazer. `/app/perfil/ajuda`
não faz consulta nenhuma e ainda leva 896 ms; **isso é 100% G1**.

**O G1 não foi feito, por decisão tomada no início da sessão.** Boa parte desses
900 ms é distância física até `us-east-2` (~175 ms por ida e volta daqui).
Publicando na Vercel numa região perto do banco, cada ida e volta cai para
~10–30 ms e a cascata deixa de custar ~740 ms para custar ~80 ms. O G1 é a
correção de maior risco do documento — mexe em `middleware.ts` e `lib/auth.ts` e
exige reteste da matriz inteira de permissão. Fazê-lo antes de saber se o
problema ainda existe seria assumir o risco para talvez nada.

**A ordem combinada:** publicar (depois do T-8, que é o portão), **medir de novo
lá com `node scripts/medir.mjs duro`**, e só então decidir se o G1 vale o risco.
As quatro frentes feitas nesta sessão não dependem da região — nenhuma delas
vira trabalho perdido no deploy.

**Duas outras coisas visíveis agora que o resto encolheu:**

- **A navegação macia tem um piso de ~375–400 ms quando o link NÃO foi
  prefetchado** (quem clica menos de ~1 s depois de a tela abrir). Esse tempo é o
  **middleware** rodando na requisição do payload RSC: `auth.getUser()` +
  `profiles`, as mesmas duas idas e voltas. É território do G1, e é mais uma
  evidência de que ele também custa percepção, não só TTFB.
- **`/app/buscar` e `/app/perfil` são as duas telas logadas mais lentas** que
  sobraram (1155 e 1200 ms). Não foram investigadas — o escopo do T-7 era a
  lista priorizada do T-1.
