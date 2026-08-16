-- ============================================================================
-- PiBarber — 05_criar_admin.sql
-- OPERAÇÃO. Marca uma conta como admin da plataforma.
--
-- is_platform_admin NÃO é um papel — é uma permissão extra em cima do papel
-- que a pessoa já tem. Quem recebe passa a acessar /admin, a tela onde as
-- barbearias são cadastradas.
--
-- COMO USAR
--   1. Crie a conta normalmente pelo /criar-conta do site.
--   2. Troque o e-mail abaixo pelo seu.
--   3. Rode este arquivo no SQL Editor.
--   4. Saia e entre de novo no site, para a sessão pegar a permissão nova.
-- ============================================================================

do $$
declare
  -- >>> TROQUE AQUI <<<
  v_email constant text := 'voce@exemplo.com';

  v_id   uuid;
  v_nome text;
begin
  select p.id, p.full_name
    into v_id, v_nome
    from profiles p
   where lower(p.email) = lower(v_email);

  if v_id is null then
    raise exception
      'Nenhuma conta encontrada com o e-mail %. Crie a conta pelo site primeiro.',
      v_email;
  end if;

  update profiles
     set is_platform_admin = true
   where id = v_id;

  raise notice '-------------------------------------------------------';
  raise notice 'Pronto. % (%) agora é admin da plataforma.', coalesce(v_nome, '(sem nome)'), v_email;
  raise notice 'Saia e entre de novo no site para a permissão valer.';
  raise notice 'Acesse /admin para cadastrar as barbearias.';
  raise notice '-------------------------------------------------------';
end $$;


-- ---------------------------------------------------------------------------
-- Conferência: quem é admin hoje?
-- ---------------------------------------------------------------------------
select
  p.email,
  p.full_name as nome,
  p.role      as papel,
  p.created_at as criado_em
from profiles p
where p.is_platform_admin
order by p.created_at;


-- ---------------------------------------------------------------------------
-- Para TIRAR a permissão de alguém, rode o comando abaixo trocando o e-mail:
--
--   update profiles set is_platform_admin = false
--    where lower(email) = lower('fulano@exemplo.com');
-- ---------------------------------------------------------------------------
