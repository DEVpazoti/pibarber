-- ============================================================================
-- PiBarber — 23_reviews_sem_anon.sql
--
-- O GRAFO "QUEM FREQUENTA QUAL BARBEARIA", SERVIDO POR UM ENDPOINT PÚBLICO.
--
-- `grant select on … reviews … to anon` era de TABELA INTEIRA. As colunas de
-- `reviews` incluem `profile_id` e `appointment_id`, e a policy
-- `reviews_public_select` liberava toda avaliação de loja ativa. Ou seja:
--
--     curl -s "$URL/rest/v1/reviews?select=profile_id,barbershop_id,rating,comment,created_at" \
--          -H "apikey: $ANON"
--
-- devolvia, sem conta e sem sessão, o histórico de avaliações de todo mundo
-- com o identificador estável do autor. Agrupando por `profile_id` sai a lista
-- de estabelecimentos que cada pessoa frequentou e avaliou, inclusive em
-- cidades diferentes — um padrão de deslocamento. E `profile_id` é a chave que
-- liga isso à foto de rosto no Storage (SEC-002) e ao cadastro de funcionário
-- (SEC-003).
--
-- A pessoa consentiu em publicar uma AVALIAÇÃO. Não em publicar a lista de
-- lugares que frequenta.
--
-- ---------------------------------------------------------------------------
-- O QUE TORNA ESTE ACHADO DIFERENTE: A CORREÇÃO JÁ EXISTIA NO REPOSITÓRIO
-- ---------------------------------------------------------------------------
-- A migration 10_avaliacoes_publicas.sql criou `public_reviews()` — uma função
-- `security definer` que devolve exatamente as colunas públicas e ABREVIA o
-- nome do autor ("Guilherme S."), com a justificativa escrita nas linhas
-- 32-36: "a avaliação é pública e indexada pelo Google. Nome completo mais
-- barbearia mais bairro identifica uma pessoa".
--
-- A aplicação usa essa função corretamente e é a ÚNICA leitura pública de
-- avaliações em src/ (src/lib/queries/barbearia.ts:270). Só que o grant direto
-- na tabela continuou existindo ao lado dela, e por ele saía o `profile_id`
-- cru — um identificador ainda mais estável que o nome que a função 10 se deu
-- ao trabalho de abreviar.
--
-- Este arquivo apenas remove o resíduo.
--
-- ---------------------------------------------------------------------------
-- VERIFICADO ANTES DE REVOGAR
-- ---------------------------------------------------------------------------
-- Todas as leituras de `reviews` em src/, uma a uma:
--
--   src/lib/queries/barbearia.ts:270   rpc("public_reviews")  anon    ← não usa o grant
--   src/app/actions/booking.ts:338     insert                 authenticated
--   src/app/actions/shop.ts:419        update                 authenticated
--   src/app/painel/avaliacoes/page.tsx:65  select             authenticated
--
-- Nenhuma leitura anônima direta da tabela. `public_reviews()` é
-- `security definer`: lê `reviews` com os privilégios do dono da função, não
-- com os de quem chamou, então continua funcionando sem o grant.
--
-- ---------------------------------------------------------------------------
-- ⚠️ O QUE ESTE ARQUIVO NÃO RESOLVE
-- ---------------------------------------------------------------------------
-- O mesmo dado continua acessível a QUALQUER CONTA AUTENTICADA:
-- `authenticated` tem `grant select on all tables` (03_rls.sql:521) e a policy
-- `reviews_select` libera toda avaliação de loja ativa. Como o cadastro é
-- público e gratuito, o vetor descrito acima sobrevive ao custo de criar uma
-- conta.
--
-- Fechar isso exige grant por coluna em `reviews` para `authenticated`, e há
-- risco de quebrar o embed `autor:profiles!reviews_profile_id_fkey` de
-- /painel/avaliacoes — que é território do BUG-019. Está registrado como
-- PENDENTE em SEC-004, e NÃO foi feito aqui.
--
-- ---------------------------------------------------------------------------
-- SE PRECISAR VOLTAR ATRÁS
-- ---------------------------------------------------------------------------
--   grant select on reviews to anon;
--   create policy reviews_public_select on reviews
--     for select to anon
--     using (exists (select 1 from barbershops b where b.id = barbershop_id and b.is_active));
--   -- Mas leia SEC-004 antes: a aplicação não precisa disso para nada.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. O grant
-- ---------------------------------------------------------------------------
revoke select on reviews from anon;


-- ---------------------------------------------------------------------------
-- 2. A policy que sobrava
--
-- Ela só existe `to anon`, e sem grant nem chega a ser avaliada — remover não
-- muda comportamento nenhum hoje. O motivo de remover é outro: enquanto ela
-- existir, um `grant select on reviews to anon` sozinho (uma linha, num
-- arquivo qualquer, por qualquer motivo) reabre o vazamento inteiro em
-- silêncio. Sem a policy, o grant sozinho não devolve nada — a RLS nega por
-- padrão.
-- ---------------------------------------------------------------------------
drop policy if exists reviews_public_select on reviews;


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
begin
  -- O que NÃO PODE ter voltado.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'reviews'
       and grantee = 'anon' and privilege_type = 'SELECT'
  ) then
    raise exception
      'PERIGO: anon voltou a ter select em reviews. Com isso profile_id sai cru por /rest/v1/reviews, e o nome abreviado de public_reviews() deixa de proteger qualquer coisa. Ver SEC-004.';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'reviews'
       and policyname = 'reviews_public_select'
  ) then
    raise exception
      'A policy reviews_public_select voltou a existir. Ela é a segunda metade do vazamento do SEC-004 — sem ela, um grant acidental não devolve linha nenhuma.';
  end if;

  -- O espelho: sem ISTO, a aba Avaliações do perfil público para de carregar.
  -- É a única porta que sobrou para a leitura pública de avaliação.
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'public_reviews'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception
      'Falta o grant de execute em public_reviews() para anon — sem ele a aba Avaliações de /b/[slug] fica vazia para quem não tem conta.';
  end if;

  raise notice '23 aplicada — reviews saiu do alcance de anon; a leitura pública é só por public_reviews().';
end $$;
