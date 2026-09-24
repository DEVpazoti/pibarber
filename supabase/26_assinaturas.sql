-- ============================================================================
-- PiBarber — 26_assinaturas.sql
--
-- OS PLANOS PAGOS: 14 DIAS GRÁTIS, DEPOIS ASSINATURA.
--
-- ---------------------------------------------------------------------------
-- As regras (decididas pelo negócio — não mude sem conversar)
-- ---------------------------------------------------------------------------
--   Planos, pelo número de profissionais ATIVOS:
--     solo       1       R$  69,99/mês
--     equipe     2 a 4   R$  99,99/mês
--     barbearia  5 a 8   R$ 159,99/mês
--   Mais de 8: não há plano — é contato direto com a PiSystem.
--
--   Recorrência: mensal, semestral (−10%) e anual (−20%), paga adiantada.
--
--   Teste: 14 dias contados da CRIAÇÃO da barbearia. As lojas que já existem
--   quando esta migration roda ganham 14 dias a partir de agora.
--
--   Vencimento: o teste acaba sem tolerância. O período PAGO tem 1 dia de
--   tolerância (Pix e cartão), para um pagamento que compensa no dia seguinte
--   não derrubar a barbearia. Vencido: painel só mostra /assinatura, a página
--   pública para de aceitar agendamento novo. NADA é apagado; os horários já
--   marcados continuam valendo; pagar libera na hora.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `plans` e a view `plan_prices` — o catálogo. O preço semestral e o
--      anual NÃO são gravados: saem do mensal pela view, e é a view que o
--      servidor lê para cobrar e a tela lê para mostrar. Um lugar só.
--
--   2. `subscriptions` — uma linha por barbearia, criada pelo trigger junto
--      com a loja. `paid_until` é o fim do período pago; quem o empurra é o
--      webhook do Asaas (service role). O dono só LÊ.
--
--   3. `subscription_payments` — o histórico de cobranças, espelho do Asaas.
--
--   4. `assinatura_liberada(shop)` — A regra. Tudo que decide "pode operar"
--      passa por ela: o layout do painel, a página pública, o trigger de
--      agendamento. Não copie a conta para outro lugar.
--
--   5. Dois triggers que tornam a regra do BANCO, não da tela:
--        - `appointments_exige_assinatura`: agendamento novo em loja vencida
--          é recusado, venha de onde vier (app, página pública, painel,
--          REST direto). Todas as funções de agendar inserem em
--          `appointments`, então um trigger cobre todas sem reescrevê-las.
--        - `professionals_limite_do_plano`: ativar um profissional além do
--          limite do plano é recusado.
--
-- Por que NÃO `barbershops.is_active`: ele já tem dois donos (setup e
-- bloqueio da plataforma — ver 25_setup_barbearia.sql). Um terceiro motivo no
-- mesmo campo repetiria o bug de um desligar o que o outro ligou.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   drop trigger if exists on_professional_limite_do_plano on professionals;
--   drop function if exists professionals_limite_do_plano();
--   drop trigger if exists on_appointment_exige_assinatura on appointments;
--   drop function if exists appointments_exige_assinatura();
--   drop trigger if exists on_barbershop_cria_assinatura on barbershops;
--   drop function if exists barbershop_cria_assinatura();
--   drop function if exists limite_de_profissionais(uuid);
--   drop function if exists assinatura_estornada(uuid);
--   drop table if exists subscription_events;
--   drop function if exists assinatura_periodo_pago(uuid, date);
--   drop function if exists assinatura_pagamento_confirmado(text, date);
--   drop function if exists assinatura_em_dia(barbershops);
--   drop function if exists assinatura_liberada(uuid);
--   drop table if exists subscription_payments;
--   drop table if exists subscriptions;
--   drop view if exists plan_prices;
--   drop table if exists plans;
--   drop type if exists subscription_status;
--   drop type if exists subscription_cycle;
-- ============================================================================


-- ###########################################################################
-- 1. CATÁLOGO
-- ###########################################################################

do $$ begin
  create type subscription_cycle as enum ('monthly', 'semiannual', 'annual');
