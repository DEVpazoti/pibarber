# PiBarber — Especificação completa

**Desenvolvido por PiSystem.**

> Documento único de referência do produto. Quem usa, o que faz, como o banco é modelado,
> como cada tela funciona e como o visual se comporta. Escrito para ser lido por inteiro
> antes da primeira linha de código, e consultado depois a cada dúvida.
>
> **Referência de produto:** este sistema segue de perto a estrutura e a ergonomia do
> AppBarber (`sites.appbarber.com.br`) na parte do cliente, com identidade visual própria
> e sem os módulos de pagamento recorrente.

---

## 1. O que é

**PiBarber** é uma plataforma de agendamento e gestão para barbearias, com três produtos
dentro do mesmo sistema:

1. **O app do cliente** — o cliente cria uma conta, encontra barbearias, agenda, acompanha
   e avalia. Funciona como aplicativo no celular (PWA), sem loja de aplicativos.
2. **O painel do dono** — agenda, clientes, equipe, caixa, comissão, fiado e relatório.
3. **O painel do assistente** — o mesmo painel com menu reduzido, sem nenhum dado financeiro.

### É um marketplace, não um sistema por barbearia

Esta é a decisão estruturante e ela precisa estar clara antes de tudo:

> **O cliente tem uma conta só no PiBarber e agenda em qualquer barbearia da plataforma.**

Ele busca estabelecimentos por nome, por cidade ou por proximidade; favorita os que gosta;
e a tela de agendamentos dele mistura barbearias diferentes, com filtro por estabelecimento.
Isso é o oposto de "cada barbearia tem seu link isolado".

**Consequência prática:** existe uma diferença entre o **perfil global** da pessoa
(`profiles` — nome, celular, endereço, foto) e a **ficha dela dentro de uma barbearia**
(`customers` — histórico, observações do barbeiro, quanto gastou ali, quanto deve ali).
Uma pessoa tem 1 perfil e N fichas. Confundir os dois é o erro mais caro possível neste
modelo. Leia a seção 5.4 com atenção.

### Princípio de escopo

Se o barbeiro não usa toda semana, fica fora da v1. Especificamente **fora**: cartão de
crédito salvo, assinatura com cobrança recorrente, pacote de sessões, reembolso, estoque,
múltiplos idiomas.

---

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components) | Vercel de graça, server actions sem backend separado |
| Linguagem | TypeScript estrito | — |
| Estilo | Tailwind CSS v4 (`@theme` no CSS, sem `tailwind.config.js`) | Tokens no próprio CSS |
| Banco / Auth / Storage | Supabase (Postgres 15+) | Free tier real, RLS de verdade, login com Google pronto |
| Gráfico | Recharts | — |
| Ícones | lucide-react | Cobre todos os ícones vistos na referência |
| Fontes | `next/font` — Fraunces + Inter | Self-hosted automático |
| App do cliente | PWA (manifest + service worker) | Instala na tela inicial sem loja de aplicativos |
| Hospedagem | Vercel (free) | — |

**Idioma:** só português do Brasil. Interface, rotas, textos e comentários em pt-BR;
tabela, coluna, função e enum em inglês.

---

## 3. Os três papéis

| Papel | Rota base | O que enxerga |
|---|---|---|
| `client` | `/app` | As próprias barbearias, agendamentos, histórico, fiado e avaliações |
| `owner` | `/painel` | Tudo da barbearia dele, **incluindo dinheiro** |
| `assistant` | `/painel` (menu reduzido) | Agenda, clientes, serviços, fiado, lista de espera. **Nunca** faturamento, despesa, comissão ou relatório |

Mais a coluna `profiles.is_platform_admin`. Quem tem `true` acessa `/admin` — uma tela só,
para você cadastrar as barbearias. **Não é um papel**, é uma permissão extra.

### O profissional não é um usuário

O barbeiro que corta cabelo é um **registro** na tabela `professionals`: nome, foto,
percentual de comissão, jornada. Ele **não faz login e não tem painel**.

Isso elimina convite, código de resgate, tela de vinculação e um bloco inteiro de RLS. A
comissão continua sendo calculada por profissional — vira relatório que o dono lê para
saber quanto pagar. Se o profissional precisar de acesso, ele vira um `assistant`.

### Como cada conta nasce

- **`client`** → se cadastra sozinho, por e-mail e senha ou pelo Google. O trigger
  `handle_new_user()` **força `role = 'client'`**, ignorando qualquer papel vindo do
  metadata. O usuário nunca escolhe o próprio papel.
- **`owner`** → você cria em `/admin`. A server action usa a service role para criar o
  usuário e já insere a barbearia; o trigger `barbershop_after_insert()` promove o perfil.
- **`assistant`** → o dono cria em `/painel/equipe`. Server action com service role: cria o
  usuário, define `role = 'assistant'` e grava `profiles.barbershop_id`. A senha provisória
  aparece na tela para o dono copiar. Sem e-mail, sem convite.

### Onde a permissão é imposta — três camadas

1. **RLS no Postgres.** A única que vale de verdade. Mesmo chamando
   `https://xxx.supabase.co/rest/v1/transactions` direto com a chave anônima, não passa.
2. **`src/middleware.ts`.** Redireciona por prefixo de rota antes de renderizar.
3. **`requireRole()`** no servidor, dentro de cada página.

**Toda página nova chama `requireRole()` no topo.** Nunca confie só no middleware.

---

## 4. Mapa de rotas

