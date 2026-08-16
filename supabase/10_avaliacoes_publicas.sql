-- ===========================================================================
-- 10 — As avaliações do perfil público voltam a aparecer
--
-- O BUG, e ele é grave: no perfil público de uma barbearia com 30 avaliações e
-- "4,8 ★" no cabeçalho, o VISITANTE DESLOGADO não via nenhuma. Zero. Descoberto
-- no T-5, montando a aba de Avaliações, e é anterior a ela.
--
-- A causa: a consulta pública embutia o nome do autor,
--
--     select id, rating, ..., autor:profiles!reviews_profile_id_fkey(full_name)
--
-- e `anon` não tem `grant select` em `profiles` — corretamente, porque lá moram
-- telefone, data de nascimento e e-mail de todo mundo. O PostgREST não degrada
-- o embed proibido para nulo: derruba a consulta INTEIRA com
--
--     42501 · permission denied for table profiles
--
-- e o `console.error` do lado do Next devolvia lista vazia sem que ninguém
-- percebesse. A falha silenciosa clássica: nada quebra na tela, o conteúdo
-- simplesmente deixa de existir.
--
-- Para quem estava LOGADO a consulta passava (authenticated tem o grant), mas
-- a policy `profiles_select` só libera o próprio perfil — então `autor` vinha
-- nulo e toda avaliação assinava "Cliente". Inclusive para o dono, que não
-- tinha como saber quem havia reclamado da barbearia dele.
--
-- A CORREÇÃO: uma função `security definer` que lê `profiles` por dentro e
-- devolve só o que pode ser público — o nome ABREVIADO. É o mesmo padrão de
-- `search_barbershops` e `client_home`, e o mesmo motivo: dar ao visitante o
-- recorte certo de uma tabela que ele não pode ler inteira.
--
-- POR QUE ABREVIAR ("Guilherme S.", não "Guilherme Santos"): a avaliação é
-- pública e indexada pelo Google. Nome completo mais barbearia mais bairro
-- identifica uma pessoa; primeiro nome mais inicial dá a credibilidade de uma
-- avaliação assinada sem publicar a identidade de ninguém. É o recorte que
-- iFood e Google Maps usam, pelo mesmo motivo.
--
-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
--   begin;
--   drop function if exists public_reviews(uuid, integer);
--   commit;
--
--   E reverter src/lib/queries/barbearia.ts para o embed anterior — que é
--   voltar ao bug, não a um estado bom.
-- ===========================================================================


create or replace function public_reviews(
  p_shop  uuid,
  limite  integer default 20
)
returns table (
  id           uuid,
  rating       integer,
  comment      text,
  reply        text,
  replied_at   timestamptz,
  created_at   timestamptz,
  autor        text,
  profissional text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    r.id,
    r.rating,
    r.comment,
    r.reply,
    r.replied_at,
    r.created_at,
    -- "Guilherme Santos" → "Guilherme S."; "Tião" (nome único) → "Tião".
    -- Sem nome, devolve nulo e a tela escreve "Cliente" — o fallback já existe.
    case
      when p.full_name is null or btrim(p.full_name) = '' then null
      when split_part(btrim(p.full_name), ' ', 2) = '' then split_part(btrim(p.full_name), ' ', 1)
      else split_part(btrim(p.full_name), ' ', 1) || ' ' ||
           upper(left(split_part(btrim(p.full_name), ' ', 2), 1)) || '.'
    end as autor,
    coalesce(prof.nickname, prof.name) as profissional
  from reviews r
  -- A loja precisa estar ativa: loja desativada some do perfil público, e as
  -- avaliações dela vão junto. Sem esta linha a função seria uma porta lateral
  -- para ler avaliação de loja fora do ar.
  join barbershops b on b.id = r.barbershop_id and b.is_active
  left join profiles p      on p.id = r.profile_id
  left join professionals prof on prof.id = r.professional_id
  where r.barbershop_id = p_shop
  order by r.created_at desc
  limit greatest(1, least(coalesce(limite, 20), 100));
$fn$;


-- ---------------------------------------------------------------------------
-- Grants — armadilha nº6 do ESTADO.md
--
-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova. O
-- `revoke ... from public` do 03_rls.sql rodou antes desta função existir e não
-- a alcança. Sem o revoke abaixo, o grant seguinte seria decorativo.
--
-- Esta função É para ser pública — é o perfil público que a chama, sem login.
-- O que ela expõe está recortado por dentro: nome abreviado e nada mais de
-- `profiles`.
-- ---------------------------------------------------------------------------
revoke execute on function public_reviews(uuid, integer) from public;
grant execute on function public_reviews(uuid, integer) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Portão de conferência — o arquivo inteiro roda numa transação (nº16), então
-- um raise aqui desfaz tudo.
-- ---------------------------------------------------------------------------
do $$
declare
  navalha    uuid;
  qtd        integer;
  exemplo    text;
  tem_public boolean;
begin
  select id into navalha from barbershops where slug = 'navalha-e-cia';

  if navalha is not null then
    select count(*) into qtd from public_reviews(navalha, 100);
    if qtd = 0 then
      raise exception 'public_reviews devolveu 0 avaliações para a Navalha & Cia, que tem avaliações.';
    end if;

    select autor into exemplo from public_reviews(navalha, 1);
    if exemplo is not null and exemplo like '% %' and exemplo not like '%.' then
      raise exception 'O nome do autor saiu sem abreviar: %', exemplo;
    end if;
    raise notice 'public_reviews: % avaliações, autor de exemplo %', qtd, coalesce(exemplo, '(sem nome)');
  end if;

  -- PUBLIC não pode ter ficado com EXECUTE (armadilha nº6).
  select has_function_privilege('public', 'public_reviews(uuid, integer)', 'execute')
    into tem_public;
  if tem_public then
    raise exception 'PUBLIC ficou com EXECUTE em public_reviews — o revoke não pegou.';
  end if;
end $$;
