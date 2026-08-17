-- ============================================================================
-- PiBarber — 21_fecha_book_appointment.sql
--
-- A PORTA BLINDADA FOI CONSTRUÍDA AO LADO DE UMA PORTA DESTRANCADA.
--
-- As migrations 17 e 20 montaram um portão elaborado para o agendamento sem
-- cadastro. `book_appointment_publico` confere, nesta ordem:
--
--   1. `barbershops.allow_public_booking` — o liga/desliga por loja, que NASCE
--      DESLIGADO (17_agendamento_publico.sql:77-78);
--   2. nome com ≥ 3 caracteres, telefone com 10-11 dígitos, DDD que existe,
--      nono dígito 9 em celular;
--   3. seis limites anti-abuso — rajada por IP (30s), flood por IP (6/min),
--      3/hora por IP, 5/dia por IP, 3/dia por telefone, e 2 agendamentos
--      ativos por telefone naquela loja;
--   4. o horário contra `get_available_slots` — a única coisa no sistema que
--      conhece `business_hours`, `break_start`/`break_end`, `time_off` e
--      `professional_schedules`.
--
-- E ela é deliberadamente inalcançável por `anon`: sem grant, com o motivo
-- escrito em maiúsculas no topo do arquivo 17 e um portão de migração que faz
-- o deploy FALHAR se alguém conceder o execute.
--
-- Só que `book_appointment` — a função que `book_appointment_publico` chama
-- por dentro — continuou concedida a `anon` desde o arquivo 03, e reafirmada
-- pelo 11 e pelo 13. Ela não faz NADA dos quatro itens acima.
--
-- O que isso permitia, com a chave anônima que fica no HTML de toda página:
--
--     curl -X POST "$URL/rest/v1/rpc/book_appointment" \
--       -H "apikey: $ANON" -H "Content-Type: application/json" \
--       -d '{"p_shop":"...","p_professional":"...",
--            "p_quando":"2026-08-23T04:00:00-03:00",
--            "p_service_ids":["..."],
--            "p_nome":"Fulano","p_telefone":"00000000000"}'
--
-- 23/08/2026 é um domingo, e 04:00 é fora de qualquer expediente. A loja podia
-- ter `allow_public_booking = false` — o padrão de toda loja nova. Passava.
--
-- E como `appointments_no_overlap` (12_status_agendado.sql:97-101) é um
-- EXCLUDE gist, ela NÃO defendia: garantia o oposto, que cada agendamento
-- falso bloqueasse aquele horário para um cliente real, em definitivo. Um
-- laço sobre cada profissional de cada loja ativa, de 15 em 15 minutos,
-- lotava a agenda da plataforma inteira a uma requisição HTTP por horário —
-- e deixava uma ficha permanente em `customers` por telefone inventado.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO FAZ
-- ---------------------------------------------------------------------------
--
--   PARTE 1  Revoga `anon` de `book_appointment`. `authenticated` permanece:
--            é por ela que o cliente logado agenda.
--
--   PARTE 2  Faz `book_appointment` conferir a disponibilidade real quando a
--            origem é 'online'. Protege também o CLIENTE LOGADO, que até aqui
--            agendava fora do expediente pelo caminho normal do app.
--
--   PARTE 3  O portão que faz a migração falhar se o grant voltar.
--
-- ---------------------------------------------------------------------------
-- POR QUE REVOGAR NÃO QUEBRA O AGENDAMENTO SEM CADASTRO
-- ---------------------------------------------------------------------------
-- `book_appointment_publico` é SECURITY DEFINER. Ela roda com os privilégios
-- do dono da função, não com os de quem a chamou — então a chamada interna a
-- `book_appointment` (20_link_expira_e_rajada.sql:468) não depende do grant
-- do chamador. É a mesma mecânica que o comentário de
-- 17_agendamento_publico.sql:498-508 já documenta para o caso do service_role.
--
-- E fecha a SEGUNDA porta junto: a Server Action `agendar`
-- (src/app/actions/booking.ts:183) usa `getProfile()` e aceita chamada sem
-- sessão. Sem cookie, o PostgREST trata a requisição como `anon` — que a
-- partir daqui não tem mais o grant. A action passa a recusar sozinha.
--   ⚠️ Isso continua sendo defesa de uma camada só. O ideal é `agendar` exigir
--      sessão explicitamente — está registrado como BUG-010 em
--      AUDITORIA_BUGS.md e NÃO foi feito aqui.
--
-- ---------------------------------------------------------------------------
-- SE PRECISAR VOLTAR ATRÁS
-- ---------------------------------------------------------------------------
--   -- 1. o grant:      grant execute on function book_appointment(...) to anon;
--   -- 2. a função:     reaplique a PARTE 3 do 13_agendamento_avulso.sql
--   -- Mas leia SEC-001 / BUG-001 antes. O grant é o buraco inteiro.
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — o grant
--
-- Vem primeiro de propósito: é a linha que fecha o vetor. Se a PARTE 2
-- falhar por qualquer motivo, o buraco já está tapado quando a transação
-- deste arquivo terminar.
-- ###########################################################################

revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source)
  from public, anon;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source)
  to authenticated;


-- ###########################################################################
-- PARTE 2 — book_appointment confere o expediente
--
-- Base: 13_agendamento_avulso.sql, PARTE 3. As travas C-1 e C-2 e o bloco
-- "nº 6" (ordem de chegada) continuam palavra por palavra. O que muda é UM
-- bloco novo, marcado com "nº 7", e a variável `v_dia` que ele usa.
-- ###########################################################################

create or replace function book_appointment(
  p_shop         uuid,
  p_professional uuid,
  p_quando       timestamptz,
  p_service_ids  uuid[],
  p_profile      uuid default null,
  p_dependent    uuid default null,
  p_nome         text default null,
  p_telefone     text default null,
  p_obs          text default null,
  p_source       appointment_source default 'online'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop_ok     boolean;
  v_online      boolean;
  v_min_advance integer;
  v_max_days    integer;
  v_fuso        text := 'America/Sao_Paulo';
  v_duracao     integer := 0;
  v_total       numeric(10, 2) := 0;
  v_customer    uuid;
  v_telefone    text;
  v_nome        text;
  v_appointment uuid;
  v_qtd         integer;
  v_equipe      boolean;
  v_source      appointment_source;
  v_profile     uuid;
  v_tem_dono    uuid;
  v_historico   boolean;
  v_avulso      boolean := false;   -- nº 6
  v_dia         date;               -- nº 7
begin
  if p_shop is null or p_professional is null or p_quando is null then
    raise exception 'Dados do agendamento incompletos.';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.';
  end if;

  -- ==========================================================================
  -- QUEM ESTÁ CHAMANDO
  -- ==========================================================================
  v_equipe := has_shop_access(p_shop);

  -- C-1: 'manual' é privilégio de quem opera o painel. Para o resto do mundo a
  -- origem é 'online', e com ela voltam as três regras da loja.
  v_source := case
                when p_source = 'manual' and v_equipe then 'manual'::appointment_source
                else 'online'::appointment_source
              end;

  -- C-2: ninguém agenda "como" outra pessoa. A equipe pode informar o perfil
  -- (é ela que atende no balcão); qualquer outro chamador só usa o próprio.
  if p_profile is not null and not v_equipe and p_profile is distinct from auth.uid() then
    raise exception 'Você não pode agendar em nome de outra pessoa.';
  end if;
  v_profile := p_profile;

  select b.is_active, b.accepts_online_booking, b.min_advance_minutes, b.max_advance_days
    into v_shop_ok, v_online, v_min_advance, v_max_days
    from barbershops b
   where b.id = p_shop;

  if not coalesce(v_shop_ok, false) then
    raise exception 'Esta barbearia não está disponível.';
  end if;

  -- O bloqueio de agendamento online não vale para quem opera o painel.
  if v_source = 'online' and not coalesce(v_online, false) then
    raise exception 'Esta barbearia não está aceitando agendamento online no momento.';
  end if;

  if v_source = 'online' then
    if p_quando < now() + make_interval(mins => v_min_advance) then
      raise exception 'Este horário exige pelo menos % minutos de antecedência.', v_min_advance;
    end if;
    if p_quando::date > (now() at time zone v_fuso)::date + v_max_days then
      raise exception 'Só dá para agendar com até % dias de antecedência.', v_max_days;
    end if;
  end if;

  -- O profissional precisa ser desta barbearia.
  if not exists (
    select 1 from professionals pr
     where pr.id = p_professional and pr.barbershop_id = p_shop and pr.is_active
  ) then
    raise exception 'Profissional não encontrado nesta barbearia.';
  end if;

  -- O dependente precisa ser de quem está agendando.
  if p_dependent is not null then
    if v_profile is null or not exists (
      select 1 from dependents d where d.id = p_dependent and d.profile_id = v_profile
    ) then
      raise exception 'Essa pessoa não está no seu cadastro.';
    end if;
  end if;

  -- Soma preço e duração dos serviços escolhidos (só os desta barbearia).
  select coalesce(sum(s.duration_minutes), 0), coalesce(sum(s.price), 0), count(*)
    into v_duracao, v_total, v_qtd
    from services s
   where s.id = any (p_service_ids)
     and s.barbershop_id = p_shop
     and s.is_active;

  if v_qtd = 0 then
    raise exception 'Nenhum serviço válido foi escolhido.';
  end if;

  -- ==========================================================================
  -- nº 7 — O HORÁRIO EXISTE MESMO?
  --
  -- Até aqui esta função conferia antecedência mínima e máxima, e mais nada
  -- sobre tempo. Não conhecia horário de funcionamento, almoço, folga fixa
  -- nem férias — quem sabe disso é `get_available_slots`, e ela nunca era
  -- consultada. Um domingo às 04:00 passava, porque não sobrepunha nada e
  -- `appointments_no_overlap` só impede sobreposição.
  --
  -- A conferência é a mesma de `book_appointment_publico`
  -- (20_link_expira_e_rajada.sql:460-465). Ficar nos dois lugares é
  -- redundância barata e proposital: aquela função continua sendo a porta do
  -- visitante, esta passa a valer também para o CLIENTE LOGADO, que até agora
  -- atravessava o expediente pelo caminho normal do app.
  --
  -- O ramo 'manual' fica de fora DE PROPÓSITO: encaixe fora do horário é o
  -- normal do balcão, e é a razão de `p_source` existir. A trava C-1 lá em
  -- cima é o que garante que só quem tem `has_shop_access` alcança 'manual'.
  -- ==========================================================================
  if v_source = 'online' then
    v_dia := (p_quando at time zone v_fuso)::date;

    if not exists (
      select 1 from get_available_slots(p_professional, v_dia, v_duracao) g
       where g.slot = p_quando
    ) then
      raise exception 'Esse horário não está mais disponível. Escolha outro.';
    end if;
  end if;

  -- --- A ficha do cliente ---------------------------------------------------
  v_telefone := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');

  if v_profile is not null then
    select coalesce(nullif(btrim(p_nome), ''), pf.full_name),
           coalesce(v_telefone, nullif(regexp_replace(coalesce(pf.phone, ''), '\D', '', 'g'), ''))
      into v_nome, v_telefone
      from profiles pf
     where pf.id = v_profile;
  else
    v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  end if;

  -- ==========================================================================
  -- nº 6 — ORDEM DE CHEGADA
  --
  -- Sem telefone, vindo de quem opera o painel, é atendimento avulso: a pessoa
  -- entrou pela porta e sentou. O banco batiza como "Cliente N" se o barbeiro
  -- também não digitou nome nenhum.
  --
  -- Para o público continua valendo a regra antiga — sem telefone, sem
  -- agendamento. É ele que identifica a pessoa no agendamento online.
  -- ==========================================================================
  if v_telefone is null then
    if not v_equipe then
      raise exception 'Informe nome e telefone para agendar.';
    end if;

    v_avulso := true;

    if v_nome is null then
      v_nome := 'Cliente ' || next_walk_in_number(p_shop);
    end if;
  end if;

  if v_nome is null then
    raise exception 'Informe o nome do cliente.';
  end if;

  -- Casa pelo telefone dentro desta barbearia. Achou, reaproveita.
  -- Avulso NUNCA casa: sem telefone não há como saber se é a mesma pessoa, e
  -- juntar dois "Cliente 3" de dias diferentes numa ficha só seria inventar
  -- um histórico que ninguém confirmou.
  if not v_avulso then
    select c.id, c.profile_id into v_customer, v_tem_dono
      from customers c
     where c.barbershop_id = p_shop and c.phone = v_telefone;
  end if;

  if v_customer is null then
    insert into customers (barbershop_id, profile_id, full_name, phone, is_walk_in)
    values (p_shop, v_profile, v_nome, v_telefone, v_avulso)
    returning id into v_customer;

  elsif v_profile is not null and v_tem_dono is null then
    -- C-2, camada 2: só ficha SEM HISTÓRICO muda de titular.
    select exists (select 1 from appointments a where a.customer_id = v_customer)
        or exists (select 1 from debts d where d.customer_id = v_customer)
      into v_historico;

    if not v_historico then
      update customers set profile_id = v_profile where id = v_customer;
    end if;
  end if;

  -- --- O agendamento --------------------------------------------------------
  insert into appointments (
    barbershop_id, professional_id, customer_id, dependent_id,
    starts_at, ends_at, status, total_price, notes, source, created_by
  ) values (
    p_shop, p_professional, v_customer, p_dependent,
    p_quando, p_quando + make_interval(mins => v_duracao),
    'scheduled', v_total, nullif(btrim(coalesce(p_obs, '')), ''), v_source, v_profile
  )
  returning id into v_appointment;

  -- Congela preço e duração: o histórico não muda quando o dono reajustar.
  insert into appointment_services (appointment_id, service_id, price, duration_minutes)
  select v_appointment, s.id, s.price, s.duration_minutes
    from services s
   where s.id = any (p_service_ids)
     and s.barbershop_id = p_shop
     and s.is_active;

  return v_appointment;
end;
$fn$;

-- O `create or replace` acima não mexe em privilégio, mas a PARTE 1 vem antes
-- dele — e reafirmar aqui custa duas linhas e fecha a janela de quem aplicar
-- este arquivo por partes coladas fora de ordem no SQL Editor.
revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source)
  from public, anon;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source)
  to authenticated;


