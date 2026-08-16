-- ============================================================================
-- PiBarber — 13_agendamento_avulso.sql   (ajuste nº 6)
--
-- ATENDIMENTO POR ORDEM DE CHEGADA — o cliente deixa de ser obrigatório.
--
-- ---------------------------------------------------------------------------
-- O problema
-- ---------------------------------------------------------------------------
-- Muita barbearia trabalha por ordem de chegada, não por horário marcado. O
-- sujeito entra pela porta, senta e é atendido. O barbeiro não vai parar a
-- máquina para cadastrar nome e telefone de quem já está na cadeira.
--
-- Hoje `book_appointment` EXIGE nome e telefone, e `appointments.customer_id`
-- é `not null`. Registrar o atendimento custa mais tempo do que o corte.
--
-- ---------------------------------------------------------------------------
-- A escolha de modelagem — e por que NÃO é `customer_id` nulo
-- ---------------------------------------------------------------------------
-- O caminho óbvio seria deixar `appointments.customer_id` aceitar NULL e criar
-- uma coluna de texto com o nome avulso. Ele foi descartado por três motivos
-- concretos:
--
--   1. FIADO. `debts.customer_id` é `not null`. Com o agendamento sem ficha, o
--      avulso não poderia pendurar — e "cliente sem cadastro que fica devendo"
--      é exatamente o caso que mais acontece no balcão.
--   2. TODA query com join em `customers` passaria a precisar de guarda de
--      nulo: agenda, tela Hoje, histórico, ficha, relatórios, comissão.
--   3. A aba Clientes (ajuste nº 8) teria que unir duas origens diferentes numa
--      view, com risco de listar a mesma pessoa duas vezes.
--
-- Em vez disso: o avulso É uma ficha em `customers`, só que sem telefone e
-- marcada com `is_walk_in`. `appointments.customer_id` continua `not null` e
-- NADA no resto do sistema precisa mudar. Quando o barbeiro quiser, ele abre a
-- ficha, preenche telefone e a mesma linha vira um cliente normal — sem
-- migração, sem perder o histórico que ela já acumulou.
--
-- ---------------------------------------------------------------------------
-- O contador "Cliente 1, Cliente 2, Cliente 3…"
-- ---------------------------------------------------------------------------
-- É POR BARBEARIA, não por profissional. A agenda e a lista de clientes são
-- compartilhadas pela loja inteira: dois "Cliente 3" no mesmo dia, em cadeiras
-- diferentes, viram confusão na hora de cobrar.
--
-- Reinicia todo dia, no fuso de São Paulo.
--
-- Contra colisão (dois barbeiros salvando no mesmo segundo) NÃO é usado
-- `count(*) + 1`, que daria o mesmo número para os dois. É uma tabela de
-- contador com `on conflict do update … returning`, que o Postgres resolve
-- serializando as duas transações na mesma linha. Simples e sem race.
--
-- ---------------------------------------------------------------------------
-- A assinatura de `book_appointment` NÃO muda
-- ---------------------------------------------------------------------------
-- De propósito. Acrescentar um parâmetro obrigaria a `drop function` + `create`
-- + refazer todos os grants, e deixaria a função fora do ar entre as duas
-- operações. Em vez disso, o significado de "sem telefone" foi definido:
--
--   quem opera o painel + sem telefone = atendimento avulso, o banco batiza.
--
-- Para o público (`anon`, agendamento online) nada muda: sem telefone continua
-- sendo erro, como sempre foi.
--
-- ⚠️ Esta função parte do corpo do **11_book_appointment_autorizacao.sql**, e
-- não do 02. As travas C-1 (só a equipe usa `source = 'manual'`) e C-2 (ninguém
-- agenda em nome de outra pessoa; ficha com histórico não muda de titular)
-- estão preservadas — o portão no fim do arquivo confere isso.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   -- 1. volta a função:  reaplique o 11_book_appointment_autorizacao.sql
--   -- 2. volta o schema:
--   update customers set phone = 'SEM-' || left(id::text, 8) where phone is null;
--   drop index if exists customers_shop_phone_unico;
--   alter table customers add constraint customers_barbershop_id_phone_key
--     unique (barbershop_id, phone);
--   alter table customers alter column phone set not null;
--   alter table customers drop column is_walk_in;
--   drop table walk_in_counters;
--   drop function if exists next_walk_in_number(uuid);
--   drop function if exists proximo_nome_avulso(uuid);
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — SCHEMA
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1.1 O telefone deixa de ser obrigatório.
--
-- Ele continua sendo a chave que reaproveita a ficha de quem já veio antes —
-- só deixa de ser exigência para registrar o atendimento.
-- ---------------------------------------------------------------------------
alter table customers alter column phone drop not null;


