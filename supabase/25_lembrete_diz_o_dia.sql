-- ============================================================================
-- PiBarber — 25_lembrete_diz_o_dia.sql
--
-- O LEMBRETE DIZIA "AMANHÃ" PARA UM ATENDIMENTO DE HOJE.
--
-- ---------------------------------------------------------------------------
-- O bug, observado em produção em 22/09/2026
-- ---------------------------------------------------------------------------
-- O cliente agendou às 15:26 para as 17:30 do MESMO DIA. Recebeu:
--
--   15:26  "Seu horário na Barbearia do Zé está confirmado para
--           terça, 22/09 às 17:30…"                        ← certo
--   15:30  "Lembrete: você tem horário AMANHÃ na Barbearia
--           do Zé, às 17:30…"                              ← MENTIRA
--
-- Quatro minutos depois da confirmação, e dizendo outro dia.
--
-- Duas causas somadas, e as duas precisam de conserto:
--
--   1. O TEXTO tinha a palavra "amanhã" FIXA. Ela só é verdade quando o
--      lembrete sai na véspera — que era o único caso previsto.
--
--   2. A REGRA DE HORÁRIO manda "se as 18h da véspera já passaram, envie
--      agora". Para quem agenda no próprio dia, esse instante SEMPRE passou,
--      então o lembrete dispara na sequência da confirmação. Ele não lembra
--      ninguém de nada: a pessoa acabou de marcar.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO
-- ---------------------------------------------------------------------------
-- PARTE 1 — o dia vira PARÂMETRO. `pibarber_lembrete_v2` recebe "hoje",
-- "amanhã" ou "sexta, 26/09", conforme o caso. Assim o texto é verdadeiro
-- mesmo quando o cron fica fora do ar e o lembrete sai atrasado.
--
-- ⚠️ Texto novo = TEMPLATE NOVO na Meta. O nome muda para `_v2`, o status
-- volta para `pending`, e NENHUM lembrete é enfileirado até a Meta aprovar —
-- é `enfileirar()` quem garante isso. Silêncio por algumas horas é melhor do
-- que mandar a data errada.
--
-- PARTE 2 — quem agenda DEPOIS das 18h da véspera não recebe lembrete. A
-- confirmação já fez esse trabalho, e ela é honesta sobre o dia. O filtro
-- mora em `whatsapp_lembretes_pendentes`, junto dos outros.
--
-- PARTE 3 — o que já está na fila no formato velho (5 parâmetros) é
-- descartado, e o `reminder_sent_at` do agendamento volta a ser nulo para a
-- varredura refazer a linha no formato novo. Sem isto, a primeira mensagem
-- depois desta migração falharia com erro de parâmetro na Meta.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   update whatsapp_templates
--      set meta_name = 'pibarber_lembrete_v1', status = 'approved',
--          body_text = 'Olá {{1}}! Lembrete: você tem horário amanhã na {{2}}, às {{3}}, com {{4}}. Se não puder vir, cancele em {{5}} para liberar o horário.'
--    where event = 'reminder';
--   -- e reaplique whatsapp_lembretes_pendentes da 24_whatsapp.sql
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — O TEMPLATE NOVO
-- ###########################################################################

update whatsapp_templates
   set meta_name = 'pibarber_lembrete_v2',
       body_text = 'Olá {{1}}! Lembrete: você tem horário {{2}} na {{3}}, às {{4}}, com {{5}}. Se não puder vir, cancele em {{6}} para liberar o horário.',
       -- Volta para análise. Até a Meta aprovar, nada de lembrete.
       status = 'pending',
       reject_reason = null,
       reviewed_at = null,
       submitted_at = now()
 where event = 'reminder'
   and meta_name <> 'pibarber_lembrete_v2';


-- ###########################################################################
-- PARTE 2 — QUEM AGENDA EM CIMA DA HORA NÃO PRECISA DE LEMBRETE
--
-- Igual à da 24, com UMA condição a mais: o agendamento precisa ter nascido
-- ANTES do instante do lembrete (18h da véspera). O resto do corpo é palavra
-- por palavra o da 24 — e o portão no fim confere que nada saiu junto.
-- ###########################################################################

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
     -- ⚠️ A CONDIÇÃO NOVA (25). 18h da véspera, no fuso de São Paulo. Quem
     -- marcou depois disso já recebeu a confirmação com o dia certo; um
     -- "lembrete" minutos depois é ruído, e era ele que dizia "amanhã" para
     -- um atendimento de hoje.
     and a.created_at < (
       ((a.starts_at at time zone 'America/Sao_Paulo')::date - 1 + time '18:00')
         at time zone 'America/Sao_Paulo'
     )
   order by a.starts_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

revoke execute on function whatsapp_lembretes_pendentes(integer) from public, anon, authenticated;
grant execute on function whatsapp_lembretes_pendentes(integer) to service_role;


-- ###########################################################################
-- PARTE 3 — LIMPA A FILA DO FORMATO ANTIGO
--
-- O template v1 tinha 5 parâmetros; o v2 tem 6. Uma linha gravada com 5 seria
-- recusada pela Meta (erro 132000–132015, falha PERMANENTE).
-- ###########################################################################

-- Devolve o agendamento para a varredura: sem isto, `reminder_sent_at`
-- preenchido faria a linha nunca mais ser refeita.
update appointments a
   set reminder_sent_at = null
  from whatsapp_messages m
 where m.appointment_id = a.id
   and m.event = 'reminder'
   and m.status = 'pending';

update whatsapp_messages
   set status = 'failed',
       failure_code = 'TEMPLATE_TROCADO',
       failure_reason = 'Enfileirada com o texto v1; refeita no formato v2.'
 where event = 'reminder'
   and status = 'pending';


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
  v_meta  text;
begin
  -- 1. O template novo está lá, e voltou para análise.
  select meta_name into v_meta from whatsapp_templates where event = 'reminder';
  if v_meta <> 'pibarber_lembrete_v2' then
    raise exception 'O template do lembrete não virou v2 (está: %).', v_meta;
  end if;

  if not exists (
    select 1 from whatsapp_templates where event = 'reminder' and body_text like '%horário {{2}} na {{3}}%'
  ) then
    raise exception 'O corpo do lembrete não tem o parâmetro do dia.';
  end if;

  -- 2. A função ganhou o filtro novo.
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'whatsapp_lembretes_pendentes';

  if v_corpo is null or v_corpo not like '%time ''18:00''%' then
    raise exception 'O filtro de "agendou depois das 18h da véspera" não foi aplicado.';
  end if;

  -- 3. ⚠️ O QUE NÃO PODE TER SAÍDO — os filtros da 24.
  if v_corpo not like '%whatsapp_reminder_enabled%' then
    raise exception 'REGRESSÃO: o interruptor da barbearia sumiu do filtro.';
  end if;
  if v_corpo not like '%c.phone is not null%' then
    raise exception 'REGRESSÃO: o filtro de telefone sumiu — o avulso voltaria em toda rodada.';
  end if;
  if v_corpo not like '%reminder_sent_at is null%' then
    raise exception 'REGRESSÃO: o filtro de lembrete pendente sumiu.';
  end if;

  -- 4. Nada do formato velho ficou esperando envio.
  if exists (select 1 from whatsapp_messages where event = 'reminder' and status = 'pending') then
    raise exception 'Sobrou lembrete pendente no formato antigo.';
  end if;

  raise notice '25 aplicada — lembrete diz o dia, e quem agenda em cima da hora não recebe. Submeta o v2 na Meta.';
end $$;
