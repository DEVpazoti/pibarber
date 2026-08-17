# AUDITORIA_BUGS.md — PiBarber

**Data da auditoria:** 16 de agosto de 2026
**Commit analisado:** `0f652a1173aeeece2ef9e95382983ce6a68d6a14` — "Link de acompanhamento mostra o endereço completo, com botão de copiar"
**Branch:** `main` (árvore de trabalho limpa no momento da análise)
**Repositório:** Next.js 15.5 (App Router) + React 19 + Supabase (Postgres + Auth + Storage), multi-tenant por barbearia.

> Este documento é escrito para ser lido por alguém — humano ou agente — **sem nenhum contexto prévio**. Cada achado é autossuficiente. Nenhum arquivo de código foi alterado durante a auditoria.

**Rodada 2 (mesma data).** A primeira passagem cobriu banco, Server Actions e camada de dados, e deixou de fora a camada de páginas e componentes. Esta rodada fechou essa lacuna: **todas as 25 páginas de `/painel` e `/app` foram lidas**, os componentes de maior lógica foram inspecionados, e **`npm audit` foi executado**. Isso acrescentou BUG-018 a BUG-021 e SEC-013 a SEC-015, e transformou BUG-017 de SUSPEITA em CONFIRMADO. As lacunas que **permanecem** estão em "Pontos que não consegui verificar".

---

## Como ler este documento

Cada achado tem o campo **Status**, e ele significa exatamente isto:

| Status | O que significa |
|---|---|
| **CONFIRMADO** | O comportamento foi deduzido lendo o código-fonte citado, e o trecho está reproduzido no achado. Nenhum código foi **executado** durante esta auditoria (ver "Escopo NÃO coberto"). |
| **SUSPEITA** | Depende de estado de execução, de configuração do servidor ou de dado de produção que não foi possível inspecionar. Precisa ser reproduzido antes de virar tarefa. |

Severidade: **CRÍTICO** (dinheiro errado, dado errado ou sistema inoperante para um tenant) · **ALTO** (número exibido diverge do real, ou regra de negócio contornável) · **MÉDIO** (falha em cenário específico ou dívida que já causa efeito) · **BAIXO** (inconsistência, mensagem ruim, risco futuro).

---

## Escopo coberto

Lidos **na íntegra**:

- Configuração: `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/middleware.ts`.
- **Banco inteiro** — os 20 arquivos de `supabase/`: `01_schema.sql`, `02_functions.sql`, `03_rls.sql`, `07`–`20`. (`04_seed.sql`, `05_criar_admin.sql` e `06_apagar_dados.sql` foram lidos apenas parcialmente — ver "Escopo NÃO coberto".)
- Os 11 arquivos de Server Actions, com as **60** actions que exportam: `src/app/actions/{admin,appointments,auth,booking,client,customers,money,publico,services,shop,team}.ts`. ⚠️ `services.ts` só foi lido na **Fase 3** — a Fase 1 o listou aqui por engano, sem tê-lo lido. Ver "Grau de evidência".
- Camada de autorização e clientes Supabase: `src/lib/auth.ts`, `src/lib/env.ts`, `src/lib/supabase/{admin,client,publico,server}.ts`.
- Camada de dados: `src/lib/queries/{agenda,barbearia,cliente}.ts`.
- Apoio: `src/lib/{erros,geocoding,imagens,types,utils}.ts`.
- **Todas as páginas de `/painel`** (15 arquivos): `layout.tsx`, `page.tsx`, `agenda`, `avaliacoes`, `caixa`, `clientes`, `clientes/[id]`, `comissoes`, `configuracoes`, `equipe`, `espera`, `fiado`, `pendencias`, `relatorios`, `servicos`. Mais `/admin/page.tsx`.
- **Todas as páginas de `/app`** (10 arquivos): `page.tsx`, `agendamentos`, `notificacoes`, `perfil` e as sete subpáginas de perfil.
- Páginas públicas: `/b/[slug]`, `/b/[slug]/agendar`, `/a/[token]`, `src/app/layout.tsx`, `src/app/sitemap.ts`, e as duas Route Handlers (`(auth)/callback/route.ts`, `app/perfil/acessos/google/route.ts`).
- Componentes lidos na íntegra ou em trechos decisivos: `booking/BookingWizard.tsx`, `painel/CompleteDialog.tsx`, `painel/EquipeAcessos.tsx`, `painel/menu.ts`, `ui/Modal.tsx`, `painel/AgendaDoDia.tsx`, `painel/MapaLocalizacao.tsx`, `painel/PendenciasPainel.tsx`, `painel/NewAppointmentDialog.tsx` (fluxo de envio), `painel/ComissoesPainel.tsx` (diálogo de pagamento e idempotência), `painel/ConfiguracoesPainel.tsx` (liga/desliga do agendamento público), e os pontos de consumo de `AvaliacoesPainel.tsx` e `EsperaPainel.tsx`.
- `public/sw.js`.
- **`npm audit --omit=dev` executado**, e as versões reais lidas de `package-lock.json`.

Varreduras transversais executadas com `grep` sobre **todo** `src/`: `dangerouslySetInnerHTML`, `any` / `as unknown as`, `@ts-ignore` / `@ts-expect-error` / `eslint-disable`, `TODO`/`FIXME`, `select("*")`, `createAdminClient`, `clientePublico`, `.limit(` / `.range(`, `addEventListener` / `setInterval` / `setTimeout`, `.channel(` / `subscribe(`.

## Escopo NÃO coberto — e a lacuna que isso deixa

O repositório tem 224 arquivos versionados e ~16.700 linhas só entre SQL e `src/lib` + `src/app/actions`. **Não foi possível ler tudo.** O que ficou de fora, explicitamente:

1. **Nenhum código da aplicação foi executado.** Sem `npm run build`, sem `npm run typecheck`, sem `npm run lint`, **sem conexão com o banco**. Portanto: nenhum erro de compilação, nenhuma policy realmente aplicada em produção e nenhuma linha de dado foram verificados. Toda afirmação sobre o banco vale para **o SQL que está no repositório**, não necessariamente para o que está no Postgres do projeto Supabase. (A exceção é `npm audit`, que foi executado — ver BUG-017.)
2. **~57 dos 74 componentes de `src/components/` continuam sem leitura linha a linha** (contagem verificada na Fase 3: `find src/components -name "*.tsx" | wc -l` → 74; as rodadas anteriores diziam "~90", o que estava errado) — foram varridos por `grep` para todos os padrões de risco listados acima (`Math.random`, `window.*`, `localStorage`, `target="_blank"`, `innerHTML`, timers, listeners), o que produziu BUG-020 e SEC-011, mas não substitui leitura. **Não lidos integralmente:** `EquipeProfissionais.tsx` (675 linhas), `AgendaGrid.tsx` (446), `AdminPainel.tsx` (379), `CaixaExtrato.tsx` (336), `ServicosPainel.tsx` (321), `FiadoPainel.tsx` (249), `LocalizacaoBarbearia.tsx` (243), `AppointmentSheet.tsx` (199), e todos os de `src/components/client/`, `src/components/auth/`, `src/components/ui/` (exceto `Modal.tsx`) e `src/components/charts/`. De `ConfiguracoesPainel.tsx`, `NewAppointmentDialog.tsx` e `ComissoesPainel.tsx` foram lidos os fluxos críticos, não o arquivo inteiro. **Bugs de estado de formulário e de acessibilidade nesses arquivos não foram procurados.**
   ⚠️ Vale notar que os três componentes cujos fluxos críticos foram lidos nesta continuação renderam **um bug novo** (BUG-022) e **um agravante para outro** (o travamento da interface descrito em BUG-004). A taxa de achado por arquivo lido continua alta — o que é a melhor estimativa disponível do que resta nos 57 não lidos.
3. **Páginas ainda não lidas:** `/entrar`, `/criar-conta`, `/sem-barbearia`, `src/app/page.tsx` (a landing, 660+ linhas), `src/app/{error,not-found,manifest,robots}.tsx`, `/app/layout.tsx`, `/app/buscar`, e as subpáginas de perfil `dados`, `seguranca`, `ajuda`, `endereco`, `pessoas`, `acessos`, `espera` (lidas apenas as maiores: `page`, `historico`, `favoritos`).
4. **`supabase/04_seed.sql` (610 linhas), `05_criar_admin.sql`, `06_apagar_dados.sql`** — lidos apenas por `grep` de grants. São scripts operacionais; um erro neles não afeta a aplicação em execução, mas `06_apagar_dados.sql` merece leitura própria antes de ser usado em produção.
5. **`src/lib/database.types.ts` (1.695 linhas)** — consultado por trechos (tabelas `professionals`, `barbershops`, `reviews`), não lido integralmente.
6. **Scripts de `scripts/`** (`capturar-telas.mjs`, `dia-de-demonstracao.mjs`, `medir.mjs`) e `supabase/aplicar-sql.mjs` não foram lidos.

**Consequência prática:** a ausência de um achado neste documento **não é prova de ausência de defeito**. O item 2 continua sendo um ponto cego real — e os quatro bugs novos desta rodada (BUG-018 a BUG-021) saíram justamente da área que a rodada anterior tinha pulado, o que é a melhor evidência de que o ponto cego restante também tem conteúdo.

---

## Sumário por severidade

| Severidade | Quantidade | IDs |
|---|---|---|
| CRÍTICO | 1 | ~~BUG-001~~ — ✅ **[CORRIGIDO em 16/08/2026]**, ver o achado |
| ALTO | 7 | BUG-002, BUG-003, BUG-004, BUG-005, **BUG-017**, **BUG-018**, **BUG-019** |
| MÉDIO | 8 | BUG-006 … BUG-012, **BUG-022** |
| BAIXO | 7 | BUG-013 … BUG-016, **BUG-020**, **BUG-021**, **BUG-023** |
| **Total** | **23** | |

Status: 22 **CONFIRMADO**, 1 **SUSPEITA**.

Em negrito, os achados da rodada 2. **BUG-017 subiu de BAIXO para ALTO** depois que `npm audit` foi executado e devolveu 3 vulnerabilidades de severidade alta.

**Convenção de posição:** achados acrescentados numa rodada posterior ficam onde foram inseridos, para os identificadores não mudarem de lugar entre versões. **A severidade que vale é sempre a do cabeçalho do achado**, não a da seção — hoje isso afeta `BUG-022` (MÉDIO, na seção BAIXO) e, no documento de segurança, `SEC-006` (ALTO, na seção MÉDIO).

---

## Grau de evidência de cada achado (Fase 3)

Passagem de autocrítica: reli cada conclusão e classifiquei **por que** acredito nela.

- 🟢 **LIDO** — deduzido de código deste repositório, com `arquivo:linha` conferido. **As citações que sustentam os achados CRÍTICO e ALTO foram reconferidas uma a uma na Fase 3** e todas resolvem para o trecho afirmado.
- 🔵 **EXECUTADO** — comando rodado, saída real reproduzida no achado.
- 🟡 **INFERIDO** — a leitura está certa, mas a conclusão depende de comportamento de terceiro que não exercitei. É onde eu posso estar errado.
- 🟠 **PROJEÇÃO** — o defeito é lido; o *quando ele morde* é conta minha sobre volume de dados.

| Achado | Grau | O que exatamente não está provado |
|---|---|---|
| BUG-001 | 🟢 | — |
| **BUG-002 · BUG-003 · BUG-004** | 🟢 + 🟠 | A truncagem e a soma em JavaScript são **lidas**. Que uma barbearia real ultrapasse 500 / 5.000 / 1.000 linhas é **aritmética minha** sobre volume estimado (20 atendimentos/dia). **Não consultei o banco**, então não sei se algum cliente já passou desses tetos. Se nenhum passou, os três são bombas armadas, não incêndios em curso |
| BUG-005 | 🟢 | O caminho ativo (zerar `profiles.email` por PATCH e depois trocar a senha) depende de a RLS aceitar o `update` da coluna — que o grant de `03_rls.sql:530` concede. Lido, não testado |
| BUG-006 | 🟢 | O defeito é condicional: só morde se o horário de verão voltar. Hoje está adormecido |
| BUG-007 … BUG-016 | 🟢 | — |
| BUG-012 | 🟡 | Já marcado **SUSPEITA** no próprio achado: depende de comportamento de cookie em Server Action e do limite de taxa do Supabase |
| **BUG-017** | 🔵 | `npm audit --omit=dev` executado; saída reproduzida no achado |
| **BUG-018 · BUG-019** | 🟢 + 🟡 | A policy `profiles_select`, os embeds e os fallbacks das telas são **lidos**. É **inferência** que o embed do PostgREST degrade para `null` em vez de erro quando a RLS filtra a linha embutida. Corroborada por `supabase/10_avaliacoes_publicas.sql:9-25`, que descreve exatamente esse comportamento como observado em produção neste mesmo sistema — mas **não reproduzi** |
| BUG-020 · BUG-021 · BUG-022 · BUG-023 | 🟢 | — |

