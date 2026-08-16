-- ===========================================================================
-- 09 — Benefícios da barbearia (T-5)
--
-- O QUE É, E POR QUE ASSIM
--
-- "Benefício" é comodidade: wi-fi, ar-condicionado, estacionamento, ambiente
-- kids. O dono marca as que tem nas configurações; o perfil público mostra numa
-- grade de ícone + rótulo.
--
-- MODELAGEM: LISTA FECHADA — decisão de produto tomada na sessão do T-5
-- (pergunta nº 6 do CONTEXTO_MELHORIAS_V1.md). Texto livre foi apresentado e
-- recusado. Três consequências que justificam a escolha:
--
--   1. ÍCONE CONSISTENTE. O ícone mora no catálogo (`amenities.icon`, o nome
--      do componente do lucide-react), não na cabeça de quem digitou. Texto
--      livre daria "Wi-Fi", "wifi grátis" e "Internet" na mesma grade, e
--      nenhum ícone para nenhum dos três.
--   2. FILTRO FUTURO. "barbearias com estacionamento" no app é um `join` nesta
--      tabela. Com texto livre seria um `ilike` sobre a criatividade alheia.
--   3. NADA DE MODERAÇÃO. Campo livre no perfil público é superfície de spam
--      indexada pelo Google com o nosso domínio.
--
-- O custo, dito por inteiro: acrescentar um benefício novo exige migration.
-- É de propósito — é o preço do catálogo controlado.
--
-- DUAS TABELAS:
--   amenities             — o catálogo. GLOBAL, não pertence a barbearia
--                           nenhuma. Ninguém escreve nele pela aplicação.
--   barbershop_amenities  — a junção. É o que o dono marca e desmarca.
--
-- ===========================================================================
-- ROLLBACK — copie o bloco, rode, e o banco volta ao estado anterior
-- ===========================================================================
--
--   begin;
--   drop table if exists barbershop_amenities;
--   drop table if exists amenities;
--   commit;
--
--   Depois: node supabase/aplicar-sql.mjs --tipos && npx tsc --noEmit
--
--   Não há o que preservar: as duas tabelas nascem nesta migration e nenhuma
--   outra as referencia. O perfil público volta a não ter a aba Benefícios.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O catálogo
--
-- `slug` é a chave estável — é por ele que o código de aplicação e um filtro
-- futuro se referem ao benefício. O `id` uuid existe para a FK; o slug existe
-- para os humanos e tem `unique`.
--
-- `icon` guarda o nome do componente do lucide-react ("Wifi", "Snowflake").
-- O mapa nome → componente é explícito em src/lib/beneficios.ts, com fallback:
-- ícone que o front não conhecer não quebra a tela, cai num genérico.
--
-- `is_active` permite aposentar um benefício sem apagar as marcações das lojas
-- que já o tinham — `delete` na linha do catálogo levaria a junção junto.
-- ---------------------------------------------------------------------------
create table if not exists amenities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  label      text not null,
  icon       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 2. A junção — quais benefícios esta barbearia tem
--
-- Chave primária composta: a mesma loja não marca o mesmo benefício duas vezes,
-- e isso é garantido pelo banco, não pela tela. O `upsert` da action depende
-- disso.
--
-- `on delete cascade` nos dois lados: apagar a loja leva as marcações dela;
-- apagar um benefício do catálogo (o que não deve acontecer — use `is_active`)
-- não deixa linha órfã.
-- ---------------------------------------------------------------------------
create table if not exists barbershop_amenities (
  barbershop_id uuid not null references barbershops (id) on delete cascade,
  amenity_id    uuid not null references amenities (id)   on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (barbershop_id, amenity_id)
);

-- A leitura quente é "os benefícios DESTA loja", e a PK composta já a cobre
-- (barbershop_id é a coluna à esquerda). O índice abaixo é para o caminho
-- inverso — "quem tem estacionamento?", o filtro futuro do app.
create index if not exists barbershop_amenities_amenity_idx
  on barbershop_amenities (amenity_id);


-- ---------------------------------------------------------------------------
-- 3. O conjunto inicial
--
-- Doze comodidades de barbearia brasileira. `on conflict (slug) do update`
-- para que rodar a migration de novo corrija rótulo e ícone sem duplicar nada
-- e sem desmarcar as lojas.
-- ---------------------------------------------------------------------------
insert into amenities (slug, label, icon, sort_order) values
  ('wifi',            'Wi-Fi grátis',        'Wifi',         10),
  ('ar-condicionado', 'Ar-condicionado',     'Snowflake',    20),
  ('estacionamento',  'Estacionamento',      'Car',          30),
  ('acessibilidade',  'Acessível',           'Accessibility',40),
  ('cartao',          'Aceita cartão',       'CreditCard',   50),
  ('pix',             'Aceita Pix',          'QrCode',       60),
  ('tv',              'TV',                  'Tv',           70),
  ('bebida',          'Bebida cortesia',     'Coffee',       80),
  ('cerveja',         'Cerveja',             'Beer',         90),
  ('kids',            'Ambiente kids',       'Baby',        100),
  ('pet',             'Aceita pets',         'Dog',         110),
  ('jogos',           'Jogos e sinuca',      'Gamepad2',    120)
