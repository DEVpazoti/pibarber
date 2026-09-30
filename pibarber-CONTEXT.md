# PiBarber — CONTEXT.md

> Arquivo de contexto para agentes de IA (Claude Code) que vão trabalhar neste
> repositório. **Leia este arquivo inteiro antes de escrever qualquer linha.**
> Ele descreve o que o projeto é, como ele está construído, quais convenções
> são inegociáveis e quais armadilhas já custaram tempo.
>
> Quem terminar um agente atualiza este arquivo ao final — é a regra que
> mantém o próximo agente informado.

**Atualizado por último:** 2026-09-24 — setup guiado, assinaturas (Asaas),
super admin, relatos e as duas portas de login (agente 02).
**Commit de referência:** branch `feat/setup-barbearia`, commit "feat: duas portas
de login" (sobre `a3174d3`).

---

## 1. O que é

Plataforma de agendamento e gestão para barbearias, em produção em
`pibarber.vercel.app`.

**É um marketplace, não um sistema por barbearia.** Essa frase decide quase
tudo. O cliente tem UMA conta no PiBarber e agenda em qualquer barbearia
cadastrada. Não há tenant isolado, não há subdomínio por loja, não há
"instalar o sistema na barbearia". A marca que o cliente conhece é PiBarber;
a barbearia é o estabelecimento que ele escolhe dentro dela.

Consequência prática para qualquer integração externa (WhatsApp, e-mail, push):
**o remetente é a plataforma, não a barbearia.** Isso não é um compromisso
técnico — é o modelo do produto.

### Os três papéis

| Quem | Onde | O que faz |
|---|---|---|
| **Cliente** | `/app` | Busca barbearia por nome, cidade ou proximidade; agenda, acompanha, avalia. PWA |
| **Dono** | `/painel` | Agenda, clientes, equipe, serviços, caixa, comissão, fiado, fila de espera, relatórios |
| **Assistente** | `/painel` | Mesmo painel, menu reduzido, sem nada financeiro |
| **Admin da plataforma** | `/admin` | Super admin: métricas, barbearias, assinaturas, relatos (`profiles.is_platform_admin`) |

Mais `/b/[slug]` (perfil público da barbearia, com agendamento aberto a quem
não tem conta), `/configurar` (setup guiado da loja nova) e `/assinatura`
(plano e pagamento da loja).

**O profissional não é um usuário.** `professionals` é uma linha da agenda, não
uma conta. Quem tem login é dono, assistente, cliente e admin.

### Uma conta, dois lados — as duas portas de login

Uma mesma conta pode ser **dono (ou assistente) E cliente**. O papel em
`profiles.role` não muda; o que decide o lado é a **porta por onde a pessoa
entrou**, guardada no cookie `pibarber-lado` (`src/lib/lado.ts`):

| Porta | Endereço | Leva a |
|---|---|---|
| "Entrar" da landing | `/entrar?tipo=barbearia` | `/painel` (sem barbearia: convite em `/app/perfil/barbearia?pela=porta-da-barbearia`) |
| "Criar conta" da landing | `/criar-conta?tipo=barbearia` | cadastro do dono → `/configurar` |
| "Sou cliente" | `/entrar` / `/criar-conta` | `/app` |

- Não há botão de trocar de lado: **sai e entra pela outra porta** (decisão do
  usuário). Cada tela de login tem um link discreto para a outra.
- O middleware manda quem está no lado errado para a casa do seu lado
  (`/app` ↔ `/painel`). O admin sempre vai para `/admin`.
- O Google OAuth carrega a porta em `/callback?lado=…`.
- **No lado cliente, "meu agendamento" NÃO é "o que a RLS me deixa ver".** O
  dono vê pela RLS a agenda inteira da loja; mostrar isso em "Meus
  agendamentos" foi o bug que derrubou a primeira tentativa. A regra é
  `meus_agendamentos_ids()` (30): ficha ligada ao perfil, ou marcado online
  pela pessoa FORA da loja em que ela trabalha. `client_home`, a lista, o
  histórico, avaliar e cancelar pelo app usam essa regra.

---

## 2. Stack

```
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4
Supabase (Postgres + Auth + Storage) · Leaflet · Recharts · Vercel
Meta WhatsApp Cloud API (fetch nativo, sem SDK)
Asaas API v3 (cobrança das assinaturas; fetch nativo, sem SDK)
Resend (e-mails; API por fetch + SMTP do Supabase Auth)
```

O que **não** existe neste projeto, e que é fácil assumir por engano:

- **Sem backend separado.** Não há NestJS, Express, nem serviço à parte. Tudo é
  Next: Server Components, Server Actions e (raramente) Route Handlers.
- **Sem ORM.** Sem Prisma, sem Drizzle. O acesso é o client do Supabase, e os
  tipos vêm de `src/lib/database.types.ts`, gerado a partir do banco.
- **Sem BullMQ, Redis nem processo de background.** As filas são tabelas:
  `whatsapp_messages` (§9) e `email_messages` (§15), com o mesmo desenho. O "worker" é um Route Handler chamado
  pelo `pg_cron` (§7). Não crie outra infraestrutura de fila — estenda esse
  desenho.
- **Sem framework de teste.** Não há Jest, Vitest nem Playwright. `npm run
  typecheck` e `npm run lint` são a única verificação automática. Critério de
  aceite de agente, portanto, é **checklist manual**, não suíte verde.
- **Sem migração automática.** Nada de `prisma migrate`. Ver §4.

### Scripts

```bash
npm run dev                  # porta 3000; NEXT_PUBLIC_SITE_URL tem de espelhar o endereço usado
# Teste de fora de casa (celular, webhook do Asaas sandbox): túnel ngrok
#   NEXT_PUBLIC_SITE_URL=https://<seu-subdominio>.ngrok-free.dev npm run dev
#   ngrok http 3000
node supabase/aplicar-sql.mjs supabase/NN_arquivo.sql   # aplica uma migração no banco do .env.local
node supabase/aplicar-sql.mjs --tipos                   # regera database.types.ts
npm run build
npm run typecheck            # tsc --noEmit
npm run lint
node --no-warnings scripts/whatsapp-templates.mjs --ver|--enviar|--listar   # templates na Meta
```

---

## 3. Mapa do código

