# PiBarber — CONTEXT.md

> Arquivo de contexto para agentes de IA (Claude Code) que vão trabalhar neste
> repositório. **Leia este arquivo inteiro antes de escrever qualquer linha.**
> Ele descreve o que o projeto é, como ele está construído, quais convenções
> são inegociáveis e quais armadilhas já custaram tempo.
>
> Quem terminar um agente atualiza este arquivo ao final — é a regra que
> mantém o próximo agente informado.

**Atualizado por último:** (preencher) — estado inicial, antes do agente 01.
**Commit de referência:** `be8c876`.

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

Mais `/b/[slug]` (perfil público da barbearia, com agendamento aberto a quem
não tem conta) e `/admin` (a plataforma cadastra lojas).

**O profissional não é um usuário.** `professionals` é uma linha da agenda, não
uma conta. Quem tem login é dono, assistente e cliente.

---

## 2. Stack

```
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4
Supabase (Postgres + Auth + Storage) · Leaflet · Recharts · Vercel
```

O que **não** existe neste projeto, e que é fácil assumir por engano:

- **Sem backend separado.** Não há NestJS, Express, nem serviço à parte. Tudo é
  Next: Server Components, Server Actions e (raramente) Route Handlers.
- **Sem ORM.** Sem Prisma, sem Drizzle. O acesso é o client do Supabase, e os
  tipos vêm de `src/lib/database.types.ts`, gerado a partir do banco.
- **Sem fila e sem worker.** Não há BullMQ, Redis, nem processo de background.
  Qualquer coisa agendada precisa de um gatilho externo (ver §7).
- **Sem framework de teste.** Não há Jest, Vitest nem Playwright. `npm run
  typecheck` e `npm run lint` são a única verificação automática. Critério de
  aceite de agente, portanto, é **checklist manual**, não suíte verde.
- **Sem migração automática.** Nada de `prisma migrate`. Ver §4.

### Scripts

```bash
npm run dev -- --port 3001   # a porta 3001 importa: NEXT_PUBLIC_SITE_URL espelha ela
npm run build
npm run typecheck            # tsc --noEmit
npm run lint
```

---

## 3. Mapa do código

