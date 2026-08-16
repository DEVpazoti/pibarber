-- ============================================================================
-- PiBarber — 03_rls.sql
-- Row Level Security + grants.
--
-- Esta é a ÚNICA camada que vale de verdade. Middleware e requireRole() são
-- conveniência; o que impede alguém de chamar
--   https://xxx.supabase.co/rest/v1/transactions?select=*
-- direto com a chave anônima é o que está escrito aqui.
--
-- Regra que organiza o arquivo inteiro:
--   Dado financeiro  → can_manage_money()   (SÓ o dono e o admin)
--   Dado operacional → has_shop_access()    (dono, assistente e admin)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Liga RLS nas 21 tabelas.
-- ---------------------------------------------------------------------------
alter table profiles               enable row level security;
alter table user_addresses         enable row level security;
alter table dependents             enable row level security;
alter table barbershops            enable row level security;
alter table business_hours         enable row level security;
alter table professionals          enable row level security;
alter table professional_schedules enable row level security;
alter table time_off               enable row level security;
alter table services               enable row level security;
alter table customers              enable row level security;
alter table favorites              enable row level security;
alter table shop_visits            enable row level security;
alter table appointments           enable row level security;
alter table appointment_services   enable row level security;
alter table waitlist_entries       enable row level security;
alter table reviews                enable row level security;
alter table transactions           enable row level security;
alter table commissions            enable row level security;
alter table debts                  enable row level security;
alter table debt_payments          enable row level security;
alter table notifications          enable row level security;


-- ===========================================================================
-- PROFILES — o perfil global
-- ===========================================================================

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (
    id = auth.uid()                       -- o próprio
    or has_shop_access(barbershop_id)     -- o dono vendo os assistentes dele
    or is_platform_admin()
  );

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update to authenticated
  using (id = auth.uid() or is_platform_admin())
  with check (id = auth.uid() or is_platform_admin());

-- O INSERT em profiles é feito pelo trigger handle_new_user(), que é
-- SECURITY DEFINER. Ninguém precisa de policy de insert.


-- ===========================================================================
-- USER_ADDRESSES · DEPENDENTS — só o dono do perfil
-- ===========================================================================

drop policy if exists user_addresses_all on user_addresses;
create policy user_addresses_all on user_addresses
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists dependents_all on dependents;
create policy dependents_all on dependents
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());


-- ===========================================================================
-- BARBERSHOPS — leitura pública, escrita só do dono
-- ===========================================================================

-- Leitura pública (sem login), SÓ de loja ativa. É o que faz /b/[slug] e a
-- busca funcionarem para quem ainda não criou conta.
drop policy if exists barbershops_public_select on barbershops;
create policy barbershops_public_select on barbershops
  for select to anon
  using (is_active);

drop policy if exists barbershops_select on barbershops;
create policy barbershops_select on barbershops
  for select to authenticated
  using (is_active or has_shop_access(id));

drop policy if exists barbershops_update on barbershops;
create policy barbershops_update on barbershops
  for update to authenticated
  using (can_manage_money(id))
  with check (can_manage_money(id));

-- Só o admin da plataforma cria e apaga barbearia (a tela /admin).
drop policy if exists barbershops_insert on barbershops;
create policy barbershops_insert on barbershops
  for insert to authenticated
  with check (is_platform_admin());

drop policy if exists barbershops_delete on barbershops;
create policy barbershops_delete on barbershops
  for delete to authenticated
  using (is_platform_admin());


-- ===========================================================================
-- BUSINESS_HOURS — público lê, dono edita
-- ===========================================================================

drop policy if exists business_hours_public_select on business_hours;
create policy business_hours_public_select on business_hours
  for select to anon
  using (exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active));

drop policy if exists business_hours_select on business_hours;
create policy business_hours_select on business_hours
  for select to authenticated
  using (
    exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
    or has_shop_access(barbershop_id)
  );

drop policy if exists business_hours_write on business_hours;
create policy business_hours_write on business_hours
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ===========================================================================
-- PROFESSIONALS — público lê, dono edita (equipe é tela só do dono)
-- ===========================================================================

drop policy if exists professionals_public_select on professionals;
create policy professionals_public_select on professionals
  for select to anon
  using (
    is_active
    and exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
  );

drop policy if exists professionals_select on professionals;
create policy professionals_select on professionals
  for select to authenticated
  using (
    (is_active and exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active))
    or has_shop_access(barbershop_id)
  );

drop policy if exists professionals_write on professionals;
create policy professionals_write on professionals
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ===========================================================================
-- PROFESSIONAL_SCHEDULES · TIME_OFF
--
-- A agenda precisa enxergar folga para desenhar a grade, então a leitura é
-- operacional. A edição é do dono.
-- ===========================================================================