```
src/
  app/
    (auth)/            entrar, criar-conta (?tipo=barbearia = porta do dono), callback
                       (OAuth + token_hash dos e-mails, lê ?lado=), email-confirmado,
                       esqueci-senha, redefinir-senha
    app/               O APP DO CLIENTE (PWA): agendamentos, buscar, notificações, perfil/*
                       (perfil/barbearia = "abrir minha barbearia")
    painel/            O PAINEL DO DONO/ASSISTENTE: agenda, caixa, clientes, comissões,
                       equipe, espera, fiado, pendências, relatórios, serviços, avaliações,
                       configurações
    b/[slug]/          Perfil público da barbearia + /agendar (funciona sem login)
    a/[token]/         Acompanhamento de agendamento feito sem cadastro (link com token)
    configurar/        Setup guiado da loja nova (6 etapas) — ver §12
    assinatura/        Plano, pagamento e faturas da loja — ver §13
    sem-barbearia/     Dono sem loja (ou loja removida)
    admin/             SUPER ADMIN: visão geral, barbearias (+ ficha [id]), feedbacks — §14
    api/
      cron/whatsapp/     O "worker": lembretes + despacho da fila. Protegido por CRON_SECRET
      webhooks/whatsapp/ Webhook da Meta: status de entrega, templates, opt-out
      webhooks/asaas/    Webhook do Asaas: pagamentos da assinatura (header asaas-access-token)
      cron/emails/       O worker dos e-mails (§15). Mesmo CRON_SECRET
      emails/sair/[id]/  Descadastro de um clique (Gmail), sem sessão
    sair/[id]/         Página "não quero mais receber" do e-mail de volta
    actions/           SERVER ACTIONS — toda escrita passa por aqui
      admin, admin-assinatura, admin-notas, admin-visualizacao, appointments,
      assinatura, auth, booking, client, customers, feedback, money, publico,
      services, setup, shop, team
  components/
    admin, assinatura, auth, booking, charts, client, landing, painel, setup, ui
  lib/
    supabase/          client.ts (browser), server.ts (RSC/action), admin.ts (service role),
                       publico.ts (leitura anônima)
    queries/           agenda.ts, barbearia.ts, cliente.ts — leitura tipada e cacheada
    whatsapp/          catalogo.ts (os textos), graph.ts (HTTP da Meta), fila.ts,
                       templates.ts, avisos.ts (o gancho das actions), painel.ts,
                       telefone.ts, rotulos.ts
    asaas.ts           HTTP do Asaas (clientes, assinaturas, parcelamentos, estornos)
    assinatura.ts      textos/contas de TELA da assinatura (pode ir ao navegador)
    assinatura-servidor.ts  sincronizar com o Asaas, temPagamentoConfirmado — só servidor
    admin.ts           tipos e situações da lista do /admin
    visualizacao.ts    cookie do "ver como o dono" (somente leitura)
    lado.ts            cookie da porta de login (cliente | barbearia)
    nova-barbearia.ts  criação da loja (cadastro do dono e "abrir minha barbearia")
    email/             modelos.ts (textos e layout), fila.ts (enfileirar, despachar,
                       varreduras do cron), avisos.ts (o gancho das actions),
                       resend.ts (HTTP), descadastro.ts
    cron.ts            cronAutorizado() — o Bearer CRON_SECRET dos dois crons
    auth.ts, config.ts, database.types.ts, env.ts, erros.ts, telefone.ts,
    utils.ts, periodo.ts, imagens.ts, geocoding.ts, viacep.ts, suporte.ts, ...
supabase/              MIGRAÇÕES SQL NUMERADAS (ver §4)
scripts/               capturar-telas, dia-de-demonstracao, medir, whatsapp-templates
docs/                  manual.md, imagens.md, promover-dono.md, whatsapp.md
ESPECIFICACAO.md       Escopo, banco e telas, em detalhe
AUDITORIA_BUGS.md      Bugs levantados em auditoria
AUDITORIA_SEGURANCA.md Achados de segurança
```

---

## 4. O banco — e como se muda ele

**As regras de negócio moram no Postgres.** Isso é decisão de arquitetura, não
acaso: agendar é `book_appointment()`, concluir é `complete_appointment()`,
faltar é `mark_no_show()`. Não reimplemente em TypeScript o que já existe como
função SQL.

### Migrações

Arquivos em `supabase/`, numerados, rodados na ordem — no SQL Editor do
Supabase ou com `node supabase/aplicar-sql.mjs <arquivo>` (usa o `.env.local`).
Não há CLI de migração neste projeto.

⚠️ **Dois bancos.** O `.env.local` aponta para o projeto Supabase de **dev**;
a configuração de **produção** fica em `.env.producao.local`. Para aplicar em
produção sem trocar o `.env.local`, rode o script a partir de uma cópia
isolada com o env de produção. **Produção só com autorização explícita.**

```
01_schema.sql      extensões, enums, tabelas, índices, a constraint de horário
02_functions.sql   triggers, helpers, funções de negócio
03_rls.sql         policies e grants
04_seed.sql        4 barbearias de exemplo
05–06              operação (promover admin, apagar dados)
07…24              migrações incrementais (24 = WhatsApp)
25_setup_barbearia       setup guiado, blocked_at, concluir_setup_barbearia, telefone único de dono
26_assinaturas           plans/plan_prices, subscriptions, pagamentos, eventos, assinatura_liberada
27_agenda_padrao_15_dias max_advance_days padrão 15
28_feedbacks             relatos do painel (+ bucket privado `feedbacks`)
29_admin_dashboard       admin_notes, admin_audit, admin_barbearias(), admin_metricas()
30_lado_cliente          meus_agendamentos_ids() e client_home com a regra do lado cliente
31_emails                email_messages, email_opt_outs, platform_settings, interruptores de e-mail
```

**A próxima migração é a `32_`.** Os modelos de e-mail do Supabase Auth ficam
em `supabase/emails/*.html` (colados à mão no painel — `docs/emails.md`). Regras para escrever uma:

- Idempotente de ponta a ponta. `create table if not exists`, `do $$ ... exception
  when duplicate_object then null; end $$` para enums e constraints, `create index
  if not exists` **com nome explícito** (sem nome o Postgres inventa um e o
  `if not exists` deixa de funcionar).
- Cabeçalho comentado explicando **o motivo**, no estilo dos arquivos existentes
  (veja `20_link_expira_e_rajada.sql`: ele conta o bug, mostra o SQL errado, o
  efeito observado em produção e a correção). Não é decoração — é o padrão da
  casa.
- Toda tabela nova entra na RLS. Ver §5.
- Depois de mexer no schema, `database.types.ts` precisa ser regerado
  (`node supabase/aplicar-sql.mjs --tipos`, que lê o `.env.local`), senão o
  `typecheck` acusa.

