# Agente 01 — WhatsApp oficial (Meta Cloud API) no PiBarber

> **Para o Claude Code.** Sessão nova, `/clear` antes de começar. Commit de
> segurança antes de qualquer alteração. Este agente cria uma migração SQL, um
> módulo novo em `src/lib/whatsapp/`, dois Route Handlers e mexe em duas Server
> Actions existentes.

---

## Leia primeiro

Este enunciado foi escrito lendo o repositório em `be8c876`. Antes de escrever
uma linha, leia — na ordem:

1. `CONTEXT.md` inteiro. Em especial §4 (como se escreve migração), §5
   (segurança), §6 (convenções), §7 (não há cron) e §9 (estado do WhatsApp e
   restrições da Meta).
2. `supabase/01_schema.sql` — tabelas `appointments` (l.305, repare em
   `reminder_sent_at`), `customers` (l.260), `barbershops` (l.131),
   `notifications` (l.448) e os enums (l.55–75).
3. `supabase/20_link_expira_e_rajada.sql` — **o modelo de cabeçalho de migração
   deste projeto.** A sua migração precisa ter esse nível de explicação do
   porquê.
4. `supabase/03_rls.sql` — o padrão de policy e grant. Toda tabela nova entra.
5. `src/app/actions/booking.ts` — o padrão de Server Action (`ActionResult`,
   `falha`/`sucesso`, `traduzirErroBanco`, `unstable_rethrow`,
   `revalidatePath`/`revalidateTag`).
6. `src/app/actions/appointments.ts` — onde o dono cancela e conclui. É um dos
   pontos de gancho.
7. `src/lib/env.ts` — o padrão `obrigatoria()`. Toda variável nova segue ele.
8. `src/lib/telefone.ts` — `normalizarTelefone()`. É o que você usa para montar
   o número no formato da Meta.
9. `src/lib/utils.ts` — `FUSO`, `timestampSP()`, `faixaDoDia()`, `linkWhatsApp()`.
10. `src/lib/supabase/admin.ts` — `createAdminClient()`, a única porta que passa
    por cima da RLS. Webhook e cron não têm sessão, então é o que eles usam.
11. `src/app/(auth)/callback/route.ts` — o único Route Handler de referência no
    projeto, para copiar o formato.

### Contexto de produto

O PiBarber é um **marketplace**: o cliente tem conta na plataforma e agenda em
qualquer barbearia. Por isso o WhatsApp é **da plataforma**, com um número só,
credenciais do dono do projeto em variável de ambiente. O cliente recebe uma
mensagem do PiBarber falando sobre a barbearia dele — e não uma mensagem de um
número desconhecido que diz ser a barbearia.

Nada de barbearia conectar WhatsApp próprio. Nada de QR code. Nada de BSP.

---

## Regras invioláveis

1. **Nada de biblioteca não oficial.** Só `graph.facebook.com`. Nenhuma
   dependência nova de WhatsApp no `package.json` — a Cloud API é HTTP com
   `fetch` nativo.
2. **Nenhum segredo no bundle do navegador.** Token, App Secret e `CRON_SECRET`
   só em código servidor, só via `src/lib/env.ts`. Nada com prefixo
   `NEXT_PUBLIC_` para esses.
3. **Envio nunca bloqueia o agendamento.** Se a Meta estiver fora do ar, o
   cliente ainda agenda. A gravação na fila é dentro da transação lógica da
   ação; a entrega é tentativa best-effort, e falha dela **não** vira `falha()`
   para o usuário.
4. **A regra que vale continua no Postgres.** Não reimplemente em TypeScript o
   que `book_appointment()` já decide. Este agente acrescenta um efeito
   colateral, não muda regra de agendamento.
5. **Toda tabela nova com RLS ligada e negando tudo para `anon` e
   `authenticated`.** A fila de mensagens é acessível só pelo service role.
   Vazar essa tabela é vazar telefone de cliente de todas as barbearias.
6. **Webhook: assinatura obrigatória.** Sem `X-Hub-Signature-256` válida, 401 e
   nada é processado. E idempotente: a Meta reenvia o mesmo evento.