on conflict (slug) do update
  set label = excluded.label,
      icon  = excluded.icon,
      sort_order = excluded.sort_order;


-- ---------------------------------------------------------------------------
-- 4. RLS
--
-- Regra do 03_rls.sql: dado financeiro → can_manage_money(); dado operacional
-- → has_shop_access(). Benefício não é nem um nem outro — é CONFIGURAÇÃO
-- PÚBLICA da loja, do mesmo naipe de `services` e `business_hours`, que a tela
-- de configurações edita e o perfil público exibe.
--
-- Por isso a escrita usa `can_manage_money`, exatamente como `services_write`:
-- o assistente opera a agenda, mas não muda o que a loja anuncia ao público.
-- (O nome do helper fala de dinheiro, mas o que ele decide é "é o dono?".)
-- ---------------------------------------------------------------------------
alter table amenities            enable row level security;
alter table barbershop_amenities enable row level security;

-- --- Catálogo: todo mundo lê, ninguém escreve pela aplicação ----------------
-- Não há policy de insert/update/delete de propósito. Com RLS ligada e nenhuma
-- policy que permita escrita, `anon` e `authenticated` não escrevem — nem o
-- dono, nem o admin da plataforma. O catálogo só muda por migration, que roda
-- com a chave de serviço e passa por cima da RLS.
drop policy if exists amenities_public_select on amenities;
create policy amenities_public_select on amenities
  for select to anon, authenticated
  using (is_active);

-- --- Junção: leitura pública, espelhando services_public_select -------------
-- A condição da loja ativa não é enfeite: loja desativada some do perfil
-- público, e os benefícios dela precisam sumir junto.
drop policy if exists barbershop_amenities_public_select on barbershop_amenities;
create policy barbershop_amenities_public_select on barbershop_amenities
  for select to anon
  using (
    exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
  );

drop policy if exists barbershop_amenities_select on barbershop_amenities;
create policy barbershop_amenities_select on barbershop_amenities
  for select to authenticated
  using (
    exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active)
    or has_shop_access(barbershop_id)
  );

drop policy if exists barbershop_amenities_write on barbershop_amenities;
create policy barbershop_amenities_write on barbershop_amenities
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ---------------------------------------------------------------------------
-- 5. GRANTS — armadilha nº17 do ESTADO.md, e ela vale de verdade aqui
--
-- O Supabase tem ALTER DEFAULT PRIVILEGES concedendo tudo a `anon` e
-- `authenticated` em toda tabela nova do schema public. O
-- `revoke all ... from anon` do 03_rls.sql rodou ANTES destas tabelas
-- existirem e não as alcança.
--
-- Sem as linhas abaixo, `anon` nasceria com insert/update/delete nas duas.
-- A RLS barraria a escrita (não há policy para anon), mas a porta ficaria
-- destrancada — e `enable row level security` sozinho filtra LINHA, não fecha
-- porta. Aqui as duas tabelas SÃO de leitura pública, então o `select` para
-- anon é intencional; o resto sai.
-- ---------------------------------------------------------------------------
revoke all on amenities            from anon;
revoke all on barbershop_amenities from anon;
grant select on amenities            to anon;
grant select on barbershop_amenities to anon;

grant select, insert, update, delete on barbershop_amenities to authenticated;
-- O catálogo é somente leitura para a aplicação inteira. Sem grant de escrita,
-- nem uma policy acidental no futuro abre a porta.
revoke all on amenities from authenticated;
grant select on amenities to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Portão de conferência
--
-- O aplicar-sql.mjs roda o arquivo inteiro numa transação só (armadilha nº16),
-- então um `raise exception` aqui desfaz TUDO acima. Padrão herdado do 08.
-- ---------------------------------------------------------------------------
do $$
declare
  n_catalogo   integer;
  n_policies   integer;
  anon_escreve integer;
begin
  select count(*) into n_catalogo from amenities where is_active;
  if n_catalogo <> 12 then
    raise exception 'Esperava 12 benefícios ativos no catálogo, encontrei %.', n_catalogo;
  end if;

  select count(*) into n_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('amenities', 'barbershop_amenities');
  if n_policies <> 4 then
    raise exception 'Esperava 4 policies nas duas tabelas, encontrei %.', n_policies;
  end if;

  -- A armadilha nº17, conferida e não suposta: anon não pode ter privilégio
  -- de escrita em nenhuma das duas.
  select count(*) into anon_escreve
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('amenities', 'barbershop_amenities')
     and grantee = 'anon'
     and privilege_type <> 'SELECT';
  if anon_escreve > 0 then
    raise exception 'anon ficou com % privilégio(s) de escrita nas tabelas de benefício.', anon_escreve;
  end if;

  raise notice 'OK: % benefícios no catálogo, % policies, anon só com SELECT.',
    n_catalogo, n_policies;
end $$;