### Tabelas principais

- `profiles` — perfil GLOBAL da pessoa (espelha `auth.users`, criado por trigger).
  `role`, `is_platform_admin`, `barbershop_id` (só o assistente usa).
- `barbershops` — `owner_id`, `slug` único, endereço, `latitude`/`longitude`,
  `whatsapp` (**o WhatsApp de contato da loja, usado só para montar link
  `wa.me` na tela** — não confundir com a integração de API), regras de
  agendamento (`min_advance_minutes`, `max_advance_days`,
  `cancel_deadline_hours`), `rating_avg`/`rating_count` mantidos por trigger.
  Desde a 24: `whatsapp_confirmation_enabled`, `whatsapp_reminder_enabled`,
  `whatsapp_cancellation_enabled` (os interruptores das mensagens).
- `professionals`, `services`, `business_hours`, `time_off`.
- `customers` — **a ficha do cliente DENTRO de uma barbearia**. `unique
  (barbershop_id, phone)` parcial. `phone` **é nulo no cliente avulso** desde a
  13. `profile_id` é nulo no caso normal (cliente que o dono cadastrou na mão e
  nunca criou conta). `notes` nunca aparece para o cliente. Totais mantidos
  pelas funções, não escreva na mão.
- `appointments` — `starts_at`/`ends_at`, `status`, `source` (`online`|`manual`),
  `cancel_reason`, `completed_at`, `public_token` (link sem cadastro),
  **`reminder_sent_at` — desde a 24 significa "o lembrete FOI PARA A FILA", não
  "foi enviado"** (§11).
  Constraint `appointments_no_overlap` (GiST) torna impossível gravar dois
  atendimentos sobrepostos para o mesmo profissional.
- `transactions`, `commissions`, `debts`, `debt_payments` — dinheiro.
- `waitlist_entries`, `reviews`, `favorites`, `shop_visits`, `dependents`.
- `notifications` — **só o sininho do topo do app**. `profile_id`, `type`
  (`appointment|reminder|waitlist|review|system`), `title`, `body`, `link`,
  `read_at`. **Não tem nada a ver com envio externo.** Não reaproveite esta
  tabela como outbox.
- `whatsapp_messages`, `whatsapp_templates`, `whatsapp_opt_outs` — a
  integração de WhatsApp (§9). **Só a service role lê e escreve.**
- `barbershops.setup_completed_at` (nulo = loja no setup) e
  `barbershops.blocked_at` (bloqueio da PLATAFORMA). `is_active` é o portão
  público e é derivado: setup concluído e sem bloqueio (§12).
- `plans` + view `plan_prices`, `subscriptions` (uma por loja, criada por
  trigger), `subscription_payments` (espelho das faturas do Asaas),
  `subscription_events` (estorno, cancelamento, extensão de teste) — §13.
- `feedbacks` — relatos enviados pelo painel (§14).
- `admin_notes` (notas internas por loja) e `admin_audit` (quem visualizou o
  quê) — só admin da plataforma.

---

## 5. Segurança — o que já foi aprendido

Está tudo em `AUDITORIA_SEGURANCA.md`; o resumo operacional:

- **A permissão desce até o banco.** Esconder menu no front não protege nada,
  porque a API do Supabase continua acessível com a chave pública. RLS é a
  proteção; menu reduzido é consequência.
- **Três camadas:** RLS no Postgres, helpers `SECURITY DEFINER` para autorização,
  e checagem na Server Action.
- `createAdminClient()` (service role) é a única porta que passa por cima da
  RLS. Use com parcimônia, só no servidor, e nunca em código que possa acabar
  no bundle do navegador. Os usos legítimos estão listados no cabeçalho de
  `src/lib/supabase/admin.ts`.
- Leitura pública passa por funções `SECURITY DEFINER` que só devolvem loja
  ativa (`search_barbershops`, `book_appointment_publico`).
- Validação de tela é **espelho**, não regra. `src/lib/telefone.ts` diz isso no
  cabeçalho: a regra que vale é a do Postgres. Mudou num lado, muda no outro.
- **Tabela só-servidor = RLS ligada, zero policy e `revoke all` de anon e
  authenticated.** É o desenho de `public_booking_attempts` (17) e das três
  tabelas de WhatsApp (24). A 24 tem um portão no fim que falha se alguma
  delas ganhar policy ou grant.
- **Endpoint público que dispara efeito** (cron, webhook) confere segredo ou
  assinatura com `crypto.timingSafeEqual`, e falha FECHADO quando o segredo
  não está configurado. Vale para o webhook do Asaas (`ASAAS_WEBHOOK_TOKEN`).
- **"Ver como o dono" é somente leitura no SERVIDOR:** com o cookie
  `pibarber-ver-loja`, `requireShopContext()` recusa toda server action
  (`ModoSomenteLeitura`). Não depende de esconder botão.
- **Colunas que o dono NÃO pode escrever** (`is_active`, `setup_completed_at`,
  `blocked_at`, tudo de `subscriptions`) ficam fora do grant por coluna; muda
  só por função `SECURITY DEFINER` ou service role.

---

## 6. Convenções de código

### Server Actions

Toda escrita é uma Server Action em `src/app/actions/*.ts`, com `"use server"`
no topo. O padrão de retorno:

```ts
import { falha, sucesso, type ActionResult } from "@/lib/types";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";

export async function fazerAlgo(...): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("...");
    if (error) return falha(traduzirErroBanco(error, "[contexto] nome_da_rpc"));
    revalidatePath("/painel/agenda");   // ou revalidateTag(tagBarbearia(id))
    return sucesso(data);
  } catch (e) {
    unstable_rethrow(e);                // ver §8
    return falha(traduzirErroDesconhecido(e));
  }
}
```

**Nunca descarte o `error` do Supabase.** E erro de banco nunca chega cru na
tela: passa por `traduzirErroBanco` e vira português.

**Efeito colateral externo** (hoje: WhatsApp) entra DEPOIS de a operação dar
certo e ANTES do `revalidatePath`, por uma função que **nunca lança** — ver
`avisarPorWhatsapp()` em `src/lib/whatsapp/avisos.ts`. Falha dele não vira
`falha()` para o usuário. O trabalho lento vai em `after()` do `next/server`.

### Idioma e comentários

- Todo o código, nomes de função, comentários e texto de tela em **português
  brasileiro**. `buscarBarbearias`, não `searchBarbershops`.