7. **`try/catch` sempre com `unstable_rethrow(e)` na primeira linha do catch.**
   Regra da casa, ver `CONTEXT.md` §8.
8. **Português brasileiro** em nomes, comentários e texto de tela. Códigos de
   erro internos em maiúsculo (`SEM_CONEXAO`).
9. **Migração idempotente**, numerada `24_`, com cabeçalho explicando o porquê
   no estilo da casa.
10. **Não reaproveite a tabela `notifications`.** Ela é o sininho do app. Fila
    de WhatsApp é tabela nova.
11. **Commit por bloco**, mensagem `agente-01: <bloco> — <resumo>`. `npm run
    typecheck` e `npm run lint` limpos antes de cada commit.

---

## Escopo

### Entra

- Migração `24_whatsapp.sql`: tabelas `whatsapp_templates`,
  `whatsapp_messages`, `whatsapp_opt_outs`; RLS; agendamento `pg_cron`.
- Módulo `src/lib/whatsapp/`: cliente da Graph API, catálogo de templates,
  enfileiramento, despacho, classificação de erro.
- Três mensagens de Utilidade: **confirmação** (no ato do agendamento),
  **lembrete** (véspera) e **cancelamento**.
- Route Handler `GET/POST /api/webhooks/whatsapp`: verificação, assinatura,
  status de entrega, status de template, opt-out.
- Route Handler `POST /api/cron/whatsapp`: varre a fila e dispara o que venceu.
- Gancho nas Server Actions de agendar e cancelar.
- Tela em `/painel/configuracoes`: a barbearia liga/desliga as mensagens e vê o
  que saiu — **sem editar texto**.
- Env, `.env.example`, `docs/whatsapp.md` com o passo a passo do painel da Meta.
- Atualização do `CONTEXT.md`.

### Não entra

- Mensagens de Marketing: aniversário, reativação, pedido de avaliação. Custam
  ~9× mais por mensagem e a decisão de produto está aberta.
- Conversa bidirecional, bot de agendamento, caixa de entrada. Mensagem recebida
  é lida **só** para detectar opt-out; o resto é descartado.
- Barbearia conectar número próprio (Embedded Signup). Outro produto, outro
  momento.
- Mídia em template, botões, listas.
- Notificar o dono/profissional. Só o cliente recebe, nesta fase.
- Mexer na tabela `notifications` ou no sininho.
- SMS, e-mail, push.

---

## Bloco A — Variáveis de ambiente

Em `src/lib/env.ts`, no padrão `obrigatoria()`, acrescentar uma função
`envWhatsapp()` que devolve `null` quando a integração não está configurada —
**o projeto precisa continuar subindo sem WhatsApp**, porque o Guilherme e você
rodam local sem credencial. Só quando `WHATSAPP_PHONE_NUMBER_ID` existir é que
as demais viram obrigatórias.

```
WHATSAPP_PHONE_NUMBER_ID=       # "Phone Number ID" do painel da Meta
WHATSAPP_WABA_ID=               # "WhatsApp Business account ID"
WHATSAPP_ACCESS_TOKEN=          # token de Usuário do Sistema (permanente)
WHATSAPP_APP_SECRET=            # assina o webhook
WHATSAPP_WEBHOOK_VERIFY_TOKEN=  # string longa aleatória; vai no painel da Meta
WHATSAPP_GRAPH_VERSION=v25.0
CRON_SECRET=                    # protege /api/cron/whatsapp
```

Documentar as sete no `.env.example` com o comentário de sempre — o arquivo já
diz que nada quebra o build, mas cada variável ausente desliga um pedaço em
silêncio. Aqui vale o mesmo: sem elas, as mensagens simplesmente não saem, e
isso precisa estar escrito.

---

## Bloco B — Migração `supabase/24_whatsapp.sql`

Cabeçalho no estilo da casa: conte que não havia nada agendado no projeto, que
`appointments.reminder_sent_at` existia sem uso desde o schema inicial, e que
esta migração é o que finalmente liga aquela coluna a alguma coisa.

