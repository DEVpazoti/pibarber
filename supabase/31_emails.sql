-- ============================================================================
-- PiBarber — 31_emails.sql
--
-- E-MAILS PELO RESEND: AVISOS AO DONO, AO CLIENTE E A VOLTA DO CLIENTE SUMIDO.
--
-- Até aqui o PiBarber não mandava e-mail nenhum além do que o próprio
-- Supabase manda no cadastro. O dono não sabia de agendamento novo sem abrir a
-- agenda; o teste grátis acabava sem aviso; o cliente sem WhatsApp ativo não
-- recebia confirmação nem lembrete.
--
-- O desenho é o MESMO do WhatsApp (24_whatsapp.sql), de propósito:
--
--   ação / cron ──► email_messages (pending) ──► reivindica (skip locked)
--                                                     │
--                                          Resend ◄───┘  sent / failed
--
--   · A fila é uma tabela. O "worker" é `/api/cron/emails`, no mesmo pg_cron.
--   · Cada linha tem `dedupe_key` ÚNICA: é o que torna o cron idempotente.
--     "lembrete:<agendamento>", "teste3:<loja>:<data>", "recorrencia:<ficha>:
--     <última visita>". Rodar duas vezes não manda duas vezes.
--   · O texto NÃO é gravado: a linha guarda o tipo e os parâmetros, e o
--     servidor monta o e-mail na hora de enviar (src/lib/email/modelos.ts).
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `email_messages` — a fila. Só a service role lê e escreve.
--   2. `email_opt_outs` — quem pediu para não receber o e-mail de VOLTA
--      (marketing). Por loja ou de todas (barbershop_id nulo). Os e-mails de
--      serviço (confirmação, lembrete) não passam por aqui: são do atendimento
--      que a pessoa marcou.
--   3. `platform_settings` — configuração da plataforma. Começa com
--      `recorrencia_dias` = 21: quantos dias depois da última visita o
--      cliente recebe o "bora voltar?". Só o super admin muda (/admin).
--   4. Três interruptores em `barbershops`: aviso ao dono de agendamento
--      novo, de cancelamento feito pelo cliente, e o e-mail de volta
--      (LIGADO por padrão — decisão do negócio em 2026-09-30: é o que traz
--      o cliente de volta, e a loja desliga se não quiser. Quem recebe sai
--      com um clique; ver `email_opt_outs`).
--   5. Funções só-service-role que o cron consulta: dados dos agendamentos,
--      lembretes, cobrança, notificações do app e candidatos à volta.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   drop function if exists email_recorrencia_candidatos(integer, integer);
--   drop function if exists email_notificacoes_pendentes(integer);
--   drop function if exists email_cobranca_pendente();
--   drop function if exists email_lembretes_pendentes(integer);
--   drop function if exists email_dados_agendamentos(uuid[]);
--   drop function if exists email_do_cliente(uuid);
--   drop function if exists email_reivindicar(integer, uuid);
--   drop function if exists recorrencia_dias();
--   drop table if exists platform_settings;
--   drop table if exists email_opt_outs;
--   drop table if exists email_messages;
--   alter table barbershops drop column if exists email_booking_enabled,
--     drop column if exists email_cancellation_enabled,
--     drop column if exists email_marketing_enabled;
-- ============================================================================


-- ###########################################################################
-- 1. A FILA
-- ###########################################################################

create table if not exists email_messages (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid references barbershops (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete cascade,
  -- O tipo do e-mail (ver src/lib/email/modelos.ts). Texto, sem enum: tipo
  -- novo não deve exigir migração.
  kind           text not null,
  recipient      text not null check (recipient ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  params         jsonb not null default '{}'::jsonb,
  -- A idempotência. Ver o cabeçalho.
  dedupe_key     text not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'sent', 'failed')),
  scheduled_for  timestamptz not null default now(),
  attempts       integer not null default 0,
  external_id    text,
  sent_at        timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now()
);

create unique index if not exists email_messages_dedupe_key on email_messages (dedupe_key);
create index if not exists email_messages_fila_idx
  on email_messages (scheduled_for) where status = 'pending';
create index if not exists email_messages_loja_idx
  on email_messages (barbershop_id, created_at desc);

