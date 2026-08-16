-- ============================================================================
-- PiBarber — 02_functions.sql
-- Triggers, helpers de autorização e as regras de negócio.
--
-- Decisão deliberada: a lógica crítica mora no Postgres. Assim nada escapa nem
-- chamando a API REST direto, e uma operação composta não fica pela metade se o
-- celular perder sinal no meio.
--
-- Todo corpo usa $fn$ em vez de $$ — assim um bloco do $$ interno não fecha a
-- função por engano.
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — TRIGGERS
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Cria o perfil quando alguém se cadastra.
--
-- O papel é FORÇADO em 'client', ignorando qualquer coisa vinda do metadata.
-- Sem isso, bastaria mandar {"role":"owner"} no cadastro para virar dono.
-- owner e assistant nascem por outro caminho (/admin e /painel/equipe).
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name, email, avatar_url, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    'client'  -- NUNCA vem do formulário
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------------------------------------------------------------------------
-- Promove o dono quando a barbearia é criada (fluxo do /admin).
-- ---------------------------------------------------------------------------
create or replace function barbershop_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update profiles
     set role = 'owner'
   where id = new.owner_id
     and role is distinct from 'owner';

  return new;
end;
$fn$;

drop trigger if exists on_barbershop_created on barbershops;
create trigger on_barbershop_created
  after insert on barbershops
  for each row execute function barbershop_after_insert();


-- ---------------------------------------------------------------------------
-- Recalcula a nota da barbearia. É esse número que vira ★ 5.0 no card da busca.
-- Roda também no update e no delete — se o dono apagar uma avaliação, a média
-- precisa acompanhar.
-- ---------------------------------------------------------------------------
create or replace function review_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  alvo uuid := coalesce(new.barbershop_id, old.barbershop_id);
begin
  update barbershops b
     set rating_avg = coalesce((
           select round(avg(r.rating)::numeric, 2) from reviews r where r.barbershop_id = alvo
         ), 0),
         rating_count = (
           select count(*) from reviews r where r.barbershop_id = alvo
         )
   where b.id = alvo;

  return coalesce(new, old);
end;
$fn$;

drop trigger if exists on_review_changed on reviews;
create trigger on_review_changed
  after insert or update or delete on reviews
  for each row execute function review_after_insert();


-- ###########################################################################
-- PARTE 2 — HELPERS DE AUTORIZAÇÃO (SECURITY DEFINER)
--
-- São SECURITY DEFINER de propósito: uma policy em `profiles` que faça subquery
-- em `profiles` causa RECURSÃO INFINITA de RLS. O helper roda com os
-- privilégios do dono da função e quebra o ciclo.
--
-- Regra prática, decore esta:
--   Dado financeiro usa can_manage_money. Dado operacional usa has_shop_access.
-- ###########################################################################

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.is_platform_admin from profiles p where p.id = auth.uid()), false);
$fn$;


-- A barbearia do usuário: o dono tem a dele; o assistente tem a que está
-- gravada em profiles.barbershop_id.
create or replace function my_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select b.id from barbershops b where b.owner_id = auth.uid() order by b.created_at limit 1),
    (select p.barbershop_id from profiles p where p.id = auth.uid())
  );
$fn$;


