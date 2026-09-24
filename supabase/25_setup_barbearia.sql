-- ============================================================================
-- PiBarber — 25_setup_barbearia.sql
--
-- O BARBEIRO CRIA A PRÓPRIA BARBEARIA, E UM SETUP GUIADO A DEIXA PRONTA.
--
-- ---------------------------------------------------------------------------
-- Como estava
-- ---------------------------------------------------------------------------
-- A conta de dono só nascia no /admin, pelas mãos da plataforma. E nascia
-- pela metade: nome, link e cidade — sem horário, sem serviço e sem
-- profissional. A loja aparecia na busca e ninguém conseguia agendar nela.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `barbershops.setup_completed_at` — nulo enquanto o dono não terminou o
--      setup de /configurar. O layout do /painel manda para lá enquanto ela
--      for nula. As lojas que JÁ EXISTEM recebem a data de criação: quem já
--      usa o app não pode cair num setup do nada.
--
--   2. Um índice único parcial no telefone do DONO. A regra do cadastro é
--      "dois barbeiros não dividem e-mail nem telefone". O e-mail o Supabase
--      Auth já garante (é único em auth.users). O telefone é daqui.
--
--      Parcial em `role = 'owner'` porque cliente pode repetir telefone à
--      vontade — mãe e filho com o mesmo celular é o caso normal. E vale
--      também para quem é PROMOVIDO: o trigger `barbershop_after_insert()` que
--      vira o papel para owner esbarra no índice, e a inserção da loja falha
--      junto. É isso que fecha a corrida de dois cadastros simultâneos com o
--      mesmo número, que a checagem da action sozinha não fecharia.
--
--      O telefone entra só com dígitos (`normalizarTelefone`); o índice
--      compara texto, então "(11) 9..." e "119..." precisam chegar iguais.
--
-- A loja criada pelo próprio barbeiro nasce com `is_active = false` — é a
-- action que decide isso, não esta migration. `is_active` é o portão público
-- de tudo (RLS, busca, sitemap), e é o fim do setup que o abre.
--
--   3. `barbershops.blocked_at` + o trigger `barbershops_guard_bloqueio`.
--
--      Com o setup, `is_active = false` passou a ter DOIS motivos: "ainda em
--      configuração" e "a plataforma desativou". Só com `is_active` não dava
--      para distinguir, e o fim do setup reabriria uma loja que o /admin tinha
--      desligado (spam, cadastro falso) sem ninguém perceber.
--
--      `blocked_at` é o bloqueio da PLATAFORMA, e o trigger o torna regra do
--      banco, não da tela:
--        - loja bloqueada fica com `is_active = false`, venha o update de onde
--          vier — inclusive de um PATCH direto na REST, que a RLS de
--          `barbershops` permite ao dono;
--        - só o admin da plataforma (ou a service role, que é o /admin) mexe
--          em `blocked_at`. O dono não se desbloqueia.
--
--   4. `concluir_setup_barbearia(shop)` — o ÚNICO jeito de o dono abrir a
--      loja. `is_active`, `setup_completed_at` e `blocked_at` NÃO estão entre
--      as colunas que `authenticated` pode atualizar (grant por coluna em
--      03_rls.sql), e é bom que não estejam: se estivessem, o dono se
--      publicaria sem setup, ou se desbloquearia, com um PATCH na REST. A
--      função confere dono, confere o mínimo para agendar e só então abre.
--
-- ---------------------------------------------------------------------------
-- Antes de rodar
-- ---------------------------------------------------------------------------
-- O índice falha se já houver dois donos com o mesmo telefone. Confira:
--
--   select phone, count(*) from profiles
--    where role = 'owner' and phone is not null
--    group by 1 having count(*) > 1;
--
-- ⚠️ Rode ANTES do deploy do código: `requireShopContext()` passa a ler
-- `setup_completed_at`, e sem a coluna todo dono cai em /sem-barbearia.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   drop function if exists concluir_setup_barbearia(uuid);
--   drop trigger if exists on_barbershop_guard_bloqueio on barbershops;
--   drop function if exists barbershops_guard_bloqueio();
--   alter table barbershops drop column if exists blocked_at;
--   drop index if exists profiles_telefone_dono_unico;
--   alter table barbershops drop column if exists setup_completed_at;
-- ============================================================================