### B.1 Enums

```sql
do $$ begin
  create type whatsapp_event as enum ('confirmation', 'reminder', 'cancellation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type whatsapp_status as enum ('pending', 'sent', 'delivered', 'read', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type whatsapp_template_status as enum ('pending', 'approved', 'rejected', 'paused', 'disabled');
exception when duplicate_object then null; end $$;
```

### B.2 `whatsapp_templates`

Espelho local do que existe na WABA da plataforma. **Uma linha por evento**, não
por barbearia — o texto é fixo e serve todo mundo.

```sql
create table if not exists whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  event         whatsapp_event not null unique,
  -- nome na Meta: pibarber_confirmacao_v1
  meta_name     text not null unique,
  language      text not null default 'pt_BR',
  -- Texto como submetido, com {{1}}, {{2}}… Serve para a pré-visualização
  -- na tela e para conferir se o catálogo do código bate com o que subiu.
  body_text     text not null,
  status        whatsapp_template_status not null default 'pending',
  reject_reason text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
```

### B.3 `whatsapp_messages` — a fila

O projeto não tem fila; esta tabela é a fila. Linha primeiro, entrega depois: é
o que permite saber que uma mensagem existia mesmo quando a Meta está fora.

```sql
create table if not exists whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid references barbershops (id) on delete set null,
  appointment_id uuid references appointments (id) on delete set null,
  event          whatsapp_event not null,
  -- E.164 sem "+": 5516996022093. Congelado no momento do enfileiramento —
  -- se o cliente trocar de número depois, a mensagem que já saiu não muda.
  recipient      text not null,
  -- Os valores de {{1}}..{{n}}, na ordem. jsonb array de texto.
  params         jsonb not null default '[]'::jsonb,
  status         whatsapp_status not null default 'pending',
  -- Só fica elegível ao despacho a partir daqui. É o que agenda o lembrete
  -- para as 18h da véspera sem precisar de scheduler.
  scheduled_for  timestamptz not null default now(),
  attempts       smallint not null default 0,
  -- wamid devolvido pela Meta — a chave que o webhook usa para achar a linha.
  external_id    text unique,
  sent_at        timestamptz,
  delivered_at   timestamptz,
  read_at        timestamptz,
  failure_code   text,
  failure_reason text,
  created_at     timestamptz not null default now()
);

create index if not exists whatsapp_messages_fila_idx
  on whatsapp_messages (status, scheduled_for)
  where status = 'pending';

create index if not exists whatsapp_messages_appt_idx
  on whatsapp_messages (appointment_id);

-- Idempotência: um evento por agendamento, no máximo. É o que impede o cron
-- de enfileirar o mesmo lembrete duas vezes se rodar duas vezes concorrentes.
create unique index if not exists whatsapp_messages_evento_unico_idx
  on whatsapp_messages (appointment_id, event)
  where appointment_id is not null;
```

### B.4 `whatsapp_opt_outs`

O opt-out é **global e por telefone**, não por barbearia. Quem responde PARAR
para o número do PiBarber está saindo do PiBarber, não de uma loja — e
`customers` é por barbearia, então não serve de lugar para guardar isso.

```sql
create table if not exists whatsapp_opt_outs (
  phone      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);
```

### B.5 RLS

As três tabelas: `enable row level security` e **nenhuma policy de select para
`anon` ou `authenticated`**. Acesso só pelo service role, que passa por cima da
RLS por definição. Comente isso no arquivo — tabela sem policy parece
esquecimento, e aqui é decisão.

A exceção justificada, se você achar necessário para a tela do Bloco F: uma
policy de `select` em `whatsapp_messages` limitada a
`barbershop_id in (select id from barbershops where owner_id = auth.uid())`,
para o dono ver o histórico da própria loja. Se fizer, use o mesmo helper
`SECURITY DEFINER` de autorização que o resto do projeto usa, não uma subquery
solta.

### B.6 `pg_cron`

