-- ============================================================================
-- PiBarber — 29_admin_dashboard.sql
--
-- O PAINEL DO SUPER ADMIN (fase 1): visão geral, barbearias com métricas,
-- notas internas e o registro de "Ver como o dono".
--
-- Quem usa: os admins da plataforma (`profiles.is_platform_admin`). Todos com
-- o mesmo poder — não há níveis.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `admin_notes` — anotações internas da PiSystem sobre uma barbearia
--      ("ligou dia 12, assina em outubro"). O dono nunca vê.
--
--   2. `admin_audit` — o que um admin fez FORA da assinatura (que já tem
--      `subscription_events`). Começa com `view_as_owner`: toda vez que alguém
--      abre o painel de uma barbearia em modo visualização, fica registrado —
--      é acesso a dado de cliente de terceiros, e precisa deixar rastro.
--
--   3. `admin_barbearias(p_shop)` — a lista (ou uma barbearia só) com tudo que
--      a tela precisa numa ida: dono, assinatura, situação calculada e uso
--      (profissionais, agendamentos em 30 dias, clientes, nota).
--
--   4. `admin_metricas()` — os números da visão geral: receita recorrente
--      mensal, pagantes, em teste, receita do mês, conversão do teste,
--      cancelamentos e cadastros.
--
-- As duas funções são SECURITY DEFINER e começam conferindo
-- `is_platform_admin()`: quem não é admin recebe erro, não dados.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   drop function if exists admin_metricas();
--   drop function if exists admin_barbearias(uuid);
--   drop table if exists admin_audit;
--   drop table if exists admin_notes;
-- ============================================================================

create table if not exists admin_notes (
  id            uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  author_id     uuid references profiles (id) on delete set null,
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now()
);

create index if not exists admin_notes_loja_idx on admin_notes (barbershop_id, created_at desc);

alter table admin_notes enable row level security;

drop policy if exists admin_notes_all on admin_notes;
create policy admin_notes_all on admin_notes
  for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin() and author_id = auth.uid());

grant select, insert, delete on admin_notes to authenticated;