-- A coluna e o preenchimento das lojas antigas andam JUNTOS, e só na primeira
-- vez. Rodar o arquivo de novo depois que alguém começou o setup não pode
-- marcar a loja dele como pronta.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'barbershops'
       and column_name = 'setup_completed_at'
  ) then
    alter table barbershops add column setup_completed_at timestamptz;
    update barbershops set setup_completed_at = created_at;
  end if;
end $$;

create unique index if not exists profiles_telefone_dono_unico
  on profiles (phone)
  where role = 'owner' and phone is not null;


-- ---------------------------------------------------------------------------
-- O bloqueio da plataforma. As lojas desativadas até hoje foram desativadas
-- pelo /admin (não existia outro motivo), então herdam o bloqueio.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'barbershops'
       and column_name = 'blocked_at'
  ) then
    alter table barbershops add column blocked_at timestamptz;
    update barbershops set blocked_at = now() where not is_active;
  end if;
end $$;

create or replace function barbershops_guard_bloqueio()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Quem vem pela API com sessão de usuário (anon/authenticated) e não é
  -- admin da plataforma não mexe no bloqueio. A service role (/admin) e o SQL
  -- direto passam: auth.role() é 'service_role' ou nulo.
  if new.blocked_at is distinct from old.blocked_at
     and coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not is_platform_admin() then
    raise exception 'Só a plataforma bloqueia ou desbloqueia uma barbearia.'
      using errcode = '42501';
  end if;

  if new.blocked_at is not null then
    new.is_active := false;
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_barbershop_guard_bloqueio on barbershops;
create trigger on_barbershop_guard_bloqueio
  before update on barbershops
  for each row execute function barbershops_guard_bloqueio();


-- ---------------------------------------------------------------------------
-- O fim do setup. Devolve se a loja foi ao ar (falso = bloqueada pela
-- plataforma: o setup termina, mas ela continua escondida).
--
-- As checagens repetem as de `concluirSetup` (actions/setup.ts) de propósito:
-- lá elas dão a mensagem bonita; aqui elas valem para quem chamar a RPC
-- direto, sem passar pela tela.
-- ---------------------------------------------------------------------------
create or replace function concluir_setup_barbearia(shop uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_loja barbershops%rowtype;
begin
  select * into v_loja from barbershops where id = shop for update;

  if not found or v_loja.owner_id is distinct from auth.uid() then
    raise exception 'Só o dono conclui o setup da barbearia.' using errcode = '42501';
  end if;

  -- Já concluído: não mexe em nada, só responde o estado atual.
  if v_loja.setup_completed_at is not null then
    return v_loja.is_active;
  end if;

  if v_loja.latitude is null or v_loja.longitude is null then
    raise exception 'Falta localizar a barbearia no mapa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from business_hours where barbershop_id = shop and not is_closed) then
    raise exception 'Falta abrir pelo menos um dia no horário.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from services where barbershop_id = shop and is_active) then
    raise exception 'Falta cadastrar pelo menos um serviço.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from professionals where barbershop_id = shop and is_active) then
    raise exception 'Falta cadastrar quem atende.' using errcode = 'P0001';
  end if;

  -- O trigger barbershops_guard_bloqueio força is_active = false se houver
  -- blocked_at; a expressão abaixo só deixa a intenção explícita.
  update barbershops
     set setup_completed_at = now(),
         is_active = (v_loja.blocked_at is null)
   where id = shop;

  return v_loja.blocked_at is null;
end;
$fn$;

revoke all on function concluir_setup_barbearia(uuid) from public, anon;
grant execute on function concluir_setup_barbearia(uuid) to authenticated;