- Comentário explica **por quê**, não o quê. O estilo da casa é discursivo e
  conta a história do problema (veja `src/lib/telefone.ts`,
  `supabase/20_link_expira_e_rajada.sql`, `src/lib/env.ts`). Mantenha.

### Data e hora

Sempre resolvidas no servidor, em `America/Sao_Paulo`. `FUSO`, `timestampSP()`,
`faixaDoDia()` em `src/lib/utils.ts`. O horário do agendamento não pode depender
do relógio do celular do cliente.

### Telefone

`normalizarTelefone()` deixa só dígitos — é assim que entra no banco. É o que
faz o limite por telefone funcionar (senão `(11) 98765-4321` e `11987654321`
seriam duas pessoas). `erroDeTelefone()` devolve a mensagem pronta.

Para a Meta, `telefoneMeta()` (`src/lib/whatsapp/telefone.ts`) põe o 55 e
**repõe o nono dígito** que o WhatsApp tira do `wa_id` de muito celular
brasileiro. Em log, telefone só por `mascararTelefone()`.

### Env

`src/lib/env.ts`, função `obrigatoria()` que grita alto quando falta variável.
Segredo só via função dedicada e só no servidor. Variável nova segue esse
padrão — nada de `process.env.X!` espalhado pelo código.

Integração OPCIONAL segue `envWhatsapp()`: devolve `null` quando o interruptor
não está definido (o projeto sobe sem ela), e só aí as demais viram
obrigatórias. `envAsaas()` segue o mesmo desenho: sem `ASAAS_API_KEY` a tela
de assinatura abre mas não cobra; o prefixo da chave (`$aact_hmlg_` ×
`$aact_prod_`) decide sandbox ou produção. A chave começa com `$` — no `.env`
precisa de barra invertida (`\$aact_…`), senão o Next a lê vazia.

### Datas na tela

`diaBR` para data sem hora (vencimento, fim de teste em dia), `dataBR` /
`dataHoraBR` para momento com hora. Data sem hora passada a `new Date()` cai no
dia anterior no fuso de São Paulo.

---

## 7. O que roda sozinho: pg_cron → /api/cron/whatsapp

Até o agente 01 não existia nada agendado. **Agora existe um gatilho:**

- **Mecanismo: `pg_cron` + `pg_net` no Supabase**, a cada **5 minutos**,
  fazendo `POST https://pibarber.vercel.app/api/cron/whatsapp`.
- **Protegido por `CRON_SECRET`**, no cabeçalho `Authorization: Bearer …`. O
  segredo fica no **Vault** do Supabase (`whatsapp_cron_secret`), não no texto
  do job. Sem `CRON_SECRET` na Vercel, o endpoint recusa todo mundo.
- **O que ele faz, em ordem:** confere os templates pendentes na Meta,
  enfileira os lembretes das próximas 36h, e despacha a fila (até 50 por rodada).
- **Rodar duas vezes não duplica nada** (índice único por agendamento+evento e
  reivindicação com `for update skip locked`).

⚠️ **ESTADO:** a migração 24 liga as extensões, mas o `cron.schedule` está
**comentado** no arquivo, porque leva URL e segredo. Ele precisa ser rodado à
mão uma vez — passo a passo em `docs/whatsapp.md` §6.1. Enquanto isso não for
feito, **lembrete nenhum sai** (confirmação e cancelamento saem, porque são
enviados na hora pela action).

**Alternativa: Vercel Cron** (`vercel.json`), que o endpoint também aceita (GET).
No plano Hobby ele roda no máximo **uma vez por dia**, o que não serve para o
lembrete das 18h. Se for trocado, atualize esta seção e o `docs/whatsapp.md`.

Funcionalidade nova com horário (resumo diário, expiração) deve pendurar no
MESMO endpoint de cron ou criar outro protegido do mesmo jeito — não um
segundo mecanismo.

---

## 8. Armadilhas — leia antes de codar

Estão detalhadas em `ESPECIFICACAO.md` §10. As que mais mordem:

**`PGRST201` — relação ambígua.** Quando duas FKs apontam para a mesma tabela,
o PostgREST não sabe qual você quer no embed. Desambigue nomeando a constraint:
`profiles!appointments_created_by_fkey(...)`.

**`try/catch` engolindo o controle de fluxo do Next.** `redirect()` e
`notFound()` funcionam lançando exceção. Um `catch` genérico engole isso e a
navegação some sem erro visível. Por isso `unstable_rethrow(e)` é a primeira
linha de todo `catch` neste projeto. Não remova.

**Nunca descarte o `error` do Supabase.** Um `.select()` que falhou devolve
`data: null` sem lançar nada. Sem checar `error`, a tela mostra "nenhum
resultado" para um problema de permissão.

**`database.types.ts` desatualizado.** Mexeu no schema e não regerou? O
`typecheck` quebra em lugares que parecem não ter relação com a sua mudança.

**Reivindicar linha de fila com `update ... where status = 'pending'`.** Não
exclui a execução concorrente: o status continua `pending` depois do update, e
as duas seguem. Use `whatsapp_reivindicar()` (skip locked + prazo de posse) ou
o mesmo padrão.

**`next build` com o `next dev` ligado quebra o dev.** Os dois usam `.next`.
Pare o dev, rode o build, apague `.next` e suba o dev de novo.

**RLS do dono vaza para o lado cliente.** O dono tem acesso de leitura a toda a
agenda da loja; qualquer tela de cliente que confie só na RLS mostra os
horários da barbearia como se fossem dele. Use `meus_agendamentos_ids()`.

**Pix em assinatura do Asaas vira boleto híbrido** (boleto com QR Pix). Pix
compensa na hora; o boleto leva até 3 dias úteis. Decisão: aceitar e avisar
na tela.

**Fatura cancelada não é "em aberto".** Use `situacaoDaFatura()`
(`src/lib/assinatura.ts`) — um mapa só para o dono e o /admin.

**Webhook: ler o corpo antes de conferir a assinatura.** `request.json()`
consome o corpo e reserializar muda os bytes — o HMAC nunca bate. Leia
`arrayBuffer()`, confira, e só então faça o parse.

---

## 9. WhatsApp — o que existe

Integração com a **Meta WhatsApp Cloud API**, chamada direto por `fetch`, com
**número único da plataforma**. Configuração do zero: **`docs/whatsapp.md`**.

Não confundir com `barbershops.whatsapp` (contato da loja, só link `wa.me` —
`linkWhatsApp()`, `src/lib/suporte.ts`, `src/lib/config.ts`) nem com
`notifications` (sininho).