```
/                        landing (vende o PiBarber para o dono de barbearia)
/entrar  /criar-conta    autenticação (e-mail/senha + Google)

APP DO CLIENTE — 4 abas fixas na base
/app                     Início
/app/buscar              Buscar estabelecimento
/app/agendamentos        Meus agendamentos
/app/perfil              Perfil (menu)
  /app/perfil/dados          Meus Dados
  /app/perfil/endereco       Endereço
  /app/perfil/acessos        Acessos (métodos de login)
  /app/perfil/seguranca      Segurança (trocar senha)
  /app/perfil/favoritos      Favoritos
  /app/perfil/historico      Histórico de agendamentos
  /app/perfil/espera         Lista de espera
  /app/perfil/pessoas        Quem eu agendo (dependentes)
  /app/perfil/ajuda          Central de ajuda
/app/notificacoes        Notificações (sino)
/b/[slug]                Perfil público da barbearia
/b/[slug]/agendar        Fluxo de agendamento

PAINEL — dono e assistente
/painel                  Hoje
/painel/agenda           Grade da agenda
/painel/clientes         Clientes
/painel/servicos         Serviços
/painel/equipe           Profissionais e acessos          [só dono]
/painel/espera           Lista de espera
/painel/avaliacoes       Avaliações
/painel/caixa            Caixa                            [só dono]
/painel/comissoes        Comissões                        [só dono]
/painel/fiado            Fiado
/painel/relatorios       Relatórios                       [só dono]
/painel/configuracoes    Configurações da barbearia       [só dono]

/admin                   Cadastro de barbearias           [is_platform_admin]
```

---

## 5. O banco

**21 tabelas, 9 enums, ~14 funções, ~45 policies.** Scripts em `supabase/`, rodam na
ordem numérica no SQL Editor.

| Arquivo | Papel |
|---|---|
| `01_schema.sql` | Extensões, enums, tabelas, índices, constraints |
| `02_functions.sql` | Funções, triggers, regras de negócio |
| `03_rls.sql` | Row Level Security + grants |
| `04_seed.sql` | Dados de exemplo para desenvolver |
| `05_criar_admin.sql` | **Operação.** Marca uma conta como admin da plataforma |
| `06_apagar_dados.sql` | **Operação.** Apaga barbearia de teste na ordem certa |

### 5.1 Enums

```sql
create type user_role          as enum ('owner', 'assistant', 'client');
create type appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
create type payment_method     as enum ('cash', 'pix', 'debit', 'credit', 'fiado');
create type transaction_type   as enum ('income', 'expense');
create type commission_status  as enum ('pending', 'paid');
create type debt_status        as enum ('open', 'partial', 'paid');
create type appointment_source as enum ('online', 'manual');
create type waitlist_status    as enum ('waiting', 'notified', 'converted', 'expired');
create type notification_type  as enum ('appointment', 'reminder', 'waitlist', 'review', 'system');
```

### 5.2 Identidade e o perfil global do cliente

**`profiles`** — espelha `auth.users`, criada pelo trigger. É o **perfil global**.
`id` (PK, = auth.users.id) · `full_name` · `email` · `phone` · `birth_date` ·
`gender` (text: `male` / `female` / `other`, nullable) · `avatar_url` ·
`role` (user_role, default `client`) · `barbershop_id` (FK, **só para assistant**) ·
`is_platform_admin` (bool) · `created_at`

> Os campos `birth_date` e `gender` existem porque a tela "Meus Dados" da referência os
> pede. `gender` é opcional e com opção "Outros" — nunca obrigatório.

**`user_addresses`** — endereço do cliente (tela "Endereço").
`id` · `profile_id` · `country` (default 'BR') · `zip_code` · `street` · `number` ·
`complement` · `neighborhood` · `city` · `state` · `is_default` (bool)

**`dependents`** — "posso agendar para o meu filho?".
`id` · `profile_id` (o titular) · `full_name` · `birth_date` · `notes` · `created_at`

> No agendamento, o cliente escolhe **para quem** é: para ele ou para um dependente. O
> agendamento guarda `dependent_id`, e a barbearia vê o nome de quem vai sentar na cadeira
> junto com o nome do responsável.

### 5.3 Barbearia

**`barbershops`**
`id` · `owner_id` (FK profiles, `on delete restrict`) · `name` · `slug` (unique) ·
`description` · `phone` · `whatsapp` · `zip_code` · `street` · `number` · `complement` ·
`neighborhood` · `city` · `state` · `latitude` (numeric) · `longitude` (numeric) ·
`logo_url` · `cover_url` · `accepts_online_booking` (bool) · `min_advance_minutes`
(int, default 60) · `max_advance_days` (int, default 60) · `cancel_deadline_hours`
(int, default 2) · `rating_avg` (numeric, mantido por trigger) · `rating_count` (int) ·
`is_active` · `created_at`

> `latitude` / `longitude` existem por causa do filtro **"Próximas"** da busca. O cálculo
> de distância é Haversine — uma função SQL simples, sem PostGIS.

**`business_hours`** — horário da loja, uma linha por dia da semana.
`id` · `barbershop_id` · `weekday` (0=domingo … 6=sábado) · `opens_at` (time) ·
`closes_at` (time) · `break_start` (time, null) · `break_end` (time, null) ·
`is_closed` (bool) — unique `(barbershop_id, weekday)`

### 5.4 Equipe

**`professionals`** — quem corta. **Não é login.**
`id` · `barbershop_id` · `name` · `nickname` · `bio` · `avatar_url` ·
`commission_percent` (numeric 0–100) · `is_active` · `sort_order` · `created_at`

**`professional_schedules`** — jornada individual. **Opcional:** sem linhas, o
profissional segue o horário da loja. Deixe isso explícito na interface.
`id` · `professional_id` · `weekday` · `starts_at` · `ends_at` · `is_off`
— unique `(professional_id, weekday)`

**`time_off`** — folga, férias, feriado.
`id` · `barbershop_id` · `professional_id` (**null = a loja inteira fecha**) ·
`starts_at` (timestamptz) · `ends_at` · `reason`

### 5.5 Catálogo

**`services`**
`id` · `barbershop_id` · `name` · `description` · `price` (numeric) ·
`duration_minutes` (int) · `is_active` · `sort_order` · `created_at`

