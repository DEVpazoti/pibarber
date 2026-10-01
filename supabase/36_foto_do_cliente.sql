-- ============================================================================
-- PiBarber — 36_foto_do_cliente.sql
--
-- A FOTO DO CLIENTE NO DETALHE DO AGENDAMENTO DO PAINEL.
--
-- O detalhe do agendamento (src/components/painel/AppointmentSheet.tsx)
-- passou a mostrar a foto de quem está na cadeira. A ficha da loja
-- (`customers`) não tem foto: a única que existe é a do perfil GLOBAL da
-- pessoa, `profiles.avatar_url`, que ela mesma sobe pelo app.
--
-- Ler isso pelo caminho óbvio não funciona, e não dá erro:
--
--     cliente:customers(..., pessoa:profiles(avatar_url))
--
-- A policy `profiles_select` (03_rls.sql) só libera o PRÓPRIO perfil (e os
-- assistentes, para o dono). O embed volta nulo em silêncio e a tela mostra
-- iniciais para todo mundo. É a armadilha que já mordeu as avaliações (10) e a
-- lista de espera (32), e a saída é a mesma: uma função `security definer`
-- que lê `profiles` por dentro e devolve SÓ o recorte certo.
--
-- O recorte: a foto das fichas DESTA loja que estão ligadas a uma conta, para
-- quem tem acesso a ela — o dono, o assistente e o admin da plataforma (o
-- "Ver como o dono" é o admin com a sessão dele, e passa por
-- `is_platform_admin()`; ele está escrito aqui de propósito, mesmo
-- `has_shop_access()` já o incluindo, para a regra não depender de um detalhe
-- de outra função). Nada além da URL: nem e-mail, nem telefone do perfil.
--
-- A URL devolvida é a que a pessoa gravou: o bucket `imagens` é PÚBLICO
-- (14_storage_imagens.sql) e a foto do Google é endereço do Google — não há
-- URL assinada a gerar. A listagem do bucket continua fechada (22).
--
-- Cliente avulso (sem conta) não tem `profile_id` e simplesmente não volta.
--
-- Rollback:
--   drop function if exists fotos_dos_clientes(uuid, uuid[]);
-- ============================================================================

create or replace function fotos_dos_clientes(p_shop uuid, p_clientes uuid[])
returns table (customer_id uuid, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (has_shop_access(p_shop) or is_platform_admin()) then
    raise exception 'Sem acesso a esta barbearia.' using errcode = '42501';
  end if;

  return query
  select c.id, p.avatar_url
    from customers c
    join profiles p on p.id = c.profile_id
   where c.barbershop_id = p_shop
     and c.id = any (p_clientes)
     and p.avatar_url is not null;
end;
$fn$;

revoke all on function fotos_dos_clientes(uuid, uuid[]) from public, anon;
grant execute on function fotos_dos_clientes(uuid, uuid[]) to authenticated;


-- ---------------------------------------------------------------------------
-- Portão: a função existe, é security definer e o anon não executa.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fotos_dos_clientes' and p.prosecdef
  ) then
    raise exception '36: fotos_dos_clientes não ficou security definer.';
  end if;

  if has_function_privilege('anon', 'public.fotos_dos_clientes(uuid, uuid[])', 'execute') then
    raise exception '36: anon consegue executar fotos_dos_clientes.';
  end if;

  if not has_function_privilege('authenticated', 'public.fotos_dos_clientes(uuid, uuid[])', 'execute') then
    raise exception '36: authenticated perdeu o execute de fotos_dos_clientes.';
  end if;
end $$;