-- Só-servidor: RLS ligada, zero policy, nenhum grant (padrão da 17 e da 24).
alter table email_messages enable row level security;
revoke all on email_messages from anon, authenticated;


-- ###########################################################################
-- 2. QUEM NÃO QUER O E-MAIL DE VOLTA
-- ###########################################################################

create table if not exists email_opt_outs (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email)),
  -- Nulo = de todas as barbearias.
  barbershop_id uuid references barbershops (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create unique index if not exists email_opt_outs_loja_key
  on email_opt_outs (email, barbershop_id) where barbershop_id is not null;
create unique index if not exists email_opt_outs_todas_key
  on email_opt_outs (email) where barbershop_id is null;

alter table email_opt_outs enable row level security;
revoke all on email_opt_outs from anon, authenticated;


-- ###########################################################################
-- 3. CONFIGURAÇÃO DA PLATAFORMA
-- ###########################################################################

create table if not exists platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);

insert into platform_settings (key, value)
values ('recorrencia_dias', '21'::jsonb)
on conflict (key) do nothing;

alter table platform_settings enable row level security;

drop policy if exists platform_settings_admin on platform_settings;
create policy platform_settings_admin on platform_settings
  for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin() and updated_by = auth.uid());

revoke all on platform_settings from anon, authenticated;
grant select, update on platform_settings to authenticated;

-- O dono lê o número para a tela dizer "21 dias depois da última visita".
-- Só esse número — a tabela continua fechada.
create or replace function recorrencia_dias()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select (value #>> '{}')::integer from platform_settings where key = 'recorrencia_dias'),
    21
  );
$fn$;

revoke all on function recorrencia_dias() from public;
grant execute on function recorrencia_dias() to authenticated, service_role;


-- ###########################################################################
-- 4. OS INTERRUPTORES DA LOJA
-- ###########################################################################

alter table barbershops
  add column if not exists email_booking_enabled      boolean not null default true,
  add column if not exists email_cancellation_enabled boolean not null default true,
  add column if not exists email_marketing_enabled    boolean not null default true;

-- Lista inteira repetida, como na 24: `grant update (col)` acrescenta.
grant update (
  name, description, phone, whatsapp,
  zip_code, street, number, complement, neighborhood, city, state,
  latitude, longitude, logo_url, cover_url,
  accepts_online_booking, min_advance_minutes, max_advance_days,
  cancel_deadline_hours, slug,
  allow_public_booking,
  whatsapp_confirmation_enabled, whatsapp_reminder_enabled, whatsapp_cancellation_enabled,
  email_booking_enabled, email_cancellation_enabled, email_marketing_enabled
) on barbershops to authenticated;