**Nada foi eliminado por falta de evidência.** Todo achado sobrevive com `arquivo:linha`. O que mudou foi a rotulagem — cinco achados passaram a declarar qual parte é inferência ou projeção, para não serem tratados como provados.

**Três correções de fato**, feitas ao conferir números que eu mesmo havia afirmado: "34 Server Actions" → **60**; "~90 componentes" → **74**; e — o mais grave — **`src/app/actions/services.ts` foi declarado lido na Fase 1 sem ter sido lido**. Foi lido na Fase 3 e rendeu **BUG-023**. Isso é um aviso sobre o resto do documento: o método achou um erro desses; pode haver outro que ele não achou.

---

# CRÍTICO

## BUG-001 — `book_appointment` é chamável por visitante anônimo e ignora horário de funcionamento, folga, almoço e o liga/desliga de agendamento sem cadastro

| Campo | Valor |
|---|---|
| **Severidade** | CRÍTICO |
| **Arquivo:linha** | `supabase/13_agendamento_avulso.sql:467` (grant) · `supabase/13_agendamento_avulso.sql:260-462` (corpo da função) · `src/app/actions/booking.ts:171-222` (a Server Action que também expõe o caminho) |
| **Status** | CONFIRMADO |

> ## ✅ [CORRIGIDO em 16/08/2026]
>
> Criada a migration **`supabase/21_fecha_book_appointment.sql`**, cobrindo os itens 1 e 2 da correção sugerida:
>
> 1. **`revoke execute … from anon`**, mantendo `authenticated`. `book_appointment_publico` é `security definer` e a chama por dentro, então o agendamento sem cadastro continua funcionando.
> 2. **A função passou a conferir `get_available_slots`** quando `v_source = 'online'` — agora respeita `business_hours`, `break_start`/`break_end`, `time_off` e `professional_schedules`. O ramo `'manual'` do painel ficou de fora de propósito, e a trava C-1 é o que garante que só quem tem `has_shop_access` alcança `'manual'`.
> 3. **Portão de migração** que faz o deploy falhar se `anon` reganhar EXECUTE, espelhando o que o arquivo 17 já fazia para `book_appointment_publico`. Verifica também que as travas C-1, C-2 e a ordem de chegada (nº 6) sobreviveram ao `create or replace`.
>
> **O item 3 (consequência de produto) foi decidido: aplicar.** O cliente logado passa a respeitar horário de funcionamento e folga — antes não respeitava. **Se alguma barbearia dependia disso, precisa ser avisada.**
>
> **Correção além do apontado:** o grant estava em **três** arquivos. `03_rls.sql:565`, `11_book_appointment_autorizacao.sql:249` e `13_agendamento_avulso.sql:467` foram todos passados para `to authenticated`, com comentário apontando para a 21 — senão reaplicar qualquer um reabriria o buraco.
>
> **NÃO foi feito:** a correção de `src/app/actions/booking.ts` (**BUG-010**, MÉDIO) ficou fora do escopo desta rodada, que tratou só os CRÍTICOS. O revoke do grant já fecha essa segunda porta na prática — sem cookie, o PostgREST trata a chamada como `anon`. **BUG-010 continua pendente** como defesa em profundidade e para tornar verdadeiro o comentário de `BookingWizard.tsx:205-214`.
>
> ⚠️ **Não executado:** sem `psql` na máquina, a migration não foi rodada nem teve a sintaxe validada. Aplicar em ambiente de teste primeiro, e confirmar o estado real do banco antes e depois (RA-3 — não há controle de versão de migrations).

### O que está errado

A função `book_appointment` recebe **`grant execute … to anon`**:

```sql
-- supabase/13_agendamento_avulso.sql:466-467
revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) from public;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) to anon, authenticated;
```

Ela é `security definer` e, lendo o corpo inteiro (linhas 260–462), **valida apenas**:

- a loja existe e `is_active` (linha 329);
- `accepts_online_booking` (linha 334);
- `min_advance_minutes` e `max_advance_days` (linhas 338-345);
- o profissional pertence à loja e está ativo (linha 348);
- os serviços pertencem à loja e estão ativos (linha 365);
- nome e telefone não vazios (linha 399-413).

**Ela NÃO consulta `get_available_slots`.** Portanto não verifica `business_hours` (loja fechada no domingo), `break_start`/`break_end` (almoço), `time_off` (férias/feriado) nem `professional_schedules` (folga fixa do profissional). A única defesa restante é a constraint `appointments_no_overlap` (`supabase/12_status_agendado.sql:97-101`), que só impede **sobreposição** — um horário vago às 3h da manhã de domingo não sobrepõe nada.

Ela também **não consulta `barbershops.allow_public_booking`**, a coluna criada em `supabase/17_agendamento_publico.sql:77-78` justamente para decidir se a loja aceita agendamento sem conta. Essa coluna **nasce desligada** (`default false`).

E não passa por **nenhum** dos seis limites anti-abuso de `book_appointment_publico` (`supabase/20_link_expira_e_rajada.sql:352-437`).

Ou seja: toda a arquitetura construída nas migrations 17 e 20 — o liga/desliga por barbearia, a validação de DDD, a conferência contra `get_available_slots`, e os limites por IP/telefone — protege **uma porta**, enquanto a porta antiga continua destrancada ao lado dela.

### Por que é problema (impacto real)

1. **A barbearia que nunca ligou "agendar sem cadastro" recebe agendamentos sem cadastro assim mesmo.** A opção nasce desligada com o comentário explícito, em `17_agendamento_publico.sql:69-71`: *"NASCE DESLIGADO, e a escolha é deliberada… Nenhuma loja deve descobrir que tem um desses por já ter um."* Hoje toda loja com `accepts_online_booking = true` já tem um.
2. **Agenda poluída com horários impossíveis.** Um agendamento às 04:00 de um domingo em que a loja está fechada aparece na grade de `/painel/agenda` e vira pendência em `/painel/pendencias`, porque nada no sistema o distingue de um agendamento legítimo.
3. **Agendamento em cima da folga do barbeiro.** `time_off` é ignorado: o profissional volta das férias com a agenda cheia.
4. **Enchimento de agenda sem custo.** Sem limite por IP e sem limite de agendamentos ativos por telefone, um script pode ocupar cada slot de 15 minutos de cada profissional de cada barbearia ativa. O `appointments_no_overlap` não ajuda — ele *garante* que cada slot preenchido bloqueie o próximo cliente real.
5. **Fichas de cliente lixo em `customers`.** `book_appointment` não valida DDD (`ddd_valido`, `17_agendamento_publico.sql:182-199`, é chamada só de `book_appointment_publico`). Telefones como `00000000000` criam fichas permanentes na aba Clientes de cada loja.

### Como reproduzir / confirmar

A chave anônima é pública por construção (fica no HTML — ver `.env.example:3-5`). Com ela:

```bash
# 1. Descobrir uma loja ativa, um profissional e um serviço (tudo legível por anon):
curl "$SUPABASE_URL/rest/v1/barbershops?select=id,slug,accepts_online_booking,allow_public_booking&is_active=eq.true" \
     -H "apikey: $ANON_KEY"
curl "$SUPABASE_URL/rest/v1/professionals?select=id&barbershop_id=eq.<SHOP_ID>" -H "apikey: $ANON_KEY"
curl "$SUPABASE_URL/rest/v1/services?select=id&barbershop_id=eq.<SHOP_ID>"      -H "apikey: $ANON_KEY"

# 2. Agendar num domingo às 04:00 numa loja com allow_public_booking = false:
curl -X POST "$SUPABASE_URL/rest/v1/rpc/book_appointment" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_shop":"<SHOP_ID>","p_professional":"<PROF_ID>",
       "p_quando":"2026-08-23T04:00:00-03:00","p_service_ids":["<SERVICE_ID>"],
       "p_nome":"Teste Auditoria","p_telefone":"00000000000"}'
```

**Resultado esperado se o bug existe:** HTTP 200 com o uuid do agendamento. O horário aparece em `/painel/agenda` do domingo. Repetir com telefones diferentes não encontra nenhum limite.

Escolha `p_quando` respeitando `min_advance_minutes` (padrão 60) e `max_advance_days` (padrão 60) — são as duas únicas travas de tempo que esse caminho aplica.

### Correção sugerida (descrição, não patch)

A raiz é o grant. Duas frentes, e a primeira sozinha já fecha o buraco:

1. **Tirar `anon` de `book_appointment`.** O único chamador anônimo legítimo é `book_appointment_publico`, que a invoca por dentro (`supabase/20_link_expira_e_rajada.sql:468`) e, sendo `security definer`, não depende do grant do chamador. `authenticated` deve permanecer, porque o cliente logado agenda por ela (`src/app/actions/booking.ts:199`). Espelhar aqui o portão que a migration 17 já criou para o caso inverso (`17_agendamento_publico.sql:719-734`): fazer a migração **falhar** se `anon` tiver EXECUTE em `book_appointment`.

2. **Fazer `book_appointment` conferir a disponibilidade real** para `v_source = 'online'`, do mesmo jeito que `book_appointment_publico` já faz (`20_link_expira_e_rajada.sql:460-465`): `exists (select 1 from get_available_slots(p_professional, v_dia, v_duracao) where slot = p_quando)`. Isso protege também o cliente **logado**, que hoje passa pelo mesmo caminho sem essa checagem. O ramo `'manual'` (painel) deve continuar sem a conferência — encaixe fora do expediente é o normal do balcão, e é a razão de `p_source` existir.

3. **Consequência de produto a decidir junto:** com (2), o cliente logado passa a respeitar horário de funcionamento e folga. Hoje ele não respeita. Se alguma barbearia depende disso, a mudança precisa ser anunciada.

Ver também **SEC-001** em `AUDITORIA_SEGURANCA.md`, que trata o mesmo defeito pelo ângulo do atacante.

---

# ALTO

## BUG-002 — A tela Caixa soma "Entrou", "Saiu" e "Sobrou" sobre uma lista truncada em 500 linhas

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/caixa/page.tsx:33-38` (a soma) e `src/app/painel/caixa/page.tsx:97` (o `.limit(500)`) |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/painel/caixa/page.tsx:31-38
const lancamentos = await carregarLancamentos(shopId, periodo.de, periodo.ate);

const entrou = lancamentos
  .filter((l) => l.type === "income")
  .reduce((acc, l) => acc + l.amount, 0);
const saiu = lancamentos
  .filter((l) => l.type === "expense")
  .reduce((acc, l) => acc + l.amount, 0);
```

E `carregarLancamentos` termina com:

```ts
// src/app/painel/caixa/page.tsx:95-97
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
```

Os três `StatCard` de dinheiro no topo da tela (`Entrou`, `Saiu`, `Sobrou` — linhas 52-71) são calculados **em JavaScript, sobre no máximo 500 linhas**, ordenadas da mais recente para a mais antiga. Passando de 500 transações no período, as mais antigas simplesmente não entram na conta — **sem nenhum aviso na tela**.

### Por que é problema

1. **Os números de dinheiro ficam menores do que a realidade**, e o erro cresce em silêncio com o movimento da barbearia. Cada atendimento concluído gera pelo menos uma linha em `transactions` (`supabase/16_pendencias.sql:192-206`), e cada forma de pagamento de um mesmo atendimento gera a sua. Uma barbearia com 20 atendimentos/dia atinge 500 transações em ~25 dias — ou seja, **o filtro "mês" já estoura no primeiro mês de uso real.**
2. **Duas telas do mesmo painel discordam sobre o mesmo número.** `/painel/relatorios` mostra "Faturamento" a partir de `dashboard_summary` (`src/app/painel/relatorios/page.tsx:34,41`), que é uma agregação feita **no Postgres sobre todas as linhas** (`supabase/02_functions.sql:1135-1141`). `/painel` (aba Hoje) usa a mesma função. Só o Caixa soma na aplicação. Para o mesmo período, Relatórios dirá R$ 12.400 e Caixa dirá R$ 9.850 — e não há nada na interface que explique a diferença.
3. É a categoria de erro mais cara possível num sistema que o dono usa para decidir se está tendo lucro: **o total continua batendo com a lista exibida**, então parece certo.

### Como reproduzir

Numa barbearia com mais de 500 linhas em `transactions` dentro do período selecionado, abrir `/painel/caixa?p=mes` e `/painel/relatorios?p=mes` lado a lado. O card "Entrou" do Caixa será menor que o card "Faturamento" dos Relatórios. Para confirmar diretamente:

```sql
select count(*), sum(amount) filter (where type='income')
  from transactions
 where barbershop_id = '<SHOP_ID>'
   and occurred_at between '<DE>' and '<ATE>';
```

Se `count` > 500, comparar `sum` com o que a tela exibe.

### Correção sugerida

Separar **o total** da **lista**, como as outras telas já fazem:

- Os três `StatCard` devem vir de `dashboard_summary(p_shop, p_de, p_ate)`, que já devolve `receita`, `despesa` e `lucro` (`supabase/02_functions.sql:1149-1156`) — agregado no banco, sobre todas as linhas, e já restrito a quem pode ver dinheiro. A tela já é `requireOwnerContext()`, então a chave estará presente.
- A lista do extrato continua paginada; o teto de 500 vira paginação de verdade (`.range()`) ou, no mínimo, um rodapé que diga "mostrando os 500 lançamentos mais recentes de N", igual ao que `/painel/pendencias` já faz com o teto de 300 (`src/lib/queries/agenda.ts:301-304`).

Nunca somar dinheiro em JavaScript sobre uma consulta com `limit`.

---

## BUG-003 — Relatórios truncam silenciosamente em 5.000 linhas: "Serviços mais vendidos" e "Desempenho por profissional" subnotificam

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/relatorios/page.tsx:222` e `src/app/painel/relatorios/page.tsx:272` |
| **Status** | CONFIRMADO |

### O que está errado

Duas consultas puxam linhas cruas e agregam em memória:

```ts
// src/app/painel/relatorios/page.tsx:209-222 — servicosMaisVendidos
const { data, error } = await supabase
  .from("appointment_services")
  .select(`price, service:services!…(name), atendimento:appointments!…(status, starts_at, barbershop_id)`)
  .eq("atendimento.barbershop_id", shopId)
  .eq("atendimento.status", "completed")
  .gte("atendimento.starts_at", faixaDoDia(de).de)
  .lt("atendimento.starts_at", faixaDoDia(ate).ate)
  .limit(5000);
```

```ts
// src/app/painel/relatorios/page.tsx:261-272 — desempenhoPorProfissional
const { data, error } = await supabase
  .from("appointments")
  .select(`id, total_price, discount, profissional:…, comissao:commissions!…(amount)`)
  .eq("barbershop_id", shopId)
  .eq("status", "completed")
  .gte("starts_at", faixaDoDia(de).de)
  .lt("starts_at", faixaDoDia(ate).ate)
  .limit(5000);
```

Ambas somam depois, em JS (linhas 231-240 e 284-293). Não há ordenação explícita, então **quais 5.000 linhas voltam é indeterminado** — é a ordem que o Postgres achar conveniente para o plano.

### Por que é problema

1. **Uma barbearia com 20 atendimentos concluídos por dia acumula ~6.000 em um ano.** O filtro de período "ano" (ou um intervalo personalizado longo) passa do teto. Como `appointment_services` tem uma linha **por serviço**, e um atendimento comum tem 1 a 3, o teto de 5.000 em `servicosMaisVendidos` é atingido em **menos de um ano** de operação normal.
2. **Sem ordenação, o corte é arbitrário.** Não é "os 5.000 mais recentes" — é "5.000 quaisquer". O ranking de serviços e a tabela de desempenho por profissional passam a refletir uma amostra sem critério, apresentada como se fosse o total.
3. A tabela "Desempenho por profissional" tem uma coluna **Comissão** (linha 154-156). Um barbeiro pode olhar para um número que é uma fração arbitrária do que ele realmente gerou.
4. Diferente do BUG-002, aqui não há uma segunda tela para denunciar a divergência — o erro é invisível.

### Como reproduzir

Selecionar um período com mais de 5.000 atendimentos concluídos (ou mais de 5.000 linhas em `appointment_services` no período) e comparar a soma da coluna "Receita" da tabela de profissionais com:

```sql
select sum(total_price - discount) from appointments
 where barbershop_id = '<SHOP_ID>' and status = 'completed'
   and (starts_at at time zone 'America/Sao_Paulo')::date between '<DE>' and '<ATE>';
```

### Correção sugerida

Agregar no banco, não na aplicação. Duas funções `security definer` novas, no mesmo molde de `comissoes_do_dia` (`supabase/15_comissao_do_dia.sql:187-250`), que já faz exatamente isso: `group by` no Postgres, checagem de permissão explícita no topo (`can_manage_money(p_shop)`), e retorno já resumido. Assim o resultado não tem teto e o custo não cresce com o histórico. Enquanto isso não existir, no mínimo acrescentar `.order()` explícito e um aviso na tela quando `data.length === 5000`.

**Nota de contexto:** `revenue_series` (`supabase/02_functions.sql:1166-1193`) já resolve esse problema para o gráfico da mesma tela — o padrão a seguir já está no repositório.

---

## BUG-004 — "Total pendente" de comissões é somado sobre 1.000 linhas; o banco deixa pagar mais do que a tela mostra

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/comissoes/page.tsx:115` (o `.limit(1000)`) e `src/app/painel/comissoes/page.tsx:158` (a soma) |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/painel/comissoes/page.tsx:98-115
const { data, error } = await supabase
  .from("commissions")
  .select(`id, amount, paid_amount, …`)
  .eq("barbershop_id", shopId)
  .or(`status.eq.pending,status.eq.partial,and(status.eq.paid,paid_at.gte.…,paid_at.lt.…)`)
  .order("created_at", { ascending: false })
  .limit(1000);
```

```ts
// src/app/painel/comissoes/page.tsx:157-158
grupo.pendentes.push(item);
grupo.totalPendente += item.amount - item.paid_amount;
```

O filtro `.or(...)` inclui **todas** as comissões `pending` e `partial`, sem recorte de período — de propósito, porque comissão pendente não tem data. Mas o `.limit(1000)` corta.

Enquanto isso, a função que efetivamente paga calcula o saldo **no banco, sem teto**:

```sql
-- supabase/08_comissao_parcial.sql:355-360
select coalesce(sum(round(amount - paid_amount, 2)), 0)
  into v_restante
  from commissions
 where barbershop_id = v_shop and professional_id = p_professional and status <> 'paid';
```

### Por que é problema

A tela e o banco discordam sobre quanto o barbeiro tem a receber. O dono lê "R$ 1.200 pendentes", digita R$ 1.200, e o pagamento passa — mas o saldo real era R$ 1.800, e o profissional continua com R$ 600 pendentes sem que ninguém entenda de onde vieram.

**E a interface impede corrigir à mão.** O diálogo de pagamento trava o valor no total truncado:

```ts
// src/components/painel/ComissoesPainel.tsx:264,298
const restante = grupo?.totalPendente ?? 0;
…
const podeEnviar = informado > 0 && informado <= restante;
```

O campo acusa *"Não dá para pagar mais do que ele tem a receber"* (linha 366) para qualquer valor acima do número truncado. Ou seja: quando a truncagem acontece, **o dono não consegue quitar a comissão pelo painel de jeito nenhum** — nem aceitando o valor errado, nem digitando o certo. A única saída seria pagar em várias parcelas, reabrindo a tela entre elas para o total ser recalculado.

Comissões pendentes **acumulam indefinidamente** até serem pagas: uma barbearia que use o painel para agendar mas pague comissão por fora chega a 1.000 linhas em poucos meses.

### Como reproduzir

```sql
select count(*) from commissions
 where barbershop_id = '<SHOP_ID>' and status <> 'paid';
```

Se > 1.000, comparar o "Total pendente" da tela com:

```sql
select professional_id, sum(round(amount - paid_amount, 2))
  from commissions
 where barbershop_id = '<SHOP_ID>' and status <> 'paid'
 group by professional_id;
```

### Correção sugerida

O **total** por profissional deve vir de uma agregação no banco (mesma recomendação do BUG-003). A **lista** de comissões individuais pode continuar com teto, desde que a tela diga que é uma amostra. O padrão correto já existe no repositório: `comissoes_do_dia` (`supabase/15_comissao_do_dia.sql`).

Observação relacionada, no mesmo arquivo: `carregarPagamentos` (`src/app/painel/comissoes/page.tsx:196-201`) traz os 500 pagamentos mais recentes **da barbearia inteira** e depois deduz, em memória, qual é o mais recente **de cada profissional** (linha 213-214). Um profissional cujo último pagamento esteja fora desses 500 desaparece do extrato e perde o botão de estorno — que continua funcionando no banco. Mesma correção de fundo.

---

## BUG-005 — Troca de senha sem conferir a senha atual quando o perfil não tem e-mail

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/actions/client.ts:232-239` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/actions/client.ts:230-241
// Confere a senha atual fazendo login com ela. Sem esta conferência,
// quem pegasse o celular destravado trocaria a senha do dono.
if (perfil.email) {
  const { error: erroConferir } = await supabase.auth.signInWithPassword({
    email: perfil.email,
    password: entrada.senhaAtual,
  });

  if (erroConferir) return falha("A senha atual está incorreta.");
}

const { error } = await supabase.auth.updateUser({ password: entrada.novaSenha });
```

A conferência inteira está dentro de `if (perfil.email)`. Quando `profiles.email` é nulo, o bloco é pulado e a troca de senha acontece **sem verificar a senha atual**.

`profiles.email` é `text` nulável (`supabase/01_schema.sql:86`) e é preenchido pelo trigger `handle_new_user()` a partir de `new.email` (`supabase/02_functions.sql:32-40`) — que também pode ser nulo. Além disso, o usuário pode **apagar o próprio e-mail** de `profiles`: o grant de coluna concede `update` em `email` a `authenticated` (`supabase/03_rls.sql:530-531`), e `salvarMeusDados` não toca nessa coluna, mas um `PATCH /rest/v1/profiles?id=eq.<meu-id>` com `{"email": null}` é aceito pela RLS (`profiles_update`, `supabase/03_rls.sql:56-59`).

### Por que é problema

O comentário no próprio código diz qual é a ameaça: *"quem pegasse o celular destravado trocaria a senha do dono"*. O cenário se realiza em duas formas:

1. **Passivamente**, para qualquer conta cujo `profiles.email` esteja nulo por origem do dado.
2. **Ativamente**: um atacante com a sessão do usuário (celular destravado, cookie roubado) primeiro zera o próprio `profiles.email` via API REST e depois troca a senha sem saber a antiga — sequestrando a conta de forma permanente, inclusive contra o dono legítimo que ainda sabe a senha antiga.

O impacto é maior num perfil `owner`: a conta dá acesso a caixa, comissões, fiado e a ficha de todos os clientes da barbearia.

### Como reproduzir

1. Com uma sessão de cliente, executar `PATCH /rest/v1/profiles?id=eq.<UID>` com corpo `{"email": null}` e a chave anônima + o token da sessão.
2. Abrir `/app/perfil/seguranca` e trocar a senha informando qualquer coisa no campo "senha atual".
3. **Se o bug existe:** a troca é aceita.

### Correção sugerida

- Não derivar a identidade de `profiles.email`, que é dado de aplicação e é editável pelo usuário. Usar o e-mail da sessão de autenticação (`supabase.auth.getUser()` → `user.email`), que vem de `auth.users` e não é gravável pela RLS de `public`.
- **Falhar fechado**: se não houver e-mail para conferir, a troca de senha deve ser **recusada** com uma mensagem que direcione ao fluxo de recuperação — nunca prosseguir.
- Considerar remover `email` da lista de colunas com `grant update` em `supabase/03_rls.sql:530`. O e-mail é a identidade de login; deixá-lo editável em `profiles` cria uma segunda fonte da verdade que diverge de `auth.users`.

Ver também BUG-011, que é o outro lado do mesmo bloco de código.

---

## BUG-017 — Três vulnerabilidades de severidade alta nas dependências de produção, confirmadas por `npm audit`

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `package.json:12-22` · versões reais em `package-lock.json` |
| **Status** | CONFIRMADO — `npm audit --omit=dev` **foi executado** nesta rodada |

### O que está errado

Saída real do comando:

```
postcss  <=8.5.22                                        Severity: high
  · XSS via Unescaped </style> in CSS Stringify Output      GHSA-qx2v-qp2m-jg93
  · Arbitrary file read via attacker-controlled sourceMappingURL   GHSA-6g55-p6wh-862q
  · incomplete fix of GHSA-6g55-p6wh-862q                   GHSA-fxqj-rqcc-2cmp
  · Path Traversal in Source Map Auto-Loading               GHSA-r28c-9q8g-f849
  node_modules/next/node_modules/postcss

sharp  <0.35.0                                           Severity: high
  · sharp inherited vulnerabilities in libvips:
    CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591
  node_modules/sharp

next  9.3.4-canary.0 - 16.3.0-preview.10
  Depends on vulnerable versions of postcss and sharp

