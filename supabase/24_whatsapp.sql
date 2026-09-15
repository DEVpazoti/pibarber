-- ============================================================================
-- PiBarber — 24_whatsapp.sql
--
-- WHATSAPP OFICIAL (META CLOUD API): A FILA, OS TEMPLATES, O OPT-OUT E O CRON.
--
-- ---------------------------------------------------------------------------
-- Como estava
-- ---------------------------------------------------------------------------
-- Até aqui, NADA no PiBarber acontecia sozinho. Não havia cron, nem fila, nem
-- worker: tudo era reação a um clique. E havia uma coluna esperando por isso
-- desde o primeiro arquivo:
--
--     -- 01_schema.sql, tabela appointments
--     reminder_sent_at timestamptz,
--
-- Nunca lida, nunca escrita, por lugar nenhum. O README prometia "notificações
-- de lembrete" como próximo passo e a coluna ficou lá, de enfeite, por 23
-- migrações. Esta é a que finalmente liga aquela coluna a alguma coisa.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `whatsapp_templates` — espelho do que está aprovado na WABA da
--      plataforma. Uma linha por EVENTO, não por barbearia: o remetente é o
--      PiBarber (é um marketplace), e o texto é o mesmo para toda loja.
--
--   2. `whatsapp_messages` — A FILA. Linha primeiro, entrega depois. Se a Meta
--      estiver fora do ar, o agendamento acontece, a linha fica `pending`, e o
--      cron tenta de novo. Sem a linha não haveria como saber que uma mensagem
--      devia ter saído.
--
--   3. `whatsapp_opt_outs` — quem respondeu PARAR. Global e por telefone:
--      quem sai, sai do PiBarber, não de uma loja. `customers` é por barbearia
--      e não serve de lugar para isso.
--
--   4. Três interruptores em `barbershops` — a loja desliga confirmação,
--      lembrete ou cancelamento. O TEXTO não é editável (ver CONTEXT §9).
--
--   5. Funções só para a service role: os dados que montam a mensagem, a
--      varredura dos lembretes, a reivindicação atômica da fila e o registro
--      do status que chega pelo webhook.
--
--   6. `pg_cron` + `pg_net` chamando `/api/cron/whatsapp` a cada 5 minutos —
--      COMENTADO, porque a chamada leva URL e segredo que não vão para o Git.
--
-- ---------------------------------------------------------------------------
-- Por que a reivindicação é uma FUNÇÃO e não um update solto
-- ---------------------------------------------------------------------------
-- O jeito ingênuo de "pegar" uma mensagem antes de enviar é:
--
--     update whatsapp_messages set attempts = attempts + 1
--      where id = $1 and status = 'pending';
--
-- e seguir se afetou uma linha. NÃO FUNCIONA: o status continua `pending`
-- depois do update, então a segunda execução concorrente do cron também
-- afeta a linha, também segue, e o cliente recebe a mensagem duas vezes.
--
-- `whatsapp_reivindicar()` faz o certo: `for update skip locked` (quem chegar
-- depois pula a linha que outro já trancou) e empurra `scheduled_for` 10
-- minutos para frente como PRAZO DE POSSE. Enquanto o envio está no ar, a
-- linha não é elegível para mais ninguém; se o processo morrer no meio, ela
-- volta sozinha quando o prazo vence.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   select cron.unschedule('whatsapp-despacho');   -- se foi agendado
--   drop function if exists whatsapp_dados_agendamentos(uuid[]);
--   drop function if exists whatsapp_lembretes_pendentes(integer);
--   drop function if exists whatsapp_reivindicar(integer, uuid);
--   drop function if exists whatsapp_registrar_status(text, text, timestamptz, text, text);
--   drop table if exists whatsapp_messages;
--   drop table if exists whatsapp_templates;
--   drop table if exists whatsapp_opt_outs;
--   drop type if exists whatsapp_event, whatsapp_status, whatsapp_template_status;
--   alter table barbershops
--     drop column if exists whatsapp_confirmation_enabled,
--     drop column if exists whatsapp_reminder_enabled,
--     drop column if exists whatsapp_cancellation_enabled;
--   drop index if exists appointments_lembrete_pendente_idx;
--   -- e reaplique o grant de update de barbershops do 17_agendamento_publico.sql
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — ENUMS
-- ###########################################################################

