-- ============================================================================
-- PiBarber — 32_lista_espera_contato.sql
--
-- A LISTA DE ESPERA DO PAINEL MOSTRAVA "Cliente" — SEM NOME E SEM TELEFONE.
--
-- /painel/espera lia o nome e o celular por um embed em `profiles`
-- (`pessoa:profiles!waitlist_entries_profile_id_fkey(full_name, phone)`). Só
-- que a policy `profiles_select` (03_rls.sql) deixa cada um ler o PRÓPRIO
-- perfil, e quem entra na fila pelo app (`join_waitlist`) não tem ficha na
-- barbearia. O embed voltava nulo em silêncio: toda linha aparecia como
-- "Cliente", sem o telefone e sem o botão de WhatsApp — o dono não tinha como
-- avisar ninguém de que a vaga abriu. Achado pelo teste E2E
-- (e2e/painel.spec.ts), em 2026-09-30.
--
-- É o mesmo problema que a 10 resolveu para as avaliações, com a mesma saída:
-- uma função `security definer` que lê `profiles` por dentro e devolve SÓ o
-- recorte certo para quem pode vê-lo.
--
-- O recorte: nome e celular de quem está na fila DESTA loja, para quem tem
-- acesso a ela (`has_shop_access`: o dono, o assistente, o admin). Quem entra
-- na fila de uma barbearia está pedindo para ela entrar em contato — é o
-- "com a barbearia que você escolheu" da política de privacidade (item 4).
--
-- Rollback:
--   drop function if exists contatos_da_lista_de_espera(uuid);
-- ============================================================================

create or replace function contatos_da_lista_de_espera(p_shop uuid)
returns table (entry_id uuid, full_name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not has_shop_access(p_shop) then
    raise exception 'Sem acesso a esta barbearia.' using errcode = '42501';
  end if;

  return query
  select w.id, p.full_name, p.phone
    from waitlist_entries w
    join profiles p on p.id = w.profile_id
   where w.barbershop_id = p_shop
     and w.status in ('waiting', 'notified');
end;
$fn$;

revoke all on function contatos_da_lista_de_espera(uuid) from public, anon;
grant execute on function contatos_da_lista_de_espera(uuid) to authenticated;
