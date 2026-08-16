-- ============================================================================
-- PiBarber — 19_agendamento_de_quem_criou.sql
--
-- QUEM CRIOU O AGENDAMENTO ENXERGA O AGENDAMENTO.
--
-- ---------------------------------------------------------------------------
-- O bug, e por que ele NÃO é a trava C-2
-- ---------------------------------------------------------------------------
-- Cenário real, reproduzido em produção:
--
--   1. A pessoa tem uma conta antiga e é dona da ficha (`customers`) daquela
--      barbearia — a ficha casa pelo TELEFONE.
--   2. Ela cria uma conta NOVA (pelo Google, com outro e-mail).
--   3. Agenda pela conta nova, informando o MESMO telefone.
--   4. `book_appointment` casa a ficha pelo telefone, vê que ela já tem dono e
--      — corretamente — recusa trocar o titular (trava C-2 do arquivo 11).
--   5. O agendamento nasce preso à ficha da conta ANTIGA.
--   6. "Meus Agendamentos" da conta nova aparece VAZIO.
--
-- A tela disse "Agendado!". O horário existe, está na agenda da barbearia, e a
-- pessoa não tem como vê-lo nem cancelá-lo. Some sem explicação.
--
-- ⚠️ A C-2 NÃO É O PROBLEMA E NÃO É AFROUXADA AQUI.
--
-- Ela existe porque, sem ela, qualquer um que saiba o seu telefone criaria uma
-- conta, agendaria com ele e ABSORVERIA a sua ficha — histórico, visitas,
-- fiado. Trocar o titular de uma ficha com histórico continua proibido, e o
-- portão no fim deste arquivo confere isso.
--
-- ---------------------------------------------------------------------------
-- A correção: `created_by`
-- ---------------------------------------------------------------------------
-- Até aqui, "este agendamento é meu?" tinha UMA resposta: `owns_customer()`,
-- ou seja, sou o dono da ficha. Passa a ter duas:
--
--   sou o dono da ficha  OU  fui EU quem marcou
--
-- `appointments.created_by` já existe desde o 01_schema.sql e já é preenchido
-- por `book_appointment` com o perfil de quem agendou. O dado sempre esteve
-- lá — ninguém perguntava por ele.
--
-- POR QUE ISSO É SEGURO:
--   · `created_by` não é escolhido pelo chamador. Em `book_appointment` ele
--     recebe `v_profile`, que a trava C-2 já garante ser `auth.uid()` para
--     quem não é da equipe ("Você não pode agendar em nome de outra pessoa").
--   · Inserção direta em `appointments` exige `has_shop_access` pela policy
--     `appointments_insert` — o cliente não escreve nessa tabela.
--   · Ver o que você mesmo marcou não revela nada de terceiros: os campos da
--     ficha continuam fora do alcance do cliente (`customers` segue fechada).
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   -- policies: reaplique as seções APPOINTMENTS, APPOINTMENT_SERVICES e
--   --           REVIEWS do 03_rls.sql
--   -- funções:  reaplique client_home e cancel_appointment do 02_functions.sql
--   drop index if exists appointments_created_by_idx;
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — O ÍNDICE
--
-- A consulta do app do cliente não tem filtro próprio: ela pede
-- `select * from appointments` e deixa a RLS recortar. Com mais um `or` na
-- policy, sem índice, isso vira varredura na tabela que mais cresce.
--
-- Parcial: agendamento criado pelo painel sem usuário tem `created_by` nulo, e
-- essas linhas nunca são resposta desta pergunta.
-- ###########################################################################

create index if not exists appointments_created_by_idx
  on appointments (created_by)
  where created_by is not null;


-- ###########################################################################
-- PARTE 2 — AS POLICIES
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Ver o próprio agendamento.
-- ---------------------------------------------------------------------------
drop policy if exists appointments_select on appointments;
create policy appointments_select on appointments
  for select to authenticated
  using (
    has_shop_access(barbershop_id)
    or owns_customer(customer_id)   -- sou o dono da ficha
    or created_by = auth.uid()      -- ou fui eu quem marcou
  );

-- ---------------------------------------------------------------------------
-- Os serviços daquele agendamento seguem o mesmo acesso.
--
-- Sem esta linha o agendamento apareceria na lista SEM o nome do serviço —
-- "Atendimento" genérico, porque o join a `appointment_services` voltaria
-- vazio. Meia correção é pior: parece bug novo.
-- ---------------------------------------------------------------------------
drop policy if exists appointment_services_select on appointment_services;
create policy appointment_services_select on appointment_services
  for select to authenticated
  using (exists (
    select 1 from appointments a
     where a.id = appointment_id
       and (
         has_shop_access(a.barbershop_id)
         or owns_customer(a.customer_id)
         or a.created_by = auth.uid()
       )
  ));