do $$ begin
  create type whatsapp_event as enum ('confirmation', 'reminder', 'cancellation');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type whatsapp_status as enum ('pending', 'sent', 'delivered', 'read', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type whatsapp_template_status as enum ('pending', 'approved', 'rejected', 'paused', 'disabled');
exception when duplicate_object then null;
end $$;


-- ###########################################################################
-- PARTE 2 — TABELAS
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 2.1 Os templates
-- ---------------------------------------------------------------------------
create table if not exists whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  event         whatsapp_event not null unique,
  -- Nome na Meta: pibarber_confirmacao_v1. Texto novo = nome novo (_v2), porque
  -- a Meta não deixa editar template aprovado sem nova análise.
  meta_name     text not null unique,
  language      text not null default 'pt_BR',
  -- Texto como submetido, com {{1}}, {{2}}… Serve para conferir se o catálogo
  -- do código (src/lib/whatsapp/catalogo.ts) bate com o que subiu.
  body_text     text not null,
  status        whatsapp_template_status not null default 'pending',
  reject_reason text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- 2.2 A fila
-- ---------------------------------------------------------------------------
create table if not exists whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  barbershop_id  uuid references barbershops (id) on delete set null,
  appointment_id uuid references appointments (id) on delete set null,
  event          whatsapp_event not null,
  -- E.164 sem "+": 5516996022093. Congelado no enfileiramento — se o cliente
  -- trocar de número depois, a mensagem que já saiu não muda.
  recipient      text not null,
  -- Os valores de {{1}}..{{n}}, na ordem. Array jsonb de texto.
  params         jsonb not null default '[]'::jsonb,
  status         whatsapp_status not null default 'pending',
  -- Só fica elegível a partir daqui. É o que agenda o lembrete para as 18h da
  -- véspera sem scheduler — e é também o prazo de posse durante o envio.
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

-- A tela de configurações lista os últimos envios da loja.
create index if not exists whatsapp_messages_shop_idx
  on whatsapp_messages (barbershop_id, created_at desc);

-- Idempotência: um evento por agendamento, no máximo. É o que impede o cron
-- de enfileirar o mesmo lembrete duas vezes se rodar duas vezes concorrentes,
-- e o duplo clique de gerar duas confirmações.
create unique index if not exists whatsapp_messages_evento_unico_idx
  on whatsapp_messages (appointment_id, event)
  where appointment_id is not null;

-- ---------------------------------------------------------------------------
-- 2.3 Opt-out
--
-- O telefone é gravado na forma CANÔNICA de 13 dígitos (55 + DDD + 9 + 8).
-- Isso importa: o WhatsApp devolve o `from` de muito celular brasileiro SEM o
-- nono dígito (551696022093, 12 dígitos). Comparado cru com o 5516996022093
-- da ficha, o PARAR nunca casaria e a pessoa continuaria recebendo. Quem
-- canoniza é `telefoneMeta()`, em src/lib/whatsapp/telefone.ts.
-- ---------------------------------------------------------------------------
create table if not exists whatsapp_opt_outs (
  phone      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2.4 Os interruptores da barbearia
--
-- Nascem LIGADOS. São mensagens de utilidade que o cliente espera receber, e
-- a barbearia que não quiser desliga. O inverso deixaria a integração pronta e
-- muda em toda loja até alguém descobrir a tela.
-- ---------------------------------------------------------------------------
alter table barbershops
  add column if not exists whatsapp_confirmation_enabled boolean not null default true,
  add column if not exists whatsapp_reminder_enabled     boolean not null default true,
  add column if not exists whatsapp_cancellation_enabled boolean not null default true;

-- O dono edita os três pela tela. Mesmo padrão do 17: `grant update (col)`
-- ACRESCENTA à lista existente, e ela é repetida inteira para ficar explícito
-- o conjunto atual.
grant update (
  name, description, phone, whatsapp,
  zip_code, street, number, complement, neighborhood, city, state,
  latitude, longitude, logo_url, cover_url,
  accepts_online_booking, min_advance_minutes, max_advance_days,
  cancel_deadline_hours, slug,
  allow_public_booking,
  whatsapp_confirmation_enabled, whatsapp_reminder_enabled, whatsapp_cancellation_enabled
) on barbershops to authenticated;

-- ---------------------------------------------------------------------------
-- 2.5 A coluna que finalmente ganha uso
-- ---------------------------------------------------------------------------
-- ⚠️ O NOME MENTE, e fica assim para não quebrar a coluna existente.
comment on column appointments.reminder_sent_at is
  'Quando o lembrete de WhatsApp foi PARA A FILA (whatsapp_messages), não quando foi entregue. '
  'A entrega está em whatsapp_messages.sent_at / delivered_at. Ver 24_whatsapp.sql.';

-- A varredura do cron pergunta "quem começa nas próximas 36h e ainda não teve
-- lembrete?" a cada 5 minutos. Parcial: só as linhas que ainda são resposta.
create index if not exists appointments_lembrete_pendente_idx
  on appointments (starts_at)
  where reminder_sent_at is null and status in ('scheduled', 'confirmed');


-- ###########################################################################
-- PARTE 3 — RLS: NINGUÉM ALÉM DA SERVICE ROLE
--
-- As três tabelas ficam com RLS ligada e ZERO policies. Não é esquecimento, é
-- decisão — o mesmo desenho de `public_booking_attempts` (17):
--
--   · `whatsapp_messages` tem o telefone de cliente de TODAS as barbearias.
--     Um select aberto a `authenticated` é o catálogo telefônico da plataforma.
--   · `whatsapp_opt_outs` é uma lista de telefones reais que falam com o
--     PiBarber. Idem.
--   · `whatsapp_templates` não tem segredo, mas também não tem leitor legítimo
--     fora do servidor.
--
-- E a tela do dono? Ela lê o histórico DA LOJA DELE pelo servidor, com
-- `createAdminClient()`, depois de `requireOwnerContext()`, e selecionando só
-- as colunas que mostra — o telefone nunca sai do banco. Uma policy de select
-- para o dono exporia `recipient` e `params` crus pela REST API, e a tela não
-- precisa de nenhum dos dois.
--
-- O revoke é o segundo cadeado: o Supabase dá privilégio padrão a anon e
-- authenticated em tabela nova do schema public. Sem policy a RLS já nega; sem
-- grant, uma policy criada por engano amanhã também não abre nada.
-- ###########################################################################

alter table whatsapp_templates enable row level security;
alter table whatsapp_messages  enable row level security;
alter table whatsapp_opt_outs  enable row level security;

revoke all on whatsapp_templates from anon, authenticated;
revoke all on whatsapp_messages  from anon, authenticated;
revoke all on whatsapp_opt_outs  from anon, authenticated;


-- ###########################################################################
-- PARTE 4 — OS TEMPLATES DA PLATAFORMA
--
-- Mesmo texto de src/lib/whatsapp/catalogo.ts. Mudou lá, muda aqui — e o
-- nome ganha _v2, porque é outro template na Meta.
--
-- `do nothing` no conflito: reaplicar a migração não pode voltar o status para
-- `pending` de um template que a Meta já aprovou.
-- ###########################################################################

insert into whatsapp_templates (event, meta_name, language, body_text) values
  ('confirmation', 'pibarber_confirmacao_v1', 'pt_BR',
   'Olá {{1}}! Seu horário na {{2}} está confirmado para {{3}} às {{4}} com {{5}}. Para acompanhar ou cancelar, acesse {{6}}.'),
  ('reminder', 'pibarber_lembrete_v1', 'pt_BR',
   'Olá {{1}}! Lembrete: você tem horário amanhã na {{2}}, às {{3}}, com {{4}}. Se não puder vir, cancele em {{5}} para liberar o horário.'),
  ('cancellation', 'pibarber_cancelamento_v1', 'pt_BR',
   'Olá {{1}}! Seu horário na {{2}} em {{3}} às {{4}} foi cancelado. Você pode marcar outro em {{5}}.')
on conflict (event) do nothing;


-- ###########################################################################
-- PARTE 5 — FUNÇÕES (SÓ SERVICE ROLE)
--
-- Todas `security definer` e com EXECUTE revogado de public, anon e
-- authenticated. Quem chama é o servidor do Next, com a service role, a
-- partir das Server Actions, do cron e do webhook.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 5.1 Tudo o que monta a mensagem, numa ida ao banco
--
-- Juntar ficha, loja, profissional e perfil pelo PostgREST seria esbarrar no
-- PGRST201 (appointments tem três FKs para profiles) e mandar o telefone
-- viajar por mais camadas do que precisa.
-- ---------------------------------------------------------------------------
create or replace function whatsapp_dados_agendamentos(p_ids uuid[])
returns table (
  appointment_id      uuid,
  barbershop_id       uuid,
  starts_at           timestamptz,
  status              appointment_status,
  cliente_nome        text,
  -- O da FICHA daquela barbearia. Se o atendimento é do dependente, continua
  -- sendo o do titular: quem recebe a mensagem é quem marcou.
  telefone            text,
  barbearia           text,
  barbearia_slug      text,
  profissional        text,
  public_token        uuid,
  -- Tem conta no PiBarber? Decide se o link é /app/agendamentos ou /a/<token>.
  tem_conta           boolean,
  confirmacao_ligada  boolean,
  lembrete_ligado     boolean,
  cancelamento_ligado boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    a.id, a.barbershop_id, a.starts_at, a.status,
    -- Só o primeiro nome, como no link público: a mensagem pode acabar num
    -- print, e "Olá João!" soa como gente; "Olá João Carlos da Silva!", não.
    split_part(btrim(c.full_name), ' ', 1),
    c.phone,
    b.name, b.slug,
    coalesce(nullif(btrim(pr.nickname), ''), pr.name),
    a.public_token,
    (c.profile_id is not null
      or exists (select 1 from profiles p where p.id = a.created_by and p.role = 'client')),
    b.whatsapp_confirmation_enabled,
    b.whatsapp_reminder_enabled,
    b.whatsapp_cancellation_enabled
  from appointments a
  join customers c      on c.id = a.customer_id
  join professionals pr on pr.id = a.professional_id
  join barbershops b    on b.id = a.barbershop_id
  where a.id = any (p_ids);
$fn$;

-- ---------------------------------------------------------------------------
-- 5.2 Quem precisa de lembrete
--
-- O filtro de loja e de telefone mora AQUI e não no TypeScript: sem ele, cada
-- rodada do cron traria de volta as mesmas linhas que nunca vão gerar
-- mensagem (loja com lembrete desligado, avulso sem telefone) e elas
-- ocupariam o limite antes das que importam.
-- ---------------------------------------------------------------------------
create or replace function whatsapp_lembretes_pendentes(p_limite integer default 200)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id
    from appointments a
    join barbershops b on b.id = a.barbershop_id
    join customers c   on c.id = a.customer_id
   where a.status in ('scheduled', 'confirmed')
     and a.reminder_sent_at is null
     and a.starts_at > now()
     and a.starts_at <= now() + interval '36 hours'
     and b.is_active
     and b.whatsapp_reminder_enabled
     and c.phone is not null
   order by a.starts_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

-- ---------------------------------------------------------------------------
-- 5.3 Reivindicar mensagens da fila — ver o cabeçalho
-- ---------------------------------------------------------------------------
create or replace function whatsapp_reivindicar(
  p_limite integer default 50,
  -- Com id, reivindica só aquela: é o envio imediato logo depois de agendar.
  p_id     uuid default null
)
returns setof whatsapp_messages
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- a) Morreu no meio da última tentativa (prazo de posse vencido sem
  --    resposta). Não fica `pending` para sempre.
  update whatsapp_messages m
     set status = 'failed',
         failure_code = 'SEM_RESPOSTA',
         failure_reason = 'Esgotou as tentativas sem resposta da Meta.'
   where m.status = 'pending'
     and m.attempts >= 5
     and m.scheduled_for <= now();

  -- b) OBSOLETAS. O lembrete de um horário que foi cancelado não pode sair —
  --    "você tem horário amanhã" para quem cancelou é pior que silêncio. Vale
  --    para a confirmação ainda na fila, e para o cancelamento de um horário
  --    que voltou a "agendado" pelo desfazer do painel.
  update whatsapp_messages m
     set status = 'failed',
         failure_code = 'OBSOLETA',
         failure_reason = 'O agendamento mudou antes do envio.'
    from appointments a
   where a.id = m.appointment_id
     and m.status = 'pending'
     and (
       (m.event in ('confirmation', 'reminder')
         and (a.status not in ('scheduled', 'confirmed') or a.starts_at <= now()))
       or (m.event = 'cancellation' and a.status <> 'cancelled')
     );

  -- c) A reivindicação propriamente dita. O `skip locked` fica numa CTE, e
  --    não num `where id in (subselect)`: dentro do IN o planejador pode
  --    reavaliar a subconsulta, e o LIMIT com trava deixa de ser garantido.
  return query
  with alvo as (
    select f.id
      from whatsapp_messages f
     where f.status = 'pending'
       and f.scheduled_for <= now()
       and f.attempts < 5
       and (p_id is null or f.id = p_id)
     order by f.scheduled_for
     limit greatest(1, least(coalesce(p_limite, 50), 200))
       for update skip locked
  )
  update whatsapp_messages m
     set attempts = m.attempts + 1,
         scheduled_for = now() + interval '10 minutes'
    from alvo
   where m.id = alvo.id
  returning m.*;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5.4 O status que chega pelo webhook
