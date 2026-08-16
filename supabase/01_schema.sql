-- ============================================================================
-- PiBarber — 01_schema.sql
-- Extensões, enums, tabelas, chaves, constraints e índices.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo sem quebrar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
-- No Supabase as extensões moram no schema `extensions`, não em `public` —
-- deixar em public faz o lint de segurança acusar, porque public é gravável.
-- O `if not exists` cobre o caso do pgcrypto, que o Supabase já traz instalado.
create schema if not exists extensions;

create extension if not exists pgcrypto  with schema extensions; -- crypt(), gen_salt()
create extension if not exists btree_gist with schema extensions; -- `professional_id with =` no EXCLUDE

-- gen_random_uuid() é do core do Postgres desde a versão 13, não do pgcrypto.
-- Por isso os defaults das tabelas funcionam sem extensions no search_path.


-- ---------------------------------------------------------------------------
-- Enums
--
-- `create type` não aceita `if not exists`, daí o bloco do/exception.
-- Todo bloco abre com `do $$` e fecha com `end $$;` — se você copiar pela
-- metade, o Postgres reclama de "unterminated dollar-quoted string".
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('owner', 'assistant', 'client');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('cash', 'pix', 'debit', 'credit', 'fiado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type transaction_type as enum ('income', 'expense');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type commission_status as enum ('pending', 'paid');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type debt_status as enum ('open', 'partial', 'paid');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type appointment_source as enum ('online', 'manual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type waitlist_status as enum ('waiting', 'notified', 'converted', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_type as enum ('appointment', 'reminder', 'waitlist', 'review', 'system');
exception when duplicate_object then null;
end $$;


-- ===========================================================================
-- 1. IDENTIDADE — o perfil global da pessoa na plataforma
-- ===========================================================================

-- profiles espelha auth.users. É criada pelo trigger handle_new_user().
-- Este é o perfil GLOBAL: vale para a plataforma inteira, não para uma
-- barbearia. A ficha da pessoa dentro de uma barbearia é `customers`.
create table if not exists profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text,
  email             text,
  phone             text,
  birth_date        date,
  -- 'male' | 'female' | 'other'. Opcional, nunca obrigatório.
  gender            text check (gender is null or gender in ('male', 'female', 'other')),
  avatar_url        text,
  role              user_role not null default 'client',
  -- Só o assistente usa: aponta a barbearia onde ele trabalha.
  -- O dono NÃO usa esta coluna — a barbearia dele vem de barbershops.owner_id.
  barbershop_id     uuid,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Endereço do cliente (tela "Endereço" do app).
create table if not exists user_addresses (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles (id) on delete cascade,
  country      text not null default 'BR',
  zip_code     text,
  street       text,
  number       text,
  complement   text,
  neighborhood text,
  city         text,
  state        text,
  is_default   boolean not null default true,
  created_at   timestamptz not null default now()
);

-- "Quem eu agendo" — resolve o "vou levar meu filho" sem obrigar outra conta.
create table if not exists dependents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  full_name  text not null,
  birth_date date,
  notes      text,
  created_at timestamptz not null default now()
);


-- ===========================================================================
-- 2. BARBEARIA
-- ===========================================================================

create table if not exists barbershops (
  id                     uuid primary key default gen_random_uuid(),
  -- on delete restrict: apagar o dono não pode derrubar a barbearia em silêncio.
  -- É por isso que "deletar usuário" pelo painel do Supabase falha —
  -- a ordem certa mora em 06_apagar_dados.sql.
  owner_id               uuid not null references profiles (id) on delete restrict,
  name                   text not null,
  slug                   text not null unique,
  description            text,
  phone                  text,
  whatsapp               text,
  zip_code               text,
  street                 text,
  number                 text,
  complement             text,
  neighborhood           text,
  city                   text,
  state                  text,
  -- latitude/longitude alimentam o filtro "Próximas" da busca.
  -- O cálculo é Haversine, sem PostGIS.
  latitude               numeric(10, 7),
  longitude              numeric(10, 7),
  logo_url               text,
  cover_url              text,
  accepts_online_booking boolean not null default true,
  min_advance_minutes    integer not null default 60,
  max_advance_days       integer not null default 60,
  cancel_deadline_hours  integer not null default 2,
  -- Mantidos pelo trigger review_after_insert(). Não escreva na mão.
  rating_avg             numeric(3, 2) not null default 0,
  rating_count           integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now()
);

-- Agora que barbershops existe, fecha a FK de profiles.barbershop_id.
-- Ficou para depois porque as duas tabelas se referenciam.
do $$ begin
  alter table profiles
    add constraint profiles_barbershop_id_fkey
    foreign key (barbershop_id) references barbershops (id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Horário da loja: uma linha por dia da semana. 0 = domingo … 6 = sábado.
create table if not exists business_hours (
  id            uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  opens_at      time,
  closes_at     time,
  break_start   time,
  break_end     time,
  is_closed     boolean not null default false,
  unique (barbershop_id, weekday)
);


-- ===========================================================================
-- 3. EQUIPE
-- ===========================================================================

-- Quem corta cabelo. NÃO é login e NÃO tem painel.
-- Se o profissional precisar de acesso, ele vira um `assistant` em profiles.
create table if not exists professionals (
  id                 uuid primary key default gen_random_uuid(),
  barbershop_id      uuid not null references barbershops (id) on delete cascade,
  name               text not null,
  nickname           text,
  bio                text,
  avatar_url         text,
  commission_percent numeric(5, 2) not null default 0 check (commission_percent between 0 and 100),
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);

-- Jornada individual. OPCIONAL: sem nenhuma linha aqui, o profissional
-- segue o horário da loja. A interface precisa deixar isso explícito.
create table if not exists professional_schedules (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals (id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6),
  starts_at       time,
  ends_at         time,
  is_off          boolean not null default false,
  unique (professional_id, weekday)
);

-- Folga, férias, feriado. professional_id nulo = a loja inteira fecha.
create table if not exists time_off (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  professional_id uuid references professionals (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);


-- ===========================================================================
-- 4. CATÁLOGO
-- ===========================================================================

-- Sem categoria e sem professional_services na v1: todo profissional faz
-- todo serviço.
create table if not exists services (
  id               uuid primary key default gen_random_uuid(),
  barbershop_id    uuid not null references barbershops (id) on delete cascade,
  name             text not null,
  description      text,
  price            numeric(10, 2) not null default 0 check (price >= 0),
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);


-- ===========================================================================
-- 5. A FICHA DO CLIENTE
--
-- customers é a ficha da pessoa DENTRO de uma barbearia. profiles é o perfil
-- global. Uma pessoa tem 1 perfil e N fichas. Confundir os dois é o erro mais
-- caro possível neste modelo.
-- ===========================================================================

create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  -- NULO é o caso normal: cliente que o dono cadastrou na mão e que nunca
  -- criou conta no PiBarber.
  profile_id    uuid references profiles (id) on delete set null,
  full_name     text not null,
  phone         text not null,
  email         text,
  birth_date    date,
  -- Texto livre do barbeiro ("máquina 2 nas laterais").
  -- NUNCA aparece para o cliente. A RLS de 03_rls.sql garante isso.
  notes         text,
  -- Mantidos por complete_appointment() e mark_no_show(). Não escreva na mão.
  total_visits  integer not null default 0,
  total_spent   numeric(12, 2) not null default 0,
  last_visit_at timestamptz,
  no_show_count integer not null default 0,
  created_at    timestamptz not null default now(),
  -- É por este par que book_appointment() reaproveita a ficha.
  unique (barbershop_id, phone)
);

create table if not exists favorites (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles (id) on delete cascade,
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (profile_id, barbershop_id)
);

-- Alimenta "Últimos acessos" na home do app. Upsert a cada abertura de /b/[slug].
create table if not exists shop_visits (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  barbershop_id  uuid not null references barbershops (id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  unique (profile_id, barbershop_id)
);


-- ===========================================================================
-- 6. AGENDA
-- ===========================================================================

create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  barbershop_id    uuid not null references barbershops (id) on delete cascade,
  -- restrict nos dois: não dá para apagar profissional nem cliente que tem
  -- histórico. Se pudesse, o caixa perderia a origem do lançamento.
  professional_id  uuid not null references professionals (id) on delete restrict,
  customer_id      uuid not null references customers (id) on delete restrict,
  -- Quando o atendimento é para um dependente (o filho do titular).
  dependent_id     uuid references dependents (id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           appointment_status not null default 'scheduled',
  total_price      numeric(10, 2) not null default 0,
  discount         numeric(10, 2) not null default 0 check (discount >= 0),
  notes            text,
  source           appointment_source not null default 'manual',
  created_by       uuid references profiles (id) on delete set null,
  cancel_reason    text,
  cancelled_by     uuid references profiles (id) on delete set null,
  completed_at     timestamptz,
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- A CONSTRAINT QUE VALE OURO.
--
-- Torna fisicamente impossível gravar dois atendimentos sobrepostos para o
-- mesmo profissional. Não é validação de tela — é o banco recusando.
-- Num marketplace, onde dois clientes podem tocar no mesmo horário no mesmo
-- segundo, é isto que resolve. Cancelado e falta ficam de fora do índice, senão
-- um horário cancelado bloquearia o encaixe.
do $$ begin
  alter table appointments add constraint appointments_no_overlap
    exclude using gist (
      professional_id with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status in ('scheduled', 'confirmed'));
exception when duplicate_object then null;
end $$;

-- Congela preço e duração na hora da marcação, para o histórico não mudar
-- quando o dono reajustar a tabela de preços.
create table if not exists appointment_services (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid not null references appointments (id) on delete cascade,
  service_id       uuid not null references services (id) on delete restrict,
  price            numeric(10, 2) not null default 0,
  duration_minutes integer not null default 30
);

create table if not exists waitlist_entries (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  profile_id      uuid not null references profiles (id) on delete cascade,
  -- nulo = tanto faz o profissional
  professional_id uuid references professionals (id) on delete set null,
  service_id      uuid references services (id) on delete set null,
  desired_date    date not null,
  period          text not null default 'any'
                    check (period in ('morning', 'afternoon', 'evening', 'any')),
  status          waitlist_status not null default 'waiting',
  notified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists reviews (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  -- unique: um atendimento gera no máximo uma avaliação.
  appointment_id  uuid not null unique references appointments (id) on delete cascade,
  profile_id      uuid not null references profiles (id) on delete cascade,
  professional_id uuid references professionals (id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  reply           text,  -- a resposta pública do dono
  replied_at      timestamptz,
  created_at      timestamptz not null default now()
);


-- ===========================================================================
-- 7. DINHEIRO
-- ===========================================================================

-- Livro-caixa único: tudo que entra e tudo que sai.
-- O assistente NÃO lê esta tabela — a policy usa can_manage_money().
create table if not exists transactions (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid not null references barbershops (id) on delete cascade,
  type           transaction_type not null,
  -- Sempre positivo. O sinal quem dá é a coluna `type`.
  amount         numeric(12, 2) not null check (amount > 0),
  payment_method payment_method,  -- nulo em despesa
  category       text,
  description    text,
  appointment_id uuid references appointments (id) on delete set null,
  occurred_at    date not null default current_date,
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists commissions (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete restrict,
  appointment_id  uuid not null unique references appointments (id) on delete cascade,
  base_amount     numeric(12, 2) not null default 0,
  percent         numeric(5, 2) not null default 0,
  amount          numeric(12, 2) not null default 0,
  status          commission_status not null default 'pending',
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- Fiado.
create table if not exists debts (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  customer_id     uuid not null references customers (id) on delete restrict,
  appointment_id  uuid references appointments (id) on delete set null,
  original_amount numeric(12, 2) not null check (original_amount > 0),
  paid_amount     numeric(12, 2) not null default 0 check (paid_amount >= 0),
  status          debt_status not null default 'open',
  due_date        date,
  created_at      timestamptz not null default now()
);

create table if not exists debt_payments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references debts (id) on delete cascade,
  amount         numeric(12, 2) not null check (amount > 0),
  payment_method payment_method not null default 'cash',
  paid_at        timestamptz not null default now(),
  created_by     uuid references profiles (id) on delete set null
);


-- ===========================================================================
-- 8. PLATAFORMA
-- ===========================================================================

-- Alimenta o sino do topo do app.
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  type       notification_type not null default 'system',
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);


-- ===========================================================================
-- 9. ÍNDICES
--
-- Nomeados à mão para o `if not exists` funcionar — sem nome, o Postgres
-- inventa um e o script deixa de ser idempotente.
-- ===========================================================================

create index if not exists appointments_shop_start_idx  on appointments  (barbershop_id, starts_at);
create index if not exists appointments_prof_start_idx  on appointments  (professional_id, starts_at);
create index if not exists appointments_customer_idx    on appointments  (customer_id);
create index if not exists appointment_services_appt_idx on appointment_services (appointment_id);

create index if not exists customers_shop_phone_idx     on customers     (barbershop_id, phone);
create index if not exists customers_profile_idx        on customers     (profile_id);

create index if not exists transactions_shop_date_idx   on transactions  (barbershop_id, occurred_at);
create index if not exists commissions_shop_prof_idx    on commissions   (barbershop_id, professional_id, status);
create index if not exists debts_shop_status_idx        on debts         (barbershop_id, status);
create index if not exists debt_payments_debt_idx       on debt_payments (debt_id);

create index if not exists favorites_profile_idx        on favorites     (profile_id);
create index if not exists shop_visits_profile_idx      on shop_visits   (profile_id, last_viewed_at desc);
create index if not exists notifications_profile_idx    on notifications (profile_id, read_at, created_at desc);
create index if not exists reviews_shop_created_idx     on reviews       (barbershop_id, created_at desc);

create index if not exists barbershops_city_active_idx  on barbershops   (city, is_active);
create index if not exists professionals_shop_idx       on professionals (barbershop_id, is_active);
create index if not exists services_shop_idx            on services      (barbershop_id, is_active);
create index if not exists business_hours_shop_idx      on business_hours (barbershop_id, weekday);
create index if not exists time_off_shop_range_idx      on time_off      (barbershop_id, starts_at, ends_at);
create index if not exists waitlist_shop_date_idx       on waitlist_entries (barbershop_id, desired_date, status);
create index if not exists profiles_barbershop_idx      on profiles      (barbershop_id);

-- O slug já é unique na definição da tabela; o índice vem junto.


-- ---------------------------------------------------------------------------
-- Confirmação
-- ---------------------------------------------------------------------------
do $$
declare
  qtd integer;
begin
  select count(*) into qtd
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'profiles','user_addresses','dependents','barbershops','business_hours',
      'professionals','professional_schedules','time_off','services','customers',
      'favorites','shop_visits','appointments','appointment_services',
      'waitlist_entries','reviews','transactions','commissions','debts',
      'debt_payments','notifications'
    );
  raise notice '01_schema.sql concluído — % de 21 tabelas criadas.', qtd;
end $$;