-- ---------------------------------------------------------------------------
-- Avaliar o atendimento que eu marquei.
--
-- Pela mesma razão: poder VER um atendimento concluído e não poder avaliá-lo
-- seria uma inconsistência nova, criada por este arquivo. As duas outras
-- condições continuam de pé — a avaliação exige atendimento CONCLUÍDO, e
-- `reviews.appointment_id` é único, então continua sendo uma por atendimento.
-- ---------------------------------------------------------------------------
drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from appointments a
        left join customers c on c.id = a.customer_id
       where a.id = appointment_id
         and a.status = 'completed'
         and (c.profile_id = auth.uid() or a.created_by = auth.uid())
    )
  );


-- ###########################################################################
-- PARTE 3 — client_home
--
-- Base: 02_functions.sql (não há versão posterior desta função).
--
-- Ela é SECURITY DEFINER, então IGNORA a RLS e filtra na mão. Corrigir só a
-- policy deixaria a tela "Meus Agendamentos" certa e a HOME ainda errada — o
-- cartão "Seu próximo horário" continuaria vazio.
--
-- Muda só o filtro dos dois primeiros blocos: `c.profile_id = v_profile` vira
-- `(c.profile_id = v_profile or a.created_by = v_profile)`.
-- ###########################################################################

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
         where (c.profile_id = v_profile or a.created_by = v_profile)
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
         where (c.profile_id = v_profile or a.created_by = v_profile)
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


-- ###########################################################################
-- PARTE 4 — cancel_appointment
--
-- Base: 02_functions.sql.
--
-- Ver e não poder cancelar seria a pior das combinações: a pessoa encontra o
-- horário, aperta "Cancelar" e leva "Você não tem permissão" no próprio
-- agendamento. O prazo da loja (`cancel_deadline_hours`) continua valendo
-- igual — quem marcou não ganha regra melhor por isso.
-- ###########################################################################

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
  v_shop       uuid;
  v_inicio     timestamptz;
  v_status     appointment_status;
  v_customer   uuid;
  v_prazo      integer;
  v_dono_ficha uuid;
  v_criador    uuid;   -- nº 19
  v_e_equipe   boolean;
  v_periodo    text;
  v_dia        date;
  v_shop_nome  text;
  v_hora       integer;
begin
  select a.barbershop_id, a.starts_at, a.status, a.customer_id, a.created_by
    into v_shop, v_inicio, v_status, v_customer, v_criador
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

  -- Ou é da equipe da loja, ou é o dono da ficha, ou foi quem marcou (nº 19).
  if not v_e_equipe
     and (v_dono_ficha is null or v_dono_ficha <> auth.uid())
     and (v_criador is null or v_criador <> auth.uid()) then
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
-- Portão: confere o que entrou E, sobretudo, o que NÃO PODE ter saído.
-- ---------------------------------------------------------------------------
do $$
declare
  v_policy text;
  v_corpo  text;
begin
  -- 1. A policy enxerga quem criou?
  select qual into v_policy
    from pg_policies
   where schemaname = 'public' and tablename = 'appointments' and policyname = 'appointments_select';

  if v_policy is null then
    raise exception 'A policy appointments_select sumiu — a agenda ficaria invisível para todo mundo.';
  end if;
  if v_policy not like '%created_by%' then
    raise exception 'nº 19 NÃO aplicado: appointments_select ainda não considera quem criou.';
  end if;
  -- As duas condições antigas continuam de pé?
  if v_policy not like '%has_shop_access%' or v_policy not like '%owns_customer%' then
    raise exception 'REGRESSÃO: appointments_select perdeu has_shop_access ou owns_customer.';
  end if;

  -- 2. client_home enxerga quem criou?
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'client_home';

  if v_corpo is null or v_corpo not like '%a.created_by = v_profile%' then
    raise exception 'nº 19 NÃO aplicado em client_home: a home continuaria sem o horário.';
  end if;

  -- 3. cancel_appointment deixa quem criou cancelar — E mantém o prazo da loja.
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_appointment';

  if v_corpo is null or v_corpo not like '%v_criador%' then
    raise exception 'nº 19 NÃO aplicado em cancel_appointment.';
  end if;
  if v_corpo not like '%cancel_deadline_hours%' then
    raise exception 'REGRESSÃO: cancel_appointment perdeu o prazo de cancelamento da loja.';
  end if;

  -- 4. ⚠️ A TRAVA C-2 CONTINUA INTEIRA.
  --
  -- É o ponto mais importante deste portão. Este arquivo NÃO afrouxa a regra de
  -- titularidade de ficha, e se alguém a remover "aproveitando a viagem", a
  -- migração precisa falhar em vez de deixar passar: sem ela, quem souber o seu
  -- telefone absorve a sua ficha inteira.
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'book_appointment';

  if v_corpo is null then
    raise exception 'book_appointment sumiu.';
  end if;
  if v_corpo not like '%não pode agendar em nome de outra pessoa%' then
    raise exception 'REGRESSÃO: a trava C-2 (ninguém agenda por outro) sumiu de book_appointment.';
  end if;
  if v_corpo not like '%v_historico%' then
    raise exception 'REGRESSÃO: a trava que impede tomar ficha com histórico sumiu de book_appointment.';
  end if;

  raise notice '19 aplicada — quem marca enxerga e cancela o próprio horário, com a C-2 intacta.';
end $$;