3 high severity vulnerabilities
fix available via `npm audit fix --force`  →  instalaria next@16.3.1 (breaking change)
```

Versões realmente instaladas, lidas de `package-lock.json`:

| Pacote | Instalado | Situação |
|---|---|---|
| `next` | **15.5.23** | puxa as duas dependências vulneráveis |
| `sharp` | **0.34.5** | vulnerável (correção só em ≥ 0.35.0) |
| `postcss` (topo) | 8.5.26 | **não** vulnerável |
| `postcss` (aninhada em `next`) | ≤ 8.5.22 | **vulnerável** |
| `@supabase/ssr` | 0.12.4 | sem aviso |
| `@supabase/supabase-js` | 2.112.3 | sem aviso |
| `react` / `react-dom` | 19.2.8 | sem aviso |
| `recharts` | 3.10.1 | sem aviso |
| `leaflet` | 1.9.4 | sem aviso |

Repare que o `postcss` de topo **já está corrigido** (8.5.26 > 8.5.22). A cópia vulnerável é a que o Next carrega em `node_modules/next/node_modules/postcss`, e por isso ela não sai com um `npm update` comum.

### Por que é problema — e por que `sharp` é o item que importa

As quatro CVEs de `sharp` são de **libvips, a biblioteca nativa que processa a imagem**. E `sharp` é o motor do otimizador de imagens do Next: é ele quem baixa e reprocessa tudo que passa por `/_next/image`.

Isso encadeia diretamente com **SEC-006** (`AUDITORIA_SEGURANCA.md`): `next.config.ts:39` declara `{ protocol: "https", hostname: "**" }`, ou seja, `/_next/image` aceita **qualquer host HTTPS** como origem, sem autenticação. Somando os dois:

> Um atacante hospeda uma imagem malformada em qualquer domínio e chama
> `GET /_next/image?url=https%3A%2F%2Fdominio-dele%2Fpayload.tiff&w=1920&q=75`.
> O servidor do PiBarber baixa o arquivo e o entrega a uma versão de libvips com quatro CVEs abertas, dentro do processo que serve o site.

Nenhuma das duas condições isoladas seria alarmante: um otimizador aberto com libvips íntegro é abuso de banda; libvips vulnerável atrás de uma lista fechada de hosts confiáveis é risco baixo. **Juntas, a superfície de processamento de imagem não confiável fica exposta à internet inteira.** Foi essa combinação que fez este item subir de BAIXO (era "não verifiquei") para ALTO.

As CVEs de `postcss` são de tempo de build (processamento de CSS), não de tempo de requisição, e o CSS processado vem do próprio repositório — risco bem menor. Entram na conta porque saem junto na mesma atualização.

### Como confirmar

```bash
npm audit --omit=dev
npm ls sharp postcss next
```

Para a metade do encadeamento que está no código, ver `next.config.ts:24-40`.

### Correção sugerida

1. **Quebrar a cadeia pelo lado barato primeiro: fechar o `remotePatterns`** (SEC-006). É uma mudança de configuração, sem atualização de dependência e sem risco de regressão, e sozinha já retira a libvips vulnerável do alcance de entrada não confiável. **Faça isto antes**, mesmo que a atualização do Next demore.
2. **Atualizar `sharp` para ≥ 0.35.0.** Ele aparece como dependência de topo em `node_modules/sharp`, então pode ser possível fixá-lo por `overrides` no `package.json` sem subir o Next de major. Testar o otimizador de imagens depois — é a única coisa que usa `sharp`.
3. **Planejar a subida do Next.** O `npm audit fix --force` propõe `next@16.3.1`, que é **breaking change** e não deve ser rodado às cegas. Verificar antes se existe um patch dentro da linha 15.x que já traga o `postcss` corrigido (`npm view next@15 versions` e as notas de release), o que resolveria sem migração de major.
4. **Colocar `npm audit --omit=dev` no CI**, falhando o build em severidade alta. Sem isso, esta seção do relatório fica desatualizada na semana seguinte.

---

## BUG-018 — A tela "Lista de espera" do painel nunca mostra quem está esperando nem o telefone: a funcionalidade inteira é inoperante

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/espera/page.tsx:41` (o embed) · `supabase/03_rls.sql:47-53` (a policy que o bloqueia) · `src/components/painel/EsperaPainel.tsx:84,92,97-100` (o consumo) |
| **Status** | CONFIRMADO |

### O que está errado

A página carrega a fila embutindo o perfil da pessoa:

```ts
// src/app/painel/espera/page.tsx:37-45
const { data, error } = await supabase
  .from("waitlist_entries")
  .select(
    `id, desired_date, period, status, created_at,
     pessoa:profiles!waitlist_entries_profile_id_fkey(full_name, phone),
     profissional:professionals!waitlist_entries_professional_id_fkey(name, nickname),
     servico:services!waitlist_entries_service_id_fkey(name)`,
  )
  .eq("barbershop_id", shopId)
```

Mas a policy de leitura de `profiles` **não libera o perfil de um cliente para a equipe da barbearia**:

```sql
-- supabase/03_rls.sql:47-53
create policy profiles_select on profiles
  for select to authenticated
  using (
    id = auth.uid()                       -- o próprio
    or has_shop_access(barbershop_id)     -- o dono vendo os assistentes dele
    or is_platform_admin()
  );
```

O `barbershop_id` da condição do meio é a **coluna de `profiles`**, e ela só é preenchida para assistentes (`supabase/01_schema.sql:93-95`: *"Só o assistente usa… O dono NÃO usa esta coluna"*). O perfil de um **cliente** tem `barbershop_id = null`, e `has_shop_access(null)` retorna `false` já na primeira condição do corpo da função (`supabase/02_functions.sql:164`: `select shop is not null and (...)`).

Portanto, para toda entrada de fila: `id ≠ auth.uid()`, `has_shop_access(null) = false`, `is_platform_admin() = false`. **A linha é filtrada e o embed volta `null`.**

Não há erro. `authenticated` tem `grant select on all tables` (`supabase/03_rls.sql:521`), então o PostgREST não devolve `42501` — a RLS apenas não entrega a linha, e o embed degrada para nulo em silêncio.

O componente então mostra o fallback em todos os campos:

```tsx
// src/components/painel/EsperaPainel.tsx:84,92,97
{e.pessoa?.full_name ?? "Cliente"}
{e.pessoa?.phone ? ` · ${mascaraTelefone(e.pessoa.phone)}` : ""}
{e.pessoa?.phone ? ( /* o botão de WhatsApp */ ) : null}
```

### Por que é problema

**A lista de espera existe para uma coisa só: ligar para a pessoa quando vagar um horário.** O telefone é a razão de ser da tela — e é exatamente o campo que nunca chega.

O que o dono vê hoje em `/painel/espera`: uma lista de entradas todas chamadas **"Cliente"**, sem telefone, sem botão de WhatsApp, com data e período. Não há como saber quem é nenhuma delas nem como entrar em contato. O cabeçalho da página promete *"Quem está esperando vaga, por dia e período. Encaixe direto na agenda"* (`src/app/painel/espera/page.tsx:26`), e a tela não entrega o "quem".

Isso torna inútil toda a cadeia construída para o recurso: a policy de `waitlist_entries`, a função `join_waitlist` (`supabase/02_functions.sql:1018-1068`), o `EsperaDialog` do agendamento (`BookingWizard.tsx:1115`), a notificação automática disparada por `cancel_appointment` (`supabase/19_agendamento_de_quem_criou.sql:328-338`) e por `cancelar_por_token` (`supabase/20_link_expira_e_rajada.sql:231-241`), e as duas Server Actions `removerDaEspera` / `marcarEsperaConvertida`. Tudo funciona; só a tela final não diz para quem ligar.

### Como reproduzir

1. Com uma conta de **cliente**, entrar na fila de uma barbearia (em `/b/[slug]/agendar`, escolher um dia lotado → "Entrar na lista de espera").
2. Com a conta do **dono** daquela barbearia, abrir `/painel/espera`.
3. **Resultado esperado se o bug existe:** a entrada aparece com o nome "Cliente", sem telefone e sem botão de WhatsApp.

Confirmação direta no banco, executando como o dono:

```sql
-- devolve a linha
select id, profile_id from waitlist_entries where barbershop_id = '<SHOP_ID>';
-- devolve zero linhas: é a RLS de profiles filtrando
select id, full_name, phone from profiles where id = '<O_PROFILE_ID_ACIMA>';
```

### Correção sugerida

Não afrouxar `profiles_select`. A policy está correta e é deliberada — abrir `profiles` para `has_shop_access` entregaria à equipe o telefone, o e-mail e a data de nascimento de **todo cliente da plataforma** que por acaso tivesse `barbershop_id` preenchido, e ampliaria a superfície bem além do necessário.

O padrão certo já existe no repositório e foi criado para este exato problema: **uma função `security definer` que lê `profiles` por dentro e devolve só o recorte necessário**, como `public_reviews()` faz em `supabase/10_avaliacoes_publicas.sql:51-96`.

Criar `waitlist_da_loja(p_shop uuid)`, `security definer`, que:
- confere `has_shop_access(p_shop)` no topo, como `comissoes_do_dia` faz (`supabase/15_comissao_do_dia.sql:211-213`);
- devolve as entradas da fila com `full_name` e `phone` do perfil;
- e nada mais de `profiles` — nem e-mail, nem data de nascimento.

Assim a equipe recebe exatamente o que precisa para ligar, e a policy de `profiles` continua fechada.

**Ver também BUG-019: é o mesmo defeito, na tela de avaliações.**

---

## BUG-019 — O dono nunca vê quem escreveu cada avaliação; toda avaliação do painel assina "Cliente"

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/avaliacoes/page.tsx:68` (o embed) · `supabase/03_rls.sql:47-53` (a policy) · `src/components/painel/AvaliacoesPainel.tsx:87` (o fallback) |
| **Status** | CONFIRMADO |

### O que está errado

Exatamente o mesmo mecanismo do BUG-018, em outra tela:

```ts
// src/app/painel/avaliacoes/page.tsx:64-73
const { data, error } = await supabase
  .from("reviews")
  .select(
    `id, rating, comment, reply, created_at,
     autor:profiles!reviews_profile_id_fkey(full_name),
     profissional:professionals!reviews_professional_id_fkey(name, nickname)`,
  )
  .eq("barbershop_id", shopId)