--
-- A Meta reenvia o mesmo evento, e manda `delivered` e `read` fora de ordem
-- quando quer. As duas coisas se resolvem do mesmo jeito: cada data só é
-- preenchida se estiver NULA, e o status só ANDA PARA FRENTE. Isso é a
-- idempotência — não há tabela de eventos processados porque não precisa.
-- ---------------------------------------------------------------------------
create or replace function whatsapp_registrar_status(
  p_external_id text,
  p_status      text,
  p_quando      timestamptz,
  p_codigo      text default null,
  p_motivo      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quando timestamptz := coalesce(p_quando, now());
  v_n      integer;
begin
  if p_status = 'sent' then
    update whatsapp_messages
       set sent_at = coalesce(sent_at, v_quando),
           status  = case when status = 'pending' then 'sent'::whatsapp_status else status end
     where external_id = p_external_id;

  elsif p_status = 'delivered' then
    update whatsapp_messages
       set sent_at      = coalesce(sent_at, v_quando),
           delivered_at = coalesce(delivered_at, v_quando),
           status = case when status in ('pending', 'sent') then 'delivered'::whatsapp_status else status end
     where external_id = p_external_id;

  elsif p_status = 'read' then
    update whatsapp_messages
       set sent_at      = coalesce(sent_at, v_quando),
           delivered_at = coalesce(delivered_at, v_quando),
           read_at      = coalesce(read_at, v_quando),
           status = case when status <> 'failed' then 'read'::whatsapp_status else status end
     where external_id = p_external_id;

  elsif p_status = 'failed' then
    -- Falha depois de lida não existe; depois de enviada, sim (a Meta aceitou
    -- e não conseguiu entregar). Só não sobrescreve um código já gravado.
    update whatsapp_messages
       set status = 'failed',
           failure_code   = coalesce(failure_code, p_codigo),
           failure_reason = coalesce(failure_reason, left(p_motivo, 500))
     where external_id = p_external_id
       and status <> 'read';

  else
    return false;
  end if;

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$fn$;

revoke execute on function whatsapp_dados_agendamentos(uuid[]) from public, anon, authenticated;
revoke execute on function whatsapp_lembretes_pendentes(integer) from public, anon, authenticated;
revoke execute on function whatsapp_reivindicar(integer, uuid) from public, anon, authenticated;
revoke execute on function whatsapp_registrar_status(text, text, timestamptz, text, text) from public, anon, authenticated;

grant execute on function whatsapp_dados_agendamentos(uuid[]) to service_role;
grant execute on function whatsapp_lembretes_pendentes(integer) to service_role;
grant execute on function whatsapp_reivindicar(integer, uuid) to service_role;
grant execute on function whatsapp_registrar_status(text, text, timestamptz, text, text) to service_role;

-- A service role passa por cima da RLS, mas não por cima de GRANT. Tabela
-- nova costuma herdar o privilégio padrão do Supabase; reafirmar custa nada e
-- evita o "permission denied" silencioso num projeto com defaults mexidos.
grant select, insert, update, delete on whatsapp_templates, whatsapp_messages, whatsapp_opt_outs
  to service_role;


-- ###########################################################################
-- PARTE 6 — O GATILHO: pg_cron + pg_net
--
-- As extensões são ligadas aqui, dentro de um bloco que NÃO derruba a
-- migração se o plano do projeto não as tiver: nesse caso a alternativa é o
-- Vercel Cron (docs/whatsapp.md §6), e o resto deste arquivo continua valendo.
-- ###########################################################################

do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron indisponível (%). Use o Vercel Cron — ver docs/whatsapp.md.', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net indisponível (%). Use o Vercel Cron — ver docs/whatsapp.md.', sqlerrm;
end $$;

-- ⚠️ O AGENDAMENTO FICA COMENTADO. Ele leva a URL de produção e o CRON_SECRET,
-- e este arquivo vai para o Git. Rode À MÃO no SQL Editor, uma vez:
--
-- 1) Guarde o segredo no Vault (não fica no texto do job nem no histórico):
--
--   select vault.create_secret('COLE_O_CRON_SECRET_AQUI', 'whatsapp_cron_secret');
--
-- 2) Agende. A cada 5 minutos. Troque a URL se o domínio não for este.
--
--   select cron.schedule(
--     'whatsapp-despacho',
--     '*/5 * * * *',
--     $job$
--       select net.http_post(
--         url     := 'https://pibarber.vercel.app/api/cron/whatsapp',
--         headers := jsonb_build_object(
--           'Content-Type',  'application/json',
--           'Authorization', 'Bearer ' || (
--             select decrypted_secret from vault.decrypted_secrets
--              where name = 'whatsapp_cron_secret'
--           )
--         ),
--         timeout_milliseconds := 60000
--       );
--     $job$
--   );
--
-- Conferir:  select * from cron.job;
--            select * from cron.job_run_details order by start_time desc limit 5;
--            select * from net._http_response order by created desc limit 5;
-- Parar:     select cron.unschedule('whatsapp-despacho');


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['whatsapp_templates', 'whatsapp_messages', 'whatsapp_opt_outs'] loop
    -- 1. RLS ligada.
    if not exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = v_tabela and rowsecurity
    ) then
      raise exception 'PERIGO: % está sem RLS.', v_tabela;
    end if;

    -- 2. Nenhuma policy. Uma policy aqui é uma porta aberta por engano.
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_tabela) then
      raise exception 'PERIGO: % ganhou policy — esta tabela é só da service role.', v_tabela;
    end if;

    -- 3. Nenhum privilégio para anon e authenticated.
    if has_table_privilege('anon', 'public.' || v_tabela, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_tabela, 'SELECT') then
      raise exception 'PERIGO: % continua legível por anon/authenticated.', v_tabela;
    end if;
  end loop;

  -- 4. A idempotência da fila.
  if not exists (select 1 from pg_indexes where indexname = 'whatsapp_messages_evento_unico_idx') then
    raise exception 'Falta o índice único (appointment_id, event) — o cron enfileiraria em dobro.';
  end if;

  -- 5. As funções fora do alcance do público.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'whatsapp\_%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'PERIGO: uma função whatsapp_* está acessível por anon/authenticated.';
  end if;

  -- 6. Os três templates.
  if (select count(*) from whatsapp_templates) < 3 then
    raise exception 'Faltam templates em whatsapp_templates.';
  end if;

  raise notice '24 aplicada — fila de WhatsApp, templates, opt-out e funções. Agende o cron à mão (PARTE 6).';
end $$;