create table if not exists admin_audit (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles (id) on delete set null,
  barbershop_id uuid references barbershops (id) on delete cascade,
  action        text not null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_idx on admin_audit (created_at desc);

alter table admin_audit enable row level security;

-- Lê: admin. Escreve: admin, sempre em nome de si mesmo. Ninguém apaga.
drop policy if exists admin_audit_select on admin_audit;
create policy admin_audit_select on admin_audit
  for select to authenticated
  using (is_platform_admin());

drop policy if exists admin_audit_insert on admin_audit;
create policy admin_audit_insert on admin_audit
  for insert to authenticated
  with check (is_platform_admin() and actor_id = auth.uid());

grant select, insert on admin_audit to authenticated;


-- ---------------------------------------------------------------------------
-- A lista de barbearias com métricas. `p_shop` nulo = todas.
--
-- `situacao`, na ordem em que é decidida:
--   bloqueada  → a plataforma desativou (blocked_at)
--   setup      → ainda não concluiu o setup
--   pagante    → período pago em vigor, renovando
--   cancelada  → período pago em vigor, mas não renova
--   atrasada   → período pago venceu há menos de 1 dia (tolerância)
--   teste      → no teste grátis, sem período pago
--   pausada    → venceu tudo: painel travado
-- ---------------------------------------------------------------------------
create or replace function admin_barbearias(p_shop uuid default null)
returns table (
  id               uuid,
  name             text,
  slug             text,
  city             text,
  state            text,
  created_at       timestamptz,
  setup_em         timestamptz,
  dono_nome        text,
  dono_email       text,
  dono_telefone    text,
  sub_status       text,
  plano_id         text,
  plano_nome       text,
  ciclo            text,
  parcelado        boolean,
  teste_ate        timestamptz,
  pago_ate         timestamptz,
  situacao         text,
  profissionais    integer,
  agendamentos_30d integer,
  clientes         integer,
  nota             numeric,
  avaliacoes       integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;

  return query
  select b.id,
         b.name,
         b.slug,
         b.city,
         b.state,
         b.created_at,
         b.setup_completed_at,
         p.full_name,
         p.email,
         p.phone,
         s.status::text,
         s.plan_id,
         pl.name,
         s.cycle::text,
         (s.asaas_installment_id is not null and s.asaas_subscription_id is null),
         s.trial_ends_at,
         s.paid_until,
         case
           when b.blocked_at is not null then 'bloqueada'
           when b.setup_completed_at is null then 'setup'
           when s.paid_until > now() and s.status = 'canceled' then 'cancelada'
           when s.paid_until > now() then 'pagante'
           when s.paid_until + interval '1 day' > now() then 'atrasada'
           when s.trial_ends_at > now() then 'teste'
           else 'pausada'
         end,
         (select count(*)::int from professionals pr
           where pr.barbershop_id = b.id and pr.is_active),
         (select count(*)::int from appointments a
           where a.barbershop_id = b.id and a.starts_at > now() - interval '30 days'),
         (select count(*)::int from customers c where c.barbershop_id = b.id),
         b.rating_avg,
         b.rating_count
    from barbershops b
    left join profiles p on p.id = b.owner_id
    left join subscriptions s on s.barbershop_id = b.id
    left join plans pl on pl.id = s.plan_id
   where p_shop is null or b.id = p_shop
   order by b.created_at desc;
end;
$fn$;

revoke all on function admin_barbearias(uuid) from public, anon;
grant execute on function admin_barbearias(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Os números da visão geral. Mês = mês do calendário em São Paulo.
--
-- Receita recorrente mensal (MRR): o valor por mês das assinaturas com
-- período pago em vigor e que RENOVAM (cancelada não entra — ela não volta a
-- pagar). Semestral e anual entram divididos pelos meses.
-- ---------------------------------------------------------------------------
create or replace function admin_metricas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_inicio_mes      timestamptz;
  v_inicio_anterior timestamptz;
  v_resultado       jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;

  v_inicio_mes := date_trunc('month', now() at time zone 'America/Sao_Paulo')
                    at time zone 'America/Sao_Paulo';
  v_inicio_anterior := (date_trunc('month', now() at time zone 'America/Sao_Paulo')
                          - interval '1 month') at time zone 'America/Sao_Paulo';

  select jsonb_build_object(
    'mrr', coalesce((
      select sum(pp.total / pp.months)
        from subscriptions s
        join plan_prices pp on pp.plan_id = s.plan_id and pp.cycle = s.cycle
       where s.paid_until > now() and s.status <> 'canceled'
    ), 0),
    'pagantes', (select count(*) from subscriptions where paid_until > now()),
    'em_teste', (
      select count(*) from subscriptions s
        join barbershops b on b.id = s.barbershop_id
       where s.trial_ends_at > now()
         and (s.paid_until is null or s.paid_until <= now())
         and b.blocked_at is null
    ),
    'receita_mes', coalesce((
      select sum(value) from subscription_payments
       where status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
         and paid_at >= v_inicio_mes
    ), 0),
    'receita_mes_anterior', coalesce((
      select sum(value) from subscription_payments
       where status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
         and paid_at >= v_inicio_anterior and paid_at < v_inicio_mes
    ), 0),
    'estornos_mes', coalesce((
      select sum(value) from subscription_payments
       where status = 'REFUNDED' and updated_at >= v_inicio_mes
    ), 0),
    -- Conversão: das barbearias cujo teste acabou nos últimos 30 dias, quantas
    -- chegaram a ter período pago.
    'testes_encerrados_30d', (
      select count(*) from subscriptions
       where trial_ends_at between now() - interval '30 days' and now()
    ),
    'convertidas_30d', (
      select count(*) from subscriptions
       where trial_ends_at between now() - interval '30 days' and now()
         and paid_until is not null
    ),
    'cancelamentos_mes', (
      select count(distinct barbershop_id) from subscription_events
       where action in ('cancel', 'owner_cancel', 'refund', 'external_refund')
         and created_at >= v_inicio_mes
    ),
    'cadastros_mes', (select count(*) from barbershops where created_at >= v_inicio_mes),
    'cadastros_mes_anterior', (
      select count(*) from barbershops
       where created_at >= v_inicio_anterior and created_at < v_inicio_mes
    ),
    'faturas_vencidas', (select count(*) from subscription_payments where status = 'OVERDUE'),
    'relatos_novos', (select count(*) from feedbacks where status = 'novo')
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

revoke all on function admin_metricas() from public, anon;
grant execute on function admin_metricas() to authenticated;