exception when duplicate_object then null;
end $$;

create table if not exists plans (
  id                text primary key,
  name              text not null,
  min_professionals integer not null check (min_professionals >= 1),
  max_professionals integer not null check (max_professionals >= min_professionals),
  monthly_price     numeric(10, 2) not null check (monthly_price > 0),
  sort_order        integer not null default 0,
  is_active         boolean not null default true
);

insert into plans (id, name, min_professionals, max_professionals, monthly_price, sort_order)
values
  ('solo',      'Solo',      1, 1,  69.99, 1),
  ('equipe',    'Equipe',    2, 4,  99.99, 2),
  ('barbearia', 'Barbearia', 5, 8, 159.99, 3)
on conflict (id) do update
   set name              = excluded.name,
       min_professionals = excluded.min_professionals,
       max_professionals = excluded.max_professionals,
       monthly_price     = excluded.monthly_price,
       sort_order        = excluded.sort_order;

-- O preço de cada plano em cada período. `total` é o que se cobra de uma vez;
-- `per_month` é só para a tela ("R$ 55,99/mês").
--
-- round(…, 2) no TOTAL, não no mensal: 69,99 × 12 × 0,8 = 671,904 → 671,90.
-- Arredondar o mensal primeiro e multiplicar daria outro total, e o cliente
-- veria na fatura um número diferente do da tela.
create or replace view plan_prices
with (security_invoker = true) as
select p.id                                   as plan_id,
       c.cycle,
       c.months,
       c.discount_percent,
       round(p.monthly_price * c.months * (1 - c.discount_percent / 100.0), 2) as total,
       round(p.monthly_price * (1 - c.discount_percent / 100.0), 2)            as per_month
  from plans p
 cross join (values
   ('monthly'::subscription_cycle,     1,  0),
   ('semiannual'::subscription_cycle,  6, 10),
   ('annual'::subscription_cycle,     12, 20)
 ) as c(cycle, months, discount_percent)
 where p.is_active;

alter table plans enable row level security;

-- O catálogo é público: a landing e a tela de assinatura mostram os preços.
drop policy if exists plans_select on plans;
create policy plans_select on plans
  for select to anon, authenticated
  using (true);

grant select on plans to anon, authenticated;
grant select on plan_prices to anon, authenticated;


-- ###########################################################################
-- 2. ASSINATURA
-- ###########################################################################

do $$ begin
  -- trialing  → no teste, sem plano pago
  -- pending   → escolheu plano, aguardando o 1º pagamento
  -- active    → pago e em dia
  -- past_due  → a cobrança do período venceu sem pagamento
  -- canceled  → não renova; vale até `paid_until`
  create type subscription_status as enum ('trialing', 'pending', 'active', 'past_due', 'canceled');
exception when duplicate_object then null;
end $$;

create table if not exists subscriptions (
  barbershop_id         uuid primary key references barbershops (id) on delete cascade,
  status                subscription_status not null default 'trialing',
  trial_ends_at         timestamptz not null,
  -- Nulos durante o teste. Depois, o plano e o período que estão valendo.
  plan_id               text references plans (id),
  cycle                 subscription_cycle,
  -- Fim do período PAGO. É o que libera depois do teste. Só o webhook mexe.
  paid_until            timestamptz,
  -- Mudança agendada para a próxima renovação (plano menor ou outro período).
  next_plan_id          text references plans (id),
  next_cycle            subscription_cycle,
  asaas_customer_id     text,
  asaas_subscription_id text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((plan_id is null) = (cycle is null))
);

create table if not exists subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  barbershop_id    uuid not null references barbershops (id) on delete cascade,
  asaas_payment_id text not null unique,
  plan_id          text references plans (id),
  cycle            subscription_cycle,
  value            numeric(10, 2) not null,
  -- 'PIX' | 'CREDIT_CARD' — texto do Asaas, sem enum: é espelho, não regra.
  billing_type     text,
  -- Status do Asaas (PENDING, CONFIRMED, RECEIVED, OVERDUE, REFUNDED…).
  status           text not null,
  due_date         date,
  paid_at          timestamptz,
  invoice_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists subscription_payments_loja_idx
  on subscription_payments (barbershop_id, created_at desc);

