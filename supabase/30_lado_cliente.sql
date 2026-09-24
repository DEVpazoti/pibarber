-- ============================================================================
-- PiBarber — 30_lado_cliente.sql
--
-- UMA CONTA, DOIS LADOS — e o lado de cliente só mostra o que é da PESSOA.
--
-- ---------------------------------------------------------------------------
-- O problema
-- ---------------------------------------------------------------------------
-- O app de cliente confiava na RLS de `appointments` para devolver "os meus
-- agendamentos". Para cliente puro, dava certo. Mas o DONO também pode ver
-- tudo da barbearia dele — e, entrando pelo lado de cliente, "Meus
-- agendamentos" listava a agenda inteira da loja. A home (`client_home`)
-- tinha o mesmo furo por outro caminho: ela inclui o que a pessoa CRIOU
-- (`created_by`), e o dono cria horários no painel o dia todo.
--
-- ---------------------------------------------------------------------------
-- A regra de "meu", como cliente
-- ---------------------------------------------------------------------------
--   o agendamento está ligado à MINHA ficha de cliente (customers.profile_id)
--   OU fui eu que o marquei ONLINE (para um filho, por exemplo) — desde que
--      não seja na barbearia onde eu trabalho (dono ou assistente).
--
-- `source = 'manual'` é o criado no painel: isso é trabalho de barbearia, não
-- agendamento de cliente, e nunca aparece no lado de cliente.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `meus_agendamentos_ids()` — os ids, pela regra acima. O app filtra por
--      eles (não dá para filtrar por `customers` direto: o cliente não lê essa
--      tabela, que tem as anotações internas do barbeiro).
--   2. `client_home` refeita com a mesma regra (antes: `created_by` sem olhar
--      a origem).
--
-- Rollback: reaplicar a `client_home` de 19_agendamento_de_quem_criou.sql e
--   drop function if exists meus_agendamentos_ids();
-- ============================================================================

create or replace function meus_agendamentos_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id
    from appointments a
    join customers c on c.id = a.customer_id
   where (c.profile_id = auth.uid()
             or (a.created_by = auth.uid()
                 and a.source = 'online'
                 -- Na loja onde a pessoa TRABALHA, o que ela marca é trabalho
                 -- de barbearia, não agendamento dela como cliente.
                 and not exists (select 1 from barbershops b2
                                  where b2.id = a.barbershop_id and b2.owner_id = auth.uid())
                 and not exists (select 1 from profiles p2
                                  where p2.id = auth.uid() and p2.role = 'assistant'
                                    and p2.barbershop_id = a.barbershop_id)));
$fn$;

revoke all on function meus_agendamentos_ids() from public, anon;
grant execute on function meus_agendamentos_ids() to authenticated;


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


