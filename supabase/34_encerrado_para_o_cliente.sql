-- ============================================================================
-- PiBarber — 34_encerrado_para_o_cliente.sql
--
-- ATENDIMENTO QUE JÁ PASSOU SAI DE "EM ABERTO" NO APP DO CLIENTE.
--
-- ---------------------------------------------------------------------------
-- O problema
-- ---------------------------------------------------------------------------
-- Em "Meus agendamentos", a separação entre "Em aberto" e "Anteriores" olhava
-- só o STATUS. Quando o barbeiro não conclui nem marca falta, o atendimento
-- fica `scheduled` para sempre — e o cliente via, em 30/09, um horário de
-- 18/08 como "Em aberto", com o botão "Cancelar" (que nem funcionava: o
-- `cancel_appointment` recusa pelo prazo da loja).
--
-- ---------------------------------------------------------------------------
-- A correção — só de APRESENTAÇÃO
-- ---------------------------------------------------------------------------
-- O status NÃO muda. O atendimento continua `scheduled` para o barbeiro
-- resolver em /painel/pendencias, onde ele lança o dinheiro, a comissão ou a
-- falta. Concluir ou marcar falta "sozinho" inventaria dinheiro no caixa ou
-- uma falta que talvez não houve.
--
-- O que muda é como o CLIENTE vê: `encerrado(a)` diz se um atendimento ainda
-- em aberto já passou do ponto de fazer sentido como "em aberto". É um campo
-- calculado do PostgREST (função que recebe a linha de `appointments`): o app
-- pede `encerrado` no select como se fosse coluna, e a tela não calcula nada.
-- O "agora" é o `now()` do banco, nunca o relógio do celular.
--
--   1. `encerrado(appointments)` — a regra, num lugar só.
--   2. `client_home` — `proximo`/`proximos` trocam `starts_at >= now()` por
--      `not encerrado(a)`. Assim o Início e a lista usam A MESMA regra. Efeito
--      colateral desejado: o atendimento em andamento continua no Início até
--      1h depois do fim (antes sumia no minuto em que começava).
--
-- `meus_agendamentos_ids()` NÃO muda: a regra de "meu" é a mesma. O corpo de
-- `client_home` abaixo é o da 30_lado_cliente.sql, com só aquela troca.
--
-- A janela de 1 hora é a mesma de `token_ainda_vale()` (20_link_expira_e_
-- rajada.sql): o link de quem agendou sem conta vale até 1h depois do fim.
-- Mesmo conceito, mesmo número — se um mudar, reveja o outro.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK: reaplique a `client_home` da 30_lado_cliente.sql e
--   drop function if exists encerrado(appointments);
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — encerrado(appointments)
-- ###########################################################################

-- `stable`, NUNCA `immutable`: depende de `now()` (ver o comentário longo de
-- `token_ainda_vale` na 20 — o mesmo vale aqui).
--
-- SEM `security definer`: a função só olha a linha que recebeu. Quem chama já
-- passou pela RLS para ter essa linha em mãos.
create or replace function encerrado(a public.appointments)
returns boolean
language plpgsql
stable
set search_path = ''
as $fn$
declare
  -- Quanto tempo depois do FIM um atendimento ainda aparece como "em aberto".
  -- Não é zero de propósito: o atendimento atrasa, o cliente chega 15 minutos
  -- depois, o barbeiro conclui no fim do expediente. Uma hora de folga evita
  -- que o horário "suma" do app enquanto a pessoa ainda está na cadeira.
  c_janela_depois_do_fim constant interval := interval '1 hour';
begin
  return a.status in ('scheduled', 'confirmed')
     and now() >= a.ends_at + c_janela_depois_do_fim;
end;
$fn$;

revoke all on function encerrado(public.appointments) from public, anon;
grant execute on function encerrado(public.appointments) to authenticated, service_role;


-- ###########################################################################
-- PARTE 2 — client_home com a mesma regra
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
         where (c.profile_id = v_profile
             or (a.created_by = v_profile
                 and a.source = 'online'
                 -- Na loja onde a pessoa TRABALHA, o que ela marca é trabalho
                 -- de barbearia, não agendamento dela como cliente.
                 and not exists (select 1 from barbershops b2
                                  where b2.id = a.barbershop_id and b2.owner_id = v_profile)
                 and not exists (select 1 from profiles p2
                                  where p2.id = v_profile and p2.role = 'assistant'
                                    and p2.barbershop_id = a.barbershop_id)))
           and a.status in ('scheduled', 'confirmed')
           -- nº 34: a mesma regra da lista de agendamentos (antes: começar no futuro).
           and not encerrado(a)
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
         where (c.profile_id = v_profile
             or (a.created_by = v_profile
                 and a.source = 'online'
                 -- Na loja onde a pessoa TRABALHA, o que ela marca é trabalho
                 -- de barbearia, não agendamento dela como cliente.
                 and not exists (select 1 from barbershops b2
                                  where b2.id = a.barbershop_id and b2.owner_id = v_profile)
                 and not exists (select 1 from profiles p2
                                  where p2.id = v_profile and p2.role = 'assistant'
                                    and p2.barbershop_id = a.barbershop_id)))
           and a.status in ('scheduled', 'confirmed')
           -- nº 34: a mesma regra da lista de agendamentos (antes: começar no futuro).
           and not encerrado(a)
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

-- Os grants da 03 são reafirmados: `create or replace` preserva, mas deixar
-- escrito é o que impede uma reaplicação fora de ordem de abrir a home.
revoke all on function client_home(uuid) from public, anon;
grant execute on function client_home(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Portão: a regra existe, a home usa a regra, e a regra velha saiu da home.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  if to_regprocedure('public.encerrado(public.appointments)') is null then
    raise exception 'A função encerrado(appointments) não existe.';
  end if;

  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'client_home';

  if v_corpo is null or v_corpo not like '%not encerrado(a)%' then
    raise exception 'client_home não usa encerrado(a) — o Início e a lista divergiriam.';
  end if;
  if v_corpo like '%starts_at >= now()%' then
    raise exception 'client_home ainda tem a regra velha (starts_at >= now()).';
  end if;
  -- A regra de "meu, como cliente" (30) não pode ter saído junto.
  if v_corpo not like '%b2.owner_id = v_profile%' then
    raise exception 'REGRESSÃO: client_home perdeu a regra do lado cliente da 30.';
  end if;

  if has_function_privilege('anon', 'public.encerrado(public.appointments)', 'execute') then
    raise exception 'anon não deveria executar encerrado(appointments).';
  end if;

  raise notice '34 aplicada — atendimento 1h depois do fim sai de "em aberto" no app do cliente.';
end $$;