No fim da migração, ligar as extensões e agendar a varredura. Deixe **comentado
e explicado** que o `url` e o `CRON_SECRET` precisam ser substituídos pelos
valores reais antes de rodar — o arquivo vai para o Git e não pode levar
segredo.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- A cada 5 minutos. Substitua a URL e o segredo antes de executar.
-- select cron.schedule(
--   'whatsapp-despacho',
--   '*/5 * * * *',
--   $$ select net.http_post(
--        url     := 'https://pibarber.vercel.app/api/cron/whatsapp',
--        headers := '{"Authorization": "Bearer SEU_CRON_SECRET"}'::jsonb
--      ); $$
-- );
```

Se `pg_cron` não estiver disponível no plano do projeto, a alternativa é
`vercel.json` com Vercel Cron — registre no `docs/whatsapp.md` qual das duas
ficou ativa.

---

## Bloco C — `src/lib/whatsapp/`

### C.1 `catalogo.ts` — os três templates

Os textos vivem aqui, em constante, porque são fixos. Cada um com os
parâmetros na ordem, e a lista serve tanto para submeter à Meta quanto para
montar o envio.

Sugestão de texto (ajuste o tom se quiser, mas mantenha a estrutura — parâmetro
no meio, nunca no começo nem no fim, e dois parâmetros nunca colados, que são
regras da Meta):

```
confirmation  pibarber_confirmacao_v1
  "Olá {{1}}! Seu horário na {{2}} está confirmado para {{3}} às {{4}}
   com {{5}}. Para acompanhar ou cancelar, acesse {{6}}."
  params: nome, barbearia, data, hora, profissional, link

reminder      pibarber_lembrete_v1
  "Olá {{1}}! Lembrete: você tem horário amanhã na {{2}}, às {{3}},
   com {{4}}. Se não puder vir, cancele em {{5}} para liberar o horário."
  params: nome, barbearia, hora, profissional, link

cancellation  pibarber_cancelamento_v1
  "Olá {{1}}! Seu horário na {{2}} em {{3}} às {{4}} foi cancelado.
   Você pode marcar outro em {{5}}."
  params: nome, barbearia, data, hora, link