drop policy if exists professional_schedules_select on professional_schedules;
create policy professional_schedules_select on professional_schedules
  for select to authenticated
  using (exists (
    select 1 from professionals pr
     where pr.id = professional_id and has_shop_access(pr.barbershop_id)
  ));

drop policy if exists professional_schedules_write on professional_schedules;
create policy professional_schedules_write on professional_schedules
  for all to authenticated
  using (exists (
    select 1 from professionals pr
     where pr.id = professional_id and can_manage_money(pr.barbershop_id)
  ))
  with check (exists (
    select 1 from professionals pr
     where pr.id = professional_id and can_manage_money(pr.barbershop_id)
  ));

drop policy if exists time_off_select on time_off;
create policy time_off_select on time_off
  for select to authenticated
  using (has_shop_access(barbershop_id));

drop policy if exists time_off_write on time_off;
create policy time_off_write on time_off
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ===========================================================================
-- SERVICES — público lê; o assistente VÊ mas não edita
-- ===========================================================================

drop policy if exists services_public_select on services;
create policy services_public_select on services
  for select to anon
  using (
    is_active
    and exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
  );

drop policy if exists services_select on services;
create policy services_select on services
  for select to authenticated
  using (
    (is_active and exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active))
    or has_shop_access(barbershop_id)
  );

drop policy if exists services_write on services;
create policy services_write on services
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ===========================================================================
-- CUSTOMERS — a ficha do cliente dentro da barbearia
--
-- ATENÇÃO, esta é a policy mais importante do arquivo:
-- o cliente NÃO lê esta tabela. Nem a própria ficha.
--
-- Motivo: `customers.notes` é o texto livre do barbeiro ("máquina 2 nas
-- laterais", "reclamão", "sempre atrasa"). A RLS não filtra COLUNA no select —
-- se o cliente pudesse ler a linha dele, leria o notes junto.
--
-- O app do cliente não precisa desta tabela: os dados dele vêm de `profiles`,
-- e o histórico vem de client_home() / appointments.
-- ===========================================================================

drop policy if exists customers_select on customers;
create policy customers_select on customers
  for select to authenticated
  using (has_shop_access(barbershop_id));

drop policy if exists customers_write on customers;
create policy customers_write on customers
  for all to authenticated
  using (has_shop_access(barbershop_id))
  with check (has_shop_access(barbershop_id));


-- ===========================================================================
-- FAVORITES · SHOP_VISITS · NOTIFICATIONS — só o dono do perfil
-- ===========================================================================

drop policy if exists favorites_all on favorites;
create policy favorites_all on favorites
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists shop_visits_all on shop_visits;
create policy shop_visits_all on shop_visits
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select to authenticated
  using (profile_id = auth.uid());

-- O cliente só marca como lida. Quem CRIA notificação são as funções
-- SECURITY DEFINER (complete_appointment, cancel_appointment).
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications
  for delete to authenticated
  using (profile_id = auth.uid());


-- ===========================================================================
-- APPOINTMENTS — a equipe da loja, ou o próprio cliente
-- ===========================================================================

drop policy if exists appointments_select on appointments;
create policy appointments_select on appointments
  for select to authenticated
  using (
    has_shop_access(barbershop_id)
    or owns_customer(customer_id)   -- o cliente vê só os DELE
  );

-- Criar pela mão é coisa do painel. O cliente agenda por book_appointment(),
-- que é SECURITY DEFINER e valida antecedência e regras da loja.
drop policy if exists appointments_insert on appointments;
create policy appointments_insert on appointments
  for insert to authenticated
  with check (has_shop_access(barbershop_id));

-- Concluir, cancelar e marcar falta passam pelas funções. O update direto
-- fica com a equipe (arrastar na grade, mudar observação).
drop policy if exists appointments_update on appointments;
create policy appointments_update on appointments
  for update to authenticated
  using (has_shop_access(barbershop_id))
  with check (has_shop_access(barbershop_id));

drop policy if exists appointments_delete on appointments;
create policy appointments_delete on appointments
  for delete to authenticated
  using (has_shop_access(barbershop_id));


-- ===========================================================================
-- APPOINTMENT_SERVICES — segue o acesso do agendamento
-- ===========================================================================

drop policy if exists appointment_services_select on appointment_services;
create policy appointment_services_select on appointment_services
  for select to authenticated
  using (exists (
    select 1 from appointments a
     where a.id = appointment_id
       and (has_shop_access(a.barbershop_id) or owns_customer(a.customer_id))
  ));

drop policy if exists appointment_services_write on appointment_services;
create policy appointment_services_write on appointment_services
  for all to authenticated
  using (exists (
    select 1 from appointments a
     where a.id = appointment_id and has_shop_access(a.barbershop_id)
  ))
  with check (exists (
    select 1 from appointments a
     where a.id = appointment_id and has_shop_access(a.barbershop_id)
  ));


-- ===========================================================================
-- WAITLIST_ENTRIES — a equipe da loja, ou o próprio cliente
-- ===========================================================================

drop policy if exists waitlist_select on waitlist_entries;
create policy waitlist_select on waitlist_entries
  for select to authenticated
  using (has_shop_access(barbershop_id) or profile_id = auth.uid());

drop policy if exists waitlist_insert on waitlist_entries;
create policy waitlist_insert on waitlist_entries
  for insert to authenticated
  with check (profile_id = auth.uid() or has_shop_access(barbershop_id));

drop policy if exists waitlist_update on waitlist_entries;
create policy waitlist_update on waitlist_entries
  for update to authenticated
  using (has_shop_access(barbershop_id) or profile_id = auth.uid())
  with check (has_shop_access(barbershop_id) or profile_id = auth.uid());

drop policy if exists waitlist_delete on waitlist_entries;
create policy waitlist_delete on waitlist_entries
  for delete to authenticated
  using (has_shop_access(barbershop_id) or profile_id = auth.uid());


-- ===========================================================================
-- REVIEWS — leitura pública, escrita do autor, resposta do dono
-- ===========================================================================

drop policy if exists reviews_public_select on reviews;
create policy reviews_public_select on reviews
  for select to anon
  using (exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active));

drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews
  for select to authenticated
  using (
    exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
    or has_shop_access(barbershop_id)
  );

-- Só dá para avaliar um atendimento SEU e que foi CONCLUÍDO.
drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from appointments a
        join customers c on c.id = a.customer_id
       where a.id = appointment_id
         and a.status = 'completed'
         and c.profile_id = auth.uid()
    )
  );

drop policy if exists reviews_update on reviews;
create policy reviews_update on reviews
  for update to authenticated
  using (profile_id = auth.uid() or has_shop_access(barbershop_id))
  with check (profile_id = auth.uid() or has_shop_access(barbershop_id));

-- A policy acima deixa o autor e a loja atualizarem a MESMA linha. Falta
-- separar QUAL coluna cada um mexe — RLS não faz isso, então vai de trigger:
-- o cliente não forja uma resposta da barbearia na própria avaliação.
create or replace function reviews_guard_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.reply is distinct from old.reply and not has_shop_access(new.barbershop_id) then
    raise exception 'Só a barbearia pode responder a uma avaliação.';
  end if;

  if new.reply is distinct from old.reply then
    new.replied_at := now();
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_review_reply on reviews;
create trigger on_review_reply
  before update on reviews
  for each row execute function reviews_guard_reply();


-- ===========================================================================
-- DINHEIRO — aqui mora a regra "assistente não vê faturamento"
--
-- can_manage_money() é verdadeiro SÓ para o dono e o admin. O assistente
-- autenticado que chamar /rest/v1/transactions?select=* recebe [] — não porque
-- o menu está escondido, mas porque o Postgres não devolve a linha.
-- ===========================================================================

drop policy if exists transactions_all on transactions;
create policy transactions_all on transactions
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));

drop policy if exists commissions_all on commissions;
create policy commissions_all on commissions
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ===========================================================================
-- DEBTS — fiado é informação OPERACIONAL
--
-- O assistente precisa ver quem está devendo: ele cobra no balcão.
-- O cliente também vê o que ele mesmo deve. Não há notes aqui, só valor.
-- ===========================================================================

drop policy if exists debts_select on debts;
create policy debts_select on debts
  for select to authenticated
  using (
    has_shop_access(barbershop_id)
    or owns_customer(customer_id)
  );

drop policy if exists debts_write on debts;
create policy debts_write on debts
  for all to authenticated
  using (has_shop_access(barbershop_id))
  with check (has_shop_access(barbershop_id));

drop policy if exists debt_payments_select on debt_payments;
create policy debt_payments_select on debt_payments
  for select to authenticated
  using (exists (
    select 1 from debts d
     where d.id = debt_id
       and (has_shop_access(d.barbershop_id) or owns_customer(d.customer_id))
  ));

drop policy if exists debt_payments_write on debt_payments;
create policy debt_payments_write on debt_payments
  for all to authenticated
  using (exists (
    select 1 from debts d where d.id = debt_id and has_shop_access(d.barbershop_id)
  ))
  with check (exists (
    select 1 from debts d where d.id = debt_id and has_shop_access(d.barbershop_id)
  ));