```

`profiles_select` filtra a linha do cliente; `autor` volta `null`; e o componente mostra o fallback:

```tsx
// src/components/painel/AvaliacoesPainel.tsx:87
{avaliacao.autor ?? "Cliente"} · {dataBR(avaliacao.created_at)}
```

### Por que este achado é diferente: o defeito **já foi diagnosticado neste repositório e a correção parou no meio**

A migration `supabase/10_avaliacoes_publicas.sql` existe para consertar exatamente esta falha. O cabeçalho dela descreve as **duas** metades do problema (linhas 21-25):

> *"Para quem estava LOGADO a consulta passava (authenticated tem o grant), mas a policy `profiles_select` só libera o próprio perfil — então `autor` vinha nulo e toda avaliação assinava 'Cliente'.* ***Inclusive para o dono, que não tinha como saber quem havia reclamado da barbearia dele.***"

A migração criou `public_reviews()` e a aplicação passou a usá-la — **mas só no perfil público** (`src/lib/queries/barbearia.ts:267-281`). A tela do painel continuou com o embed direto. O bug foi documentado por escrito, e a metade que o próprio comentário destaca em itálico ("inclusive para o dono") nunca foi corrigida.

### Por que é problema

Responder a uma avaliação é uma das poucas ferramentas de reputação que o dono tem, e a Server Action `responderAvaliacao` existe justamente para isso (`src/app/actions/shop.ts:405`). Mas o dono responde **no escuro**: não sabe se a crítica veio de um cliente fiel de cinco anos ou de alguém que foi atendido uma vez. Não consegue cruzar a reclamação com a ficha da pessoa em `/painel/clientes` para entender o que aconteceu, nem ligar para resolver.

Há uma ironia adicional: **o visitante anônimo em `/b/[slug]` vê mais do que o dono.** `public_reviews()` devolve o nome abreviado ("Guilherme S.", `supabase/10_avaliacoes_publicas.sql:79-84`), enquanto o painel do dono mostra "Cliente".

### Como reproduzir

Com a conta do dono de uma barbearia que tenha avaliações de clientes, abrir `/painel/avaliacoes`. Todas as linhas assinam "Cliente". Comparar com `/b/<slug>?aba=avaliacoes`, aberto numa janela anônima: ali os nomes abreviados aparecem.

### Correção sugerida

A mais barata: **usar `public_reviews()` também no painel**, já que ela é `security definer`, tem `grant execute … to anon, authenticated` (`supabase/10_avaliacoes_publicas.sql:111`) e devolve `autor` já resolvido. Custo: trocar o `.from("reviews").select(...)` por `.rpc("public_reviews", { p_shop: shopId, limite: 200 })`.

Ressalva a decidir junto: `public_reviews()` **abrevia** o nome, o que é a decisão certa para a página pública indexada pelo Google (justificada em `10_avaliacoes_publicas.sql:32-36`) e provavelmente não é o que o dono precisa — ele quer identificar a pessoa. Se o nome completo for desejável no painel, criar uma segunda função `security definer` que confira `has_shop_access(p_shop)` no topo e devolva o nome inteiro. **Nesse caso as duas funções precisam existir**, e a diferença entre elas — quem chama, e quanto cada uma revela — deve ficar escrita, senão a próxima pessoa unifica as duas e reabre o vazamento que a migração 10 fechou.

---

# MÉDIO

## BUG-006 — O fuso horário é gravado como offset fixo `-03:00`, e não como a zona `America/Sao_Paulo`

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/lib/utils.ts` — função `timestampSP` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
export function timestampSP(diaISO: string, hora: string): string {
  const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;
  return `${diaISO}T${horaCompleta}-03:00`;
}
```

O offset `-03:00` está escrito à mão. Todo instante que entra no banco passa por aqui: `criarAgendamento` (`src/app/actions/appointments.ts:101`), `agendar` (`src/app/actions/booking.ts:202`), `agendarSemLogin` (`src/app/actions/publico.ts:164`), `registrarFolga` (`src/app/actions/team.ts:227-228`) e `faixaDoDia` — que por sua vez recorta **todas** as consultas por dia da agenda, das pendências e dos relatórios.

Do outro lado, **o banco usa a zona nomeada**, não o offset: `at time zone 'America/Sao_Paulo'` aparece em `get_available_slots` (`supabase/02_functions.sql:410-411`), `complete_appointment` (`supabase/16_pendencias.sql:115`), `comissoes_do_dia` (`supabase/15_comissao_do_dia.sql:242`), `cancel_appointment` e outras.

### Por que é problema

Hoje os dois concordam, porque o Brasil aboliu o horário de verão em 2019 e está permanentemente em UTC−3. **O bug é condicional e está adormecido:** no dia em que o horário de verão voltar (é assunto reaberto periodicamente), `America/Sao_Paulo` passa a valer UTC−2 em parte do ano e o `-03:00` fixo **não acompanha**. O efeito seria:

- todo agendamento novo criado **uma hora fora do lugar**;
- as fronteiras de dia (`faixaDoDia`) deslocadas em uma hora, jogando o atendimento das 23h de um dia no outro nos relatórios;
- divergência entre o que a aplicação grava e o que as funções do banco calculam, **na mesma linha**.

O risco é agravado por o código-fonte anunciar o contrário do que faz: `src/lib/utils.ts:1-7` diz *"Toda formatação de data e hora fixa o fuso em America/Sao_Paulo de propósito"* — o que é verdade para a **leitura** (`Intl.DateTimeFormat` com `timeZone: FUSO`), mas não para a **escrita**, que é justamente onde o offset fixo está.

### Como confirmar

Ler `src/lib/utils.ts` (`timestampSP`, `faixaDoDia`, `hojeISO`) e comparar com os `at time zone 'America/Sao_Paulo'` do SQL citado. Para testar o cenário futuro sem esperar uma lei: numa cópia do banco, aplicar `set timezone` e comparar o resultado de `select ('2026-08-23T14:00:00-03:00'::timestamptz)` com `select (('2026-08-23'::date + '14:00'::time) at time zone 'America/Sao_Paulo')`.

### Correção sugerida

Não montar o instante com string. Ou (a) enviar `dia` e `hora` **separados** para o Postgres e deixar a conversão para o banco, que já tem a base de fusos (`(p_dia + p_hora) at time zone 'America/Sao_Paulo'`, exatamente como `get_available_slots` faz na linha 410); ou (b) usar a API de fuso do próprio JS para resolver o offset **daquela data específica** em vez de assumir um valor. A opção (a) é a que elimina a segunda fonte da verdade.

Se a decisão for **manter** o offset fixo, isso deve virar um comentário explícito no topo de `timestampSP` dizendo que é uma aposta em "o Brasil não voltar ao horário de verão", em vez de um `-03:00` sem justificativa no meio de uma template string.

---

## BUG-007 — Folga registrada termina às 23:59, deixando o último minuto do último dia sem cobertura

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/team.ts:227-228` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/actions/team.ts:222-229
const { error } = await supabase.from("time_off").insert({
  barbershop_id: shopId,
  professional_id: entrada.professionalId,
  // O dia inteiro: da meia-noite à meia-noite do dia seguinte, no fuso
  // de São Paulo. Sem isso, uma folga "de 10 a 12" liberaria o dia 12.
  starts_at: timestampSP(entrada.primeiroDia, "00:00"),
  ends_at: timestampSP(entrada.ultimoDia, "23:59"),
  reason: entrada.motivo?.trim() || null,
});
```

O comentário diz "da meia-noite à meia-noite do dia seguinte". O código grava **23:59:00** do último dia, não 00:00 do dia seguinte. O helper para isso já existe e é usado em toda a camada de consulta: `faixaDoDia(dia).ate`, que é `timestampSP(somarDias(dia, 1), "00:00")`.

### Por que é problema

`get_available_slots` testa a sobreposição com `tstzrange(t.starts_at, t.ends_at) && tstzrange(v_cursor, v_cursor + v_duracao)` (`supabase/02_functions.sql:433`). Um slot que comece às 23:59:00 ou depois do último dia da folga **não sobrepõe** o intervalo e continua sendo oferecido.

Na prática o impacto é pequeno — nenhuma barbearia atende às 23:59. Mas o defeito é do tipo que só aparece quando alguém configura um horário incomum, e aí é um agendamento marcado em cima de uma férias que o sistema afirmava estar bloqueada. **O comentário do código descreve o comportamento correto, e o código não o implementa** — o que torna o defeito invisível numa revisão rápida.

### Como reproduzir

Registrar uma folga e conferir no banco:

```sql
select starts_at, ends_at from time_off where barbershop_id = '<SHOP_ID>' order by created_at desc limit 1;
```

O `ends_at` estará em `…T23:59:00-03:00`, não em `00:00` do dia seguinte.

### Correção sugerida

Trocar `timestampSP(entrada.ultimoDia, "23:59")` por `faixaDoDia(entrada.ultimoDia).ate`, que já existe em `src/lib/utils.ts` e significa exatamente "meia-noite do dia seguinte". Isso alinha o código com o comentário e com o resto da base.

---

## BUG-008 — Responder avaliação é do dono na tela, mas o banco permite ao assistente

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/shop.ts:410` (exige dono) vs. `supabase/03_rls.sql:411-415` e `supabase/03_rls.sql:427` (permitem a equipe) |
| **Status** | CONFIRMADO |

### O que está errado

A Server Action exige o dono:

```ts
// src/app/actions/shop.ts:405-410
export async function responderAvaliacao(reviewId: string, resposta: string): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
```

Mas a policy de update em `reviews` aceita qualquer pessoa com acesso à loja:

```sql
-- supabase/03_rls.sql:411-415
create policy reviews_update on reviews
  for update to authenticated
  using (profile_id = auth.uid() or has_shop_access(barbershop_id))
  with check (profile_id = auth.uid() or has_shop_access(barbershop_id));
```

E o trigger que protege a coluna `reply` usa o mesmo helper permissivo:

```sql
-- supabase/03_rls.sql:427
if new.reply is distinct from old.reply and not has_shop_access(new.barbershop_id) then
```

`has_shop_access` inclui o assistente (`supabase/02_functions.sql:157-174`); `can_manage_money` não (`supabase/02_functions.sql:180-191`). A intenção de produto, expressa no comentário do próprio arquivo de actions (`src/app/actions/shop.ts:400-402` — *"Responder avaliação é do dono: a resposta aparece publicamente em `/b/[slug]` com o nome da loja"*), é a segunda.

### Por que é problema

Um assistente pode publicar, **em nome da barbearia e em público**, uma resposta a uma avaliação — bastando um `PATCH /rest/v1/reviews?id=eq.<ID>` com `{"reply": "..."}` usando a chave anônima e o token da sessão dele. A tela não oferece o botão, mas o menu escondido não é a trava.

O resto do arquivo `03_rls.sql` é rigoroso justamente sobre essa distinção (linhas 10-13: *"Dado financeiro → can_manage_money(); Dado operacional → has_shop_access()"*), e trata "o que a loja anuncia ao público" como decisão do dono em toda parte — `services_write`, `professionals_write`, `barbershop_amenities_write` e `business_hours_write` usam `can_manage_money`. A resposta pública a uma avaliação é do mesmo naipe e ficou de fora.

O impacto é **reputacional, não de vazamento**: o assistente já é pessoal de confiança da loja e já enxerga a agenda e os clientes.

### Como reproduzir

Com a sessão de um `assistant`, emitir o PATCH acima contra uma review da barbearia dele. Se o bug existe, a resposta aparece em `/b/[slug]` na aba Avaliações.

### Correção sugerida

Escolher **um** dos dois lados e alinhar o outro:

- Se responder é do dono: trocar `has_shop_access` por `can_manage_money` nas duas ocorrências (a policy `reviews_update` e o `reviews_guard_reply`). Cuidado: a policy também é a que deixa o **cliente autor** editar a própria avaliação (`profile_id = auth.uid()`), e essa parte deve permanecer.
- Se responder é da equipe: trocar `requireOwnerContext()` por `requireShopContext()` em `responderAvaliacao` e mover o item de menu.

Recomendação: a primeira, porque é a que o comentário do código já declara como intenção.

---

## BUG-009 — `cancelarPorToken` não valida o formato do token antes de ir ao banco (assimetria com `buscarPorToken`)

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/publico.ts:275-287` (sem validação) vs. `src/app/actions/publico.ts:242-245` (com validação) |
| **Status** | CONFIRMADO |

### O que está errado

A leitura valida:

```ts
// src/app/actions/publico.ts:242-245
export async function buscarPorToken(token: string): Promise<AgendamentoPorToken | null> {
  const formatoUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!formatoUUID.test(token)) return null;
```

O cancelamento, não:

```ts
// src/app/actions/publico.ts:275-286
export async function cancelarPorToken(token: string, motivo?: string): Promise<ActionResult> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("cancelar_por_token", {
      p_token: token,
      p_motivo: motivo?.trim() || undefined,
    });
```

O comentário em `buscarPorToken` explica exatamente por que a validação existe (linhas 240-241): *"Formato de token conferido ANTES de ir ao banco: sem isso, cada visita a `/a/qualquer-coisa` viraria uma consulta, e varrer a rota ficaria barato."* O mesmo raciocínio se aplica ao cancelamento, que é uma **Server Action chamável diretamente**, sem passar pela página.

### Por que é problema

1. **A defesa contra varredura só cobre metade da superfície.** `cancelarPorToken` é uma Server Action exportada: qualquer um pode invocá-la com valores arbitrários, cada chamada gerando uma ida ao Postgres com a **service role** (que ignora RLS).
2. **Mensagem de erro ruim.** Um token malformado faz o Postgres devolver `22P02` (formato inválido), que `traduzirErroBanco` converte em *"Algum valor está em formato inválido"* (`src/lib/erros.ts:91-92`) — enquanto a página de leitura, para o mesmo token, diz *"Este link não vale mais"*. Duas respostas diferentes para a mesma entrada.
3. **Assimetria de oráculo.** A página `/a/[token]` foi cuidadosamente desenhada para não distinguir "não existe", "não é seu" e "expirou" (`src/app/a/[token]/page.tsx:46-49`). O cancelamento **distingue**: token malformado dá `22P02`, token válido mas inexistente dá `P0001 'Não encontrei esse agendamento'`, e token válido mas vencido dá `P0001 'Esse link expirou'` (`supabase/20_link_expira_e_rajada.sql:190,196-197`). São três respostas diferentes — um oráculo que confirma quais uuids existem, exatamente o que o comentário de `17_agendamento_publico.sql:663-666` diz querer evitar.

### Como reproduzir

Invocar a Server Action `cancelarPorToken` com `"nao-e-um-uuid"`, com um uuid válido inexistente e com o token de um agendamento vencido. Comparar as três mensagens devolvidas.

### Correção sugerida

Extrair a validação de formato para um helper compartilhado no mesmo arquivo e aplicá-lo nas **duas** funções. Além disso, uniformizar a resposta do cancelamento para os casos "não achei" e "expirou" numa frase só, espelhando a decisão já tomada na página — a distinção entre "nunca existiu" e "venceu" não ajuda quem tem o link e ajuda quem não tem.

---

## BUG-010 — A Server Action `agendar` funciona sem sessão e contorna todo o portão do agendamento público; a escolha do caminho certo mora só no navegador

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/booking.ts:183,192-195,199-210` · a escolha do caminho em `src/components/booking/BookingWizard.tsx:215-247` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/actions/booking.ts:182-210
const perfil = await getProfile();          // pode ser null — não é requireProfile()

if (entrada.serviceIds.length === 0) return falha("Escolha pelo menos um serviço.");
…
if (!perfil) {
  if (nome.length < 2) return falha("Informe seu nome.");
  if (telefone.length < 10) return falha("Informe seu celular com DDD.");
}

