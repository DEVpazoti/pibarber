-- ============================================================================
-- PiBarber — 20_link_expira_e_rajada.sql
--
-- DUAS CORREÇÕES NO AGENDAMENTO SEM CADASTRO:
--   1. a trava de rajada deixa de se autoalimentar
--   2. o link de acompanhamento passa a EXPIRAR
--
-- ---------------------------------------------------------------------------
-- 1. A TRAVA DE RAJADA SE AUTOALIMENTAVA
-- ---------------------------------------------------------------------------
-- Como estava:
--
--     select count(*) from public_booking_attempts
--      where ip_hash = p_ip_hash
--        and created_at > now() - interval '30 seconds';
--     if v_n >= 1 then bloqueia;
--
-- Sem filtro por `ok`. Ou seja: contava também as tentativas que a PRÓPRIA
-- função tinha acabado de recusar. O efeito, observado em produção:
--
--     18:43:53  limite_ativos_telefone   ← recusa legítima, vai para o log
--     18:44:34  limite_ativos_telefone   ← recusa legítima, vai para o log
--     18:44:48  rajada_ip                ← recusado porque a anterior existe
--
-- Cada recusa reiniciava a janela de 30 segundos. Quem fosse barrado por um
-- motivo real e tentasse de novo passava a levar "rajada" para sempre, sem
-- nunca mais ver a causa verdadeira nem conseguir corrigir a entrada. A trava
-- prendia justamente quem estava tentando acertar.
--
-- As outras três travas (hora, dia, telefone) já filtravam `and a.ok` — só
-- esta ficou de fora, e é a que mais dói, porque é a de janela mais curta.
--
-- A CORREÇÃO separa duas perguntas que estavam misturadas numa só:
--
--   a) "acabei de RESERVAR agora mesmo?"  → duplo envio / robô com sucesso.
--      Conta só `ok`, janela de 30s, limite 1. Recusa não conta.
--
--   b) "estou martelando o endpoint?"     → flood, com ou sem sucesso.
--      Conta tudo, janela de 1 minuto, limite 6. Dá espaço para a pessoa
--      corrigir o telefone duas ou três vezes, e ainda assim segura o robô.
--
-- ---------------------------------------------------------------------------
-- 2. O LINK PASSA A EXPIRAR
-- ---------------------------------------------------------------------------
-- Regra pedida: o link morre 1 HORA DEPOIS DO FIM do atendimento. Agendamento
-- das 10:00 que dura 30min termina 10:30 → o link para de valer às 11:30.
--
-- O token continua aleatório: `gen_random_uuid()` é v4, 122 bits de entropia
-- de fonte criptográfica. Não é sequencial nem adivinhável — isso já estava
-- certo e não muda.
--
-- COMO A EXPIRAÇÃO É FEITA: por FILTRO na leitura, não apagando a coluna.
--
-- Apagar o token exigiria alguém rodando de tempos em tempos — cron, job,
-- trigger agendado — e um link que "só morre se a faxina rodar" não é uma
-- garantia, é uma esperança. Com o filtro, o link expira no instante exato,
-- sozinho, sem nada precisar acontecer. O uuid continua na linha e é inerte:
-- não existe caminho que o leia depois do prazo.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   -- reaplique as PARTES 3 e 4 do 17_agendamento_publico.sql
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — A JANELA DE VALIDADE DO LINK, EM UM LUGAR SÓ
--
-- As duas funções que respondem ao token precisam concordar sobre "ainda
-- vale?". Se cada uma trouxesse o `interval '1 hour'` no corpo, um dia alguém
-- mudaria uma e não a outra — e o link abriria a página mas recusaria o
-- cancelamento, ou o contrário.
-- ###########################################################################

