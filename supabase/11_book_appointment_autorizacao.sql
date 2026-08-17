-- ============================================================================
-- PiBarber — 11_book_appointment_autorizacao.sql   (T-8, achados C-1 e C-2)
--
-- `book_appointment` é SECURITY DEFINER e está concedida a `anon` — tem que
-- estar, é ela que faz o agendamento público de /b/[slug]/agendar funcionar sem
-- conta. O que faltava era a função conferir QUEM está chamando. Ela validava
-- loja ativa, profissional da loja e serviço da loja, e confiava em dois
-- argumentos que o chamador escolhe: `p_source` e `p_profile`.
--
-- ---------------------------------------------------------------------------
-- C-1 — `p_source => 'manual'` pulava TODAS as regras da loja
-- ---------------------------------------------------------------------------
-- As três checagens de regra (antecedência mínima, janela máxima e
-- `accepts_online_booking`) só rodavam no ramo `'online'`. Trocar uma palavra
-- desligava as três. Provado na auditoria, com a CHAVE ANÔNIMA:
--
--   anon · online · daqui a 5 min    → 400 "exige pelo menos 60 minutos"
--   anon · MANUAL · daqui a 5 min    → 200, agendado
--   anon · MANUAL · daqui a 400 dias → 200, agendado
--   anon · MANUAL · ONTEM            → 200, agendado
--
-- Correção: `'manual'` agora exige `has_shop_access(p_shop)` — é o que
-- significa "alguém atrás do balcão". Quem não tem é rebaixado para `'online'`
-- em silêncio, e passa a responder pelas regras da loja. Rebaixar em vez de
-- levantar exceção é de propósito: o caminho legítimo (o público) não muda de
-- comportamento, e o ataque simplesmente deixa de existir.
--
-- ---------------------------------------------------------------------------
-- C-2 — `p_profile` deixava ADOTAR a ficha de um cliente alheio
-- ---------------------------------------------------------------------------
-- `p_profile` nunca era conferido contra `auth.uid()`, e a linha
--
--   update customers set profile_id = coalesce(profile_id, p_profile)
--
-- carimbava o chamador como titular de QUALQUER ficha com `profile_id` nulo,
-- bastando saber o telefone. Como `owns_customer()` é o que abre
-- `appointments` e `debts` na RLS, isso é leitura do histórico alheio.
-- Provado na auditoria: um cliente sem relação nenhuma com a Barbearia do Tião
-- passou a enxergar 12 agendamentos onde enxergava 8, informando só o telefone
-- de um cliente da loja. 24 das 31 fichas do banco estão com `profile_id` nulo.
--
-- Correção, em duas camadas:
--   1. `p_profile` que não seja `auth.uid()` é recusado, salvo para quem tem
--      `has_shop_access` (o painel, que hoje nem passa o argumento).
--   2. a adoção só acontece em ficha SEM HISTÓRICO. Ficha com atendimento,
--      fiado ou visita registrada nunca troca de titular por telefone —
--      telefone não é verificado neste sistema (não há SMS), então ele não pode
--      ser a prova de que a pessoa é quem diz ser.
--
-- ⚠️ CONSEQUÊNCIA DE PRODUTO da camada 2, dita por inteiro: o cliente que já
-- foi atendido no balcão (ficha criada pelo barbeiro, com histórico) e só
-- depois cria conta no app AGENDA normalmente, mas o agendamento novo não
-- aparece em /app/agendamentos, porque a ficha não passa a ser dele. Vincular
-- ficha antiga a conta nova é fluxo de confirmação de identidade e não existe
-- hoje — está no AUDITORIA.md como item a decidir.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Reaplicar o bloco `create or replace function book_appointment(...)` do
-- `02_functions.sql` (linhas 468–604). Nada de schema muda aqui: só o corpo da
-- função. Não há coluna, tabela, índice ou grant novo, e nenhum dado é tocado.
-- ============================================================================

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
begin
  if p_shop is null or p_professional is null or p_quando is null then
    raise exception 'Dados do agendamento incompletos.';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.';
  end if;

  -- ==========================================================================
  -- QUEM ESTÁ CHAMANDO — a parte que faltava
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

  -- O dependente precisa ser de quem está agendando. Sem esta checagem dá para
  -- pendurar o filho de outra pessoa num atendimento — o nome dele apareceria
  -- na agenda de uma barbearia que aquela família não escolheu.
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
  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');

  if v_profile is not null then
    select coalesce(nullif(btrim(p_nome), ''), pf.full_name),
           coalesce(nullif(v_telefone, ''), regexp_replace(coalesce(pf.phone, ''), '\D', '', 'g'))
      into v_nome, v_telefone
      from profiles pf
     where pf.id = v_profile;
  else
    v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  end if;

  if v_nome is null or v_telefone is null or v_telefone = '' then
    raise exception 'Informe nome e telefone para agendar.';
  end if;

  -- Casa pelo telefone dentro desta barbearia. Achou, reaproveita.
  select c.id, c.profile_id into v_customer, v_tem_dono
    from customers c
   where c.barbershop_id = p_shop and c.phone = v_telefone;

  if v_customer is null then
    insert into customers (barbershop_id, profile_id, full_name, phone)
    values (p_shop, v_profile, v_nome, v_telefone)
    returning id into v_customer;

  elsif v_profile is not null and v_tem_dono is null then
    -- C-2, camada 2: só ficha SEM HISTÓRICO muda de titular. O telefone não é
    -- verificado neste sistema, então ele sozinho não prova identidade — e uma
    -- ficha com atendimento ou fiado é justamente a que vale a pena sequestrar.
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

-- A assinatura não mudou, então os grants do 03_rls.sql continuam valendo.
-- Reafirmados aqui porque `create or replace` de função já existente preserva
-- os privilégios, mas um `drop` acidental no meio de um replay não preservaria.
-- `anon` saiu daqui em 21_fecha_book_appointment.sql (SEC-001 / BUG-001):
-- concedida a `anon`, esta função é uma segunda porta de agendamento público
-- sem nenhuma das travas das migrations 17 e 20. Reconceder faz a 21 falhar.
revoke execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) from public, anon;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) to authenticated;


-- ---------------------------------------------------------------------------
-- Portão: se a função não ficou como se espera, o Postgres desfaz tudo.
-- (o padrão da armadilha nº16 — o arquivo inteiro roda numa transação só)
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'book_appointment';

  if v_corpo is null then
    raise exception 'book_appointment sumiu.';
  end if;
  if v_corpo not like '%has_shop_access(p_shop)%' then
    raise exception 'C-1 NÃO aplicado: a função não confere has_shop_access.';
  end if;
  if v_corpo not like '%não pode agendar em nome de outra pessoa%' then
    raise exception 'C-2 NÃO aplicado: p_profile continua sem conferência.';
  end if;
  if v_corpo not like '%v_historico%' then
    raise exception 'C-2 camada 2 NÃO aplicada: a adoção de ficha continua livre.';
  end if;

  raise notice '11 aplicada — book_appointment agora confere quem chama.';
end $$;
