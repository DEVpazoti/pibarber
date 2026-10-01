-- ============================================================================
-- PiBarber — 35_como_conheceu.sql
--
-- "COMO VOCÊ CONHECEU O PIBARBER?" — DE ONDE VÊM AS BARBEARIAS.
--
-- A plataforma não sabia qual canal traz loja nova: Instagram, indicação de
-- outro barbeiro, visita da equipe. Sem isso não dá para decidir onde pôr
-- esforço. A pergunta entra na etapa 1 do setup guiado (/configurar), é
-- obrigatória ali, e a resposta aparece só no /admin.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA PRÓPRIA, E NÃO DUAS COLUNAS EM `barbershops`
-- ---------------------------------------------------------------------------
-- O 03_rls.sql dá `grant select on barbershops to anon` — a TABELA inteira,
-- todas as colunas — e a policy `barbershops_public_select` libera toda loja
-- ativa. Uma coluna nova ali ficaria legível por qualquer pessoa sem conta:
--
--     curl "$URL/rest/v1/barbershops?select=name,acquisition_detail" -H "apikey: $ANON"
--
-- E o detalhe é texto livre ("Quem indicou?"), que vai ter nome de gente.
-- Tirar só essas colunas do grant não funciona: no Postgres não se revoga uma
-- coluna de quem tem o grant da tabela; seria preciso refazer o grant de
-- `barbershops` coluna a coluna, e o `select("*")` espalhado pelo código
-- quebraria. Tabela separada, com RLS própria, resolve sem mexer no resto.
--
-- ---------------------------------------------------------------------------
-- AS REGRAS
-- ---------------------------------------------------------------------------
--   - `source`: um dos sete valores do check (o rótulo em português fica na
--     tela, src/lib/como-conheceu.ts — espelho, não regra).
--   - `detail`: até 100 caracteres, já aparado, nunca string vazia. Só existe
--     em indicação (opcional: "Quem indicou?") e em "other" (obrigatório:
--     "Qual?"). Nos demais canais é nulo.
--   - GRAVAÇÃO SÓ POR `salvar_como_conheceu()`. `authenticated` não tem
--     insert/update/delete na tabela. A função confere que quem chama é o DONO
--     da loja e que o setup AINDA NÃO TERMINOU (`setup_completed_at` nulo):
--     durante o setup o dono pode voltar à etapa 1 e mudar a resposta; depois,
--     nem por PATCH direto na REST. Não aparece em /painel/configuracoes.
--   - LEITURA: o dono (para a etapa 1 voltar preenchida) e o admin, pela
--     policy com `can_manage_money()`. O assistente não lê.
--   - NÃO É requisito de `concluir_setup_barbearia()`: loja que já está no meio
--     do setup não pode travar por uma pergunta que não existia quando ela
--     começou. Loja antiga simplesmente não tem linha ("Não informado").
--
-- ---------------------------------------------------------------------------
-- O /admin: admin_barbearias() ganha duas colunas
-- ---------------------------------------------------------------------------
-- O tipo de retorno de uma função `returns table` não muda com `create or
-- replace` — é preciso `drop` e `create`. Entre os dois, a função não existe:
-- por isso o arquivo inteiro roda numa transação só (begin/commit abaixo), com
-- os grants recriados iguais aos da 29 e um portão no fim conferindo que ela
-- continua executável só pelo caminho de hoje (authenticated + checagem de
-- is_platform_admin() por dentro; nada para anon nem PUBLIC).
--
-- Rollback:
--   drop function if exists salvar_como_conheceu(uuid, text, text);
--   drop table if exists barbershop_acquisition;
--   -- e recriar admin_barbearias() como está na 29_admin_dashboard.sql
--   -- (drop + create, na mesma transação, com os mesmos grants).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------------
create table if not exists barbershop_acquisition (
  barbershop_id uuid primary key references barbershops (id) on delete cascade,
  source        text not null,
  detail        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$ begin
  alter table barbershop_acquisition add constraint barbershop_acquisition_source_valida
    check (source in (
      'instagram', 'tiktok', 'google', 'barber_referral',
      'friend_referral', 'pibarber_team', 'other'
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table barbershop_acquisition add constraint barbershop_acquisition_detail_tamanho
    check (detail is null or (char_length(detail) between 1 and 100 and detail = btrim(detail)));
exception when duplicate_object then null;
end $$;

-- O detalhe só faz sentido em indicação e em "outro" — e em "outro" é obrigatório.
do $$ begin
  alter table barbershop_acquisition add constraint barbershop_acquisition_detail_coerente
    check (
      (source = 'other' and detail is not null)
      or (source in ('barber_referral', 'friend_referral'))
      or (source not in ('other', 'barber_referral', 'friend_referral') and detail is null)
    );
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 2. RLS: leitura do dono e do admin; escrita só pela função
-- ---------------------------------------------------------------------------
alter table barbershop_acquisition enable row level security;

drop policy if exists barbershop_acquisition_select on barbershop_acquisition;
create policy barbershop_acquisition_select on barbershop_acquisition
  for select to authenticated
  using (can_manage_money(barbershop_id));

-- O `grant ... on all tables` do 03 só valeu para as tabelas que existiam;
-- ainda assim, revoga tudo e devolve só o select, para ficar explícito.
revoke all on barbershop_acquisition from public, anon, authenticated;
grant select on barbershop_acquisition to authenticated;


-- ---------------------------------------------------------------------------
-- 3. A gravação — só durante o setup, só pelo dono
-- ---------------------------------------------------------------------------
create or replace function salvar_como_conheceu(p_shop uuid, p_source text, p_detail text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_setup_em timestamptz;
  v_detalhe  text := nullif(btrim(coalesce(p_detail, '')), '');
begin
  select b.setup_completed_at into v_setup_em
    from barbershops b
   where b.id = p_shop and b.owner_id = auth.uid();

  if not found then
    raise exception 'Só o dono da barbearia responde esta pergunta.' using errcode = '42501';
  end if;

  if v_setup_em is not null then
    raise exception 'A resposta só pode ser mudada durante a configuração da barbearia.';
  end if;

  if p_source is null or p_source not in (
    'instagram', 'tiktok', 'google', 'barber_referral',
    'friend_referral', 'pibarber_team', 'other'
  ) then
    raise exception 'Escolha como você conheceu o PiBarber.';
  end if;

  -- Canal sem detalhe: o que vier é descartado, não recusado.
  if p_source not in ('other', 'barber_referral', 'friend_referral') then
    v_detalhe := null;
  end if;

  if p_source = 'other' and v_detalhe is null then
    raise exception 'Conte qual foi o canal.';
  end if;

  if char_length(v_detalhe) > 100 then
    raise exception 'Use até 100 caracteres.';
  end if;

  insert into barbershop_acquisition (barbershop_id, source, detail)
  values (p_shop, p_source, v_detalhe)
  on conflict (barbershop_id) do update
    set source = excluded.source,
        detail = excluded.detail,
        updated_at = now();
end;
$fn$;

revoke all on function salvar_como_conheceu(uuid, text, text) from public, anon;
grant execute on function salvar_como_conheceu(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. admin_barbearias() com o canal — drop + create NA MESMA TRANSAÇÃO
--
-- Igual à 29, mais `como_conheceu` e `como_conheceu_detalhe` no fim.
-- ---------------------------------------------------------------------------
drop function if exists admin_barbearias(uuid);

create function admin_barbearias(p_shop uuid default null)
returns table (
  id                    uuid,
  name                  text,
  slug                  text,
  city                  text,
  state                 text,
  created_at            timestamptz,
  setup_em              timestamptz,
  dono_nome             text,
  dono_email            text,
  dono_telefone         text,
  sub_status            text,
  plano_id              text,
  plano_nome            text,
  ciclo                 text,
  parcelado             boolean,
  teste_ate             timestamptz,
  pago_ate              timestamptz,
  situacao              text,
  profissionais         integer,
  agendamentos_30d      integer,
  clientes              integer,
  nota                  numeric,
  avaliacoes            integer,
  como_conheceu         text,
  como_conheceu_detalhe text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;

  return query
  select b.id,
         b.name,
         b.slug,
         b.city,
         b.state,
         b.created_at,
         b.setup_completed_at,
         p.full_name,
         p.email,
         p.phone,
         s.status::text,
         s.plan_id,
         pl.name,
         s.cycle::text,
         (s.asaas_installment_id is not null and s.asaas_subscription_id is null),
         s.trial_ends_at,
         s.paid_until,
         case
           when b.blocked_at is not null then 'bloqueada'
           when b.setup_completed_at is null then 'setup'
           when s.paid_until > now() and s.status = 'canceled' then 'cancelada'
           when s.paid_until > now() then 'pagante'
           when s.paid_until + interval '1 day' > now() then 'atrasada'
           when s.trial_ends_at > now() then 'teste'
           else 'pausada'
         end,
         (select count(*)::int from professionals pr
           where pr.barbershop_id = b.id and pr.is_active),
         (select count(*)::int from appointments a
           where a.barbershop_id = b.id and a.starts_at > now() - interval '30 days'),
         (select count(*)::int from customers c where c.barbershop_id = b.id),
         b.rating_avg,
         b.rating_count,
         aq.source,
         aq.detail
    from barbershops b
    left join profiles p on p.id = b.owner_id
    left join subscriptions s on s.barbershop_id = b.id
    left join plans pl on pl.id = s.plan_id
    left join barbershop_acquisition aq on aq.barbershop_id = b.id
   where p_shop is null or b.id = p_shop
   order by b.created_at desc;
end;
$fn$;

revoke all on function admin_barbearias(uuid) from public, anon;
grant execute on function admin_barbearias(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure := 'public.admin_barbearias(uuid)'::regprocedure;
begin
  -- admin_barbearias: o mesmo caminho de hoje.
  if not (select prosecdef from pg_proc where oid = v_fn) then
    raise exception '35: admin_barbearias deixou de ser security definer.';
  end if;
  if position('is_platform_admin()' in (select prosrc from pg_proc where oid = v_fn)) = 0 then
    raise exception '35: admin_barbearias perdeu a checagem de is_platform_admin().';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception '35: anon consegue executar admin_barbearias.';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception '35: authenticated perdeu o execute de admin_barbearias.';
  end if;
  if exists (
    select 1 from pg_proc, aclexplode(proacl) a
     where oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception '35: PUBLIC tem execute em admin_barbearias.';
  end if;

  -- salvar_como_conheceu: security definer, sem anon.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'salvar_como_conheceu' and p.prosecdef
  ) then
    raise exception '35: salvar_como_conheceu não ficou security definer.';
  end if;
  if has_function_privilege('anon', 'public.salvar_como_conheceu(uuid, text, text)', 'execute') then
    raise exception '35: anon consegue executar salvar_como_conheceu.';
  end if;

  -- A tabela: RLS ligada, ninguém escreve direto, anon não lê.
  if not (select relrowsecurity from pg_class where oid = 'public.barbershop_acquisition'::regclass) then
    raise exception '35: RLS desligada em barbershop_acquisition.';
  end if;
  if has_table_privilege('anon', 'public.barbershop_acquisition', 'select') then
    raise exception '35: anon lê barbershop_acquisition.';
  end if;
  if has_table_privilege('authenticated', 'public.barbershop_acquisition', 'insert')
     or has_table_privilege('authenticated', 'public.barbershop_acquisition', 'update')
     or has_table_privilege('authenticated', 'public.barbershop_acquisition', 'delete') then
    raise exception '35: authenticated escreve direto em barbershop_acquisition.';
  end if;
end $$;

commit;