-- ---------------------------------------------------------------------------
-- 1.2 A unicidade vira PARCIAL.
--
-- `unique (barbershop_id, phone)` com telefone nulo não serviria: no Postgres
-- NULL nunca é igual a NULL, então dez avulsos passariam pela constraint por
-- acidente, não por regra. Um índice único parcial diz a regra de verdade:
-- dois clientes COM telefone não podem repetir o número; sem telefone, não há
-- o que comparar.
--
-- É esta unicidade que faz `book_appointment` reaproveitar a ficha certa.
-- ---------------------------------------------------------------------------
alter table customers drop constraint if exists customers_barbershop_id_phone_key;

create unique index if not exists customers_shop_phone_unico
  on customers (barbershop_id, phone)
  where phone is not null;


-- ---------------------------------------------------------------------------
-- 1.3 A marca de "entrou pela porta".
--
-- Sem ela não dá para distinguir, na aba Clientes, o avulso de hoje de um
-- cliente que o barbeiro cadastrou na mão e ainda não pediu o telefone.
-- ---------------------------------------------------------------------------
alter table customers add column if not exists is_walk_in boolean not null default false;


-- ---------------------------------------------------------------------------
-- 1.3.1 A INVARIANTE que faz o resto funcionar:
--
--     ficha NÃO avulsa  ⟹  ficha COM telefone
--
-- Por que isso importa: `book_appointment` reaproveita a ficha casando pelo
-- TELEFONE. Uma ficha comum sem telefone seria um beco sem saída — apareceria
-- na busca do novo agendamento, o barbeiro a escolheria, e o banco criaria uma
-- SEGUNDA ficha porque não teria como casar a primeira. Dois cadastros da mesma
-- pessoa, histórico partido ao meio.
--
-- Com a constraint, esse estado deixa de existir: ou a ficha tem telefone, ou
-- ela é avulsa (e avulsa fica fora da busca justamente por não ser reutilizável).
-- ---------------------------------------------------------------------------
do $$ begin
  alter table customers add constraint customers_avulso_sem_telefone
    check (is_walk_in or phone is not null);
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 1.4 O contador do dia.
--
-- Uma linha por barbearia por dia. Não guarda histórico e não precisa: o nome
-- já foi carimbado na ficha do cliente no momento da criação.
-- ---------------------------------------------------------------------------
create table if not exists walk_in_counters (
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  -- O dia no fuso de São Paulo, nunca em UTC: às 22h de Brasília o UTC já
  -- virou o dia seguinte, e o contador reiniciaria no meio do expediente.
  dia           date not null,
  ultimo        integer not null default 0,
  primary key (barbershop_id, dia)
);

alter table walk_in_counters enable row level security;

-- Leitura para quem opera a loja (a tela mostra o próximo número sugerido).
-- Escrita ninguém faz direto: quem incrementa é a função SECURITY DEFINER.
drop policy if exists walk_in_counters_select on walk_in_counters;
create policy walk_in_counters_select on walk_in_counters
  for select to authenticated
  using (has_shop_access(barbershop_id));

-- ⚠️ O GRANT NÃO VEM DE GRAÇA. O `grant select … on all tables` do 03_rls.sql
-- roda uma vez e vale para as tabelas que existiam NAQUELE momento — tabela
-- criada depois nasce sem permissão nenhuma. Sem a linha abaixo, a policy
-- acima seria irrelevante: o Postgres recusa antes de chegar a avaliá-la.
--
-- Só `select`: escrever aqui é trabalho da função, que é SECURITY DEFINER e
-- não depende da permissão de quem a chamou. Conceder insert/update ao usuário
-- abriria a porta para alguém carimbar o contador na mão.
grant select on walk_in_counters to authenticated;