-- ⚠️ `stable`, NUNCA `immutable`.
--
-- Esta função depende de `now()`, e `now()` não é imutável — ele muda. Marcar
-- como `immutable` autoriza o planejador a avaliar a chamada uma vez e
-- reaproveitar o resultado, inclusive entre execuções de um plano preparado.
-- O efeito seria o pior possível para uma trava de prazo: ela congelaria numa
-- resposta velha, e um link vencido continuaria abrindo — ou um válido pararia
-- de abrir — sem nada no código parecer errado.
--
-- `stable` é exatamente o contrato certo: constante DENTRO de uma consulta
-- (todas as linhas do mesmo select comparam contra o mesmo instante, que é o
-- que queremos), reavaliada a cada nova consulta.
create or replace function token_ainda_vale(p_ends_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $fn$
  -- 1 hora depois do FIM do atendimento. Depois disso o link é papel velho:
  -- não há mais o que acompanhar nem o que cancelar.
  select now() < p_ends_at + interval '1 hour';
$fn$;

revoke execute on function token_ainda_vale(timestamptz) from public, anon, authenticated;
grant execute on function token_ainda_vale(timestamptz) to service_role;


-- ###########################################################################
-- PARTE 2 — LER PELO TOKEN, COM PRAZO
-- ###########################################################################

create or replace function agendamento_por_token(p_token uuid)
returns table (
  id                    uuid,
  starts_at             timestamptz,
  ends_at               timestamptz,
  status                appointment_status,
  total_price           numeric,
  cliente_nome          text,
  profissional          text,
  servicos              text,
  shop_nome             text,
  shop_slug             text,
  shop_telefone         text,
  shop_whatsapp         text,
  shop_endereco         text,
  cancel_deadline_hours integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    a.id, a.starts_at, a.ends_at, a.status, a.total_price,
    -- Só o primeiro nome: o link pode acabar num print num grupo de WhatsApp.
    split_part(btrim(c.full_name), ' ', 1) as cliente_nome,
    coalesce(nullif(btrim(pr.nickname), ''), pr.name) as profissional,
    (select string_agg(s.name, ' + ' order by s.name)
       from appointment_services aps
       join services s on s.id = aps.service_id
      where aps.appointment_id = a.id) as servicos,
    b.name, b.slug, b.phone, b.whatsapp,
    nullif(btrim(concat_ws(', ',
      nullif(btrim(concat_ws(', ', b.street, b.number)), ''),
      b.neighborhood, b.city
    )), '') as shop_endereco,
    b.cancel_deadline_hours
  from appointments a
  join customers c      on c.id = a.customer_id
  join professionals pr on pr.id = a.professional_id
  join barbershops b    on b.id = a.barbershop_id
  where a.public_token = p_token
    -- O PRAZO. Passada a hora seguinte ao fim do atendimento, não devolve
    -- linha nenhuma — para quem tem o link, ele deixou de existir.
    and token_ainda_vale(a.ends_at)
  limit 1;
$fn$;


-- ###########################################################################
-- PARTE 3 — CANCELAR PELO TOKEN, COM O MESMO PRAZO
-- ###########################################################################

create or replace function cancelar_por_token(
  p_token  uuid,
  p_motivo text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id        uuid;
  v_shop      uuid;
  v_inicio    timestamptz;
  v_fim       timestamptz;
  v_status    appointment_status;
  v_prazo     integer;
  v_dia       date;
  v_hora      integer;
  v_periodo   text;
  v_shop_nome text;
begin
  select a.id, a.barbershop_id, a.starts_at, a.ends_at, a.status,
         b.cancel_deadline_hours, b.name
    into v_id, v_shop, v_inicio, v_fim, v_status, v_prazo, v_shop_nome
    from appointments a
    join barbershops b on b.id = a.barbershop_id
   where a.public_token = p_token
     for update of a;

  if v_id is null then
    raise exception 'Não encontrei esse agendamento. Confira o link.';
  end if;

  -- Mesmo prazo da leitura: link vencido não cancela nada. Sem isto, um link
  -- antigo continuaria derrubando horário muito depois de o atendimento ter
  -- acabado — e a página nem mostraria mais o agendamento para conferir.
  if not token_ainda_vale(v_fim) then
    raise exception 'Esse link expirou. Ele vale até 1 hora depois do atendimento.';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Este agendamento já foi cancelado.';
  end if;

  if v_status in ('completed', 'no_show') then
    raise exception 'Este atendimento já foi finalizado e não pode ser cancelado.';
  end if;

  if now() > v_inicio - make_interval(hours => coalesce(v_prazo, 2)) then
    raise exception
      'O prazo para cancelar sozinho já passou (% horas antes). Fale com a barbearia.',
      coalesce(v_prazo, 2);
  end if;

  update appointments
     set status = 'cancelled',
         cancel_reason = nullif(btrim(coalesce(p_motivo, '')), ''),
         cancelled_by = null   -- não há usuário: quem cancelou foi o portador do link
   where id = v_id;

  -- Avisa a lista de espera, igual ao `cancel_appointment`. Uma vaga que abre é
  -- uma vaga que abre — não importa por qual porta o cancelamento entrou.
  v_dia  := (v_inicio at time zone 'America/Sao_Paulo')::date;
  v_hora := extract(hour from (v_inicio at time zone 'America/Sao_Paulo'))::integer;

  v_periodo := case
    when v_hora < 12 then 'morning'
    when v_hora < 18 then 'afternoon'
    else 'evening'
  end;

  insert into notifications (profile_id, type, title, body, link)
  select w.profile_id, 'waitlist',
         'Vagou um horário!',
         'Abriu uma vaga na ' || coalesce(v_shop_nome, 'barbearia') ||
           ' no dia ' || to_char(v_dia, 'DD/MM') || '. Corre que é por ordem de chegada.',
         '/b/' || (select b.slug from barbershops b where b.id = v_shop) || '/agendar'
    from waitlist_entries w
   where w.barbershop_id = v_shop
     and w.desired_date = v_dia
     and w.status = 'waiting'
     and w.period in (v_periodo, 'any');

  update waitlist_entries
     set status = 'notified', notified_at = now()
   where barbershop_id = v_shop
     and desired_date = v_dia
     and status = 'waiting'
     and period in (v_periodo, 'any');

  return true;
end;
$fn$;

-- Os grants são reafirmados: `create or replace` preserva, mas deixar
-- explícito evita o "permission denied" silencioso de quem reaplicar fora de
-- ordem. Ver o aviso sobre service_role no 17.
revoke execute on function agendamento_por_token(uuid) from public, anon, authenticated;
revoke execute on function cancelar_por_token(uuid, text) from public, anon, authenticated;
grant execute on function agendamento_por_token(uuid) to service_role;
grant execute on function cancelar_por_token(uuid, text) to service_role;


-- ###########################################################################
-- PARTE 4 — A TRAVA DE RAJADA QUE NÃO SE AUTOALIMENTA
--
-- Base: 17_agendamento_publico.sql. Muda SÓ o bloco 3.1; o resto é palavra por
-- palavra, e o portão no fim confere que nada mais saiu.
-- ###########################################################################

create or replace function book_appointment_publico(
  p_shop         uuid,
  p_professional uuid,
  p_quando       timestamptz,
  p_service_ids  uuid[],
  p_nome         text,
  p_telefone     text,
  p_ip_hash      text,
  p_obs          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fuso       text := 'America/Sao_Paulo';
  v_permite    boolean;
  v_ativa      boolean;
  v_online     boolean;
  v_telefone   text;
  v_nome       text;
  v_ddd        text;
  v_duracao    integer;
  v_qtd        integer;
  v_dia        date;
  v_appointment uuid;
  v_token      uuid;
  v_motivo     text;
  v_n          integer;
begin
  if p_ip_hash is null or btrim(p_ip_hash) = '' then
    raise exception 'Origem da requisição não identificada.';
  end if;

  if p_shop is null or p_professional is null or p_quando is null then
    raise exception 'Dados do agendamento incompletos.';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.';
  end if;

  -- 1. A LOJA PERMITE?
  select b.is_active, b.accepts_online_booking, b.allow_public_booking
    into v_ativa, v_online, v_permite
    from barbershops b
   where b.id = p_shop;

  if not coalesce(v_ativa, false) or not coalesce(v_online, false) then
    raise exception 'Esta barbearia não está aceitando agendamento online no momento.';
  end if;

  if not coalesce(v_permite, false) then
    raise exception 'Esta barbearia pede cadastro para agendar. Crie sua conta — leva menos de um minuto.';
  end if;

  -- 2. O TELEFONE, de verdade
  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome     := nullif(btrim(coalesce(p_nome, '')), '');

  if v_nome is null or length(v_nome) < 3 then
    raise exception 'Informe seu nome completo.';
  end if;

  if length(v_telefone) not in (10, 11) then
    raise exception 'Informe um celular válido, com DDD.';
  end if;

  v_ddd := left(v_telefone, 2);
  if not ddd_valido(v_ddd) then
    raise exception 'Esse DDD não existe. Confira o número.';
  end if;

  if length(v_telefone) = 11 and substr(v_telefone, 3, 1) <> '9' then
    raise exception 'Esse celular não parece válido. Confira o número.';
  end if;

  -- ==========================================================================
  -- 3. OS LIMITES
  -- ==========================================================================

  -- 3.1 DUPLO ENVIO: já reservou com sucesso nos últimos 30 segundos?
  --
  -- ⚠️ `and a.ok` é o conserto. Sem ele isto contava as próprias recusas, e
  -- cada tentativa barrada esticava a janela — quem levasse um "não" legítimo
  -- e tentasse de novo ficava preso em "rajada" para sempre, sem nunca ver o
  -- motivo verdadeiro. A trava prendia quem estava tentando acertar.
  select count(*) into v_n
    from public_booking_attempts a
   where a.ip_hash = p_ip_hash
     and a.ok
     and a.created_at > now() - interval '30 seconds';

  if v_n >= 1 then
    v_motivo := 'rajada_ip';
  end if;

  -- 3.1b FLOOD: martelando o endereço, com ou sem sucesso?
  --
  -- Aqui SIM conta tudo — é a pergunta "isto é um robô?". O limite é folgado
  -- de propósito: seis tentativas por minuto deixa a pessoa corrigir o
  -- telefone duas ou três vezes sem ser punida, e ainda assim fecha a porta
  -- para quem dispara em sequência.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.ip_hash = p_ip_hash
       and a.created_at > now() - interval '1 minute';

    if v_n >= 6 then
      v_motivo := 'flood_ip';
    end if;
  end if;

  -- 3.2 Por origem, na hora.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.ip_hash = p_ip_hash
       and a.ok
       and a.created_at > now() - interval '1 hour';

    if v_n >= 3 then
      v_motivo := 'limite_ip_hora';
    end if;
  end if;

  -- 3.3 Por origem, no dia.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.ip_hash = p_ip_hash
       and a.ok
       and a.created_at > now() - interval '24 hours';

    if v_n >= 5 then
      v_motivo := 'limite_ip_dia';
    end if;
  end if;

  -- 3.4 Por telefone, no dia.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.phone = v_telefone
       and a.ok
       and a.created_at > now() - interval '24 hours';

    if v_n >= 3 then
      v_motivo := 'limite_telefone_dia';
    end if;
  end if;

  -- 3.5 Agendamentos ATIVOS por telefone naquela barbearia.
  if v_motivo is null then
    select count(*) into v_n
      from appointments ap
      join customers c on c.id = ap.customer_id
     where ap.barbershop_id = p_shop
       and c.phone = v_telefone
       and ap.status = 'scheduled'
       and ap.starts_at > now();

    if v_n >= 2 then
      v_motivo := 'limite_ativos_telefone';
    end if;
  end if;

  if v_motivo is not null then
    insert into public_booking_attempts (barbershop_id, ip_hash, phone, ok, motivo)
    values (p_shop, p_ip_hash, v_telefone, false, v_motivo);

    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  -- 4. O HORÁRIO existe mesmo?
  select coalesce(sum(s.duration_minutes), 0), count(*)
    into v_duracao, v_qtd
    from services s
   where s.id = any (p_service_ids)
     and s.barbershop_id = p_shop
     and s.is_active;

  if v_qtd = 0 then
    raise exception 'Nenhum serviço válido foi escolhido.';
  end if;

  v_dia := (p_quando at time zone v_fuso)::date;

  if not exists (
    select 1 from get_available_slots(p_professional, v_dia, v_duracao) g
     where g.slot = p_quando
  ) then
    raise exception 'Esse horário não está mais disponível. Escolha outro.';
  end if;

  -- 5. AGENDA
  v_appointment := book_appointment(
    p_shop         => p_shop,
    p_professional => p_professional,
    p_quando       => p_quando,
    p_service_ids  => p_service_ids,
    p_profile      => null,
    p_dependent    => null,
    p_nome         => v_nome,
    p_telefone     => v_telefone,
    p_obs          => p_obs,
    p_source       => 'online'
  );

  -- 122 bits de aleatoriedade criptográfica. Não é sequencial, não é
  -- adivinhável, e não dá para percorrer.
  v_token := gen_random_uuid();
  update appointments set public_token = v_token where id = v_appointment;

  insert into public_booking_attempts (barbershop_id, ip_hash, phone, ok, motivo)
  values (p_shop, p_ip_hash, v_telefone, true, null);

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$fn$;

revoke execute on function book_appointment_publico(uuid, uuid, timestamptz, uuid[], text, text, text, text)
  from public, anon, authenticated;
grant execute on function book_appointment_publico(uuid, uuid, timestamptz, uuid[], text, text, text, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  -- 1. O link expira nas DUAS funções.
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'agendamento_por_token';

  if v_corpo is null or v_corpo not like '%token_ainda_vale%' then
    raise exception 'A leitura pelo token não expira — o link valeria para sempre.';
  end if;

  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancelar_por_token';

  if v_corpo is null or v_corpo not like '%token_ainda_vale%' then
    raise exception 'O cancelamento pelo token não expira — um link velho ainda derrubaria horário.';
  end if;

  -- 2. A rajada deixou de contar as próprias recusas.
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'book_appointment_publico';

  if v_corpo is null then
    raise exception 'book_appointment_publico sumiu.';
  end if;
  if v_corpo not like '%flood_ip%' then
    raise exception 'A separação entre duplo envio e flood não foi aplicada.';
  end if;

  -- 3. ⚠️ O QUE NÃO PODE TER SAÍDO — as travas do 17.
  if v_corpo not like '%allow_public_booking%' then
    raise exception 'REGRESSÃO: a checagem de "a loja permite?" sumiu.';
  end if;
  if v_corpo not like '%ddd_valido%' then
    raise exception 'REGRESSÃO: a validação de DDD sumiu.';
  end if;
  if v_corpo not like '%get_available_slots%' then
    raise exception 'REGRESSÃO: a conferência do horário livre sumiu — passado e fora do expediente passariam.';
  end if;
  if v_corpo not like '%limite_ativos_telefone%' then
    raise exception 'REGRESSÃO: o limite de agendamentos ativos por telefone sumiu.';
  end if;

  -- 4. E a função continua fora do alcance de anon.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'book_appointment_publico'
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'PERIGO: book_appointment_publico voltou a ser acessível por anon/authenticated.';
  end if;

  raise notice '20 aplicada — link com prazo de 1h após o fim, e rajada sem se autoalimentar.';
end $$;