alter table subscriptions         enable row level security;
alter table subscription_payments enable row level security;

-- Quem opera a loja LÊ a assinatura (o assistente precisa saber que venceu,
-- para a tela dizer "fale com o dono"). Ninguém escreve pela API: a escrita é
-- do servidor, pela service role, depois de o Asaas confirmar.
drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions
  for select to authenticated
  using (has_shop_access(barbershop_id));

-- Fatura é dinheiro: só o dono.
drop policy if exists subscription_payments_select on subscription_payments;
create policy subscription_payments_select on subscription_payments
  for select to authenticated
  using (can_manage_money(barbershop_id));

grant select on subscriptions, subscription_payments to authenticated;


-- ###########################################################################
-- 3. A REGRA
-- ###########################################################################

-- Liberada = no teste, OU dentro do período pago + 1 dia de tolerância.
-- O teste não tem tolerância; o pagamento tem.
--
-- Loja sem linha em `subscriptions` (não deveria existir — o trigger cria)
-- conta como liberada: travar uma barbearia por um dado que falta seria pior
-- do que deixá-la operar, e o /admin mostra quem está sem assinatura.
create or replace function assinatura_liberada(shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((
    select now() < s.trial_ends_at
        or (s.paid_until is not null and now() < s.paid_until + interval '1 day')
      from subscriptions s
     where s.barbershop_id = shop
  ), true);
$fn$;

-- Pública de propósito: a página /b/[slug] decide se mostra o botão de agendar
-- sem sessão. Diz só "pode agendar ou não" — nada de plano nem de valor.
revoke all on function assinatura_liberada(uuid) from public;
grant execute on function assinatura_liberada(uuid) to anon, authenticated;

-- Quantos profissionais ATIVOS a loja pode ter agora.
-- No teste (ou sem plano pago em vigor), o máximo do maior plano: o teste é
-- para experimentar tudo. Com plano pago em vigor, o limite dele.
create or replace function limite_de_profissionais(shop uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((
    select p.max_professionals
      from subscriptions s
      join plans p on p.id = s.plan_id
     where s.barbershop_id = shop
       and s.paid_until is not null
       and now() < s.paid_until + interval '1 day'
  ), (select max(max_professionals) from plans where is_active));
$fn$;

revoke all on function limite_de_profissionais(uuid) from public;
grant execute on function limite_de_profissionais(uuid) to authenticated;


-- ###########################################################################
-- 4. OS TRIGGERS
-- ###########################################################################

-- A assinatura nasce com a loja. `created_at` e não now(): é a criação da
-- barbearia que conta, e um insert com data retroativa (seed, importação) não
-- deve ganhar teste novo.
create or replace function barbershop_cria_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into subscriptions (barbershop_id, trial_ends_at)
  values (new.id, new.created_at + interval '14 days')
  on conflict (barbershop_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_barbershop_cria_assinatura on barbershops;
create trigger on_barbershop_cria_assinatura
  after insert on barbershops
  for each row execute function barbershop_cria_assinatura();

-- As lojas que já existem: 14 dias a partir de AGORA (decisão do negócio —
-- contar da criação as travaria todas no dia do deploy).
insert into subscriptions (barbershop_id, trial_ends_at)
select b.id, now() + interval '14 days'
  from barbershops b
on conflict (barbershop_id) do nothing;


create or replace function appointments_exige_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not assinatura_liberada(new.barbershop_id) then
    raise exception 'Esta barbearia não está aceitando agendamentos no momento. Fale direto com ela.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_appointment_exige_assinatura on appointments;
create trigger on_appointment_exige_assinatura
  before insert on appointments
  for each row execute function appointments_exige_assinatura();


-- Conta os OUTROS ativos + este. Só dispara quando alguém PASSA a ser ativo:
-- editar nome ou comissão de quem já está ativo não é barrado, nem mesmo numa
-- loja que ficou acima do limite (ex.: desceu de plano) — ela só não cresce.
create or replace function professionals_limite_do_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_limite integer;
  v_ativos integer;
  v_maximo integer;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.is_active then
    return new;
  end if;

  v_limite := limite_de_profissionais(new.barbershop_id);

  select count(*) into v_ativos
    from professionals
   where barbershop_id = new.barbershop_id
     and is_active
     and id is distinct from new.id;

  if v_ativos + 1 > v_limite then
    select max(max_professionals) into v_maximo from plans where is_active;

    if v_limite >= v_maximo then
      raise exception 'O PiBarber atende até % profissionais por barbearia. Para mais, fale com a gente.', v_maximo
        using errcode = 'P0001';
    end if;

    raise exception 'Seu plano permite até % profissional(is) ativo(s). Mude de plano em Assinatura para cadastrar mais.', v_limite
      using errcode = 'P0001';
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_professional_limite_do_plano on professionals;
create trigger on_professional_limite_do_plano
  before insert or update of is_active on professionals
  for each row execute function professionals_limite_do_plano();


-- ###########################################################################
-- 5. COLUNA CALCULADA PARA O APP
-- ###########################################################################

-- `select=id,name,assinatura_em_dia` no PostgREST: a regra vem na MESMA
-- consulta que o painel e a página pública já fazem em `barbershops`, sem ida
-- e volta a mais — e sem copiar a conta para o TypeScript.
create or replace function assinatura_em_dia(b barbershops)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select assinatura_liberada(b.id);
$fn$;

grant execute on function assinatura_em_dia(barbershops) to anon, authenticated;


-- ###########################################################################
-- 6. PAGAMENTO CONFIRMADO (chamada pelo webhook do Asaas)
-- ###########################################################################

-- O período que um pagamento cobre começa no VENCIMENTO da cobrança, não no
-- dia em que foi pago. É isso que preserva o teste: quem assina no 5º dia tem
-- a 1ª cobrança vencendo no fim do teste (a action manda `nextDueDate` assim),
-- e o mês pago começa ali — os 9 dias de teste que faltavam não se perdem.
--
-- `greatest`: o webhook repete eventos, e eles chegam fora de ordem. Um
-- CONFIRMED atrasado de um mês antigo não pode encurtar o período.
-- Fim do dia em São Paulo: vencer "dia 7" é poder usar o dia 7 inteiro.
create or replace function assinatura_pagamento_confirmado(
  p_asaas_subscription text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop  uuid;
  v_meses integer;
begin
  select s.barbershop_id,
         case s.cycle when 'monthly' then 1 when 'semiannual' then 6 when 'annual' then 12 end
    into v_shop, v_meses
    from subscriptions s
   where s.asaas_subscription_id = p_asaas_subscription
   for update;

  if v_shop is null or v_meses is null then
    return null;
  end if;

  update subscriptions
     set paid_until = greatest(
           coalesce(paid_until, '-infinity'::timestamptz),
           ((p_due_date + make_interval(months => v_meses))::timestamp + time '23:59:59')
             at time zone 'America/Sao_Paulo'
         ),
         status     = case when status = 'canceled' then status else 'active' end,
         updated_at = now()
   where barbershop_id = v_shop;

  return v_shop;
end;
$fn$;

-- Só a service role (o webhook). Ninguém com sessão se dá período pago.
revoke all on function assinatura_pagamento_confirmado(text, date) from public, anon, authenticated;


-- ###########################################################################
-- 7. PAGAMENTO PARCELADO NO CARTÃO (semestral 6x, anual 12x — sem juros)
-- ###########################################################################

-- Assinatura do Asaas não parcela (testado no Sandbox: o `installmentCount`
-- é ignorado). O parcelado é uma COBRANÇA PARCELADA avulsa por período, e a
-- renovação é por link — o dono paga de novo no fim do período.
--
-- `asaas_installment_id` aponta o parcelamento do período em vigor (ou do que
-- está esperando pagamento). Com ele preenchido e `asaas_subscription_id`
-- nulo, a loja está no modo parcelado: nada renova sozinho.
alter table subscriptions
  add column if not exists asaas_installment_id text unique;

-- Vencimento da 1ª parcela = início do período pago pelo parcelamento.
-- Gravado na criação: deduzir "parcela 12 vence em X, logo o início foi X − 11
-- meses" erra em dia 29–31 (o Asaas encurta o mês curto).
alter table subscriptions
  add column if not exists installment_first_due date;

-- Qual parcela é esta cobrança (1 a 12). Nulo fora do parcelado.
alter table subscription_payments
  add column if not exists installment_number integer;

-- O período pago de UMA loja, a partir do dia em que ele começa.
--
-- É a mesma conta de `assinatura_pagamento_confirmado`, mas pela loja e pelo
-- INÍCIO do período — que o parcelado precisa: o Asaas confirma as 12
-- parcelas de uma vez, cada uma com o vencimento do seu mês. Somar 12 meses ao
-- vencimento da 12ª daria quase dois anos. Quem chama converte "parcela N,
-- vence em X" no vencimento da 1ª.
create or replace function assinatura_periodo_pago(p_shop uuid, p_inicio date)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_meses integer;
begin
  select case s.cycle when 'monthly' then 1 when 'semiannual' then 6 when 'annual' then 12 end
    into v_meses
    from subscriptions s
   where s.barbershop_id = p_shop
   for update;

  if v_meses is null then
    return;
  end if;

  update subscriptions
     set paid_until = greatest(
           coalesce(paid_until, '-infinity'::timestamptz),
           ((p_inicio + make_interval(months => v_meses))::timestamp + time '23:59:59')
             at time zone 'America/Sao_Paulo'
         ),
         status     = case when status = 'canceled' then status else 'active' end,
         updated_at = now()
   where barbershop_id = p_shop;
end;
$fn$;

revoke all on function assinatura_periodo_pago(uuid, date) from public, anon, authenticated;


-- ###########################################################################
-- 8. ESTORNO, CANCELAMENTO E AUDITORIA
-- ###########################################################################

-- Tudo que mexe em dinheiro ou em acesso FORA do fluxo normal de pagamento
-- fica registrado aqui: estorno, cancelamento (pelo dono ou pela PiSystem) e
-- extensão de teste. É a resposta para "por que essa barbearia recebeu o
-- dinheiro de volta?" seis meses depois.
--
-- Só a service role escreve (as actions, depois de conferir quem chamou). O
-- admin da plataforma lê; o dono não — é registro interno.
create table if not exists subscription_events (
  id            uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  -- Quem fez. Nulo = o sistema (webhook de um estorno feito no painel do Asaas).
  actor_id      uuid references profiles (id) on delete set null,
  -- 'refund' | 'cancel' | 'owner_cancel' | 'extend_trial' | 'external_refund'
  action        text not null,
  reason        text,
  -- O que foi pedido e o que o Asaas respondeu (ids, valores).
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists subscription_events_loja_idx
  on subscription_events (barbershop_id, created_at desc);

alter table subscription_events enable row level security;

drop policy if exists subscription_events_select on subscription_events;
create policy subscription_events_select on subscription_events
  for select to authenticated
  using (is_platform_admin());

grant select on subscription_events to authenticated;


-- O dinheiro voltou: o acesso PAGO termina agora (Termos, item 5 —
-- "o acesso pago termina quando a devolução é feita").
--
-- `paid_until` vai para 1 dia ANTES de agora, não para agora: a tolerância de
-- 1 dia de `assinatura_liberada()` existe para pagamento atrasado, não para
-- quem recebeu o dinheiro de volta. O teste grátis, se ainda estiver
-- correndo, continua valendo — ele não foi pago, então não é estornado.
create or replace function assinatura_estornada(p_shop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update subscriptions
     set paid_until = least(coalesce(paid_until, now()), now() - interval '1 day'),
         status     = 'canceled',
         updated_at = now()
   where barbershop_id = p_shop;
end;
$fn$;

revoke all on function assinatura_estornada(uuid) from public, anon, authenticated;