-- DADO OPERACIONAL: agenda, cliente, serviço, fiado, lista de espera.
-- Vale para o dono, para o assistente daquela loja, e para o admin.
create or replace function has_shop_access(shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select shop is not null and (
    exists (select 1 from barbershops b where b.id = shop and b.owner_id = auth.uid())
    or exists (
      select 1 from profiles p
       where p.id = auth.uid()
         and p.barbershop_id = shop
         and p.role = 'assistant'
    )
    or is_platform_admin()
  );
$fn$;


-- DADO FINANCEIRO: transactions, commissions, relatório.
-- SÓ o dono e o admin. É esta função que faz a regra "assistente não vê
-- faturamento" valer de verdade, mesmo chamando a API REST com a chave anônima.
create or replace function can_manage_money(shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select shop is not null and (
    exists (select 1 from barbershops b where b.id = shop and b.owner_id = auth.uid())
    or is_platform_admin()
  );
$fn$;


-- O cliente logado é o titular daquela ficha?
create or replace function owns_customer(p_customer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from customers c
     where c.id = p_customer
       and c.profile_id = auth.uid()
  );
$fn$;


-- ###########################################################################
-- PARTE 3 — REGRAS DE NEGÓCIO
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Distância em km entre dois pontos — Haversine puro, sem PostGIS.
-- 6371 é o raio médio da Terra. O least/greatest protege o acos() de estourar
-- o domínio [-1, 1] por erro de arredondamento em pontos muito próximos.
-- ---------------------------------------------------------------------------
create or replace function distancia_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
returns numeric
language sql
immutable
-- search_path fixo: sem isso o advisor do Supabase acusa "role mutable
-- search_path". Só usa função de pg_catalog, que é buscado sempre.
set search_path = ''
as $fn$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((6371 * acos(least(1, greatest(-1,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))))::numeric, 2)
  end;
$fn$;


-- ---------------------------------------------------------------------------
-- Busca pública de barbearias. Cobre os TRÊS filtros da tela:
--   Nome     → passe `termo`
--   Cidade   → passe `cidade`
--   Próximas → passe `lat` + `lng` (e opcionalmente `raio_km`)
-- Devolve a nota e a distância. Só loja ativa.
-- ---------------------------------------------------------------------------
create or replace function search_barbershops(
  termo   text    default null,
  cidade  text    default null,
  lat     numeric default null,
  lng     numeric default null,
  raio_km numeric default 25,
  limite  integer default 50
)
returns table (
  id            uuid,
  name          text,
  slug          text,
  description   text,
  neighborhood  text,
  city          text,
  state         text,
  logo_url      text,
  cover_url     text,
  rating_avg    numeric,
  rating_count  integer,
  dist_km       numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    b.id, b.name, b.slug, b.description,
    b.neighborhood, b.city, b.state,
    b.logo_url, b.cover_url,
    b.rating_avg, b.rating_count,
    distancia_km(lat, lng, b.latitude, b.longitude) as dist_km
  from barbershops b
  where b.is_active
    and (termo is null or btrim(termo) = '' or b.name ilike '%' || btrim(termo) || '%')
    and (cidade is null or btrim(cidade) = '' or b.city ilike '%' || btrim(cidade) || '%')
    and (
      lat is null or lng is null
      or (
        b.latitude is not null and b.longitude is not null
        and distancia_km(lat, lng, b.latitude, b.longitude) <= coalesce(raio_km, 25)
      )
    )
  order by
    -- Na busca por proximidade a distância manda; nas outras, a nota.
    case when lat is not null and lng is not null
         then distancia_km(lat, lng, b.latitude, b.longitude) end asc nulls last,
    b.rating_avg desc,
    b.rating_count desc,
    b.name asc
  limit greatest(1, coalesce(limite, 50));
$fn$;


-- ---------------------------------------------------------------------------
-- Horários livres de um profissional num dia.
--
-- Respeita, nesta ordem:
--   1. horário da loja (business_hours)
--   2. jornada individual (professional_schedules) — OPCIONAL: sem linha para
--      aquele dia, vale o horário da loja
--   3. intervalo de almoço (break_start / break_end)
--   4. folga e férias (time_off) — da loja inteira ou só daquele profissional
--   5. antecedência mínima e máxima da barbearia
--   6. os agendamentos que já existem
--
-- A grade anda de 15 em 15 minutos. Devolve o início de cada encaixe possível.
-- ---------------------------------------------------------------------------
create or replace function get_available_slots(
  p_professional uuid,
  p_dia          date,
  p_duracao      integer default 30
)
returns table (slot timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_shop        uuid;
  v_fuso        text := 'America/Sao_Paulo';
  v_weekday     smallint;
  v_abre        time;
  v_fecha       time;
  v_almoco_ini  time;
  v_almoco_fim  time;
  v_fechado     boolean;
  v_min_advance integer;
  v_max_days    integer;
  v_inicio      timestamptz;
  v_fim         timestamptz;
  v_cursor      timestamptz;
  v_passo       interval := interval '15 minutes';
  v_duracao     interval;
begin
  if p_professional is null or p_dia is null then
    return;
  end if;

  v_duracao := make_interval(mins => greatest(5, coalesce(p_duracao, 30)));

  select pr.barbershop_id into v_shop
    from professionals pr
   where pr.id = p_professional and pr.is_active;

  if v_shop is null then
    return;  -- profissional inexistente ou desativado
  end if;

  select b.min_advance_minutes, b.max_advance_days
    into v_min_advance, v_max_days
    from barbershops b
   where b.id = v_shop and b.is_active;

  if v_min_advance is null then
    return;  -- loja inativa
  end if;

  -- Antecedência máxima: não deixa marcar para daqui a um ano.
  if p_dia > (now() at time zone v_fuso)::date + v_max_days then
    return;
  end if;

  -- extract(dow) já devolve 0=domingo, igual ao nosso business_hours.weekday.
  v_weekday := extract(dow from p_dia)::smallint;

  select bh.opens_at, bh.closes_at, bh.break_start, bh.break_end, bh.is_closed
    into v_abre, v_fecha, v_almoco_ini, v_almoco_fim, v_fechado
    from business_hours bh
   where bh.barbershop_id = v_shop and bh.weekday = v_weekday;

  if v_fechado is null or v_fechado or v_abre is null or v_fecha is null then
    return;  -- a loja não abre nesse dia
  end if;

  -- Jornada individual, se houver. Sem linha = segue o horário da loja.
  declare
    v_p_ini  time;
    v_p_fim  time;
    v_p_off  boolean;
    v_tem    boolean;
  begin
    select ps.starts_at, ps.ends_at, ps.is_off, true
      into v_p_ini, v_p_fim, v_p_off, v_tem
      from professional_schedules ps
     where ps.professional_id = p_professional and ps.weekday = v_weekday;

    if coalesce(v_tem, false) then
      if coalesce(v_p_off, false) then
        return;  -- folga fixa desse profissional
      end if;
      -- A jornada individual aperta a janela, nunca amplia além da loja.
      v_abre  := greatest(v_abre, coalesce(v_p_ini, v_abre));
      v_fecha := least(v_fecha, coalesce(v_p_fim, v_fecha));
    end if;
  end;

  if v_abre >= v_fecha then
    return;
  end if;

  -- Monta a janela do dia no fuso do Brasil. Nunca calcule "hoje" no cliente.
  v_inicio := (p_dia + v_abre)  at time zone v_fuso;
  v_fim    := (p_dia + v_fecha) at time zone v_fuso;

  v_cursor := v_inicio;

  while v_cursor + v_duracao <= v_fim loop
    if
      -- 5. antecedência mínima
      v_cursor >= now() + make_interval(mins => v_min_advance)

      -- 3. não pega o almoço
      and not (
        v_almoco_ini is not null and v_almoco_fim is not null
        and tstzrange(v_cursor, v_cursor + v_duracao)
            && tstzrange((p_dia + v_almoco_ini) at time zone v_fuso,
                         (p_dia + v_almoco_fim) at time zone v_fuso)
      )

      -- 4. não cai em folga da loja nem do profissional
      and not exists (
        select 1 from time_off t
         where t.barbershop_id = v_shop
           and (t.professional_id is null or t.professional_id = p_professional)
           and tstzrange(t.starts_at, t.ends_at) && tstzrange(v_cursor, v_cursor + v_duracao)
      )

      -- 6. não colide com agendamento existente
      and not exists (
        select 1 from appointments a
         where a.professional_id = p_professional
           and a.status in ('scheduled', 'confirmed')
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_cursor + v_duracao)
      )
    then
      slot := v_cursor;
      return next;
    end if;

    v_cursor := v_cursor + v_passo;
  end loop;

  return;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Agenda um atendimento.
--
-- Cria ou REAPROVEITA a ficha do cliente casando pelo telefone dentro daquela
-- barbearia. Calcula ends_at e total_price a partir dos serviços escolhidos,
-- congelando preço e duração em appointment_services.
--
-- Dá para agendar sem conta: basta nome e telefone (p_profile nulo).
--
-- Não tenta checar colisão no código: a constraint appointments_no_overlap
-- resolve no banco. A aplicação só captura o erro e pede outro horário.
-- ---------------------------------------------------------------------------
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
begin
  if p_shop is null or p_professional is null or p_quando is null then
    raise exception 'Dados do agendamento incompletos.';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.';
  end if;

  select b.is_active, b.accepts_online_booking, b.min_advance_minutes, b.max_advance_days
    into v_shop_ok, v_online, v_min_advance, v_max_days
    from barbershops b
   where b.id = p_shop;

  if not coalesce(v_shop_ok, false) then
    raise exception 'Esta barbearia não está disponível.';
  end if;

  -- O bloqueio de agendamento online não vale para quem opera o painel.
  if p_source = 'online' and not coalesce(v_online, false) then
    raise exception 'Esta barbearia não está aceitando agendamento online no momento.';
  end if;

  if p_source = 'online' then
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

  -- --- A ficha do cliente ---------------------------------------------------
  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');

  if p_profile is not null then
    select coalesce(nullif(btrim(p_nome), ''), pf.full_name),
           coalesce(nullif(v_telefone, ''), regexp_replace(coalesce(pf.phone, ''), '\D', '', 'g'))
      into v_nome, v_telefone
      from profiles pf
     where pf.id = p_profile;
  else
    v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  end if;

  if v_nome is null or v_telefone is null or v_telefone = '' then
    raise exception 'Informe nome e telefone para agendar.';
  end if;

  -- Casa pelo telefone dentro desta barbearia. Achou, reaproveita.
  select c.id into v_customer
    from customers c
   where c.barbershop_id = p_shop and c.phone = v_telefone;

  if v_customer is null then
    insert into customers (barbershop_id, profile_id, full_name, phone)
    values (p_shop, p_profile, v_nome, v_telefone)
    returning id into v_customer;
  elsif p_profile is not null then
    -- Ficha que o dono tinha cadastrado na mão: agora ganhou dono de verdade.
    update customers
       set profile_id = coalesce(profile_id, p_profile)
     where id = v_customer;
  end if;

  -- --- O agendamento --------------------------------------------------------
  insert into appointments (
    barbershop_id, professional_id, customer_id, dependent_id,
    starts_at, ends_at, status, total_price, notes, source, created_by
  ) values (
    p_shop, p_professional, v_customer, p_dependent,
    p_quando, p_quando + make_interval(mins => v_duracao),
    'scheduled', v_total, nullif(btrim(coalesce(p_obs, '')), ''), p_source, p_profile
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


-- ---------------------------------------------------------------------------
-- CONCLUI O ATENDIMENTO — a operação mais delicada do sistema.
--
-- Faz tudo numa transação só:
--   1. valida que a soma dos pagamentos bate com total_price - desconto
--   2. marca como concluído
--   3. lança cada forma de pagamento no caixa
--   4. cria a dívida se houver fiado
--   5. gera a comissão do profissional
--   6. atualiza total_visits / total_spent / last_visit_at do cliente
--   7. cria a notificação pedindo avaliação
--
-- Formato de p_pagamentos:
--   [{"method":"pix","amount":40.00},{"method":"fiado","amount":20.00}]
--
-- Um erro aqui vira dinheiro errado no caixa. Por isso a soma é conferida
-- antes de qualquer escrita.
-- ---------------------------------------------------------------------------
create or replace function complete_appointment(
  p_appointment uuid,
  p_pagamentos  jsonb,
  p_desconto    numeric default 0,
  p_vencimento  date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_prof      uuid;
  v_customer  uuid;
  v_status    appointment_status;
  v_total     numeric(10, 2);
  v_desconto  numeric(10, 2) := round(coalesce(p_desconto, 0)::numeric, 2);
  v_liquido   numeric(10, 2);
  v_soma      numeric(10, 2) := 0;
  v_fiado     numeric(10, 2) := 0;
  v_percent   numeric(5, 2);
  v_comissao  numeric(12, 2);
  v_profile   uuid;
  v_shop_nome text;
  pgto        jsonb;
  v_metodo    payment_method;
  v_valor     numeric(12, 2);
begin
  -- Trava a linha: dois cliques no botão "Concluir" não podem lançar duas vezes.
  select a.barbershop_id, a.professional_id, a.customer_id, a.status, a.total_price
    into v_shop, v_prof, v_customer, v_status, v_total
    from appointments a
   where a.id = p_appointment
     for update;

  if v_shop is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  -- SECURITY DEFINER ignora RLS: a permissão precisa ser conferida aqui.
  if not has_shop_access(v_shop) then
    raise exception 'Você não tem permissão para concluir este atendimento.';
  end if;

  if v_status = 'completed' then
    raise exception 'Este atendimento já foi concluído.';
  end if;

  if v_status in ('cancelled', 'no_show') then
    raise exception 'Este atendimento foi cancelado e não pode ser concluído.';
  end if;

  if v_desconto > v_total then
    raise exception 'O desconto não pode ser maior que o total do atendimento.';
  end if;

  v_liquido := round(v_total - v_desconto, 2);

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Informe como o cliente pagou.';
  end if;

  -- 1. A soma tem que bater ANTES de escrever qualquer coisa.
  for pgto in select * from jsonb_array_elements(p_pagamentos) loop
    v_valor := round(coalesce((pgto ->> 'amount')::numeric, 0), 2);
    if v_valor <= 0 then
      raise exception 'Todo pagamento precisa ter valor maior que zero.';
    end if;
    v_soma := v_soma + v_valor;
    if (pgto ->> 'method') = 'fiado' then
      v_fiado := v_fiado + v_valor;
    end if;
  end loop;

  if v_soma <> v_liquido then
    raise exception
      'A soma dos pagamentos (R$ %) não bate com o total do atendimento (R$ %).',
      to_char(v_soma, 'FM999999990.00'), to_char(v_liquido, 'FM999999990.00');
  end if;

  if v_fiado > 0 and p_vencimento is null then
    raise exception 'Informe a data de vencimento do fiado.';
  end if;

  -- 2. Conclui.
  update appointments
     set status = 'completed',
         completed_at = now(),
         discount = v_desconto
   where id = p_appointment;

  -- 3 e 4. Cada forma de pagamento vira caixa; o fiado vira dívida.
  for pgto in select * from jsonb_array_elements(p_pagamentos) loop
    v_metodo := (pgto ->> 'method')::payment_method;
    v_valor  := round(coalesce((pgto ->> 'amount')::numeric, 0), 2);

    if v_metodo = 'fiado' then
      insert into debts (
        barbershop_id, customer_id, appointment_id,
        original_amount, paid_amount, status, due_date
      ) values (
        v_shop, v_customer, p_appointment,
        v_valor, 0, 'open', p_vencimento
      );
    else
      insert into transactions (
        barbershop_id, type, amount, payment_method,
        category, description, appointment_id, occurred_at, created_by
      ) values (
        v_shop, 'income', v_valor, v_metodo,
        'Atendimento', 'Atendimento concluído', p_appointment,
        (now() at time zone 'America/Sao_Paulo')::date, auth.uid()
      );
    end if;
  end loop;

  -- 5. Comissão sobre o valor líquido — o fiado também conta, porque o serviço
  --    foi prestado. O que muda é quando o dinheiro entra, não o que é devido.
  select pr.commission_percent into v_percent
    from professionals pr where pr.id = v_prof;

  if coalesce(v_percent, 0) > 0 then
    v_comissao := round(v_liquido * v_percent / 100, 2);

    insert into commissions (
      barbershop_id, professional_id, appointment_id,
      base_amount, percent, amount, status
    ) values (
      v_shop, v_prof, p_appointment,
      v_liquido, v_percent, v_comissao, 'pending'
    )
    on conflict (appointment_id) do nothing;
  end if;

  -- 6. Estatísticas da ficha do cliente.
  update customers
     set total_visits  = total_visits + 1,
         total_spent   = total_spent + v_liquido,
         last_visit_at = now()
   where id = v_customer;

  -- 7. Convite para avaliar — é o que alimenta a nota da barbearia.
  select c.profile_id into v_profile from customers c where c.id = v_customer;
  select b.name into v_shop_nome from barbershops b where b.id = v_shop;

  if v_profile is not null then
    insert into notifications (profile_id, type, title, body, link)
    values (
      v_profile, 'review',
      'Como foi seu atendimento?',
      'Conte como foi na ' || coalesce(v_shop_nome, 'barbearia') || '. Leva 10 segundos.',
      '/app/agendamentos'
    );
  end if;

  return p_appointment;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Cancela um atendimento.
--
-- Se quem cancelou foi o CLIENTE, respeita o cancel_deadline_hours da loja.
-- Quem opera o painel cancela a qualquer momento (cliente ligou, deu problema).
--
-- Depois de cancelar, avisa quem está na lista de espera daquele dia e período.
-- É isso que dá sentido à tela "Lista de espera".
-- ---------------------------------------------------------------------------
create or replace function cancel_appointment(
  p_appointment uuid,
  p_motivo      text default null,
  p_por_quem    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_inicio    timestamptz;
  v_status    appointment_status;
  v_customer  uuid;
  v_prazo     integer;
  v_dono_ficha uuid;
  v_e_equipe  boolean;
  v_periodo   text;
  v_dia       date;
  v_shop_nome text;
  v_hora      integer;
begin
  select a.barbershop_id, a.starts_at, a.status, a.customer_id
    into v_shop, v_inicio, v_status, v_customer
    from appointments a
   where a.id = p_appointment
     for update;

  if v_shop is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  if v_status in ('cancelled', 'completed', 'no_show') then
    raise exception 'Este atendimento não pode mais ser cancelado.';
  end if;

  v_e_equipe := has_shop_access(v_shop);
  select c.profile_id into v_dono_ficha from customers c where c.id = v_customer;

  -- Ou é da equipe da loja, ou é o próprio cliente.
  if not v_e_equipe and (v_dono_ficha is null or v_dono_ficha <> auth.uid()) then
    raise exception 'Você não tem permissão para cancelar este atendimento.';
  end if;

  if not v_e_equipe then
    select b.cancel_deadline_hours into v_prazo from barbershops b where b.id = v_shop;
    if now() > v_inicio - make_interval(hours => coalesce(v_prazo, 2)) then
      raise exception
        'O prazo para cancelar sozinho já passou (% horas antes). Fale com a barbearia.',
        coalesce(v_prazo, 2);
    end if;
  end if;

  update appointments
     set status = 'cancelled',
         cancel_reason = nullif(btrim(coalesce(p_motivo, '')), ''),
         cancelled_by = coalesce(p_por_quem, auth.uid())
   where id = p_appointment;

  -- --- Avisa a lista de espera ---------------------------------------------
  v_dia  := (v_inicio at time zone 'America/Sao_Paulo')::date;
  v_hora := extract(hour from (v_inicio at time zone 'America/Sao_Paulo'))::integer;

  v_periodo := case
    when v_hora < 12 then 'morning'
    when v_hora < 18 then 'afternoon'
    else 'evening'
  end;

  select b.name into v_shop_nome from barbershops b where b.id = v_shop;

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

  return p_appointment;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Marca falta e incrementa o contador na ficha do cliente.
-- ---------------------------------------------------------------------------
create or replace function mark_no_show(p_appointment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop     uuid;
  v_customer uuid;
  v_status   appointment_status;
begin
  select a.barbershop_id, a.customer_id, a.status
    into v_shop, v_customer, v_status
    from appointments a
   where a.id = p_appointment
     for update;

  if v_shop is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  if not has_shop_access(v_shop) then
    raise exception 'Você não tem permissão para alterar este atendimento.';
  end if;

  if v_status in ('completed', 'cancelled', 'no_show') then
    raise exception 'Este atendimento não pode ser marcado como falta.';
  end if;

  update appointments set status = 'no_show' where id = p_appointment;
  update customers set no_show_count = no_show_count + 1 where id = v_customer;

  return p_appointment;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Recebe (parte de) um fiado: registra o pagamento, lança no caixa e
-- recalcula o status da dívida.
-- ---------------------------------------------------------------------------
create or replace function pay_debt(
  p_debt  uuid,
  p_valor numeric,
  p_forma payment_method default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_original  numeric(12, 2);
  v_pago      numeric(12, 2);
  v_restante  numeric(12, 2);
  v_valor     numeric(12, 2) := round(coalesce(p_valor, 0), 2);
  v_customer  uuid;
  v_nome      text;
begin
  select d.barbershop_id, d.original_amount, d.paid_amount, d.customer_id
    into v_shop, v_original, v_pago, v_customer
    from debts d
   where d.id = p_debt
     for update;

  if v_shop is null then
    raise exception 'Dívida não encontrada.';
  end if;

  -- Receber fiado é operacional: o assistente precisa poder cobrar no balcão.
  if not has_shop_access(v_shop) then
    raise exception 'Você não tem permissão para receber esta dívida.';
  end if;

  if p_forma = 'fiado' then
    raise exception 'Não dá para pagar um fiado com outro fiado.';
  end if;

  if v_valor <= 0 then
    raise exception 'O valor recebido precisa ser maior que zero.';
  end if;

  v_restante := round(v_original - v_pago, 2);

  if v_restante <= 0 then
    raise exception 'Esta dívida já está quitada.';
  end if;

  if v_valor > v_restante then
    raise exception 'O valor é maior que o saldo devedor (R$ %).',
      to_char(v_restante, 'FM999999990.00');
  end if;

  insert into debt_payments (debt_id, amount, payment_method, created_by)
  values (p_debt, v_valor, p_forma, auth.uid());

  update debts
     set paid_amount = round(paid_amount + v_valor, 2),
         status = case
           when round(paid_amount + v_valor, 2) >= original_amount then 'paid'::debt_status
           else 'partial'::debt_status
         end
   where id = p_debt;

  select c.full_name into v_nome from customers c where c.id = v_customer;

  insert into transactions (
    barbershop_id, type, amount, payment_method,
    category, description, occurred_at, created_by
  ) values (
    v_shop, 'income', v_valor, p_forma,
    'Fiado', 'Recebimento de fiado — ' || coalesce(v_nome, 'cliente'),
    (now() at time zone 'America/Sao_Paulo')::date, auth.uid()
  );

  return p_debt;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Entra na lista de espera, sem duplicar.
-- ---------------------------------------------------------------------------
create or replace function join_waitlist(
  p_shop         uuid,
  p_professional uuid default null,
  p_service      uuid default null,
  p_dia          date default null,
  p_periodo      text default 'any'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id      uuid;
  v_periodo text := coalesce(nullif(btrim(p_periodo), ''), 'any');
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para usar a lista de espera.';
  end if;

  if p_shop is null or p_dia is null then
    raise exception 'Informe a barbearia e o dia.';
  end if;

  if v_periodo not in ('morning', 'afternoon', 'evening', 'any') then
    raise exception 'Período inválido.';
  end if;

  -- Já está esperando esse dia e período? Devolve a entrada existente.
  select w.id into v_id
    from waitlist_entries w
   where w.barbershop_id = p_shop
     and w.profile_id = auth.uid()
     and w.desired_date = p_dia
     and w.period = v_periodo
     and w.status in ('waiting', 'notified');

  if v_id is not null then
    return v_id;
  end if;

  insert into waitlist_entries (
    barbershop_id, profile_id, professional_id, service_id, desired_date, period, status
  ) values (
    p_shop, auth.uid(), p_professional, p_service, p_dia, v_periodo, 'waiting'
  )
  returning id into v_id;

  return v_id;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Resumo do painel.
--
-- Devolve os números operacionais para QUEM TEM ACESSO à loja, e os números de
-- DINHEIRO só para quem pode gerenciar dinheiro. O assistente chama a mesma
-- função e simplesmente não recebe as chaves financeiras — o dado não é
-- buscado, não é "escondido com CSS".
-- ---------------------------------------------------------------------------
create or replace function dashboard_summary(
  p_shop uuid,
  p_de   date default null,
  p_ate  date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_de       date := coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date);
  v_ate      date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
  v_dinheiro boolean;
  v_out      jsonb;
  v_receita  numeric(12, 2);
  v_despesa  numeric(12, 2);
  v_fiado    numeric(12, 2);
  v_qtd      integer;
  v_concl    integer;
  v_faltas   integer;
  v_pend     integer;
begin
  if not has_shop_access(p_shop) then
    raise exception 'Você não tem acesso a esta barbearia.';
  end if;

  v_dinheiro := can_manage_money(p_shop);

  select
    count(*) filter (where a.status <> 'cancelled'),
    count(*) filter (where a.status = 'completed'),
    count(*) filter (where a.status = 'no_show'),
    count(*) filter (where a.status in ('scheduled', 'confirmed'))
    into v_qtd, v_concl, v_faltas, v_pend
    from appointments a
   where a.barbershop_id = p_shop
     and (a.starts_at at time zone 'America/Sao_Paulo')::date between v_de and v_ate;

  v_out := jsonb_build_object(
    'de', v_de,
    'ate', v_ate,
    'atendimentos', coalesce(v_qtd, 0),
    'concluidos', coalesce(v_concl, 0),
    'faltas', coalesce(v_faltas, 0),
    'a_atender', coalesce(v_pend, 0),
    'taxa_falta', case when coalesce(v_qtd, 0) = 0 then 0
                       else round(v_faltas::numeric * 100 / v_qtd, 1) end,
    'pode_ver_dinheiro', v_dinheiro
  );

  if not v_dinheiro then
    return v_out;  -- assistente para por aqui
  end if;

  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
    into v_receita, v_despesa
    from transactions t
   where t.barbershop_id = p_shop
     and t.occurred_at between v_de and v_ate;

  select coalesce(sum(d.original_amount - d.paid_amount), 0)
    into v_fiado
    from debts d
   where d.barbershop_id = p_shop
     and d.status in ('open', 'partial');

  return v_out || jsonb_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'lucro', round(v_receita - v_despesa, 2),
    'ticket_medio', case when coalesce(v_concl, 0) = 0 then 0
                          else round(v_receita / v_concl, 2) end,
    'fiado_aberto', v_fiado
  );
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Série diária de faturamento para o gráfico. Só quem gerencia dinheiro.
-- generate_series garante o dia sem venda aparecendo como zero — sem isso o
-- gráfico "pula" a segunda-feira fechada e engana a leitura.
-- ---------------------------------------------------------------------------
create or replace function revenue_series(
  p_shop uuid,
  p_de   date,
  p_ate  date
)
returns table (dia date, receita numeric, despesa numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not can_manage_money(p_shop) then
    raise exception 'Você não tem acesso ao faturamento desta barbearia.';
  end if;

  return query
  select g::date as dia,
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric  as receita,
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)::numeric as despesa
    from generate_series(p_de, p_ate, interval '1 day') g
    left join transactions t
           on t.barbershop_id = p_shop
          and t.occurred_at = g::date
   group by g
   order by g;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Monta a home do app do cliente em UMA chamada:
-- último agendamento, os próximos, os últimos acessos e os favoritos.
-- ---------------------------------------------------------------------------
create or replace function client_home(p_profile uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_profile uuid := coalesce(p_profile, auth.uid());
begin
  if v_profile is null then
    raise exception 'Entre na sua conta.';
  end if;

  -- Ninguém monta a home de outra pessoa.
  if v_profile <> auth.uid() and not is_platform_admin() then
    raise exception 'Você não tem permissão para ver estes dados.';
  end if;

  return jsonb_build_object(
    'proximo', (
      select to_jsonb(x) from (
        select a.id, a.starts_at, a.status,
               b.name as shop_name, b.slug as shop_slug, b.logo_url,
               pr.name as professional_name,
               (select string_agg(s.name, ' + ' order by s.name)
                  from appointment_services aps
                  join services s on s.id = aps.service_id
                 where aps.appointment_id = a.id) as servicos
          from appointments a
          join customers c   on c.id = a.customer_id
          join barbershops b on b.id = a.barbershop_id
          join professionals pr on pr.id = a.professional_id
         where c.profile_id = v_profile
           and a.status in ('scheduled', 'confirmed')
           and a.starts_at >= now()
         order by a.starts_at asc
         limit 1
      ) x
    ),

    'proximos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
        select a.id, a.starts_at, a.status,
               b.name as shop_name, b.slug as shop_slug, b.logo_url,
               pr.name as professional_name
          from appointments a
          join customers c   on c.id = a.customer_id
          join barbershops b on b.id = a.barbershop_id
          join professionals pr on pr.id = a.professional_id
         where c.profile_id = v_profile
           and a.status in ('scheduled', 'confirmed')
           and a.starts_at >= now()
         order by a.starts_at asc
         offset 1 limit 5
      ) x
    ), '[]'::jsonb),

    'ultimos_acessos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_viewed_at desc) from (
        select b.id, b.name, b.slug, b.logo_url, b.rating_avg, b.rating_count,
               b.neighborhood, b.city, sv.last_viewed_at
          from shop_visits sv
          join barbershops b on b.id = sv.barbershop_id
         where sv.profile_id = v_profile
           and b.is_active
         order by sv.last_viewed_at desc
         limit 5
      ) x
    ), '[]'::jsonb),

    'favoritos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select b.id, b.name, b.slug, b.logo_url, b.rating_avg, b.rating_count,
               b.neighborhood, b.city, f.created_at
          from favorites f
          join barbershops b on b.id = f.barbershop_id
         where f.profile_id = v_profile
           and b.is_active
         order by f.created_at desc
         limit 10
      ) x
    ), '[]'::jsonb),

    'nao_lidas', (
      select count(*) from notifications n
       where n.profile_id = v_profile and n.read_at is null
    )
  );
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Confirmação
-- ---------------------------------------------------------------------------
do $$
declare
  qtd integer;
begin
  select count(*) into qtd
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'handle_new_user','barbershop_after_insert','review_after_insert',
       'is_platform_admin','my_shop_id','has_shop_access','can_manage_money',
       'owns_customer','distancia_km','search_barbershops','get_available_slots',
       'book_appointment','complete_appointment','cancel_appointment',
       'mark_no_show','pay_debt','join_waitlist','dashboard_summary',
       'revenue_series','client_home'
     );
  raise notice '02_functions.sql concluído — % de 20 funções criadas.', qtd;
end $$;