```
src/
  app/
    (auth)/            entrar, criar-conta, callback (Route Handler do OAuth), email-confirmado
    app/               O APP DO CLIENTE (PWA): agendamentos, buscar, notificações, perfil/*
    painel/            O PAINEL DO DONO/ASSISTENTE: agenda, caixa, clientes, comissões,
                       equipe, espera, fiado, pendências, relatórios, serviços, avaliações,
                       configurações
    b/[slug]/          Perfil público da barbearia + /agendar (funciona sem login)
    a/[token]/         Acompanhamento de agendamento feito sem cadastro (link com token)
    admin/             Cadastro de lojas pela plataforma
    actions/           SERVER ACTIONS — toda escrita passa por aqui
      admin, appointments, auth, booking, client, customers, money, publico,
      services, shop, team
  components/
    admin, auth, booking, charts, client, landing, painel, ui
  lib/
    supabase/          client.ts (browser), server.ts (RSC/action), admin.ts (service role),
                       publico.ts (leitura anônima)
    queries/           agenda.ts, barbearia.ts, cliente.ts — leitura tipada e cacheada
    auth.ts, config.ts, database.types.ts, env.ts, erros.ts, telefone.ts,
    utils.ts, periodo.ts, imagens.ts, geocoding.ts, viacep.ts, suporte.ts, ...
supabase/              MIGRAÇÕES SQL NUMERADAS (ver §4)
docs/                  manual.md, imagens.md, promover-dono.md
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

Arquivos em `supabase/`, numerados, rodados **à mão no SQL Editor do Supabase**,
na ordem. Não há CLI de migração neste projeto.

```
01_schema.sql      extensões, enums, tabelas, índices, a constraint de horário
02_functions.sql   triggers, helpers, funções de negócio
03_rls.sql         policies e grants
04_seed.sql        4 barbearias de exemplo
05–06              operação (promover admin, apagar dados)
07…23              migrações incrementais
```

**A próxima migração é a `24_`.** Regras para escrever uma:

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
  (Supabase → API → TypeScript), senão o `typecheck` acusa.

### Tabelas principais

- `profiles` — perfil GLOBAL da pessoa (espelha `auth.users`, criado por trigger).
  `role`, `is_platform_admin`, `barbershop_id` (só o assistente usa).
- `barbershops` — `owner_id`, `slug` único, endereço, `latitude`/`longitude`,
  `whatsapp` (**o WhatsApp de contato da loja, hoje usado só para montar link
  `wa.me` na tela** — não confundir com a integração de API), regras de
  agendamento (`min_advance_minutes`, `max_advance_days`,
  `cancel_deadline_hours`), `rating_avg`/`rating_count` mantidos por trigger.
- `professionals`, `services`, `business_hours`, `time_off`.
- `customers` — **a ficha do cliente DENTRO de uma barbearia**. `unique
  (barbershop_id, phone)`. `profile_id` é nulo no caso normal (cliente que o dono
  cadastrou na mão e nunca criou conta). `notes` nunca aparece para o cliente.
  Totais mantidos pelas funções, não escreva na mão.
- `appointments` — `starts_at`/`ends_at`, `status`, `source` (`online`|`manual`),
  `cancel_reason`, `completed_at`, **`reminder_sent_at` (coluna existente e hoje
  NUNCA lida nem escrita por lugar nenhum — é o gancho do lembrete)**.
  Constraint `appointments_no_overlap` (GiST) torna impossível gravar dois
  atendimentos sobrepostos para o mesmo profissional.
- `transactions`, `commissions`, `debts`, `debt_payments` — dinheiro.
- `waitlist_entries`, `reviews`, `favorites`, `shop_visits`, `dependents`.
- `notifications` — **só o sininho do topo do app**. `profile_id`, `type`
  (`appointment|reminder|waitlist|review|system`), `title`, `body`, `link`,
  `read_at`. **Não tem nada a ver com envio externo.** Não reaproveite esta
  tabela como outbox.

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
  no bundle do navegador.
- Leitura pública passa por funções `SECURITY DEFINER` que só devolvem loja
  ativa (`search_barbershops`, `book_appointment_publico`).
- Validação de tela é **espelho**, não regra. `src/lib/telefone.ts` diz isso no
  cabeçalho: a regra que vale é a do Postgres. Mudou num lado, muda no outro.

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

### Env

`src/lib/env.ts`, função `obrigatoria()` que grita alto quando falta variável.
Segredo só via função dedicada e só no servidor. Variável nova segue esse
padrão — nada de `process.env.X!` espalhado pelo código.

---

## 7. A lacuna que define a próxima etapa: não há nada agendado

Não existe cron, fila nem worker. Hoje, nada no PiBarber acontece "sozinho às
19h". Tudo é reação a um clique.

Qualquer funcionalidade com horário (lembrete de agendamento, expiração, resumo
diário) precisa de um gatilho externo. As duas opções realistas nesta stack:

1. **`pg_cron` + `pg_net` no Supabase** chamando um Route Handler do Next.
   Roda dentro do banco, com a granularidade que você quiser, e a agenda fica
   versionada junto com as migrações SQL. É o que combina com a cultura do
   projeto.
2. **Vercel Cron** (`vercel.json`). Mais simples de ler, mas o plano Hobby
   limita a frequência — checar o limite vigente antes de depender disso.

Seja qual for, o endpoint chamado precisa ser protegido por segredo
(`Authorization: Bearer ${CRON_SECRET}`), porque é uma URL pública.

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

---

## 9. WhatsApp — estado atual

**Não existe integração com a API do WhatsApp.** O que existe hoje:

- `barbershops.whatsapp` — número de contato da loja, usado só para montar link
  `wa.me` na tela (`linkWhatsApp()` em `src/lib/utils.ts`, `src/lib/suporte.ts`,
  `src/lib/config.ts`).
- `notifications` — sininho interno do app.
- `appointments.reminder_sent_at` — coluna existente, nunca usada.

Nada disso envia mensagem para ninguém. O README registra "notificações de
lembrete" como próximo passo.

### Decisões já tomadas para a integração (2026-09)

- **API oficial da Meta (Cloud API), chamada direto.** Sem BSP (Twilio,
  360dialog): com número único não há multi-tenant do lado da Meta, e o BSP só
  acrescenta taxa por mensagem e um portão a mais (o Twilio exige verificação
  de empresa concluída antes de produção; a Meta não exige para o teto inicial).
  Sem biblioteca não oficial por QR code (Baileys, Evolution API, Z-API):
  viola os Termos e o risco de banimento recai sobre o número da plataforma.
- **Número único da plataforma**, com as credenciais do dono do projeto em
  variável de ambiente. Coerente com o modelo de marketplace: o remetente é
  PiBarber, que é a marca que o cliente conhece.
- **Templates fixos da plataforma**, aprovados uma vez, com o nome da barbearia
  entrando como parâmetro. Barbearia não edita texto — cada edição viraria um
  template novo na WABA, e a conta não verificada tem teto de 250 templates.
- **Só mensagens de Utilidade na primeira fase** (confirmação, lembrete,
  cancelamento). Marketing (aniversário, reativação, pedido de avaliação) custa
  cerca de 9× mais por mensagem e fica para uma decisão de produto posterior.

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

---

## 10. Histórico de agentes

| # | Agente | Status |
|---|---|---|
| 01 | WhatsApp oficial (Meta Cloud API): outbox, templates, webhook, cron | ⏳ |

> Cada agente acrescenta a própria linha aqui e um bloco "O que o agente N
> entregou" ao final deste arquivo, no mesmo formato: o que era, o que ficou, o
> que se descobriu lendo o código, o que NÃO foi feito e por quê.

---

## 11. Dívidas técnicas conhecidas

- Sem nenhum teste automatizado. Qualquer regressão só aparece em uso.
- `AUDITORIA_BUGS.md` e `AUDITORIA_SEGURANCA.md` listam achados; conferir se o
  item em que você vai mexer já está catalogado antes de "descobrir" de novo.
- `database.types.ts` é gerado à mão pelo painel do Supabase — fácil de esquecer.
- Migrações rodadas manualmente: não há garantia de que produção e o banco local
  de um dev estejam no mesmo ponto. Confira antes de depender de coluna nova.
