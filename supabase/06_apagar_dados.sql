-- ============================================================================
-- PiBarber — 06_apagar_dados.sql
-- OPERAÇÃO. Apaga uma barbearia de teste na ordem certa das FKs.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Três chaves são `on delete restrict` de propósito:
--   barbershops.owner_id
--   appointments.professional_id
--   appointments.customer_id
--
-- Isso protege o histórico: ninguém apaga um profissional e leva junto a
-- origem de um lançamento do caixa. O efeito colateral é que "deletar usuário"
-- pelo painel do Supabase falha com `Failed to delete user: {}` — uma mensagem
-- que não explica nada.
--
-- A ordem abaixo é a que funciona. Do mais dependente para o menos.
--
-- >>> ISTO APAGA DADOS DE VERDADE E NÃO TEM VOLTA. <<<
-- >>> O Supabase free não tem point-in-time recovery. Faça backup antes. <<<
-- ============================================================================

do $$
declare
  -- >>> TROQUE AQUI pelo slug da barbearia que você quer apagar <<<
  v_slug constant text := 'barbearia-de-teste';

  -- Apagar também a conta de login do dono e dos assistentes?
  -- Deixe false se o dono for uma conta sua que você usa em outra loja.
  v_apagar_contas constant boolean := false;

  v_shop  uuid;
  v_nome  text;
  v_dono  uuid;
  v_contas uuid[];
  v_n     integer;
begin
  select b.id, b.name, b.owner_id
    into v_shop, v_nome, v_dono
    from barbershops b
   where b.slug = v_slug;

  if v_shop is null then
    raise exception 'Nenhuma barbearia com o slug "%".', v_slug;
  end if;

  raise notice 'Apagando "%" (slug: %)...', v_nome, v_slug;

  -- Guarda quem são as contas ligadas a esta loja, antes de soltar os vínculos.
  select array_agg(id) into v_contas
    from profiles
   where barbershop_id = v_shop and role = 'assistant';

  -- ---- 1. Dinheiro ---------------------------------------------------------
  delete from debt_payments
   where debt_id in (select id from debts where barbershop_id = v_shop);
  get diagnostics v_n = row_count; raise notice '  debt_payments: %', v_n;

  delete from debts where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  debts: %', v_n;

  delete from commissions where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  commissions: %', v_n;

  delete from transactions where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  transactions: %', v_n;

  -- ---- 2. Agenda -----------------------------------------------------------
  -- reviews e appointment_services caem por cascade quando o agendamento sai,
  -- mas apagar explicitamente deixa o log honesto.
  delete from reviews where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  reviews: %', v_n;

  delete from appointment_services
   where appointment_id in (select id from appointments where barbershop_id = v_shop);
  get diagnostics v_n = row_count; raise notice '  appointment_services: %', v_n;

  -- Os agendamentos PRECISAM sair antes de profissionais e clientes:
  -- é o `restrict` das duas FKs.
  delete from appointments where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  appointments: %', v_n;

  delete from waitlist_entries where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  waitlist_entries: %', v_n;

  -- ---- 3. Cadastros --------------------------------------------------------
  delete from customers where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  customers: %', v_n;

  delete from professional_schedules
   where professional_id in (select id from professionals where barbershop_id = v_shop);
  get diagnostics v_n = row_count; raise notice '  professional_schedules: %', v_n;

  delete from time_off where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  time_off: %', v_n;

  delete from professionals where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  professionals: %', v_n;

  delete from services where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  services: %', v_n;

  delete from business_hours where barbershop_id = v_shop;
  get diagnostics v_n = row_count; raise notice '  business_hours: %', v_n;

  -- ---- 4. Vínculos de cliente ----------------------------------------------
  delete from favorites   where barbershop_id = v_shop;
  delete from shop_visits where barbershop_id = v_shop;

  -- ---- 5. Solta os assistentes e apaga a loja ------------------------------
  update profiles set barbershop_id = null where barbershop_id = v_shop;

  delete from barbershops where id = v_shop;
  raise notice '  barbershops: 1';

  -- ---- 6. As contas de login (opcional) ------------------------------------
  if v_apagar_contas then
    -- O dono só pode sair se não for dono de nenhuma outra loja.
    if not exists (select 1 from barbershops where owner_id = v_dono) then
      v_contas := coalesce(v_contas, '{}') || v_dono;
    else
      raise notice '  dono mantido: ele ainda tem outra barbearia.';
    end if;

    -- Apagar de auth.users derruba profiles junto (cascade).
    delete from auth.users where id = any (coalesce(v_contas, '{}'));
    get diagnostics v_n = row_count; raise notice '  contas de login: %', v_n;
  end if;

  raise notice 'Pronto. "%" foi apagada.', v_nome;
end $$;


-- ============================================================================
-- LIMPEZA TOTAL — apaga TUDO e devolve o banco ao estado pós-03_rls.sql.
--
-- Use quando quiser rodar o 04_seed.sql do zero.
-- Está comentado de propósito. Descomente o bloco inteiro para usar.
-- ============================================================================

-- do $$
-- begin
--   delete from debt_payments;
--   delete from debts;
--   delete from commissions;
--   delete from transactions;
--   delete from reviews;
--   delete from appointment_services;
--   delete from appointments;
--   delete from waitlist_entries;
--   delete from notifications;
--   delete from customers;
--   delete from professional_schedules;
--   delete from time_off;
--   delete from professionals;
--   delete from services;
--   delete from business_hours;
--   delete from favorites;
--   delete from shop_visits;
--   delete from dependents;
--   delete from user_addresses;
--   update profiles set barbershop_id = null;
--   delete from barbershops;
--   -- Apaga só as contas de teste do seed. Sua conta pessoal fica.
--   delete from auth.users
--    where email like '%@pibarber.dev';
--   raise notice 'Banco limpo. Pode rodar o 04_seed.sql de novo.';
-- end $$;