-- ###########################################################################
-- 5. FUNÇÕES DO SERVIDOR (só service_role)
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 5.1 O e-mail de quem marcou.
--
-- Na ordem: a conta ligada à ficha; a conta de quem marcou online (a regra
-- da 19 — mas nunca o dono ou o assistente da própria loja, que marcam em
-- nome do cliente); o e-mail que o dono digitou na ficha.
-- ---------------------------------------------------------------------------
create or replace function email_do_cliente(p_appointment uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select nullif(lower(btrim(coalesce(
    (select p.email from profiles p where p.id = c.profile_id),
    (select p.email
       from profiles p
      where p.id = a.created_by
        and a.source = 'online'
        and p.id <> b.owner_id
        and not (p.role = 'assistant' and p.barbershop_id = b.id)),
    c.email
  ))), '')
  from appointments a
  join customers c   on c.id = a.customer_id
  join barbershops b on b.id = a.barbershop_id
  where a.id = p_appointment;
$fn$;

-- ---------------------------------------------------------------------------
-- 5.2 Tudo que um e-mail de agendamento precisa, numa ida.
-- ---------------------------------------------------------------------------
create or replace function email_dados_agendamentos(p_ids uuid[])
returns table (
  appointment_id        uuid,
  barbershop_id         uuid,
  starts_at             timestamptz,
  status                appointment_status,
  source                text,
  cliente_nome          text,
  cliente_email         text,
  cliente_telefone      text,
  barbearia             text,
  barbearia_slug        text,
  barbearia_endereco    text,
  profissional          text,
  servicos              text,
  total                 numeric,
  public_token          uuid,
  tem_conta             boolean,
  dono_email            text,
  dono_nome             text,
  aviso_novo_ligado     boolean,
  aviso_cancelado_ligado boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    a.id, a.barbershop_id, a.starts_at, a.status, a.source::text,
    btrim(c.full_name),
    email_do_cliente(a.id),
    c.phone,
    b.name, b.slug,
    nullif(concat_ws(', ',
      nullif(concat_ws(' ', nullif(btrim(b.street), ''), nullif(btrim(b.number), '')), ''),
      nullif(btrim(b.neighborhood), ''),
      nullif(btrim(b.city), '')), ''),
    coalesce(nullif(btrim(pr.nickname), ''), pr.name),
    (select string_agg(s.name, ' + ' order by aps.id)
       from appointment_services aps
       join services s on s.id = aps.service_id
      where aps.appointment_id = a.id),
    a.total_price,
    a.public_token,
    (c.profile_id is not null
      or exists (select 1 from profiles p where p.id = a.created_by and p.role = 'client')),
    nullif(lower(btrim(dono.email)), ''),
    split_part(btrim(coalesce(dono.full_name, '')), ' ', 1),
    b.email_booking_enabled,
    b.email_cancellation_enabled
  from appointments a
  join customers c      on c.id = a.customer_id
  join professionals pr on pr.id = a.professional_id
  join barbershops b    on b.id = a.barbershop_id
  left join profiles dono on dono.id = b.owner_id
  where a.id = any (p_ids);
$fn$;

-- ---------------------------------------------------------------------------
-- 5.3 Quem precisa de lembrete por e-mail (próximas 36h, sem lembrete na
-- fila). Não usa `reminder_sent_at`: aquela coluna é do WhatsApp.
-- ---------------------------------------------------------------------------
create or replace function email_lembretes_pendentes(p_limite integer default 200)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id
    from appointments a
    join barbershops b on b.id = a.barbershop_id
   where a.status in ('scheduled', 'confirmed')
     and a.starts_at > now()
     and a.starts_at <= now() + interval '36 hours'
     and b.is_active
     and not exists (select 1 from email_messages m where m.dedupe_key = 'lembrete:' || a.id)
     and email_do_cliente(a.id) is not null
   order by a.starts_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

-- ---------------------------------------------------------------------------
-- 5.4 Os avisos de cobrança ao dono que ainda não foram para a fila.
--
-- Janelas curtas no passado de propósito: no primeiro cron depois do deploy,
-- ninguém recebe aviso de fatura de três meses atrás.
-- ---------------------------------------------------------------------------
create or replace function email_cobranca_pendente()
returns table (
  tipo          text,
  chave         text,
  barbershop_id uuid,
  dono_email    text,
  dono_nome     text,
  barbearia     text,
  quando        timestamptz,
  valor         numeric,
  link          text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with lojas as (
    select b.id, b.name,
           nullif(lower(btrim(p.email)), '') as email,
           split_part(btrim(coalesce(p.full_name, '')), ' ', 1) as nome
      from barbershops b
      join profiles p on p.id = b.owner_id
     where b.blocked_at is null
  ),
  candidatos as (
    -- Teste acabando em 3 dias e em 1 dia (sem plano pago).
    select 'teste_3d'::text as tipo,
           'teste3:' || s.barbershop_id || ':' || (s.trial_ends_at at time zone 'America/Sao_Paulo')::date as chave,
           s.barbershop_id, s.trial_ends_at as quando, null::numeric as valor, null::text as link
      from subscriptions s
     where s.paid_until is null
       and s.trial_ends_at > now() + interval '1 day'
       and s.trial_ends_at <= now() + interval '3 days'
    union all
    select 'teste_1d',
           'teste1:' || s.barbershop_id || ':' || (s.trial_ends_at at time zone 'America/Sao_Paulo')::date,
           s.barbershop_id, s.trial_ends_at, null, null
      from subscriptions s
     where s.paid_until is null
       and s.trial_ends_at > now()
       and s.trial_ends_at <= now() + interval '1 day'
    union all
    -- Pausou: acabou o teste ou o período pago (com a tolerância) há pouco.
    select 'pausada',
           'pausada:' || s.barbershop_id || ':' ||
             (coalesce(s.paid_until + interval '1 day', s.trial_ends_at) at time zone 'America/Sao_Paulo')::date,
           s.barbershop_id, coalesce(s.paid_until + interval '1 day', s.trial_ends_at), null, null
      from subscriptions s
     where not assinatura_liberada(s.barbershop_id)
       and coalesce(s.paid_until + interval '1 day', s.trial_ends_at) > now() - interval '3 days'
    union all
    -- Fatura vencida.
    select 'fatura_vencida', 'vencida:' || sp.asaas_payment_id,
           sp.barbershop_id, sp.due_date::timestamptz, sp.value, sp.invoice_url
      from subscription_payments sp
     where sp.status = 'OVERDUE'
       and sp.due_date >= current_date - 7
    union all
    -- Pagamento confirmado (no parcelado, só a 1ª parcela).
    select 'pagamento', 'pago:' || sp.asaas_payment_id,
           sp.barbershop_id, sp.paid_at, sp.value, null
      from subscription_payments sp
     where sp.status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
       and sp.paid_at > now() - interval '2 days'
       and coalesce(sp.installment_number, 1) = 1
    union all
    -- Parcelado: a renovação abre 15 dias antes do fim do período pago.
    select 'renovar',
           'renovar:' || s.barbershop_id || ':' || (s.paid_until at time zone 'America/Sao_Paulo')::date,
           s.barbershop_id, s.paid_until, null, null
      from subscriptions s
     where s.asaas_installment_id is not null
       and s.status = 'active'
       and s.paid_until > now()
       and s.paid_until <= now() + interval '15 days'
  )
  select c.tipo, c.chave, c.barbershop_id, l.email, l.nome, l.name, c.quando, c.valor, c.link
    from candidatos c
    join lojas l on l.id = c.barbershop_id
   where l.email is not null
     and not exists (select 1 from email_messages m where m.dedupe_key = c.chave);
$fn$;

-- ---------------------------------------------------------------------------
-- 5.5 Notificações do app que também viram e-mail: vaga na fila de espera e
-- convite para avaliar. Nascem dentro de funções SQL (02, 17, 19, 20), e é
-- mais simples o cron olhar para o sininho do que ensinar cada uma a enfileirar.
-- ---------------------------------------------------------------------------
create or replace function email_notificacoes_pendentes(p_limite integer default 200)
returns table (
  notification_id uuid,
  tipo            text,
  email           text,
  nome            text,
  titulo          text,
  corpo           text,
  link            text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select n.id, n.type::text, lower(btrim(p.email)),
         split_part(btrim(coalesce(p.full_name, '')), ' ', 1),
         n.title, n.body, n.link
    from notifications n
    join profiles p on p.id = n.profile_id
   where n.type in ('waitlist', 'review')
     and n.created_at > now() - interval '2 hours'
     and n.read_at is null
     and nullif(btrim(p.email), '') is not null
     and not exists (select 1 from email_messages m where m.dedupe_key = 'notif:' || n.id)
   order by n.created_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

-- ---------------------------------------------------------------------------
-- 5.6 Quem recebe o "bora voltar?".
--
--   · a loja ligou o e-mail de volta, está no ar e com a assinatura em dia;
--   · a última visita foi há pelo menos `p_dias` — e há no máximo `p_dias`
--     + 30: quem sumiu há um ano não recebe e-mail do nada quando a loja liga;
--   · não tem horário marcado nessa loja;
--   · não pediu para sair (dessa loja ou de todas);
--   · ainda não recebeu o e-mail DESTA última visita (a chave). Voltou e
--     sumiu de novo, recebe de novo — uma vez por ciclo.
-- ---------------------------------------------------------------------------
create or replace function email_recorrencia_candidatos(p_dias integer, p_limite integer default 200)
returns table (
  customer_id   uuid,
  barbershop_id uuid,
  chave         text,
  email         text,
  nome          text,
  barbearia     text,
  slug          text,
  ultima_visita timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  with base as (
    select c.id, c.barbershop_id, c.last_visit_at, c.full_name,
           nullif(lower(btrim(coalesce(
             (select p.email from profiles p where p.id = c.profile_id), c.email))), '') as email,
           b.name, b.slug
      from customers c
      join barbershops b on b.id = c.barbershop_id
     where b.email_marketing_enabled
       and b.is_active
       and assinatura_liberada(b.id)
       and c.last_visit_at is not null
       and c.last_visit_at <= now() - make_interval(days => greatest(p_dias, 7))
       and c.last_visit_at >  now() - make_interval(days => greatest(p_dias, 7) + 30)
       and not exists (
         select 1 from appointments a
          where a.customer_id = c.id
            and a.status in ('scheduled', 'confirmed')
            and a.starts_at > now())
  )
  select b.id, b.barbershop_id,
         'recorrencia:' || b.id || ':' || (b.last_visit_at at time zone 'America/Sao_Paulo')::date,
         b.email, split_part(btrim(b.full_name), ' ', 1), b.name, b.slug, b.last_visit_at
    from base b
   where b.email is not null
     and not exists (
       select 1 from email_opt_outs o
        where o.email = b.email
          and (o.barbershop_id is null or o.barbershop_id = b.barbershop_id))
     and not exists (
       select 1 from email_messages m
        where m.dedupe_key = 'recorrencia:' || b.id || ':' ||
                             (b.last_visit_at at time zone 'America/Sao_Paulo')::date)
   order by b.last_visit_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

-- ---------------------------------------------------------------------------
-- 5.7 Reivindicar — o mesmo desenho de `whatsapp_reivindicar` (24, §5.3).
-- ---------------------------------------------------------------------------
create or replace function email_reivindicar(p_limite integer default 50, p_id uuid default null)
returns setof email_messages
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- a) Esgotou as tentativas sem resposta.
  update email_messages m
     set status = 'failed', failure_reason = 'Esgotou as tentativas sem resposta do Resend.'
   where m.status = 'pending' and m.attempts >= 5 and m.scheduled_for <= now();

  -- b) Obsoletas: o agendamento mudou antes do envio.
  update email_messages m
     set status = 'failed', failure_reason = 'OBSOLETA: o agendamento mudou antes do envio.'
    from appointments a
   where a.id = m.appointment_id
     and m.status = 'pending'
     and (
       (m.kind in ('confirmacao', 'lembrete', 'novo_agendamento')
         and (a.status not in ('scheduled', 'confirmed') or a.starts_at <= now()))
       or (m.kind in ('cancelamento', 'cancelamento_dono') and a.status <> 'cancelled')
     );

  -- c) Pediu para sair depois de o e-mail de volta entrar na fila.
  update email_messages m
     set status = 'failed', failure_reason = 'OPT_OUT'
   where m.status = 'pending'
     and m.kind = 'recorrencia'
     and exists (
       select 1 from email_opt_outs o
        where o.email = m.recipient
          and (o.barbershop_id is null or o.barbershop_id = m.barbershop_id));

  return query
  with alvo as (
    select f.id
      from email_messages f
     where f.status = 'pending'
       and f.scheduled_for <= now()
       and f.attempts < 5
       and (p_id is null or f.id = p_id)
     order by f.scheduled_for
     limit greatest(1, least(coalesce(p_limite, 50), 200))
       for update skip locked
  )
  update email_messages m
     set attempts = m.attempts + 1,
         scheduled_for = now() + interval '10 minutes'
    from alvo
   where m.id = alvo.id
  returning m.*;
end;
$fn$;

do $$
declare f text;
begin
  foreach f in array array[
    'email_do_cliente(uuid)',
    'email_dados_agendamentos(uuid[])',
    'email_lembretes_pendentes(integer)',
    'email_cobranca_pendente()',
    'email_notificacoes_pendentes(integer)',
    'email_recorrencia_candidatos(integer, integer)',
    'email_reivindicar(integer, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;


-- ###########################################################################
-- Portão: as duas tabelas só-servidor não podem ganhar policy nem grant.
-- ###########################################################################
do $$ begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename in ('email_messages', 'email_opt_outs')) then
    raise exception 'email_messages/email_opt_outs não podem ter policy: são só do servidor.';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public'
                and table_name in ('email_messages', 'email_opt_outs')
                and grantee in ('anon', 'authenticated')) then
    raise exception 'email_messages/email_opt_outs não podem ter grant para anon/authenticated.';
  end if;
end $$;