-- ###########################################################################
-- PARTE 3 — Portão
--
-- Confere o que entrou E o que NÃO PODE ter saído. O espelho do portão que o
-- arquivo 17 já mantém para `book_appointment_publico` (linhas 719-734).
-- ###########################################################################

do $$
declare
  v_oid   oid;
  v_corpo text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'book_appointment';

  if v_corpo is null then
    raise exception 'book_appointment sumiu.';
  end if;

  -- ------------------------------------------------------------------------
  -- A TRAVA QUE SUSTENTA TUDO O QUE AS MIGRATIONS 17 E 20 CONSTRUÍRAM.
  --
  -- Se um dia alguém reconceder execute a `anon` — e o caminho mais provável
  -- é reaplicar o 03, o 11 ou o 13, que historicamente concediam —, o portão
  -- de `book_appointment_publico` continua passando e ninguém percebe nada:
  -- o agendamento público segue funcionando, e ao lado dele volta a existir
  -- uma porta sem liga/desliga, sem validação de telefone, sem conferência de
  -- expediente e sem nenhum dos seis limites anti-abuso.
  --
  -- Esta migração falha em vez de deixar isso passar despercebido.
  -- ------------------------------------------------------------------------
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception
      'PERIGO: book_appointment voltou a ser executável por anon. Com isso o portão de book_appointment_publico deixa de valer — allow_public_booking, validação de telefone, conferência de horário e os seis limites anti-abuso são todos contornáveis por /rest/v1/rpc/book_appointment. Ver SEC-001 / BUG-001.';
  end if;

  -- O espelho: sem grant para `authenticated` o cliente logado não agenda mais.
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'Falta o grant de execute para authenticated — o cliente logado não conseguiria agendar.';
  end if;

  -- A conferência de expediente que esta migração acrescentou (nº 7).
  if v_corpo not like '%get_available_slots(p_professional, v_dia, v_duracao)%' then
    raise exception 'A conferência de disponibilidade (nº 7) não está em book_appointment.';
  end if;

  -- E as travas que vieram de antes e não podem ter se perdido no
  -- `create or replace` — mesma verificação de regressão que o 19 já faz.
  if v_corpo not like '%Você não pode agendar em nome de outra pessoa%' then
    raise exception 'REGRESSÃO: a trava C-2 (ninguém agenda por outro) sumiu de book_appointment.';
  end if;

  if v_corpo not like '%p_source = ''manual'' and v_equipe%' then
    raise exception 'REGRESSÃO: a trava C-1 (só a equipe usa source manual) sumiu de book_appointment.';
  end if;

  if v_corpo not like '%next_walk_in_number(p_shop)%' then
    raise exception 'REGRESSÃO: a ordem de chegada (nº 6, atendimento avulso) sumiu de book_appointment.';
  end if;

  raise notice '21 aplicada — book_appointment fechada para anon e conferindo o expediente no ramo online.';
end $$;