### Os eventos (só Utilidade) — em uso: lembrete e cancelamento

| Evento | Quando | Onde nasce | Template |
|---|---|---|---|
| ~~`confirmation`~~ | **Desligada em 2026-09-30** (decisão do negócio): a confirmação vai por e-mail; o template continua no catálogo, fora de `EVENTOS` | — | `pibarber_confirmacao_v1` |
| `reminder` | 18h da véspera (ou já, se esse instante passou) | Cron → `varrerLembretes` | `pibarber_lembrete_v1` |
| `cancellation` | Cancelou pelo painel (`cancelarAgendamento`), pelo app (`cancelarMeuAgendamento`) ou pelo link (`cancelarPorToken`) | Server Action → `avisarPorWhatsapp` | `pibarber_cancelamento_v1` |

Agendamento criado **pelo balcão** (`criarAgendamento`) não gera confirmação,
mas gera lembrete se a ficha tiver telefone.

### Onde ficam os textos

`src/lib/whatsapp/catalogo.ts` — os três textos, a ordem dos parâmetros,
`montarParametros()` e `previa()`. Espelho em `supabase/24_whatsapp.sql`
PARTE 4. Texto novo = template novo na Meta (`_v2`). **A barbearia não edita
texto** (§11-b); ela liga e desliga em `/painel/configuracoes`.

### As tabelas (24_whatsapp.sql)

- `whatsapp_templates` — espelho da WABA, uma linha por evento, com `status`
  (`pending|approved|rejected|paused|disabled`) e `reject_reason`. **Só
  `approved` é enfileirado.**
- `whatsapp_messages` — a fila. `recipient` congelado (E.164 sem +), `params`
  jsonb, `status` (`pending|sent|delivered|read|failed`), `scheduled_for`
  (agenda E prazo de posse), `attempts`, `external_id` (wamid), datas de
  entrega, `failure_code`/`failure_reason`. Índice único
  `(appointment_id, event)`.
- `whatsapp_opt_outs` — telefone canônico (13 dígitos) de quem pediu para sair.
  Global, não por loja.
- Todas com RLS ligada e **zero policy**; a tela do dono lê pelo servidor, depois
  de `requireOwnerContext()`, recortando pela loja e sem trazer telefone.

Funções (todas `security definer`, só `service_role`):
`whatsapp_dados_agendamentos`, `whatsapp_lembretes_pendentes`,
`whatsapp_reivindicar`, `whatsapp_registrar_status`.

### O fluxo

```
Server Action (agendar / cancelar)
  └─ avisarPorWhatsapp()        nunca lança; sem env → return
       ├─ whatsapp_dados_agendamentos   nome, telefone, loja, profissional, link, interruptores
       ├─ enfileirar()           opt-out? template aprovado? → insert pending (duplicata = ok)
       └─ after(despacharUma)    envia depois que a resposta saiu

pg_cron (5 min) → /api/cron/whatsapp
  ├─ sincronizarTemplates()     só se houver template não aprovado
  ├─ varrerLembretes()          enfileira reminder p/ 18h da véspera; marca reminder_sent_at
  └─ despachar()                whatsapp_reivindicar → Graph API → sent + wamid
                                   ├ erro transitório → pending, espera 1/2/4/8 min
                                   ├ erro permanente  → failed
                                   └ agendamento mudou → failed/OBSOLETA (não envia)

Meta → /api/webhooks/whatsapp   (X-Hub-Signature-256 obrigatório)
  ├─ statuses[]                 whatsapp_registrar_status: só preenche nulo, só anda para frente
  ├─ messages[] "PARAR"…        opt-out + descarta o que estava pending para o número
  └─ message_template_status_update → whatsapp_templates
```

Classificação de erro (transitório ou não) em `classificarErro()`,
`src/lib/whatsapp/graph.ts`, com o porquê de cada código.

### Restrições da Meta que valem para o Brasil

- **Cross-border bloqueado.** Empresa fora do Brasil não envia para número
  brasileiro, e empresa brasileira só fala com brasileiro. Na prática: o número
  de teste da Meta (`+1 555…`) **não envia para `+55`** — devolve erro `130497`,
  sem solução conhecida. O número registrado precisa ser `+55`.
- **Teto sem verificação de empresa:** 250 destinatários únicos por 24h, 2
  números, 250 templates. É franquia inicial, não bloqueio — dá para operar sem
  CNPJ. A verificação levanta o teto (1.000 → 10.000 → 100.000) e faz o nome de
  exibição aparecer na lista de conversas (sem ela, o cliente vê só o número).
- O número registrado na API **deixa de funcionar no WhatsApp comum/Business
  App**. É migração, não cópia.
- Token do botão "Gerar token" do painel expira em 24h. Produção usa token de
  **Usuário do Sistema** (Meta Business Suite → Usuários do sistema), com
  `whatsapp_business_management` e `whatsapp_business_messaging`.
- Sem **forma de pagamento** na conta do WhatsApp, template iniciado pela
  empresa é recusado (`131042`).

### Decisões tomadas (2026-09) — continuam valendo

- **API oficial da Meta, chamada direto.** Sem BSP (Twilio, 360dialog): com
  número único não há multi-tenant do lado da Meta, e o BSP só acrescenta taxa
  por mensagem e um portão a mais. Sem biblioteca não oficial por QR code
  (Baileys, Evolution API, Z-API): viola os Termos e o risco de banimento recai
  sobre o número da plataforma.
- **Número único da plataforma**, credenciais em variável de ambiente.
- **Templates fixos da plataforma**, nome da barbearia como parâmetro.
- **Só Utilidade na primeira fase.** Marketing custa ~9× mais (§11-a).

---

## 10. Histórico de agentes

| # | Agente | Status |
|---|---|---|
| 01 | WhatsApp oficial (Meta Cloud API): outbox, templates, webhook, cron | ✅ código entregue — ativação em produção pendente (ver abaixo) |
| 02 | Setup guiado, assinaturas (Asaas), super admin, relatos, duas portas de login | ✅ entregue na `feat/setup-barbearia` — migrações 28–30 pendentes em produção (ver abaixo) |
| 02b | E-mails com Resend: avisos ao dono e ao cliente, lembrete de voltar, "Esqueci minha senha" | ✅ código e migração 31 no dev — falta domínio/chave do Resend, SMTP no Supabase e o cron (§15) |