const supabase = await createClient();
const { data, error } = await supabase.rpc("book_appointment", { …, p_profile: perfil?.id, … });
```

`agendar` aceita explicitamente o visitante sem conta. A separação entre "com sessão" e "sem sessão" é feita **no componente de cliente**:

```tsx
// src/components/booking/BookingWizard.tsx:215-236
if (!logado) {
  const resultado = await agendarSemLogin({ … });   // caminho com limites
  …
  return;
}
const resultado = await agendar({ … });             // caminho sem limites
```

Uma Server Action é um endpoint HTTP. Nada impede chamar `agendar` diretamente, sem sessão, e cair no caminho que **não** passa por `allow_public_booking`, pela validação de DDD, pela conferência contra `get_available_slots` nem por nenhum dos seis limites de `book_appointment_publico`.

### Por que é problema

É a mesma falha do BUG-001, por uma segunda porta: mesmo que o grant de `anon` em `book_appointment` seja revogado no banco, **esta rota continuaria aberta**, porque a Server Action roda no servidor da Vercel e usa a chave anônima com o cookie de sessão — e sem cookie o PostgREST a trata como `anon`… *que perderia o grant*. Ou seja: revogar o grant **conserta** os dois, mas quem ler só o `BookingWizard.tsx` não perceberá que a Server Action era uma segunda entrada.

O comentário no próprio wizard (linhas 205-214) afirma: *"DOIS CAMINHOS, e eles não se misturam… Sem sessão: `agendarSemLogin`… e o servidor recusa mesmo que a tela seja burlada."* A última frase é falsa para `agendar`, que não recusa nada quando não há sessão.

### Como reproduzir

Enviar o POST de Server Action correspondente a `agendar` sem cookie de sessão (copiar a requisição das DevTools de um fluxo logado e remover o header `Cookie`). Se o bug existe, o agendamento é criado mesmo numa loja com `allow_public_booking = false`.

### Correção sugerida

Duas mudanças, ambas pequenas:

1. Em `agendar`, trocar `getProfile()` por `requireProfile()` — ou, se `redirect()` não for desejável numa action chamada por `fetch`, retornar `falha(...)` explicitamente quando não houver perfil. `agendar` passa a ser **exclusivamente** o caminho de quem tem conta, e o visitante sem sessão passa a ter uma porta só: `agendarSemLogin`.
2. Remover, junto, o bloco de validação `if (!perfil) { … }` das linhas 192-195, que só existe para suportar o caso que deixa de existir.

Isso torna a afirmação do comentário do `BookingWizard` verdadeira.

---

## BUG-011 — Conta criada pelo Google nunca consegue definir uma senha

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/client.ts:232-239` |
| **Status** | CONFIRMADO |

### O que está errado

O mesmo bloco do BUG-005, pelo outro lado:

```ts
// src/app/actions/client.ts:232-239
if (perfil.email) {
  const { error: erroConferir } = await supabase.auth.signInWithPassword({
    email: perfil.email,
    password: entrada.senhaAtual,
  });
  if (erroConferir) return falha("A senha atual está incorreta.");
}
```

Uma conta nascida por OAuth do Google **não tem senha**. `signInWithPassword` com qualquer valor devolve `Invalid login credentials`, e a action responde *"A senha atual está incorreta."* — para sempre.

O código do projeto **sabe disso**: a tradução de erro do login tem uma dica dedicada a esse caso, com o motivo escrito por extenso (`src/app/actions/auth.ts:23-33`): *"Uma conta nascida pelo OAuth não tem senha, e tentar entrar com uma devolve exatamente este erro."* O conhecimento existe na tela de login e não chegou na tela de segurança.

### Por que é problema

O usuário que entrou pelo Google e quer acrescentar uma senha (para não depender do Google, ou porque perdeu acesso à conta Google) fica preso num formulário que sempre acusa erro. A tela `/app/perfil/acessos` oferece **vincular** o Google (`src/app/app/perfil/acessos/google/route.ts`) e **desvincular** métodos (`desvincularAcesso`, `src/app/actions/client.ts:269-303`) — mas `desvincularAcesso` recusa remover o último método (linhas 281-285). Resultado: um usuário só-Google **não pode** criar senha nem remover o Google. Ele está permanentemente amarrado ao provedor, e a mensagem de erro não explica isso.

### Como reproduzir

1. Criar uma conta pelo botão "Entrar com Google".
2. Abrir `/app/perfil/seguranca` e tentar definir uma senha, deixando "senha atual" vazia ou com qualquer valor.
3. **Resultado:** *"A senha atual está incorreta."*, em toda tentativa.

### Correção sugerida

Detectar o caso e mudar o fluxo, em vez de mudar a mensagem:

- Ler as identidades da conta com `supabase.auth.getUserIdentities()` — a mesma chamada que `desvincularAcesso` já faz (`src/app/actions/client.ts:274`).
- Se **não** houver identidade do tipo `email`, a tela deve mostrar "Criar senha" em vez de "Trocar senha", esconder o campo "senha atual" e chamar `updateUser({ password })` direto. Definir a primeira senha numa sessão já autenticada é o fluxo padrão e não exige senha anterior — não existe senha anterior.
- Se **houver**, o fluxo atual vale, com a correção do BUG-005 (usar o e-mail da sessão, não `profiles.email`).

---

## BUG-012 — `trocarSenha` cria uma sessão nova como efeito colateral de validar a senha

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/client.ts:233-236` |
| **Status** | SUSPEITA |

### O que está errado

```ts
const { error: erroConferir } = await supabase.auth.signInWithPassword({
  email: perfil.email,
  password: entrada.senhaAtual,
});
```

`signInWithPassword` não é uma função de verificação: é uma função de **login**. Em caso de sucesso ela emite um par de tokens novo e — como o cliente vem de `createClient()` de `src/lib/supabase/server.ts`, que grava cookies via `cookieStore.set` (linhas 22-31) — **substitui o cookie de sessão em curso**.

### Por que é problema

1. **Rotação de sessão não intencional no meio de uma operação.** A sessão anterior é trocada por uma nova antes mesmo de a senha ser alterada. Se `updateUser` falhar logo em seguida (linha 241), o usuário fica com uma sessão que não corresponde a nenhuma ação que ele pediu.
2. **Consome a cota de tentativas de login do projeto.** O Supabase Auth aplica limite de taxa em `signInWithPassword`. Um usuário que erre a senha atual algumas vezes na tela de segurança pode ser bloqueado **na tela de login**, sem entender a relação. A tradução de erro do projeto já prevê `rate limit` (`src/app/actions/auth.ts:51-53`), mas `trocarSenha` não a usa — ela devolve o genérico *"A senha atual está incorreta."* para o caso de bloqueio, o que é uma mensagem **errada**.
3. **Poluição de auditoria.** Cada troca de senha registra um evento de login nos logs do Supabase Auth.

Marcado como **SUSPEITA** porque o comportamento exato de reescrita de cookie dentro de uma Server Action e o limite de taxa efetivo do projeto dependem de configuração do Supabase e do runtime, e nada foi executado.

### Como confirmar

Numa sessão de teste, anotar o valor do cookie `sb-<projeto>-auth-token` antes e depois de uma troca de senha bem-sucedida. Se o valor mudar antes de `updateUser` rodar, o efeito colateral está confirmado. Em seguida, errar a senha atual ~10 vezes seguidas e observar se o login normal passa a devolver erro de limite.

### Correção sugerida

Se o objetivo é apenas **verificar** a senha sem logar, usar um cliente Supabase descartável — `createSupabaseClient(url, anonKey, { auth: { persistSession: false } })`, o mesmo padrão de `src/lib/supabase/admin.ts:30-36` mas com a chave anônima — de modo que o token emitido não toque nos cookies da requisição. Independentemente disso, traduzir o erro de limite de taxa separadamente do erro de senha incorreta, reaproveitando `traduzirErroAuth` de `src/app/actions/auth.ts`.

---

# BAIXO

> **Nota de leitura:** `BUG-022` aparece nesta seção mas está classificado **MÉDIO**. Ele foi acrescentado depois, e mantido aqui para os identificadores não mudarem de posição entre versões deste documento — a severidade que vale é sempre a do cabeçalho do achado, nunca a da seção. Mesma convenção usada em `SEC-006` no documento de segurança.

## BUG-013 — Desconto negativo só é barrado pela constraint da coluna, com mensagem genérica

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `supabase/16_pendencias.sql:99,138-140` · `src/app/actions/appointments.ts:169` |
| **Status** | CONFIRMADO |

`complete_appointment` valida o teto do desconto, mas não o piso:

```sql
-- supabase/16_pendencias.sql:138-140
if v_desconto > v_total then
  raise exception 'O desconto não pode ser maior que o total do atendimento.';
end if;
```

Nem a Server Action valida (`src/app/actions/appointments.ts:169` só arredonda: `p_desconto: Math.round(entrada.desconto * 100) / 100`).

Com `p_desconto = -100`, `v_liquido` vira `total + 100`; a conferência da soma dos pagamentos passa se o chamador enviar esse valor; e a operação só falha no `update appointments set … discount = v_desconto`, contra o `check (discount >= 0)` da coluna (`supabase/01_schema.sql:318`). A transação inteira volta atrás — **o dinheiro não fica errado** — mas o usuário lê *"Algum valor informado está fora do permitido. Confira os campos."* (`src/lib/erros.ts:85-86`), que não diz qual campo nem o quê.

**Correção:** acrescentar `if v_desconto < 0 then raise exception 'O desconto não pode ser negativo.'; end if;` logo antes da checagem do teto, e o espelho na Server Action para o erro voltar sem uma ida ao banco. É o mesmo padrão que o resto do arquivo já usa.

---

## BUG-014 — `buscarClientes` monta o filtro `.or()` do PostgREST por interpolação de string

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `src/app/actions/customers.ts:49,63-68` |
| **Status** | CONFIRMADO |

```ts
// src/app/actions/customers.ts:49
const limpo = termo.trim().replace(/[%,()]/g, "");
const digitos = limpo.replace(/\D/g, "");
…
// linhas 63-68
consulta =
  digitos.length >= 3
    ? consulta.or(`full_name.ilike.%${limpo}%,phone.ilike.%${digitos}%`)
    : consulta.ilike("full_name", `%${limpo}%`);
```

A sanitização remove `%`, `,`, `(` e `)` — os caracteres que a gramática de filtros do PostgREST usa como separador e agrupador. **Isto não é SQL injection**: o PostgREST parametriza os valores antes de chegar ao Postgres, e a lista negra cobre os metacaracteres relevantes da camada de filtro. Além disso, o `.eq("barbershop_id", shopId)` (linha 55) é um filtro **separado** do `.or()`, então nem um `or` injetado com sucesso escaparia do recorte por barbearia.

O problema é de **robustez, não de segurança**: uma lista negra de quatro caracteres é frágil por construção, e a próxima pessoa que precisar de outra busca copiará este padrão para um lugar onde o `eq` de tenant não exista. O `*` não é removido e é tratado como coringa pelo PostgREST em `ilike`.

**Correção:** usar filtros compostos da própria API (`.or()` com `PostgrestFilterBuilder` recebendo referências, ou duas consultas unidas em memória), ou uma função `security definer` que receba o termo como parâmetro e monte o `ilike` no Postgres. E documentar, onde este padrão ficar, que o `.eq("barbershop_id")` é o que garante o isolamento — não a sanitização.

---

## BUG-015 — O status `confirmed` está morto mas continua referenciado em três funções do banco e no mapa de rótulos da UI

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `supabase/12_status_agendado.sql:104-113` (a decisão) · `supabase/02_functions.sql:440,1113,1234,1252` (as referências vivas) · `src/lib/types.ts:313,325` |
| **Status** | CONFIRMADO |

A migration 12 unificou `confirmed` em `scheduled`, migrou os dados e recriou a constraint `appointments_no_overlap` sem o valor (`supabase/12_status_agendado.sql:97-101`). Mas deixou, de propósito e documentado (linhas 104-113), três funções ainda citando `in ('scheduled', 'confirmed')`:

- `get_available_slots` — `supabase/02_functions.sql:440`
- `dashboard_summary` — `supabase/02_functions.sql:1113`
- `client_home` — `supabase/02_functions.sql:1234,1252` (e a versão viva, em `supabase/19_agendamento_de_quem_criou.sql:183,200`)

E na aplicação, `STATUS_AGENDAMENTO.confirmed` (`src/lib/types.ts:313`) e `emAberto()` (linha 325).

**Isto não é um bug hoje** — nenhum caminho escreve `confirmed`, e o resultado das funções é idêntico. É dívida com uma armadilha embutida, e a própria migration a anota (`supabase/12_status_agendado.sql:175-178`): se alguém rodar a PARTE B (limpeza do enum), **as três funções deixam de compilar** contra o tipo novo. O comentário existe dentro do bloco comentado da PARTE B, ou seja, só é lido por quem já está prestes a executá-la.

**Correção:** ou executar a limpeza completa (PARTE B + reescrever as três funções + limpar `types.ts`) numa janela de manutenção, ou registrar o item num lugar que seja lido antes — não dentro do bloco comentado que ele descreve.

---

## BUG-016 — A ficha do cliente lê histórico e fiado sem filtrar por barbearia

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `src/app/painel/clientes/[id]/page.tsx:208` e `src/app/painel/clientes/[id]/page.tsx:241-242` |
| **Status** | CONFIRMADO |

```ts
// linha 201-210 — carregarHistorico
.from("appointments").select(…).eq("customer_id", customerId).order(…).limit(50)