```

Exporte também `montarParametros(evento, dados)`, que produz o array de strings
na ordem certa, e uma função `previa(evento, params)` que devolve o texto
renderizado — a tela do Bloco F usa isso para mostrar como a mensagem chega.

**Parâmetro nunca vai vazio** (a Meta rejeita) e nunca contém quebra de linha.
Sem valor, use `"—"`.

### C.2 `graph.ts` — o cliente HTTP

`fetch` nativo, `AbortController` com 15s de timeout. Funções:

- `enviarTemplate({ to, name, language, params })` →
  `POST /{phoneNumberId}/messages`, devolve o `wamid`.
- `criarTemplate(body)` → `POST /{wabaId}/message_templates`.
- `listarTemplates()` → `GET /{wabaId}/message_templates`.

Erro da Meta vem em `{ error: { code, error_subcode, message } }`. Converta
para um objeto `ErroMeta { codigo, mensagem, transitorio }`.

**Nunca logue o token nem o telefone completo.** Mascare: `5516****2093`.

Classificação (com comentário explicando cada linha — é ela que decide se a
mensagem tenta de novo ou morre):

| Código | Transitório? | Nota |
|---|---|---|
| HTTP 5xx, timeout, rede | sim | |
| `130429` limite de taxa | sim | |
| `131048`, `131056` limite de spam / mesmo destinatário | sim | |
| `368` bloqueio temporário por política | sim | |
| `190` token inválido/expirado | **não** | e loga `error` alto: a integração inteira está parada |
| `130497` restrição de país | **não** | ver §9 do CONTEXT: número precisa ser +55 |
| `131026` destinatário não usa WhatsApp | não | |
| `132000`–`132015` template inexistente ou parâmetro errado | não | |
| qualquer outro | não | falha explícita é melhor que retentativa cega |

### C.3 `fila.ts` — enfileirar e despachar

`enfileirar({ barbershopId, appointmentId, evento, telefone, params, agendarPara })`:

1. Se `envWhatsapp()` for `null`, retorna sem fazer nada (ambiente sem
   credencial). Sem lançar erro.
2. Se o telefone estiver em `whatsapp_opt_outs`, retorna sem enfileirar.
3. `insert` em `whatsapp_messages` via `createAdminClient()`. O índice único de
   `(appointment_id, event)` pode recusar por duplicidade — trate como sucesso
   silencioso, é idempotência funcionando, não erro.

`despachar(limite = 50)`:

1. Seleciona `pending` com `scheduled_for <= now()` e `attempts < 5`, ordenado
   por `scheduled_for`.
2. **Reivindica antes de enviar**: `update ... set attempts = attempts + 1
   where id = ... and status = 'pending'` e só segue se afetou a linha. Sem
   isso, duas execuções concorrentes do cron mandam a mesma mensagem duas vezes.
3. Envia. Sucesso → `sent`, `sent_at`, `external_id`.
4. Falha transitória → volta a `pending` com `scheduled_for = now() + 2^attempts
   minutos` (1, 2, 4, 8, 16). Permanente → `failed`, com `failure_code` e
   `failure_reason`.
5. Devolve `{ pegos, enviados, falhos }`.

`varrerLembretes()`:

1. Busca `appointments` com `status in ('scheduled','confirmed')`,
   `reminder_sent_at is null`, e `starts_at` entre agora e 36h à frente.
2. Para cada um, enfileira o `reminder` com `scheduled_for` = **18h do dia
   anterior ao atendimento**, no fuso de São Paulo (use `timestampSP`). Se esse
   instante já passou e o atendimento é em menos de 24h, agenda para agora.
3. Marca `reminder_sent_at = now()` no agendamento — a coluna passa a significar
   "lembrete já foi PARA A FILA", e o comentário no código precisa dizer isso,
   porque o nome sugere "enviado".

---

## Bloco D — Route Handlers

### D.1 `src/app/api/cron/whatsapp/route.ts`

`POST`. Primeira linha: conferir
`request.headers.get("authorization") === "Bearer " + CRON_SECRET`, senão 401.
Depois `varrerLembretes()` e `despachar()`, nessa ordem, e devolve o resumo em
JSON. `export const dynamic = "force-dynamic"` e `runtime = "nodejs"`.

### D.2 `src/app/api/webhooks/whatsapp/route.ts`

**`GET`** — verificação da Meta. Confere `hub.mode === "subscribe"` e
`hub.verify_token`, devolve `hub.challenge` como **texto puro** com 200, senão
403.

**`POST`** — o corpo cru é necessário para a assinatura. Em Route Handler isso é
simples: `const cru = await request.text()`, valide, e só depois
`JSON.parse(cru)`. **Não use `request.json()` antes de validar** — o corpo só
pode ser lido uma vez, e reserializar muda os bytes e quebra o HMAC.

Assinatura: `sha256=` + HMAC-SHA256(cru, `WHATSAPP_APP_SECRET`), comparado com
`crypto.timingSafeEqual` contra o header `x-hub-signature-256`. Divergente →
401.

Processamento, por `entry[].changes[]`:

- `field: "messages"` com `statuses[]`: acha a linha por `external_id` e
  preenche o que estiver nulo — `delivered` → `delivered_at`; `read` →
  `read_at` (e `delivered_at`, se nulo); `failed` → `status = failed` com o
  código de `errors[0]`. Preencher só o que está nulo **é** a idempotência.
- `field: "messages"` com `messages[]` recebida: se `type === "text"` e o texto
  normalizado (trim, minúsculo, sem acento) for `parar`, `sair`, `stop`,
  `cancelar` ou `descadastrar` → `insert` em `whatsapp_opt_outs` com
  `on conflict do nothing`. Qualquer outra mensagem é ignorada.
- `field: "message_template_status_update"` → atualiza `whatsapp_templates` pelo
  `message_template_name`, gravando `status`, `reject_reason` e `reviewed_at`.
- Qualquer outro `field`: 200 e segue.

Sempre 200 no fim, mesmo sem ter feito nada. Corpo malformado → 400, nunca 500.

Atenção ao middleware: confira se há `middleware.ts` no projeto e se ele
intercepta `/api/*`. O webhook não tem sessão e não pode ser redirecionado para
login.

---

## Bloco E — Ganchos nas Server Actions

Três pontos, e em nenhum deles a falha de WhatsApp pode virar `falha()` para o
usuário. Envolva cada chamada em `try/catch` que só loga.

**E.1 Agendou → confirmação.** Em `src/app/actions/booking.ts`, depois do
`book_appointment` retornar sucesso, e também no caminho do agendamento público
(`book_appointment_publico`). Enfileira `confirmation` com `scheduled_for =
now()`.

**E.2 Cancelou → cancelamento.** Em `src/app/actions/appointments.ts`, no
cancelamento feito pelo dono e no feito pelo cliente. Enfileira `cancellation`.
Enfileire **antes** de qualquer `revalidatePath`, para não depender da ordem de
cache.

**E.3 Lembrete.** Não tem gancho de ação — é o cron do Bloco D.1.

**Onde sai o telefone:** de `customers.phone` (a ficha daquela barbearia),
normalizado, prefixado com `55`. Se o agendamento for para um dependente, o
telefone continua sendo o do titular — quem recebe a mensagem é quem marcou.

**Onde sai o link:** `absoluta("/app/agendamentos")` para quem tem conta;
`absoluta("/a/" + token)` para agendamento sem cadastro. Use `absoluta()` de
`src/lib/env.ts`, nunca monte a URL na mão.

---

## Bloco F — Tela em `/painel/configuracoes`

Um bloco novo no `ConfiguracoesPainel`, abaixo do que já existe. **Sem edição de
texto** — o motivo está explicado no CONTEXT.md §9, e vale repetir num
comentário no componente, porque a primeira pergunta de quem abrir esse arquivo
vai ser "por que não dá para editar?".

O que a tela mostra:

- Um interruptor por evento (confirmação, lembrete, cancelamento) — a coluna
  fica em `barbershops`, três booleanos com default `true`. Acrescente-os na
  mesma migração do Bloco B.
- A **pré-visualização** de cada mensagem, renderizada com os dados reais da
  barbearia via `previa()`.
- O estado do template quando não estiver aprovado: "Em análise pela Meta" ou
  "Reprovado" com o motivo. Se estiver reprovado, o interruptor não é
  renderizado — no lugar dele, o texto "Indisponível no momento".
- Um resumo simples dos últimos 20 envios daquela barbearia: data, cliente
  (nome, não telefone), evento e estado (Aguardando / Enviado / Entregue /
  Lido / Falhou).

Nada de expor `failure_code` cru para o dono. Traduza: `130497` → "Restrição da
Meta para o país"; `131026` → "O número do cliente não usa WhatsApp";
`190` → "Integração desconectada — avise o suporte"; padrão → "Não foi possível
entregar".

---

## Bloco G — `docs/whatsapp.md`

Escrito pelo agente, em português, para quem for configurar do zero. Precisa
cobrir:

1. As sete variáveis do Bloco A e como gerar as duas aleatórias
   (`openssl rand -base64 32`).
2. Painel da Meta → app → Etapa 2 → Configurar webhooks: URL
   `https://pibarber.vercel.app/api/webhooks/whatsapp`, o verify token, e
   assinar os campos `messages` e `message_template_status_update`.
3. Token permanente: Meta Business Suite → Configurações do Negócio → Usuários
   do sistema → usuário admin → gerar token com `whatsapp_business_management`
   e `whatsapp_business_messaging`. **O token do botão "Gerar token" da Etapa 1
   dura 24h e não serve para produção.**
4. **O número precisa ser +55.** O número de teste da Meta é americano e não
   entrega para o Brasil (erro `130497`). E o número registrado deixa de
   funcionar no WhatsApp comum.
5. Submeter os três templates: comando ou passo manual, com os textos do
   catálogo, categoria **UTILITY**, idioma `pt_BR`, e os exemplos de parâmetro
   (a Meta exige `example.body_text` ou recusa).
6. Ligar o `pg_cron` (ou o Vercel Cron), com a URL e o segredo reais.
7. Como conferir que funciona: agendar pelo site, ver a linha em
   `whatsapp_messages` virar `sent` e depois `delivered`.
8. Teto sem verificação de empresa: 250 destinatários únicos por 24h. O que
   acontece ao bater no teto e o que a verificação destrava.

---

## Critérios de aceite

Não há suíte de teste neste projeto — então este checklist é rodado à mão, e o
resultado de cada item vai no bloco do CONTEXT.md ao final.

- [ ] `npm run typecheck` e `npm run lint` limpos.
- [ ] `npm run build` passa **sem nenhuma variável de WhatsApp definida**, e o
      site sobe normal. Agendar funciona; nenhuma mensagem sai; nenhum erro na
      tela.
- [ ] `24_whatsapp.sql` roda duas vezes seguidas no SQL Editor sem erro.
- [ ] `database.types.ts` regerado; `typecheck` reflete as tabelas novas.
- [ ] Com credenciais: agendar pelo `/b/[slug]/agendar` faz chegar a mensagem de
      confirmação no celular em segundos.
- [ ] O webhook marca `delivered_at` e depois `read_at` na linha, sem recarregar
      nada à mão.
- [ ] `POST /api/webhooks/whatsapp` sem assinatura → 401. Com assinatura
      inválida → 401. Com corpo malformado → 400, nunca 500.
- [ ] `GET /api/webhooks/whatsapp` com o verify token certo devolve o challenge
      em texto puro.
- [ ] `POST /api/cron/whatsapp` sem o header de autorização → 401.
- [ ] Rodar o cron duas vezes seguidas **não** manda a mesma mensagem duas vezes.
- [ ] Agendamento para amanhã gera uma linha `reminder` com `scheduled_for` às
      18h de hoje e `reminder_sent_at` preenchido no agendamento.
- [ ] Cancelar pelo painel enfileira o `cancellation`.
- [ ] Responder "PARAR" no WhatsApp cria a linha em `whatsapp_opt_outs`, e o
      próximo agendamento daquele telefone **não** enfileira nada.
- [ ] Desligar o interruptor de lembrete na barbearia impede o enfileiramento só
      daquela loja.
- [ ] `select * from whatsapp_messages` com a chave `anon` do Supabase devolve
      vazio ou erro de permissão — nunca dados.
- [ ] Nenhum token, App Secret ou telefone completo aparece em log.
- [ ] `docs/whatsapp.md` é suficiente para o Guilherme configurar do zero sem
      perguntar nada.

---

## Ao finalizar — atualizar `CONTEXT.md`

1. Cabeçalho: data e "atualizado pelo agente 01 (WhatsApp oficial)".
2. §7 ("não há nada agendado") precisa ser reescrita: agora há. Diga qual
   mecanismo ficou ativo (`pg_cron` ou Vercel Cron), a frequência, e que o
   endpoint é protegido por `CRON_SECRET`.
3. §9 (WhatsApp) vira a documentação do que existe: tabelas, fluxo do
   enfileiramento ao webhook, os três eventos, onde ficam os textos.
4. §10: marcar o agente 01 como ✅ e acrescentar o bloco "O que o agente 01
   entregou" — o que era, o que ficou, **o que se descobriu lendo o código**, e
   o que NÃO foi feito e por quê.
5. §11 (dívidas): acrescentar as que este agente cria —
   (a) mensagens de Marketing (aniversário, reativação, avaliação) fora de
   escopo por custo;
   (b) barbearia não pode editar texto de mensagem;
   (c) `reminder_sent_at` significa "foi para a fila", não "foi entregue" — nome
   enganoso, mantido para não quebrar a coluna existente;
   (d) teto de 250 destinatários únicos por 24h enquanto a empresa não for
   verificada — e o que acontece quando bater nele.