> Sem categoria e sem `professional_services` na v1: todo profissional faz todo serviço.

### 5.6 A ficha do cliente — leia com atenção

**`customers`** — a ficha da pessoa **dentro de uma barbearia**.
`id` · `barbershop_id` · `profile_id` (FK profiles, **nullable**) · `full_name` ·
`phone` · `email` · `birth_date` · `notes` (texto livre do barbeiro: "máquina 2 nas
laterais") · `total_visits` · `total_spent` · `last_visit_at` · `no_show_count` ·
`created_at` — unique `(barbershop_id, phone)`

**A regra dos dois registros:**

| | `profiles` | `customers` |
|---|---|---|
| Escopo | A plataforma inteira | Uma barbearia |
| Quem edita | O próprio cliente | O barbeiro |
| Some se | A conta é apagada | A barbearia é apagada |
| Quantidade | 1 por pessoa | 1 por pessoa **por barbearia** |

- `profile_id` **nulo** é o caso normal do cliente que o dono cadastrou na mão e que nunca
  criou conta no PiBarber.
- Quando alguém agenda online, `book_appointment` procura uma ficha naquela barbearia pelo
  **telefone**. Achou, reaproveita e preenche o `profile_id`. Não achou, cria.
- O campo `notes` é do barbeiro e **nunca aparece para o cliente**.

**`favorites`** — o coração da tela Favoritos.
`id` · `profile_id` · `barbershop_id` · `created_at` — unique `(profile_id, barbershop_id)`

**`shop_visits`** — alimenta "Últimos acessos" na home do app.
`id` · `profile_id` · `barbershop_id` · `last_viewed_at` — unique `(profile_id, barbershop_id)`

> Upsert a cada vez que o cliente abre `/b/[slug]`. A tela mostra os 5 mais recentes, e o
> botão "Editar lista" permite remover itens.

### 5.7 Agenda

**`appointments`**
`id` · `barbershop_id` · `professional_id` (`on delete restrict`) · `customer_id`
(`on delete restrict`) · `dependent_id` (nullable — quando é para outra pessoa) ·
`starts_at` (timestamptz) · `ends_at` · `status` · `total_price` · `discount` ·
`notes` · `source` · `created_by` · `cancel_reason` · `cancelled_by` ·
`completed_at` · `reminder_sent_at` · `created_at`

**A constraint que vale ouro:**

```sql
create extension if not exists btree_gist;

alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('scheduled', 'confirmed'));
```

Torna **fisicamente impossível** gravar dois atendimentos sobrepostos para o mesmo
profissional. Não é validação de tela — é o banco recusando. Num marketplace, onde dois
clientes podem tocar no mesmo horário no mesmo segundo, isso é o que impede a dor de
cabeça.

**`appointment_services`** — congela preço e duração na hora da marcação, para o histórico
não mudar quando o dono reajustar a tabela.
`id` · `appointment_id` (`on delete cascade`) · `service_id` · `price` · `duration_minutes`

**`waitlist_entries`** — a lista de espera.
`id` · `barbershop_id` · `profile_id` · `professional_id` (nullable = qualquer um) ·
`service_id` (nullable) · `desired_date` (date) · `period` (text: `morning`/`afternoon`/
`evening`/`any`) · `status` (waitlist_status) · `notified_at` · `created_at`

> Quando um agendamento é cancelado, `cancel_appointment` procura quem está esperando
> naquele dia e período e cria uma notificação. É o que dá sentido à tela "Lista de espera".

**`reviews`** — avaliação depois do atendimento.
`id` · `barbershop_id` · `appointment_id` (unique) · `profile_id` ·
`professional_id` · `rating` (int 1–5) · `comment` · `reply` (resposta do dono) ·
`replied_at` · `created_at`

> Um trigger recalcula `barbershops.rating_avg` e `rating_count` a cada inserção. É esse
> número que aparece como **★ 5.0** no card da busca e dos últimos acessos.

### 5.8 Dinheiro

**`transactions`** — livro-caixa único: tudo que entra e tudo que sai.
`id` · `barbershop_id` · `type` · `amount` (sempre positivo) · `payment_method`
(null em despesa) · `category` (texto) · `description` · `appointment_id` (nullable) ·
`occurred_at` (date) · `created_by` · `created_at`

**`commissions`**
`id` · `barbershop_id` · `professional_id` · `appointment_id` (unique) ·
`base_amount` · `percent` · `amount` · `status` · `paid_at` · `created_at`

**`debts`** — fiado.
`id` · `barbershop_id` · `customer_id` · `appointment_id` (nullable) ·
`original_amount` · `paid_amount` · `status` · `due_date` · `created_at`

**`debt_payments`**
`id` · `debt_id` (`on delete cascade`) · `amount` · `payment_method` · `paid_at` ·
`created_by`

### 5.9 Plataforma

**`notifications`** — alimenta o sino do topo.
`id` · `profile_id` · `type` (notification_type) · `title` · `body` · `link` ·
`read_at` · `created_at`

### 5.10 Índices que importam

```sql
create index on appointments  (barbershop_id, starts_at);
create index on appointments  (professional_id, starts_at);
create index on appointments  (customer_id);
create index on customers     (barbershop_id, phone);
create index on customers     (profile_id);
create index on transactions  (barbershop_id, occurred_at);
create index on commissions   (barbershop_id, professional_id, status);
create index on debts         (barbershop_id, status);
create index on favorites     (profile_id);
create index on shop_visits   (profile_id, last_viewed_at desc);
create index on notifications (profile_id, read_at, created_at desc);
create index on reviews       (barbershop_id, created_at desc);
create index on barbershops   (city, is_active);
create unique index on barbershops (slug);
```

### 5.11 Funções — as regras de negócio moram no Postgres

Decisão deliberada: a lógica crítica fica no banco. Assim nada escapa nem chamando a API
direto, e uma operação composta não fica pela metade se o celular perder sinal no meio.

| Função | O que faz |
|---|---|
| `handle_new_user()` | Trigger em `auth.users`. Cria o perfil e **força `role='client'`** |
| `barbershop_after_insert()` | Trigger. Promove o `owner_id` para `owner` |
| `review_after_insert()` | Trigger. Recalcula `rating_avg` e `rating_count` da barbearia |
| `search_barbershops(termo, cidade, lat, lng, raio_km)` | Busca pública. Cobre os três filtros da tela: Nome, Cidade e Próximas (Haversine). Devolve nota e distância |
| `get_available_slots(professional_id, dia, duracao)` | Horários livres respeitando horário da loja, jornada individual, almoço, folga, antecedência mínima, antecedência máxima e agendamentos existentes |
| `book_appointment(shop, professional, quando, service_ids[], profile, dependent, nome, telefone, obs)` | Cria ou reaproveita a ficha do cliente (casa pelo telefone) e agenda. Valida antecedência e se a loja aceita agendamento online. Calcula `ends_at` |
| `complete_appointment(id, pagamentos jsonb, desconto, vencimento)` | **Numa transação só:** conclui, lança cada forma de pagamento no caixa, cria a dívida se houver fiado, gera a comissão, atualiza as estatísticas do cliente e notifica o cliente para avaliar |
| `cancel_appointment(id, motivo, por_quem)` | Cancela, valida o prazo de cancelamento se quem cancelou foi o cliente, e **avisa a lista de espera** daquele dia e período |
| `mark_no_show(id)` | Marca falta e incrementa `no_show_count` do cliente |
| `pay_debt(debt_id, valor, forma)` | Registra o recebimento, lança no caixa e recalcula o status |
| `join_waitlist(shop, professional, service, dia, periodo)` | Entra na lista de espera sem duplicar |
| `dashboard_summary(shop, de, ate)` | JSON com faturamento, despesa, lucro, atendimentos, ticket médio, taxa de falta e total em aberto no fiado |
| `revenue_series(shop, de, ate)` | Série diária para o gráfico |
| `client_home(profile_id)` | JSON com o último agendamento, os próximos, os últimos acessos e os favoritos — monta a home do app em uma chamada |

**Formato do `pagamentos` em `complete_appointment`:**

```json
[{ "method": "pix", "amount": 40.00 }, { "method": "fiado", "amount": 20.00 }]
```

A soma tem que bater com `total_price - desconto`, senão a função levanta exceção com
mensagem em português.

### 5.12 Helpers de autorização (SECURITY DEFINER)

São `SECURITY DEFINER` **de propósito**: uma policy em `profiles` que faça subquery em
`profiles` causa **recursão infinita de RLS**. O helper roda com os privilégios do dono
da função e quebra o ciclo.

| Helper | Verdadeiro quando |
|---|---|
| `is_platform_admin()` | O usuário tem a flag |
| `my_shop_id()` | A barbearia do usuário (dono → a dele; assistente → `profiles.barbershop_id`) |
| `has_shop_access(shop)` | É dono, assistente daquela loja, ou admin — **dado operacional** |
| `can_manage_money(shop)` | É **só** o dono ou o admin — **dado financeiro** |
| `owns_customer(customer_id)` | O cliente logado é o titular daquela ficha |

**Regra prática, decore esta:**
> Dado financeiro usa `can_manage_money`. Dado operacional usa `has_shop_access`.

`transactions`, `commissions` e o relatório usam `can_manage_money` — é isso que impede o
assistente de ver faturamento **de verdade**, não o menu escondido.

### 5.13 Leitura pública

A busca e o perfil da barbearia precisam funcionar para quem não fez login. São legíveis
por `anon`, **apenas de loja ativa**: `barbershops`, `services`, `professionals`
(sem dados sensíveis), `business_hours` e `reviews`.

Todo o resto exige autenticação.

---

## 6. O app do cliente

Mobile em primeiro lugar, sempre. O desktop é uma versão centralizada com largura máxima
de ~480px — não invente um layout diferente para ele.

### 6.1 A casca

**Barra inferior fixa, 4 abas** — presente em toda tela de `/app`:

| Ícone | Rótulo | Rota |
|---|---|---|
| `Home` | Início | `/app` |
| `Search` | Buscar | `/app/buscar` |
| `Calendar` | Agendamentos | `/app/agendamentos` |
| `User` (em círculo) | Perfil | `/app/perfil` |

A aba ativa fica em latão, com o ícone preenchido e o rótulo em peso maior. As inativas em
cinza, ícone de traço. Alvo de toque de 44px no mínimo, e respeite a área segura do
iPhone (`env(safe-area-inset-bottom)`).

**Cabeçalho fixo:** logo do PiBarber à esquerda; à direita o **sino de notificações**
(com um ponto em latão quando há não lidas) e o **alternador de tema** (lua no claro, sol
no escuro). Sem seletor de idioma — o sistema é só em português.

### 6.2 Início — `/app`

1. **Saudação:** "Olá, **{primeiro nome}**" com o nome em latão, e abaixo a data por
   extenso em cinza: "Sexta, 14 ago 2026".
2. **Busca:** campo com lupa, "Encontre uma barbearia". Ao focar, navega para `/app/buscar`.
3. **Último agendamento** — só se houver. Card em destaque com **borda em gradiente**
   (latão → âmbar), logo da barbearia, nome, o serviço, a data e hora, e um chevron. É o
   elemento mais chamativo da tela, de propósito.
4. **Próximos** — se houver mais de um, lista compacta.
5. **Últimos acessos** — título com um botão "Editar lista" à direita, que liga o modo de
   remoção. Cada item: avatar circular da barbearia **com anel em gradiente**, badge de
   nota (★ 4.9) sobreposto no canto superior, nome, endereço truncado, chevron.
6. **Estado vazio** (cliente novo): ilustração, "Você ainda não agendou nada" e um botão
   cheio "Encontrar uma barbearia".

### 6.3 Buscar — `/app/buscar`

- Campo de busca no topo, com foco automático ao chegar pela home.
- **Três chips de filtro**, um ativo por vez: **Nome** · **Cidade** · **Próximas**.
  O ativo em latão preenchido com texto claro; os outros com fundo suave.
- **Próximas** pede permissão de localização. Se o cliente negar, mostre um aviso educado
  com a opção de buscar por cidade — **nunca** deixe a tela travada num pedido negado.
- **Resultado:** cartão com capa, logo, nome, nota com estrela, quantidade de avaliações,
  bairro e cidade, distância em km quando disponível, e um coração de favoritar no canto.
- **Estado vazio inicial:** ilustração de lupa, "Encontre uma barbearia" e o subtítulo
  "Pesquise pelo nome ou pela cidade".
- **Nada encontrado:** "Nenhuma barbearia encontrada" com sugestão de ampliar a busca.

### 6.4 Agendamentos — `/app/agendamentos`

- Título grande "Meus Agendamentos".
- **Dropdown "Filtrar por estabelecimento"** — a prova de que o cliente circula por várias
  barbearias. Traz só as em que ele já agendou.
- Duas seções: **Em aberto** (agendado e confirmado) e **Anteriores**.
- Card de agendamento: logo e nome da barbearia, serviço, profissional, data e hora em
  destaque, e um chip de status colorido.
- Ações no card, conforme o status:
  - agendado/confirmado → **Cancelar** (respeitando `cancel_deadline_hours`) e **Como chegar**
  - concluído sem avaliação → **Avaliar** (chamada visível, é o que alimenta a nota)
  - concluído → **Agendar de novo** (repete serviço e profissional)
- **Vazio:** ilustração + "Nenhum agendamento em aberto" + botão "Agendar agora".

### 6.5 Perfil — `/app/perfil`

Cabeçalho com avatar grande e um **botão de câmera em latão** sobreposto no canto inferior
direito, nome e e-mail abaixo. Depois a lista de itens — cada um com **ícone, título,
subtítulo em cinza e chevron**, separados por linha fina:

| Ícone | Item | Subtítulo |
|---|---|---|
| `User` | Meus Dados | Altere as informações do seu perfil |
| `MapPin` | Endereço | Altere seu endereço |
| `KeyRound` | Acessos | Métodos de login da sua conta |
| `Users` | Quem eu agendo | Agende para filhos ou familiares |
| `Heart` | Favoritos | Suas barbearias favoritas |
| `Lock` | Segurança | Altere sua senha |
| `History` | Histórico | Seu histórico de agendamentos |
| `Clock` | Lista de espera | Acompanhe sua lista de espera |
| `HelpCircle` | Central de ajuda | Perguntas frequentes e suporte |

E, embaixo, **"Sair"** centralizado, em vermelho, sem caixa de botão.

#### Meus Dados — `/app/perfil/dados`
Nome completo (obrigatório) · Data de nascimento · Celular (obrigatório, máscara
`(00) 00000-0000`) · Gênero (Masculino / Feminino / Outros, opcional) · botão **Salvar**
cheio, largura total. Abaixo, **"Excluir conta"** em vermelho, com confirmação por diálogo
explicando o que será apagado.

#### Endereço — `/app/perfil/endereco`
País (padrão Brasil) · **CEP** · Endereço · Número · Complemento · Bairro · Cidade ·
Estado. **Preencha o endereço automaticamente pelo CEP** consultando a ViaCEP — é grátis,
sem chave, e economiza cinco campos de digitação no celular.

#### Acessos — `/app/perfil/acessos`
Lista os métodos vinculados (Google com o e-mail, e/ou e-mail e senha), cada um com um
botão de desvincular. Abaixo, um cartão "Vincular acesso" com o que ainda falta.
**Nunca permita remover o último método** — bloqueie e explique.

#### Quem eu agendo — `/app/perfil/pessoas`
Os dependentes. Nome e data de nascimento. No agendamento, um seletor "Para quem?" com o
titular em primeiro e os dependentes abaixo. Resolve o "vou levar meu filho" sem obrigar a
criar outra conta.

#### Favoritos · Histórico · Lista de espera
- **Favoritos:** grade de cartões. Vazio: coração partido em cinza + "Nenhuma barbearia
  favoritada ainda".
- **Histórico:** campo de busca, faixa "Filtrando de: dd/mm/aaaa até dd/mm/aaaa" com botão
  **Filtrar**, e a lista. Vazio: "Nenhum agendamento encontrado no período."
- **Lista de espera:** o que ele está aguardando, com barbearia, dia e período, e um botão
  de sair da fila. Vazio: "Você não está em nenhuma lista de espera."

#### Central de ajuda — `/app/perfil/ajuda`
FAQ em acordeão, agrupado em seções numeradas. Conteúdo estático num arquivo TypeScript —
sem tabela no banco. Seções: **1.** Sobre o PiBarber · **2.** Agendamentos e uso do app ·
**3.** Cancelamento e falta · **4.** Pagamento na barbearia · **5.** Conta e segurança ·
**6.** Suporte.

### 6.6 Perfil público da barbearia — `/b/[slug]`

Aberta sem login e **compartilhável** — é o link que o barbeiro põe na bio do Instagram.

Capa e logo · nome, nota com estrela e nº de avaliações · coração de favoritar ·
descrição · endereço com botão "Como chegar" · telefone e WhatsApp · horário da semana
com o dia de hoje em destaque e um chip **Aberto agora** / **Fechado** · serviços com
preço e duração · equipe com foto e bio curta · últimas avaliações com a resposta do dono ·
e um **botão "Agendar" fixo na base** ao rolar.

Se `accepts_online_booking` estiver desligado, troque o botão por telefone e WhatsApp.
Configure o `metadata` do Next com `openGraph` para o link ficar bonito no WhatsApp.

### 6.7 Agendar — `/b/[slug]/agendar`

Fluxo em passos, **um por tela no celular**, com barra de progresso e botão de voltar sempre:

1. **Serviço** — pode escolher mais de um; o total e a duração se somam à vista.
2. **Profissional** — cartões com foto, ou a opção **"Tanto faz"**, que pega quem tiver
   horário. Deixe essa opção em primeiro: ela aumenta a conversão.
3. **Dia e hora** — tira de datas na horizontal e os horários em grade. Os horários vêm de
   `get_available_slots`. Se o dia estiver lotado, ofereça **"Entrar na lista de espera"**
   no lugar de um vazio inútil.
4. **Para quem** — titular ou dependente. Pule este passo se não houver dependentes.
5. **Confirmação** — resumo, campo de observação, e nome/telefone (já preenchidos se
   estiver logado). **Dá para agendar sem criar conta**, informando nome e telefone.

**Sucesso:** tela de confirmação com os dados, botão "Adicionar ao calendário" (arquivo
`.ics`) e "Ver meus agendamentos".

> Dois clientes podem tocar no mesmo horário ao mesmo tempo. Não tente resolver com
> verificação no código — a constraint já resolve no banco. Sua parte é capturar o erro e
> mostrar **"Esse horário acabou de ser preenchido, escolha outro"**, recarregando a grade.

---

## 7. O painel do dono

Desktop em primeiro lugar (o dono faz o fechamento no computador), mas **a agenda e a tela
Hoje precisam funcionar muito bem no celular** — é lá que ele opera durante o expediente.

Barra lateral no desktop, menu inferior no celular.

| Rota | Conteúdo |
|---|---|
| `/painel` | **Hoje.** Quanto entrou, atendimentos do dia, quantos faltam atender, total em aberto no fiado. Abaixo, a agenda de hoje em ordem, cada linha com botão de concluir |
| `/painel/agenda` | Grade por dia e semana, **uma coluna por profissional**. Criar, mover, concluir, cancelar, marcar falta. No celular vira lista vertical agrupada por horário — não tente espremer a grade |
| `/painel/clientes` | Busca por nome e telefone. Ficha com dados, **observações**, histórico, quanto gastou, faltas e o que deve. Botão de WhatsApp pronto |
| `/painel/servicos` | Catálogo: nome, descrição, preço, duração, ativo, ordenável |
| `/painel/equipe` | **Profissionais** (nome, apelido, foto, comissão %, jornada, folgas) e **Acessos** (criar e remover assistentes) |
| `/painel/espera` | Quem está na fila, por dia e período, com botão de encaixar direto na agenda |
| `/painel/avaliacoes` | As avaliações recebidas, com a nota média e o campo de **responder** publicamente |
| `/painel/caixa` | Período, três cards (entrou, saiu, sobrou), extrato com filtro, lançar despesa manual |
| `/painel/comissoes` | Por profissional: acumulado e pendente, o detalhe atendimento a atendimento, e "marcar como pago" que fecha o lote e lança a saída no caixa |
| `/painel/fiado` | Quem deve, há quantos dias, vencidos em destaque, receber com pagamento parcial, e cobrança pronta no WhatsApp |
| `/painel/relatorios` | Gráfico de faturamento, comparativo com o período anterior, serviços mais vendidos, desempenho por profissional, ticket médio, taxa de falta |
| `/painel/configuracoes` | Dados da barbearia, endereço com CEP, horário de funcionamento, link público com botão de copiar, agendamento online liga/desliga, antecedências e prazo de cancelamento |

### Concluir atendimento — a tela mais delicada

Diálogo com o total, campo de desconto, e **divisão do pagamento em várias formas**
(ex.: R$ 40 no pix + R$ 20 fiado). Se houver fiado, pede a data de vencimento. O botão só
habilita quando a soma bate com o total menos o desconto. Chama `complete_appointment`.

Um erro aqui vira dinheiro errado no caixa — capriche na clareza, mostre o que falta somar.

---

## 8. O painel do assistente

**Mesmas rotas, menu reduzido.** Ele vê: `/painel` (sem os valores em dinheiro),
`/painel/agenda`, `/painel/clientes`, `/painel/servicos` (leitura), `/painel/espera`,
`/painel/fiado`.

Bloqueado por `requireRole(["owner"])` **e** por RLS: `/painel/caixa`, `/painel/comissoes`,
`/painel/relatorios`, `/painel/configuracoes`, `/painel/equipe`.

**O que ele pode:** agendar, remarcar, cancelar, marcar falta, **concluir o atendimento e
receber o pagamento**, cadastrar cliente, encaixar alguém da lista de espera, e ver quem
está devendo (é informação operacional — ele precisa saber na hora de cobrar).

**O que ele nunca vê:** faturamento acumulado, despesa, lucro, comissão de ninguém,
relatório. Na tela Hoje, os cards de dinheiro **não são renderizados e o dado não é
buscado** — esconder com CSS não é esconder.

---

## 9. Design system

**Clean, com charme de barbearia.** A estrutura e a ergonomia vêm da referência: campos de
fundo suave sem borda, títulos grandes, muito respiro, estados vazios ilustrados. A cor e a
tipografia é que dão a personalidade — em vez do azul genérico, **grafite e latão**.

### 9.1 Tokens

```css
@theme {
  /* Superfície — claro */
  --color-bg:         #F7F5F2;   /* fundo da página */
  --color-surface:    #FFFFFF;   /* card */
  --color-surface-2:  #F1EEE9;   /* campo, hover, chip inativo */

  /* Tinta */
  --color-ink:        #17161A;
  --color-ink-soft:   #55535C;   /* subtítulo */
  --color-ink-faint:  #8B8892;   /* placeholder, legenda */

  /* Acento — latão */
  --color-brass:      #B87A2E;   /* primário: botão, aba ativa, destaque */
  --color-brass-deep: #8F5C1E;   /* hover, texto sobre claro */
  --color-brass-soft: #F6EAD6;   /* fundo de chip, realce */

  /* Semânticos */
  --color-money:      #2E7D5B;   /* entrou, sucesso */
  --color-money-soft: #E3F1EA;
  --color-danger:     #C2413A;   /* sair, excluir, saiu, falta */
  --color-danger-soft:#F8E6E4;
  --color-info:       #2C5F8A;
  --color-info-soft:  #E4EDF5;

  /* Linha */
  --color-line:       #E7E2D9;
  --color-line-strong:#D5CDC0;

  /* Elevação */
  --shadow-card:  0 1px 2px rgb(23 22 26 / 0.05), 0 4px 12px rgb(23 22 26 / 0.04);
  --shadow-float: 0 2px 6px rgb(23 22 26 / 0.07), 0 14px 32px rgb(23 22 26 / 0.09);

  /* Raio */
  --radius-card:  14px;
  --radius-field: 10px;
  --radius-chip:  999px;
}
```

**Tema escuro** — a referência tem um escuro de verdade, quase preto, e ele fica bom.
Redefina **só os tokens**:

```css
:root:not([data-theme="light"]) { /* dentro de @media (prefers-color-scheme: dark) */
  --color-bg:        #0C0C0E;
  --color-surface:   #17171A;
  --color-surface-2: #212126;
  --color-ink:       #F4F2EF;
  --color-ink-soft:  #A8A5AE;
  --color-ink-faint: #6E6B75;
  --color-line:      #2A2A30;
  --color-brass:     #D69B4A;   /* mais claro, para contrastar no escuro */
}
```

> **Regra que quebra tudo se ignorada:** defina toda cor no `:root` primeiro e só
> sobrescreva no bloco escuro. Uma cor que só existe dentro do `@media` quebra o tema claro.
> Como há um botão manual de tema, cubra os três estados: `:root`,
> `@media (prefers-color-scheme: dark)` com a guarda `:root:not([data-theme="light"])`, e
> `:root[data-theme="dark"]`.

### 9.2 Tipografia

- **Marca e títulos de página:** `Fraunces` — serifada variável com cara de placa antiga.
  Use **só** em `h1` e no logotipo. É o tempero.
- **Todo o resto:** `Inter`. Pesos 400/500/600.
- **Números:** sempre `font-variant-numeric: tabular-nums` (classe `.tnum`). Sem isso as
  colunas de dinheiro desalinham e o financeiro parece amador.

### 9.3 Forma dos componentes

Copiado da referência, porque funciona bem no polegar:

- **Campo:** fundo `--color-surface-2`, **sem borda**, raio 10px, altura 48px, rótulo
  acima em peso 500. Asterisco vermelho quando obrigatório. Foco = anel de 2px em latão.
- **Botão primário:** latão preenchido, texto claro, **largura total** em formulário de
  celular, altura 50px, raio 10px.
- **Ação destrutiva** (Sair, Excluir conta): texto vermelho centralizado, **sem caixa**.
- **Item de lista do perfil:** ícone à esquerda, título, subtítulo em `--color-ink-faint`,
  chevron à direita, separador de 1px. Linha inteira clicável.
- **Chip de filtro:** ativo = latão preenchido; inativo = `--color-surface-2` com texto
  `--color-ink-soft`.
- **Cartão de destaque** (último agendamento): borda de 2px em **gradiente latão → âmbar**,
  feita com `border: 2px solid transparent` + `background-clip: padding-box, border-box`.
- **Avatar de barbearia:** círculo com **anel em gradiente** e a nota num badge sobreposto
  no canto superior direito.
- **Estado vazio:** ilustração ou ícone grande em cinza claro, uma frase explicando, e
  **sempre um botão que ensina o próximo passo**. "Nenhum cliente ainda" sozinho não serve.

### 9.4 Regras de uso

1. **Cor só por token.** Nunca `text-red-500` ou `bg-gray-100` do Tailwind cru.
2. **Dinheiro** sempre pelo helper `brl()` e com `.tnum`.
3. **Verde é dinheiro que entra, vermelho é que sai.** Confirmar é **latão**, não verde.
4. **O gradiente é para uma coisa por tela.** Repetir em todo card estraga.
5. **44px de alvo de toque, mínimo.** O barbeiro opera com uma mão só.
6. **Respeite a área segura** do iPhone na barra de abas.

---

## 10. Armadilhas — leia antes de codar

> Todas já custaram tempo de verdade num projeto anterior.

### PostgREST: relação ambígua (`PGRST201`)
Quando uma tabela tem **dois caminhos** até outra — e aqui `barbershops` tem: direto por
`owner_id` e indireto por `favorites` — o embed genérico falha. Nomeie a FK:

```ts
// ❌ "more than one relationship was found"
.select("*, owner:profiles(full_name)")
// ✅
.select("*, owner:profiles!barbershops_owner_id_fkey(full_name)")
```

### Nunca descarte o `error` do Supabase
```ts
// ❌ erro de banco vira lista vazia silenciosa — o pior tipo de bug
const { data } = await query;
// ✅
const { data, error } = await query;
if (error) console.error("[busca] falha ao listar barbearias:", error);
```
Foi exatamente assim que um bug real passou meses despercebido: a tela dizia "nenhuma
barbearia encontrada" quando a query estava quebrada.

### `try/catch` engolindo o controle de fluxo do Next
`redirect()` e `notFound()` viajam como **exceção**. Um `catch` genérico as engole e quebra
o roteamento, silenciosamente:

```ts
} catch (error) {
  unstable_rethrow(error);   // devolve os erros internos do Next
  console.error(error);
  return null;
}
```

### Recursão de RLS
Policy em `profiles` que faz subquery em `profiles` = recursão infinita. Se precisar
consultar a própria tabela dentro de uma policy dela, **crie um helper `SECURITY DEFINER`**.

### Redirect em loop no layout
Um layout em `/painel` que redireciona para `/painel/algo` roda de novo e trava. Telas de
escape ficam **fora** do grupo de rotas.

### Relação vem como array às vezes
Dependendo do formato do `select`, um join "para um" volta como objeto ou como array de um
item. Tenha um helper `one<T>()` e use sempre.

### Ordem de exclusão
`barbershops.owner_id`, `appointments.professional_id` e `appointments.customer_id` são
`on delete restrict`. Por isso "deletar usuário" pelo painel do Supabase falha com
`Failed to delete user: {}`. A ordem certa mora em `06_apagar_dados.sql`.

### Bloco `do $$` copiado pela metade
`42601: unterminated dollar-quoted string` significa só isso: faltou o `end; $$;`.

### Fuso horário
Guarde `timestamptz` sempre. O Brasil é UTC−3 sem horário de verão hoje, mas **nunca
calcule "hoje" no cliente e mande para o servidor** — resolva a data no servidor, ou o
agendamento das 23h cai no dia errado.

---

## 11. Convenções de código

- **Server Components por padrão.** `"use client"` só com estado, evento de usuário ou
  hook de navegador.
- **Mutação = Server Action** em `src/app/actions/`. Toda action devolve
  `ActionResult<T>` = `{ ok: boolean; message?: string; data?: T }` e **traduz o erro do
  Postgres para português**. O usuário nunca lê `duplicate key value violates unique
  constraint`.
- **`SUPABASE_SERVICE_ROLE_KEY` só dentro de `createAdminClient()`**, sempre depois de
  confirmar o papel de quem chamou. A service role **ignora RLS por completo**.
- **`npx tsc --noEmit` limpo** antes de considerar qualquer coisa pronta.
- **Texto em português, tom direto,** falando a língua do barbeiro: "quanto entrou",
  "quem tá devendo", "concluir atendimento".

### Estrutura de arquivos

```
supabase/                6 scripts SQL
src/
  middleware.ts
  app/
    layout.tsx
    globals.css          design system inteiro
    page.tsx             landing
    manifest.ts          PWA
    (auth)/              entrar · criar-conta · callback do Google
    app/                 APP DO CLIENTE (4 abas)
      layout.tsx           casca com abas + cabeçalho
      page.tsx             Início
      buscar/ agendamentos/ notificacoes/
      perfil/              menu + 9 subpáginas
    painel/              PAINEL (dono e assistente)
    admin/
    b/[slug]/            perfil público + agendar
    actions/             auth · booking · appointments · customers · services
                         · team · money · shop · client · admin
  components/
    ui/                  Button · Card · Field · Input · Select · Modal · Chip
                         · EmptyState · StatCard · Sheet · Avatar · Rating
    client/              TabBar · AppHeader · ShopCard · AppointmentCard
                         · ProfileMenuItem
    painel/              Sidebar · AgendaGrid · CompleteDialog · NewAppointmentDialog
    booking/             BookingWizard (5 passos)
    charts/              RevenueChart
  lib/
    supabase/            client · server · admin
    auth.ts              getProfile · requireRole · requireShopContext
    types.ts
    utils.ts             brl() · datas · one() · máscara de telefone e CEP
    viacep.ts            busca de endereço pelo CEP
    faq.ts               conteúdo da central de ajuda
```

### Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # SEGREDO — só servidor, ignora RLS
NEXT_PUBLIC_SITE_URL
```

Nunca comite `.env.local`. Na Vercel, cadastre as quatro em Settings → Environment
Variables. Para o login com Google, habilite o provider no Supabase e registre a URL de
callback nos dois lados.

---

## 12. Ordem de construção

Cada etapa entrega algo que **roda**. Não avance com a anterior quebrada.

| # | Etapa | Entrega |
|---|---|---|
| 0 | Fundação | Projeto, design system, primitives, landing |
| 1 | Banco | Os 4 scripts rodados no Supabase, com dados de exemplo |
| 2 | Auth | Login por e-mail e Google, middleware, as duas cascas de navegação |
| 3 | **Agenda do painel** | Hoje, grade, criar e concluir. **O coração da operação** |
| 4 | Cadastros | Clientes, serviços, equipe |
| 5 | Dinheiro | Caixa, comissões, fiado |
| 6 | **App do cliente** | As 4 abas e as 9 páginas do perfil |
| 7 | Busca e agendamento | `/b/[slug]`, o fluxo de 5 passos, lista de espera, avaliações |
| 8 | Fecho | Relatórios, configurações, `/admin`, notificações, PWA |
| 9 | Produção | Auditoria de segurança, deploy na Vercel |

**Se o tempo apertar:** as etapas 0–5 já são um sistema de gestão vendável. As 6 e 7 são o
que transforma em plataforma — e é o que diferencia de uma planilha.

---

## 13. Depois da v1 — nesta ordem

1. **Upload de imagem** (Supabase Storage): logo, capa, foto de perfil e de profissional.
   Na v1 os campos são URL de texto.
2. **Lembrete na véspera** — a coluna `reminder_sent_at` já existe; falta o Vercel Cron
   disparando notificação e mensagem no WhatsApp.
3. **Push de verdade** no PWA (Web Push).
4. **Bloqueio por falta** — cliente com muitas faltas passa a precisar de confirmação.
5. **Cartão fidelidade** ("a cada 10, 1 grátis").
6. **Clientes sumidos** — quem passou do intervalo médio dele, com WhatsApp pronto.
7. **Despesa recorrente** que se lança sozinha.
8. **Assinatura mensal com cobrança** (Asaas é mais simples que Stripe no Brasil).

Nenhum desses muda a arquitetura. Foi por isso que ficaram fora da v1.