// linha 238-242 — carregarFiadoAberto
.from("debts").select("original_amount, paid_amount")
  .eq("customer_id", customerId).in("status", ["open", "partial"])
```

Nenhuma das duas filtra por `barbershop_id`, enquanto a consulta da própria ficha, logo acima, filtra (`linha 51-52`: `.eq("id", id).eq("barbershop_id", shopId)`).

**Não é uma vulnerabilidade.** `customers` é uma ficha **por barbearia** (`supabase/01_schema.sql:260-281`), então um `customer_id` pertence a exatamente uma loja; e a RLS de `appointments` (`supabase/19_agendamento_de_quem_criou.sql:85-91`) e de `debts` (`supabase/03_rls.sql:473-479`) já recorta por `has_shop_access`. Duas camadas cobrem.

O problema é de **consistência de padrão**. O projeto pratica defesa em profundidade de forma explícita e documentada em todo o resto — `src/app/actions/client.ts:17-20` diz: *"A RLS já limita cada tabela ao `auth.uid()`, mas o filtro também é escrito à mão em cada consulta: duas travas custam uma linha e evitam a categoria inteira de bug em que uma policy mal escrita vira vazamento."* Estes dois pontos são a exceção, sem comentário explicando por quê.

**Correção:** acrescentar `.eq("barbershop_id", shopId)` em `carregarHistorico` (passando `shopId` como segundo parâmetro) e em `carregarFiadoAberto`. Uma linha em cada, e o arquivo passa a seguir a regra que o resto do projeto anuncia.

---

## BUG-022 — Quem agenda sem cadastro aparece como "Balcão" na aba Clientes, e a tela de configurações promete um rótulo que não existe

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/painel/clientes/page.tsx:36-40` (a função `origem`) · `src/components/painel/ConfiguracoesPainel.tsx:353-357` (a promessa) · `supabase/13_agendamento_avulso.sql:425-428` (o insert que produz o estado) |
| **Status** | CONFIRMADO |

### O que está errado

A aba Clientes classifica a origem de cada ficha com três ramos:

```ts
// src/app/painel/clientes/page.tsx:36-40
function origem(c: ClienteDaLista): { rotulo: string; tom: "brass" | "info" | "neutro" } {
  if (c.profile_id) return { rotulo: "App", tom: "brass" };
  if (c.is_walk_in) return { rotulo: "Avulso", tom: "neutro" };
  return { rotulo: "Balcão", tom: "info" };
}
```

E o comentário logo acima (linhas 25-35) define o que cada um significa — **"Balcão → o barbeiro cadastrou a ficha na mão"**.

Agora, o estado que uma ficha criada por agendamento público assume. Em `book_appointment`, o caminho do agendamento sem conta tem `v_profile = null` (repassado por `book_appointment_publico`, `supabase/20_link_expira_e_rajada.sql:471`) e telefone preenchido, o que faz `v_avulso` permanecer `false`:

```sql
-- supabase/13_agendamento_avulso.sql:425-428
if v_customer is null then
  insert into customers (barbershop_id, profile_id, full_name, phone, is_walk_in)
  values (p_shop, v_profile, v_nome, v_telefone, v_avulso);
```

Resultado: `profile_id = null`, `is_walk_in = false`. **Cai no terceiro ramo e é rotulada "Balcão"** — ou seja, o sistema afirma que o barbeiro cadastrou aquela pessoa na mão, quando ela na verdade agendou sozinha por um link público, sem nunca ter entrado na loja.

E a tela de configurações promete outra coisa:

```tsx
// src/components/painel/ConfiguracoesPainel.tsx:353-357
<span className="font-medium">Permitir agendamento sem cadastro</span>
<span className="mt-0.5 block text-ink-soft">
  O cliente agenda informando só nome e telefone. Ele aparece na Agenda e em
  Clientes como qualquer outro, marcado como “sem cadastro”, e recebe um link
```

**O rótulo "sem cadastro" não existe em lugar nenhum do código.** Uma varredura por `"sem cadastro"` em `src/` devolve apenas comentários e este texto de interface — nunca um `rotulo`.

### Por que é problema

Não é cosmético, e o motivo está na própria tela que faz a promessa. O texto de ajuda logo abaixo da caixinha diz (`ConfiguracoesPainel.tsx:364-367`):

> *"Em troca, seu endereço de agendamento fica aberto: há limites automáticos por telefone e por origem para conter spam, **mas se aparecer horário falso, é só desmarcar aqui.**"*

Ou seja: o produto instrui o dono a **monitorar** o resultado do agendamento público e desligar se vier lixo. E então não lhe dá como distinguir o que veio pelo link público do que ele mesmo cadastrou. As duas coisas aparecem com o mesmo chip azul "Balcão".

Isso importa mais depois de BUG-001/SEC-001: enquanto `book_appointment` estiver aberta a `anon`, fichas criadas por terceiros aparecem como se o próprio barbeiro as tivesse digitado — o que atrapalha exatamente a investigação que alguém faria ao notar o problema.

**O dado existe e não é usado.** `appointments.source` guarda `'online'` vs `'manual'` (`supabase/01_schema.sql:320`) e `appointments.public_token` é não-nulo apenas para agendamento sem cadastro (`supabase/17_agendamento_publico.sql:110-111`). Uma varredura por `public_token` e `source` em `src/app/painel/` e `src/components/painel/` **não devolve nenhuma ocorrência**: nenhuma tela do painel lê qualquer um dos dois.

### Como reproduzir

1. Numa barbearia com "Permitir agendamento sem cadastro" ligado, agendar por `/b/<slug>/agendar` sem estar logado.
2. Abrir `/painel/clientes`. A ficha nova aparece com o chip **"Balcão"**.
3. Comparar com a promessa em `/painel/configuracoes`, que diz "sem cadastro".

### Correção sugerida

Duas partes, e a segunda é obrigatória em qualquer cenário:

1. **Acrescentar o quarto ramo em `origem()`.** A ficha por si só não distingue — `profile_id = null, is_walk_in = false` descreve tanto "cadastrado no balcão" quanto "agendou pelo link". A distinção está no **agendamento**, não na ficha. Duas opções:
   - trazer, na consulta de `/painel/clientes`, se existe algum `appointments` daquela ficha com `public_token is not null` (ou `source = 'online'` e `created_by is null`), e usar isso como quarto ramo;
   - ou, mais barato e estável, gravar a origem **na ficha** no momento da criação — uma coluna `origem` em `customers` preenchida por `book_appointment`, que já sabe qual caminho está seguindo. Evita o join e não depende de o agendamento continuar existindo.
2. **Corrigir o texto de `ConfiguracoesPainel.tsx:356`** para descrever o que a tela realmente mostra. Se a opção (1) for adiada, o texto não pode continuar prometendo um rótulo inexistente — é uma promessa verificável e falsa, na tela em que o dono decide ligar o recurso.

---

## BUG-020 — Um único `target="_blank"` sem `rel="noopener noreferrer"`, entre 18

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `src/components/admin/AdminPainel.tsx:83-84` |
| **Status** | CONFIRMADO |

```tsx
// src/components/admin/AdminPainel.tsx:83-84
href={`/b/${b.slug}`}
target="_blank"
```

A contagem no repositório: **18 ocorrências de `target="_blank"` e 17 de `noopener`.** As outras 17 — em `/b/[slug]`, `AppointmentCard`, `FiadoPainel`, `EsperaPainel`, `ConfiguracoesPainel`, `Suporte`, a landing e a ficha do cliente — todas trazem `rel="noopener noreferrer"`. Esta é a única exceção.

**Impacto real: pequeno.** O destino é `/b/${slug}`, uma página do próprio site, então não há terceiro para receber a referência `window.opener`. E os navegadores baseados em Chromium, Firefox e Safari aplicam `noopener` implicitamente a `target="_blank"` desde 2021.

Vale registrar por dois motivos: (1) é a única quebra de um padrão que o resto do código segue com disciplina, e desvio isolado é o que a próxima cópia-e-cola propaga; (2) sem `noreferrer`, o `Referer` da página `/admin` vaza para a aba nova — irrelevante aqui, mas o hábito importa dado o SEC-005 (`AUDITORIA_SEGURANCA.md`), onde o vazamento de `Referer` numa URL com token é um problema de verdade.

**Correção:** acrescentar `rel="noopener noreferrer"` na linha 84, igual às outras 17. (Mesmo achado, do lado de segurança: **SEC-015**.)

---

## BUG-023 — `moverServico` troca a ordem em duas escritas sem transação; se a segunda falhar, a ordem fica corrompida

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `src/app/actions/services.ts:152-157` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/actions/services.ts:152-157
const [{ error: e1 }, { error: e2 }] = await Promise.all([
  supabase.from("services").update({ sort_order: vizinho.sort_order }).eq("id", atual.id),
  supabase.from("services").update({ sort_order: atual.sort_order }).eq("id", vizinho.id),
]);

if (e1 || e2) return falha(traduzirErroBanco(e1 ?? e2, "[serviços] reordenar"));
```

São **duas escritas independentes, disparadas em paralelo, sem transação entre elas**. A verificação de erro acontece depois de ambas terem sido tentadas — e nesse ponto uma delas pode já ter sido gravada. Se a outra falhar (rede, timeout, RLS), o resultado é uma troca pela metade: os dois serviços ficam com o **mesmo** `sort_order`, ou o primeiro assume o do segundo enquanto o segundo mantém o dele.

A ação devolve `falha(...)` — então a tela avisa que deu errado —, mas **não desfaz** a escrita que passou.

### Por que registro isto, sendo tão pequeno

O impacto é baixo e autocorrigível: `sort_order` empatado faz o desempate cair no `.order("name")` da própria consulta (`services.ts:139-140`), e o próximo clique em subir/descer reorganiza. Ninguém perde dado e não há dinheiro envolvido.

Vale registrar porque **o projeto conhece este padrão e o rejeita explicitamente noutro lugar**. Em `salvarBeneficios`, o comentário diz por extenso (`src/app/actions/shop.ts:210-213`):

> *"Grava por diferença em vez de apagar-tudo-e-reinserir. Não é preciosismo: são duas chamadas sem transação entre elas, e um `delete` que roda seguido de um `insert` que falha deixaria a loja sem nenhum benefício — pior que o estado anterior."*

É o mesmo raciocínio, aplicado num arquivo e não no outro. Registrar a inconsistência é o que impede que a próxima operação composta copie o caminho errado — e a próxima pode ser uma que mexa em dinheiro, onde a metade gravada não se autocorrige.

### Como reproduzir

Difícil de forçar sem instrumentação, porque exige que uma das duas escritas falhe e a outra passe. Para observar o estado resultante:

```sql
select sort_order, count(*) from services
 where barbershop_id = '<SHOP_ID>' group by 1 having count(*) > 1;