-- ###########################################################################
-- PARTE 2 — FUNÇÕES DO CONTADOR
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 2.1 Pega o próximo número E o consome. Atômico.
--
-- `on conflict do update … returning` faz o Postgres travar a linha do dia:
-- duas transações simultâneas saem com números diferentes, sem gap e sem
-- duplicata. É a razão de existir a tabela em vez de um `count(*) + 1`.
--
-- SEM GRANT de propósito: ninguém chama de fora. Ela é usada por dentro do
-- `book_appointment`, que é SECURITY DEFINER e por isso não precisa de
-- permissão do usuário que disparou.
-- ---------------------------------------------------------------------------
create or replace function next_walk_in_number(p_shop uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n   integer;
begin
  insert into walk_in_counters (barbershop_id, dia, ultimo)
  values (p_shop, v_dia, 1)
  on conflict (barbershop_id, dia)
  do update set ultimo = walk_in_counters.ultimo + 1
  returning ultimo into v_n;

  return v_n;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- 2.2 Espia o próximo nome SEM consumir — é o que a tela mostra pré-preenchido.
--
-- Pode divergir do número final se alguém salvar entre a abertura do formulário
-- e o toque em "Agendar". É por isso que a tela manda o nome VAZIO quando o
-- barbeiro não editou a sugestão: aí quem carimba é o banco, na hora, e o
-- número nunca sai duplicado.
-- ---------------------------------------------------------------------------
create or replace function proximo_nome_avulso(p_shop uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n   integer;
begin
  if not has_shop_access(p_shop) then
    raise exception 'Você não tem acesso a esta barbearia.';
  end if;

  select ultimo into v_n
    from walk_in_counters
   where barbershop_id = p_shop and dia = v_dia;

  return 'Cliente ' || (coalesce(v_n, 0) + 1);
end;
$fn$;

revoke execute on function next_walk_in_number(uuid) from public, anon, authenticated;
revoke execute on function proximo_nome_avulso(uuid) from public, anon;
grant execute on function proximo_nome_avulso(uuid) to authenticated;


-- ###########################################################################
-- PARTE 3 — book_appointment
--
-- Base: 11_book_appointment_autorizacao.sql. As travas C-1 e C-2 continuam
-- palavra por palavra. O que muda são os dois blocos marcados com "nº 6".
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

-- A assinatura não mudou, então os grants continuam valendo. Reafirmados por
-- garantia, como no arquivo 11.
revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) from public;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Portão: confere o que entrou E o que NÃO PODE ter saído.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  -- Schema
  if exists (
    select 1 from information_schema.columns
     where table_name = 'customers' and column_name = 'phone' and is_nullable = 'NO'
  ) then
    raise exception 'customers.phone continua NOT NULL.';
  end if;

  if not exists (select 1 from pg_indexes where indexname = 'customers_shop_phone_unico') then
    raise exception 'O índice único parcial do telefone não foi criado.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_name = 'customers' and column_name = 'is_walk_in'
  ) then
    raise exception 'A coluna customers.is_walk_in não existe.';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customers_avulso_sem_telefone'
  ) then
    raise exception 'A invariante "ficha não avulsa tem telefone" não foi criada.';
  end if;

  if not exists (select 1 from pg_tables where tablename = 'walk_in_counters') then
    raise exception 'A tabela walk_in_counters não existe.';
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
     where table_name = 'walk_in_counters'
       and grantee = 'authenticated'
       and privilege_type = 'SELECT'
  ) then
    raise exception 'Falta o grant de select em walk_in_counters — a tela não leria o contador.';
  end if;

  -- Função
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'book_appointment';

  if v_corpo is null then
    raise exception 'book_appointment sumiu.';
  end if;

  -- O que ENTROU agora
  if v_corpo not like '%next_walk_in_number%' then
    raise exception 'nº 6 NÃO aplicado: a função não batiza o cliente avulso.';
  end if;

  -- O que NÃO PODE ter saído — as travas do arquivo 11
  if v_corpo not like '%has_shop_access(p_shop)%' then
    raise exception 'REGRESSÃO: a trava C-1 do arquivo 11 sumiu.';
  end if;
  if v_corpo not like '%não pode agendar em nome de outra pessoa%' then
    raise exception 'REGRESSÃO: a trava C-2 do arquivo 11 sumiu.';
  end if;
  if v_corpo not like '%v_historico%' then
    raise exception 'REGRESSÃO: a camada 2 da C-2 do arquivo 11 sumiu.';
  end if;

  raise notice '13 aplicada — atendimento por ordem de chegada, com as travas do 11 intactas.';
end $$;