-- ###########################################################################
-- GRANTS
--
-- RLS filtra LINHA. O grant decide se a tabela e a COLUNA são acessíveis.
-- Os dois trabalham juntos: sem grant, a policy nem chega a ser avaliada.
-- ###########################################################################

grant usage on schema public to anon, authenticated;

-- --- anon: só as cinco tabelas de leitura pública ---------------------------
revoke all on all tables in schema public from anon;
grant select on barbershops, services, professionals, business_hours, reviews to anon;

-- --- authenticated: acesso amplo; quem filtra é a RLS -----------------------
grant select, insert, update, delete on all tables in schema public to authenticated;

-- --- Fecha a escalada de privilégio -----------------------------------------
--
-- RLS deixa o usuário atualizar a PRÓPRIA linha em profiles. Sem o recorte de
-- coluna abaixo, bastaria um
--   PATCH /rest/v1/profiles?id=eq.<meu-id>  {"role":"owner"}
-- para o cliente virar dono. O grant por coluna é o que fecha isso.
revoke update on profiles from authenticated;
grant update (full_name, email, phone, birth_date, gender, avatar_url)
  on profiles to authenticated;

-- Mesma ideia na barbearia: o dono edita a loja, mas não transfere a posse
-- nem se autopromove mexendo em rating.
revoke update on barbershops from authenticated;
grant update (
  name, description, phone, whatsapp,
  zip_code, street, number, complement, neighborhood, city, state,
  latitude, longitude, logo_url, cover_url,
  accepts_online_booking, min_advance_minutes, max_advance_days,
  cancel_deadline_hours, slug
) on barbershops to authenticated;

-- --- Funções ----------------------------------------------------------------
--
-- ATENÇÃO: o Postgres concede EXECUTE a PUBLIC por padrão em TODA função que
-- você cria. Conceder explicitamente para `authenticated` não tira esse padrão.
-- Sem o revoke abaixo, `anon` consegue chamar via /rest/v1/rpc/:
--   complete_appointment, pay_debt, mark_no_show, revenue_series, client_home…
--
-- Elas falhariam por dentro (auth.uid() é nulo, has_shop_access() dá false),
-- mas é superfície de ataque à toa — e o lint de segurança do Supabase acusa.
-- Revogamos tudo e devolvemos só o necessário, função por função.
--
-- As três funções de trigger (handle_new_user, barbershop_after_insert,
-- review_after_insert) e reviews_guard_reply ficam SEM grant nenhum: trigger
-- não precisa de EXECUTE do usuário que dispara, só de quem criou o trigger.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on function distancia_km(numeric, numeric, numeric, numeric) to anon, authenticated;
grant execute on function search_barbershops(text, text, numeric, numeric, numeric, integer) to anon, authenticated;
grant execute on function get_available_slots(uuid, date, integer) to anon, authenticated;
grant execute on function book_appointment(uuid, uuid, timestamptz, uuid[], uuid, uuid, text, text, text, appointment_source) to anon, authenticated;

grant execute on function is_platform_admin() to authenticated;
grant execute on function my_shop_id() to authenticated;
grant execute on function has_shop_access(uuid) to authenticated;
grant execute on function can_manage_money(uuid) to authenticated;
grant execute on function owns_customer(uuid) to authenticated;

grant execute on function complete_appointment(uuid, jsonb, numeric, date) to authenticated;
grant execute on function cancel_appointment(uuid, text, uuid) to authenticated;
grant execute on function mark_no_show(uuid) to authenticated;
grant execute on function pay_debt(uuid, numeric, payment_method) to authenticated;
grant execute on function join_waitlist(uuid, uuid, uuid, date, text) to authenticated;
grant execute on function dashboard_summary(uuid, date, date) to authenticated;
grant execute on function revenue_series(uuid, date, date) to authenticated;
grant execute on function client_home(uuid) to authenticated;

-- Sequências: nenhuma tabela usa serial (todas são uuid), mas fica o grant
-- caso alguma seja adicionada depois.
grant usage on all sequences in schema public to authenticated;


-- ---------------------------------------------------------------------------
-- Confirmação
-- ---------------------------------------------------------------------------
do $$
declare
  qtd_rls      integer;
  qtd_policies integer;
begin
  select count(*) into qtd_rls
    from pg_tables
   where schemaname = 'public' and rowsecurity = true;

  select count(*) into qtd_policies
    from pg_policies
   where schemaname = 'public';

  raise notice '03_rls.sql concluído — RLS em % tabelas, % policies.', qtd_rls, qtd_policies;
end $$;