> Cada agente acrescenta a própria linha aqui e um bloco "O que o agente N
> entregou" ao final deste arquivo, no mesmo formato: o que era, o que ficou, o
> que se descobriu lendo o código, o que NÃO foi feito e por quê.

---

## 11. Dívidas técnicas conhecidas

- Sem nenhum teste automatizado. Qualquer regressão só aparece em uso.
- `AUDITORIA_BUGS.md` e `AUDITORIA_SEGURANCA.md` listam achados; conferir se o
  item em que você vai mexer já está catalogado antes de "descobrir" de novo.
- `database.types.ts` é gerado à mão pelo painel do Supabase — fácil de esquecer.
  (As partes da 24, escritas à mão pelo agente 01, foram conferidas contra o
  banco em 19/09 — bateram.)
- Migrações rodadas manualmente: não há garantia de que produção e o banco local
  de um dev estejam no mesmo ponto. Confira antes de depender de coluna nova.

Criadas pelo agente 01:

- **(a) Mensagens de Marketing fora de escopo.** Aniversário, reativação de
  cliente sumido e pedido de avaliação custam ~9× uma de Utilidade. É decisão
  de produto pendente, não esquecimento. Quando entrar: categoria MARKETING,
  opt-in explícito, e o mesmo catálogo/fila.
- **(b) A barbearia não pode editar o texto das mensagens.** Cada texto é um
  template na WABA da plataforma, com análise da Meta e teto de 250 templates
  sem verificação. A loja só liga e desliga. Personalização possível no futuro:
  mais parâmetros no mesmo template, nunca texto livre.
- **(c) `appointments.reminder_sent_at` significa "foi para a fila", não "foi
  entregue".** O nome engana; foi mantido para não quebrar a coluna existente
  desde o 01. Entrega é `whatsapp_messages.sent_at`/`delivered_at`. Há
  `comment on column` no banco dizendo isso.