```

Qualquer linha devolvida é um empate de ordem — que pode ter vindo daqui ou de outro caminho.

### Correção sugerida

Fazer a troca numa operação só. Duas opções:

1. **Uma função no Postgres** (`mover_servico(p_id uuid, p_direcao text)`), `security definer`, que confira `can_manage_money` e faça a troca dentro da mesma transação. É o padrão que o projeto usa para toda operação composta que importa — `complete_appointment`, `pay_commissions`, `complete_appointments_lote` — e o comentário de `supabase/02_functions.sql:5-7` explica exatamente por quê: *"uma operação composta não fica pela metade se o celular perder sinal no meio"*.
2. Se preferir manter na aplicação, ao menos **sequenciar** as duas escritas em vez de `Promise.all`, e desfazer a primeira se a segunda falhar. É pior que (1) — o desfazer também pode falhar —, mas já elimina o caso mais provável.

Observação lateral, no mesmo arquivo: os dois `update` das linhas 153-154 filtram só por `.eq("id", …)`, sem `.eq("barbershop_id", shopId)`. **Não é falha de acesso** — os dois ids vêm de `lista`, que já foi filtrada por loja na linha 138, e a RLS `services_write` exige `can_manage_money` de qualquer forma. É a mesma ausência de defesa em profundidade descrita em BUG-016, e cabe a mesma correção de uma linha.

---

## BUG-021 — Nenhum teste automatizado no repositório

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO (como achado isolado) / ver RA-4 em "Riscos arquiteturais" |
| **Arquivo:linha** | `package.json:5-11` |
| **Status** | CONFIRMADO |

```json
"scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "eslint", "typecheck": "tsc --noEmit" }
```

Não há script de teste, e uma varredura do repositório não encontrou nenhum arquivo `*.test.*` ou `*.spec.*`, nem configuração de Vitest/Jest/Playwright.

Registrado como BAIXO porque é ausência de rede de proteção, não defeito em execução. O impacto real está descrito em RA-4, e ficou demonstrado nesta auditoria: **BUG-018 e BUG-019 são duas telas que não funcionam há tempo indeterminado** e que nenhum teste — nem de integração, nem de fumaça — teria deixado passar.

---

# Riscos arquiteturais

Problemas estruturais que não cabem num arquivo só. Não recebem ID de bug porque não têm um "conserte esta linha".

## RA-1 — Duas portas para a mesma operação, com regras diferentes

`book_appointment` e `book_appointment_publico` criam agendamento. A segunda foi construída (migrations 17 e 20) para ser o portão único do público, com liga/desliga por loja, validação de telefone, conferência de disponibilidade real e seis limites anti-abuso. A primeira continua acessível e não faz nada disso (BUG-001, SEC-001).

O padrão se repete no `BookingWizard`, que escolhe o caminho **no cliente** (BUG-010). Enquanto houver duas portas, toda regra nova terá que ser escrita duas vezes, e o dia em que uma for esquecida a falha será silenciosa — porque o caminho legítimo continuará funcionando.

**Direção:** `book_appointment` deveria ser um detalhe interno (chamado por `book_appointment_publico` e pelo painel), não um endpoint. Uma porta por público-alvo: painel, cliente logado, visitante.

## RA-2 — Dinheiro agregado em dois lugares, com resultados diferentes

O projeto tem duas técnicas para calcular totais financeiros e as mistura:

- **No Postgres**, por função `security definer` com `group by` e checagem de permissão: `dashboard_summary`, `revenue_series`, `comissoes_do_dia`. Correta, sem teto, e é a que o painel e os relatórios usam nos cards principais.
- **Na aplicação**, com `.limit(N)` + `reduce` em JavaScript: `/painel/caixa` (BUG-002), `/painel/relatorios` (BUG-003), `/painel/comissoes` (BUG-004).

A segunda produz números **menores que os reais**, sem aviso, a partir de um volume que uma barbearia ativa alcança em semanas. E como as duas técnicas coexistem no mesmo painel, telas diferentes exibem valores diferentes para o mesmo período.

**Direção:** estabelecer como regra que **nenhum valor monetário exibido é somado em JavaScript**. Listas podem ter teto; totais, não.

## RA-3 — Não há controle de versão de migrations

Os 20 arquivos de `supabase/` são numerados e aplicados por `supabase/aplicar-sql.mjs` (não lido) ou colando no SQL Editor. **Não existe tabela de controle** que registre qual arquivo já foi aplicado em qual ambiente.

O projeto compensa isso com "portões" no fim de cada migration — blocos `do $$` que levantam exceção se o resultado esperado não estiver no banco (bom exemplo: `supabase/19_agendamento_de_quem_criou.sql:355-418`, que verifica inclusive **regressões** de migrations anteriores). É uma prática defensiva melhor que a média, mas ela responde *"o estado final está certo?"*, não *"o que já rodou aqui?"*.

**Consequência concreta para esta auditoria:** todas as afirmações sobre RLS, grants e funções valem para o **SQL do repositório**. Se `13_agendamento_avulso.sql` nunca rodou em produção, `book_appointment` lá é a versão da migration 11, e o BUG-001 tem outro contorno. **Isso precisa ser verificado no banco real antes de qualquer correção.** Ver a seção "Pontos que não consegui verificar".

**Direção:** adotar o CLI do Supabase (`supabase migration`) ou, no mínimo, uma tabela `schema_migrations` com o nome do arquivo e o instante de aplicação, escrita pelo próprio `aplicar-sql.mjs`.

## RA-4 — Zero cobertura de teste automatizado sobre a lógica financeira

`complete_appointment`, `pay_commissions` e `revert_commission_payment` são as funções mais delicadas do sistema — movem caixa, comissão e fiado numa transação só, com FIFO, idempotência e estorno em ordem inversa (`supabase/08_comissao_parcial.sql:292-569`). O raciocínio está documentado em detalhe nos comentários, o que é excelente. **E não há um único teste que o exercite.**

O comentário de `supabase/08_comissao_parcial.sql:150-155` registra um bug encontrado *"exercitando a RPC de verdade — ler o SQL não mostraria"*. É a evidência, escrita pelo próprio projeto, de que a leitura não basta aqui.

**Direção:** um conjunto pequeno de testes de integração contra um Postgres local (pgTAP, ou um runner em Node chamando as RPCs), cobrindo: conclusão com fiado parcial, conclusão em lote, pagamento parcial de comissão seguido de estorno, e duplo clique com a mesma chave de idempotência.

## RA-5 — A lista de grants para `anon` é por tabela inteira, num arquivo que usa grants por coluna em toda outra decisão

`supabase/03_rls.sql:518` concede `select` em cinco tabelas inteiras para `anon`. O mesmo arquivo, 12 linhas abaixo, usa `grant update (coluna, coluna, …)` para `profiles` e `barbershops`, com um comentário explicando exatamente por que o recorte por coluna é necessário (linhas 523-528). A assimetria deixou colunas sensíveis públicas — ver **SEC-003**, **SEC-004** e **SEC-009** em `AUDITORIA_SEGURANCA.md`.

## RA-6 — Embed do PostgREST bloqueado pela RLS não dá erro: devolve nulo, e a tela mostra um valor de reserva plausível

Este é o risco estrutural mais insidioso encontrado nas duas rodadas, porque **produz telas que parecem funcionar**.

Quando uma consulta embute uma tabela relacionada (`autor:profiles!fk(full_name)`) e a policy da tabela embutida não libera aquela linha para quem consulta, o PostgREST **não** falha: `authenticated` tem `grant select` em tudo (`supabase/03_rls.sql:521`), então não há `42501`; a RLS apenas não devolve a linha, e o embed vira `null`. O código então aplica o fallback — `?? "Cliente"` — e a tela renderiza normalmente, com um dado inventado no lugar do real.

O repositório já pagou esse preço uma vez, e **documentou o diagnóstico por escrito** em `supabase/10_avaliacoes_publicas.sql:9-25`, incluindo a variante que atinge o usuário logado. A correção implantada cobriu o caminho anônimo (`public_reviews()`); os dois caminhos autenticados continuaram quebrados — são BUG-018 e BUG-019, encontrados nesta rodada.

O que torna isto estrutural e não pontual: **nenhuma das defesas do projeto pega este caso.** O TypeScript aceita (`autor` é declarado `string | null`, e nulo é um valor válido do tipo). O `console.error` não dispara, porque não há erro. Os portões de migração conferem o estado do banco, não o que a tela recebe. E não há testes.

**Direção:** estabelecer como regra que **dado de outra pessoa nunca vem por embed** — vem por função `security definer` que confere a permissão no topo e devolve o recorte explícito. É o padrão que `public_reviews()`, `comissoes_do_dia()` e `client_home()` já seguem. Enquanto isso, varrer os embeds existentes e, para cada um, responder: *"a policy da tabela embutida libera esta linha para este papel?"* — se a resposta não for obviamente sim, o campo está nulo em produção agora.

---

# Pontos que não consegui verificar

Esta seção é deliberadamente específica. Cada item é uma lacuna real desta auditoria.

## Sobre o banco de dados

1. **Nada foi executado contra o Postgres.** Não sei quais migrations estão de fato aplicadas, nem se os grants e policies do repositório correspondem ao banco de produção. **Antes de agir sobre qualquer achado de banco, rodar:**
   ```sql
   -- Quem pode executar book_appointment (BUG-001 / SEC-001):
   select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
          (values ('anon'),('authenticated'),('service_role')) as r(rolname)
    where n.nspname = 'public' and p.proname like 'book_appointment%';

   -- Grants de tabela para anon (SEC-002/003/004):
   select table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' order by table_name;

   -- RLS ligada e contagem de policies por tabela:
   select t.tablename, t.rowsecurity, count(p.policyname)
     from pg_tables t left join pg_policies p
       on p.schemaname = t.schemaname and p.tablename = t.tablename
    where t.schemaname = 'public' group by 1,2 order by 1;
   ```
2. **`max-rows` do PostgREST não foi verificado.** O Supabase permite configurar um teto global de linhas por resposta. Se ele estiver abaixo dos `.limit()` do código, os BUG-002/003/004 são **piores** do que descrito. Conferir em Project Settings → API → `db-max-rows`.
3. **Não sei se existem dados de produção** e, portanto, se algum dos limites (500 / 1000 / 5000) já foi ultrapassado. Os BUG-002/003/004 estão descritos como certezas de comportamento, não como incidentes observados.
4. **`supabase/06_apagar_dados.sql` não foi lido.** É um script destrutivo. Precisa de leitura própria antes de qualquer uso.

## Sobre a aplicação

5. **`npm run typecheck` e `npm run lint` não foram executados.** O `tsconfig.json` é rigoroso (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` — `tsconfig.json:7-11`), o que é um bom sinal, mas nada foi confirmado.
6. **Sete usos de `as unknown as` não foram validados contra a forma real da resposta** — `src/app/app/page.tsx:38`, `src/app/painel/comissoes/page.tsx:124`, `src/lib/queries/agenda.ts:106,134,226,311`, `src/lib/queries/cliente.ts:93`. São casts que **desligam a checagem de tipo** justamente onde o PostgREST devolve embeds cuja forma varia entre objeto e array. O código lida com isso pelos helpers `one()`/`many()`, o que sugere consciência do problema; mas se a forma mudar, o erro aparecerá em tempo de execução, sem aviso do compilador.
7. **~60 componentes continuam sem leitura linha a linha** (lista no "Escopo NÃO coberto"). O `grep` transversal — agora ampliado para `Math.random`, `window.*`, `localStorage`, `document.cookie`, `innerHTML` e `target="_blank"` — não encontrou realtime sem cleanup, listeners órfãos nem `dangerouslySetInnerHTML` inseguro, e **encontrou** BUG-020 e SEC-011. Os quatro `useEffect` inspecionados (`Modal.tsx:22-30`, `AgendaDoDia.tsx:75-91`, `MapaLocalizacao.tsx:105-111`, `PendenciasPainel.tsx:458-465`) **têm cleanup correto**. Mas bugs de estado e de formulário nos arquivos não lidos não foram procurados.
8. **Nenhum fluxo foi executado no navegador.** Estados de carregamento, tratamento de erro na tela, acessibilidade e comportamento em rede lenta não foram avaliados. Em particular, **BUG-018 e BUG-019 não foram reproduzidos em execução** — foram deduzidos da policy `profiles_select` e do caminho do embed. A dedução é direta e o mecanismo é o mesmo que `supabase/10_avaliacoes_publicas.sql` documenta ter observado em produção, mas a reprodução (descrita em cada achado) continua valendo a pena antes de mexer no código.
9. **`npm audit --omit=dev` FOI executado nesta rodada** e as versões reais foram lidas de `package-lock.json` — ver BUG-017. O que **não** foi feito: verificar se existe patch dentro da linha 15.x do Next que resolva sem subir de major, e rodar `npm outdated`.
10. **Os `setTimeout(() => setCopiado(false), 2500)`** em cinco componentes (`AdminPainel.tsx:205`, `BookingWizard.tsx:1075`, `ConfiguracoesPainel.tsx:112`, `EquipeAcessos.tsx:197`, `ObservacoesCliente.tsx:45`) não têm `clearTimeout` no desmonte. No React 19 isso não gera aviso nem vazamento observável, então **não foi registrado como bug** — mas também não foi testado.
11. **Não procurei outros embeds quebrados pela RLS além dos três mapeados.** A varredura por `profiles!` encontrou exatamente três (`admin/page.tsx:67`, `avaliacoes/page.tsx:68`, `espera/page.tsx:41`) — o primeiro funciona porque `requireAdmin()` satisfaz `is_platform_admin()` na policy. **Mas a mesma classe de falha pode existir em qualquer embed de tabela cuja policy não cubra o papel de quem consulta**, e não fiz essa varredura para as outras tabelas. É o tipo de defeito que não gera erro: o campo simplesmente vem nulo.

## O que esta auditoria explicitamente NÃO cobriu

- Performance real (nenhuma medição; existe um `PERFORMANCE.md` no repositório que não foi lido).
- Acessibilidade.
- Comportamento offline / PWA além da leitura de `public/sw.js`.
- Conteúdo dos documentos `AJUSTES-PIBARBER-2.md`, `AUDITORIA.md`, `ESPECIFICACAO.md`, `PERFORMANCE.md`, `PROMPTS.md`, `README.md`, `docs/*` — **nenhum foi lido.** Note que **já existe um `AUDITORIA.md` de uma rodada anterior** na raiz; ele pode conter achados que se sobrepõem ou contradizem estes, e não foi consultado.

---

**Documento companheiro:** `AUDITORIA_SEGURANCA.md`, na raiz do repositório, com os achados de segurança (IDs `SEC-XXX`), a tabela de RLS tabela por tabela e o checklist de pré-produção.