- **(d) Teto de 250 destinatários únicos por 24h** enquanto a empresa não for
  verificada, somando TODAS as barbearias. Ao bater nele, a Meta recusa
  mensagem para destinatário novo; a linha termina `failed` (o dono vê "Não foi
  possível entregar"), sem retentativa — de propósito, confirmação atrasada
  horas depois confunde. O agendamento não é afetado. Destrava com verificação
  de empresa (CNPJ).
- **(e) Pequenas arestas conhecidas:**
  - Cancelar → desfazer → cancelar de novo manda UM aviso de cancelamento só (índice único).
  - Desfazer um cancelamento não reenfileira o lembrete: `reminder_sent_at` já estava preenchido.
  - Status do webhook que chega antes de o envio gravar o `wamid` se perde. É raro; a linha fica `sent`.
  - Quem agenda depois das 18h da véspera recebe confirmação e lembrete quase juntos. É a regra pedida ("se o instante passou, agora").
  - A palavra de saída "cancelar" pode ser escrita por quem queria cancelar o HORÁRIO. A pessoa sai da lista e o horário não é cancelado. Está na lista porque foi pedido; reavaliar com dado de uso.

Criadas pelo agente 02:

- **(f) Estorno é manual fora do /admin.** O botão de estorno do /admin chama
  o Asaas; devolução pedida por outro canal é feita no painel do Asaas e
  registrada como `external_refund`.
- **(g) E-mails dependem do cron** (lembrete, cobrança, lembrete de voltar):
  sem o `cron.schedule` de `docs/emails.md` §5, só saem os avisos imediatos de
  agendar/cancelar. O aviso de pagamento também vem do cron (até 5 min).
- **(h) A regra do lado cliente mora em dois lugares:** `meus_agendamentos_ids()`
  e `client_home` (30). Mudou uma, mude a outra.
- **(i) Excluir conta** só existe para quem é só cliente; quem tem barbearia
  pede pela Central de ajuda.

---

## 12. Setup guiado e cadastro do dono

- O dono se cadastra sozinho em `/criar-conta?tipo=barbearia` (sem Google: o
  cadastro exige celular). E-mail e celular são **únicos entre donos**
  (índice `profiles_telefone_dono_unico`, telefone só com dígitos).
- Cliente logado também abre a própria loja em `/app/perfil/barbearia`, com a
  mesma conta (ver "Uma conta, dois lados", §1).
- A loja nasce com `is_active = false` e `setup_completed_at` nulo; o painel
  manda para `/configurar` (6 etapas em `components/setup/SetupGuiado.tsx`:
  sua barbearia, onde fica, horário, serviços, quem atende, regras de
  agendamento). Agenda nasce aberta por 15 dias (27).
- **Só `concluir_setup_barbearia(shop)` publica a loja:** confere dono, mapa,
  um dia aberto, um serviço e um profissional ativos. Loja com `blocked_at`
  termina o setup mas continua escondida.
- `blocked_at` é o bloqueio da plataforma; o trigger `barbershops_guard_bloqueio`
  força `is_active = false` e só deixa o admin (ou a service role) mexer nele.

## 13. Assinaturas (Asaas)

Regras de negócio no cabeçalho de `supabase/26_assinaturas.sql` — **não mude
sem falar com o dono do produto.** Resumo:

- Planos por profissionais ATIVOS: Solo (1) R$ 69,99 · Equipe (2–4) R$ 99,99
  · Barbearia (5–8) R$ 159,99 por mês. Mais de 8: contato direto.
- Semestral −10%, anual −20%. Preços derivados pela view `plan_prices`
  (arredonda o TOTAL).
- Teste de 14 dias a partir da criação da loja (as lojas antigas ganharam 14
  dias na migração). Período pago tem **1 dia de tolerância**; teste não.
- Cartão ou Pix, sempre na página do Asaas (nenhum dado de cartão passa pelo
  servidor). Parcelado 6x/12x sem juros no semestral/anual, taxa absorvida; o
  parcelado não renova sozinho — link de renovação 15 dias antes do fim.
- Reembolso: 7 dias de arrependimento com devolução integral após cada
  pagamento; depois, sem devolução proporcional.
- **`assinatura_liberada(shop)` é A regra** de "pode operar". Vencida: o painel
  só mostra `/assinatura`, a página pública não aceita agendamento novo
  (trigger `appointments_exige_assinatura`), nada é apagado, pagar libera na
  hora. Ativar profissional além do plano é recusado
  (`professionals_limite_do_plano`).
- `paid_until` só é empurrado pelo **webhook do Asaas** (service role). A
  página `/assinatura` também sincroniza com o Asaas quando há fatura
  pendente — rede de segurança se o webhook atrasar.
- Antes de pagar, o dono pode trocar plano e forma de pagamento
  (`temPagamentoConfirmado`). O dono cancela a renovação sozinho; estorno,
  cancelamento e extensão de teste ficam no /admin (`subscription_events`).

## 14. Super admin e relatos

- `/admin` (layout só para `is_platform_admin`): **Visão geral**
  (`admin_metricas()`: MRR, receita do mês, pagantes, conversão do teste,
  cancelamentos; e a lista "Precisa de atenção"), **Barbearias**
  (`admin_barbearias()`, filtros, CSV no formato do Excel brasileiro) e a
  **ficha** de cada loja (dono, assinatura, uso, notas internas, relatos,
  linha do tempo, "Ver como o dono", "Gerenciar assinatura", bloquear).
- Admins: Rafael Vetrano e Guilherme Pazoti, mesmo poder (o do Guilherme
  ainda precisa ser promovido — `docs/promover-dono.md` / `05_criar_admin.sql`).
- **Relatos:** botão "Reportar problema ou dar sugestão" no painel (dono e
  assistente), com print opcional no bucket privado `feedbacks` (caminho sempre
  `<shopId>/…`, `upsert: false`). Limite por loja em `feedbacks_limite`. A
  lista fica só em `/admin/feedbacks`; a resposta é pelo WhatsApp.

## 15. E-mails (Resend)

Configuração do zero em **`docs/emails.md`**. Dois caminhos:

- **Auth** (confirmação de cadastro, "Esqueci minha senha"): quem manda é o
  Supabase, com o Resend como **SMTP**. Os modelos (`supabase/emails/`) levam
  `{{ .RedirectTo }}&token_hash=…` → `/callback` faz `verifyOtp`, o que
  funciona em qualquer aparelho (o `code` do PKCE só no navegador que pediu).
- **Avisos**: fila `email_messages` (31), mesmo desenho do WhatsApp — linha
  primeiro, `after()` para o envio imediato, `/api/cron/emails` a cada 5 min
  para o resto. `dedupe_key` única = idempotência. O texto é montado na hora
  do envio (`modelos.ts`); a linha guarda tipo + parâmetros.

| Para | E-mail | Origem |
|---|---|---|
| Dono | agendamento novo, cliente cancelou (interruptores em Configurações) | `avisarPorEmail` nas actions `agendar`, `agendarSemLogin`, `cancelarMeuAgendamento`, `cancelarPorToken` |
| Dono | teste acaba em 3d/1d, agenda pausada, fatura vencida, pagamento, renovar parcelado | cron → `email_cobranca_pendente()` |
| Cliente | confirmação; cancelamento pela loja | `avisarPorEmail` em `agendar`/`agendarSemLogin`/`cancelarAgendamento` |
| Cliente | lembrete às 18h da véspera | cron → `email_lembretes_pendentes()` (não usa `reminder_sent_at`, que é do WhatsApp) |
| Cliente | vaga na fila de espera, convite para avaliar | cron → `email_notificacoes_pendentes()` (o sininho vira e-mail) |
| Cliente | **lembrete de voltar** (marketing) | cron → `email_recorrencia_candidatos()` |

- **E-mail do cliente** = `email_do_cliente()`: conta da ficha → conta de quem
  marcou online (nunca o dono/assistente da loja) → e-mail da ficha.
- **Lembrete de voltar:** ligado por padrão, a loja desliga; o intervalo é da
  plataforma (`platform_settings.recorrencia_dias`, padrão 21, editado em
  `/admin/emails`). Uma vez por visita, só sem horário marcado, até 30 dias
  depois do prazo, entre 9h e 20h. Descadastro por `/sair/<id da linha>` e
  `List-Unsubscribe` de um clique; `email_opt_outs` por loja ou de todas.
- Sem `RESEND_API_KEY` nada entra na fila (o dev roda sem).

---

## O que o agente 01 entregou

### O que era

Nenhuma integração de API com WhatsApp. `reminder_sent_at` existia sem uso
desde o `01_schema.sql`. Nada agendado no projeto: nem cron, nem fila, nem worker.

### O que ficou

Branch `agente-01-whatsapp`, um commit por bloco (`agente-01: A…G`).

| Bloco | Entrega |
|---|---|
| A | `envWhatsapp()` (null sem `WHATSAPP_PHONE_NUMBER_ID`) e `envCronSecret()` em `env.ts`; `.env.example` de volta, com as sete variáveis |
| B | `supabase/24_whatsapp.sql` — 3 enums, 3 tabelas, 3 interruptores em `barbershops` (+ grant de coluna), RLS fechada com portão, 4 funções só-service-role, seed dos templates, extensões e o `cron.schedule` comentado com segredo no Vault. `database.types.ts` e `types.ts` acrescidos |
| C | `src/lib/whatsapp/`: catálogo, cliente Graph com classificação de erro, fila (enfileirar/despachar/varrerLembretes), sincronização de templates, `avisarPorWhatsapp` |
| D | `/api/cron/whatsapp` (POST e GET) e `/api/webhooks/whatsapp` (GET verificação, POST eventos); middleware deixa de rodar nessas rotas |
| E | Ganchos em `agendar`, `agendarSemLogin`, `cancelarAgendamento`, `cancelarMeuAgendamento`, `cancelarPorToken` |
| F | Bloco "Mensagens de WhatsApp" em `/painel/configuracoes`: interruptores, prévia com dados reais, estado do template, últimos 20 envios; action `salvarAvisosWhatsapp` |
| G | `docs/whatsapp.md` e `scripts/whatsapp-templates.mjs` |

### O que se descobriu lendo o código

- **Este arquivo se chama `pibarber-CONTEXT.md`**, na raiz, e estava fora do Git
  até o commit de segurança deste agente. Toda referência a "CONTEXT.md" é a ele.
- **O `.env.example` tinha sido apagado** (`fd304d0`), contra o que o próprio
  `.gitignore` explica. Foi restaurado com o bloco do WhatsApp.
- **`customers.phone` é nulo no cliente avulso** desde a 13. O lembrete filtra
  isso no SQL, senão o avulso voltaria em toda rodada do cron.
- **O "reivindicar" sugerido no enunciado (`attempts + 1 where status =
  'pending'`) não impede envio duplo** — o status continua `pending`. Virou
  `whatsapp_reivindicar()` com `for update skip locked` e prazo de posse de 10
  minutos (§8).
- **O WhatsApp devolve o `wa_id` de muito celular brasileiro sem o nono
  dígito.** Sem canonizar, o PARAR nunca casaria com o telefone da ficha.
- **Há TRÊS portas de cancelamento**, não duas: painel, app e link com token
  (`cancelar_por_token`). As três avisam.
- **`book_appointment_publico` só devolve o token**; o id do agendamento sai
  por `public_token`.
- **Lembrete de horário cancelado sairia** se nada o impedisse: a fila não sabia
  do cancelamento. A reivindicação descarta como `OBSOLETA` o que não faz mais
  sentido.
- **Template aprovado lá e `pending` aqui** travaria tudo em silêncio se o campo
  do webhook não fosse assinado. O cron sincroniza pela API.
- **O middleware rodava `getUser()` em toda rota, inclusive `/api/*`** — o
  webhook pagaria uma ida ao Supabase antes de responder à Meta.
- **`aplicar-sql.mjs --tipos` existe**, mas lê `.env.local`, que não havia na
  máquina — os tipos foram escritos à mão no formato do gerador.
- **Vercel Cron no Hobby roda uma vez por dia** — insuficiente; por isso pg_cron.

### Checklist de aceite — resultado

Rodado em 2026-09-15. "Local" = Postgres 16 em Docker com as migrações 01–23 aplicadas e roles/`auth.uid()` do Supabase simulados; `next start` com credenciais falsas e service role inválida (nada tocou produção).

- [x] `npm run typecheck` e `npm run lint` limpos (a cada commit).
- [x] `npm run build` passa **sem nenhuma variável de WhatsApp**. Agendar continua igual: sem env, `avisarPorWhatsapp` retorna antes de abrir conexão. *Não houve clique real no site nesta sessão.*
- [x] `24_whatsapp.sql` roda duas vezes seguidas sem erro (local; portão final passou nas duas).
- [x] `database.types.ts` — escrito à mão e, em 19/09, **regerado a partir do banco** depois de aplicar a 24. O que o gerador trouxe bate com o que estava escrito; `typecheck` e `lint` limpos.
- [ ] ⏳ Confirmação chegando no celular — exige credenciais, número +55 e templates aprovados.
- [ ] ⏳ Webhook marcando `delivered_at`/`read_at` com evento real da Meta. *Local: `whatsapp_registrar_status` com `read` antes de `delivered`, repetido, e `failed` depois de `read` → termina `read`, sem sobrescrever.*
- [x] Webhook POST sem assinatura → 401; assinatura inválida → 401; corpo malformado → 400; válido → 200.
- [x] Webhook GET com o verify token certo → challenge em `text/plain`; errado → 403.
- [x] Cron sem autorização → 401 (POST e GET); segredo errado → 401.
- [x] Cron duas vezes não manda em dobro (local): sessão B reivindicou 0 enquanto A segurava a linha, e 0 depois (prazo de posse); índice único recusa lembrete duplicado.
- [~] Lembrete para amanhã: `whatsapp_lembretes_pendentes` devolve só o que está nas próximas 36h (local); o cálculo das 18h da véspera e o `reminder_sent_at` estão em `varrerLembretes`, **sem execução ponta a ponta** (exige env).
- [~] Cancelar pelo painel enfileira `cancellation` — gancho no lugar; ponta a ponta exige env. *Local: pendência de horário cancelado vira `OBSOLETA`.*
- [ ] ⏳ PARAR real criando opt-out — exige Meta. Caminho de código revisado; canonização de 12→13 dígitos conferida à mão.
- [x] Desligar o lembrete numa loja tira só ela da varredura (local, com o dono atualizando a coluna sob RLS como `authenticated`).
- [x] `anon` e `authenticated` (inclusive o dono) recebem `permission denied` em `whatsapp_messages`, `whatsapp_opt_outs` e nas funções `whatsapp_*` (local).
- [x] Nenhum token, App Secret, verify token, CRON_SECRET ou telefone completo no log (`next start` de teste: 0 ocorrências; telefone só por `mascararTelefone`).
- [x] `docs/whatsapp.md` cobre do zero ao teste, com tabela de falhas.

### O que NÃO foi feito, e por quê

- **Ativação (atualizado em 19/09):** a 24 FOI aplicada em produção e os tipos
  foram regerados; os três templates foram submetidos e estão em análise
  (PENDING) na WABA Pi Barber; o número +55 16 99305-5888 está registrado na
  Cloud API. **Ainda falta:** subir o código para o GitHub, as variáveis na
  Vercel, o webhook salvo na Meta, publicar o app e agendar o `cron.schedule`.
  O roteiro com o estado de cada passo está em `context_whatsapp_api.md`.
- **Confirmação no agendamento pelo balcão** (`criarAgendamento`): fora do
  escopo pedido. Quem marca no balcão costuma estar na frente do cliente.
- **Marketing, conversa bidirecional, bot, Embedded Signup, mídia/botões,
  notificar dono/profissional, SMS/e-mail/push**: fora de escopo por decisão.
- **Nenhuma alteração em `notifications`** nem no sininho.

---

## O que o agente 02 entregou

### O que ficou

Branch `feat/setup-barbearia`: `a4f13e3` (cadastro, setup, planos com Asaas),
`ffcf2b5` (trocar plano/forma antes de pagar), `a3174d3` (super admin,
relatos, ajustes da assinatura) e o commit das duas portas de login
(migração 30, `src/lib/lado.ts`, telas de /entrar e do app).

### Estado das migrações

| Migração | Dev | Produção |
|---|---|---|
| 25, 26, 27 | ✅ | ✅ |
| 28, 29, 30 | ✅ | ⏳ aplicar ANTES do deploy do código que as usa |

### O que se descobriu

- **A primeira tentativa de "uma conta, dois lados" foi revertida inteira**:
  "Meus agendamentos" do dono mostrava a agenda da loja (RLS). A versão atual
  resolve na regra (`meus_agendamentos_ids`), não na tela.
- **Seed de teste com agendamento `online` do dono na própria loja** entraria
  como "dele" — por isso a regra exclui a loja em que a pessoa trabalha.
- **Upload com `upsert: true` no bucket `feedbacks` é negado pela RLS**
  (upsert exige policy de update).
- **O Google OAuth não traz telefone** — por isso o cadastro de barbearia não
  tem Google.

### O que NÃO foi feito, e por quê

- **Avisos por e-mail (Resend):** planejado para depois do admin.
- **Revisão jurídica** de Termos e Privacidade (textos atualizados, não revisados).
- **E-mail do Guilherme** para promovê-lo a admin em dev e produção.
- **Build de produção** das duas portas (parar o dev antes — §8).
