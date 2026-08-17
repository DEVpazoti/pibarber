-- ============================================================================
-- PiBarber — 14_storage_imagens.sql   (ajuste nº 9)
--
-- O BUCKET DAS IMAGENS: logo e capa da barbearia, foto do profissional e foto
-- do cliente saem do aparelho e vão para o Supabase Storage.
--
-- ---------------------------------------------------------------------------
-- O desenho, em uma frase
-- ---------------------------------------------------------------------------
-- Um bucket público chamado `imagens`, com o caminho do arquivo dizendo de quem
-- ele é:
--
--   barbearias/{barbershop_id}/logo-1765432100000.webp
--   barbearias/{barbershop_id}/capa-1765432100000.webp
--   barbeiros/{barbershop_id}/foto-1765432100000.webp
--   clientes/{profile_id}/foto-1765432100000.webp
--
-- Quem escreve é decidido lendo os dois primeiros pedaços do caminho. Um bucket
-- só, um conjunto de policies só. Quatro buckets separados diriam exatamente a
-- mesma coisa com quatro vezes mais policy para manter em sincronia.
--
-- Por que `barbeiros/` é indexado pela BARBEARIA e não pelo profissional: no
-- momento em que a foto é escolhida, um profissional novo ainda não tem id. E a
-- permissão de mexer em profissional é a do dono da loja de qualquer forma —
-- então a pasta da loja diz a mesma coisa e já existe.
--
-- ---------------------------------------------------------------------------
-- Público para LER, restrito para ESCREVER
-- ---------------------------------------------------------------------------
-- Leitura pública não é descuido: estas imagens aparecem na página da barbearia
-- e na busca, telas que funcionam SEM LOGIN. Se a leitura exigisse sessão, o
-- perfil público apareceria sem logo para quem ainda não tem conta — que é
-- justamente quem a gente quer conquistar.
--
-- O que NÃO pode ir para este bucket: documento, comprovante, qualquer coisa
-- que não deva ser vista por quem tiver o link. Público aqui quer dizer público
-- de verdade — não há URL secreta.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop policy if exists imagens_leitura_publica on storage.objects;
--   drop policy if exists imagens_leitura_privada on storage.objects;
--   drop policy if exists imagens_insert  on storage.objects;
--   drop policy if exists imagens_update  on storage.objects;
--   drop policy if exists imagens_delete  on storage.objects;
--   drop function if exists pode_escrever_imagem(text);
--   -- e, se quiser apagar o bucket (ISTO APAGA AS IMAGENS):
--   -- delete from storage.objects where bucket_id = 'imagens';
--   -- delete from storage.buckets where id = 'imagens';
--
-- O código tolera a ausência deste script: sem o bucket, o envio falha com
-- "Não consegui enviar a imagem" e o campo de URL continua funcionando.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. O bucket
--
-- `file_size_limit` e `allowed_mime_types` são a MESMA regra que a tela já
-- aplica antes de enviar. Repetida aqui de propósito: a validação do navegador
-- é conveniência, esta é a que vale. Quem chamar a API do Storage direto
-- esbarra nela.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens',
  'imagens',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. Quem pode escrever onde
--
-- Uma função só, chamada pelas três policies de escrita. Concentrar a regra
-- aqui é o que impede o clássico "consertei o insert e esqueci o delete".
--
-- Ela reusa `can_manage_money()` — o mesmo helper que decide quem edita a
-- barbearia e a equipe em 03_rls.sql. Ou seja: quem pode trocar o nome da loja
-- pode trocar a logo dela, e ninguém mais. Assistente não mexe em imagem, pela
-- mesma razão de não mexer em serviço.
--
-- O `exception when others` no cast existe porque `name` é texto livre: um
-- caminho como `barbearias/lixo/x.webp` faria o `::uuid` explodir e o erro
-- subiria como falha do upload em vez de negação limpa.
-- ---------------------------------------------------------------------------
create or replace function pode_escrever_imagem(p_nome text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_partes text[] := string_to_array(coalesce(p_nome, ''), '/');
  v_tipo   text   := v_partes[1];
  v_id     text   := v_partes[2];
  v_uuid   uuid;
begin
  if auth.uid() is null then return false; end if;
  if v_tipo is null or v_id is null then return false; end if;

  -- Sem subpasta depois do id: `clientes/<outro-id>/../meu/foto.webp` não é
  -- caminho, é tentativa.
  if array_length(v_partes, 1) <> 3 then return false; end if;

  begin
    v_uuid := v_id::uuid;
  exception when others then
    return false;
  end;

  if v_tipo = 'barbearias' or v_tipo = 'barbeiros' then
    -- Logo, capa e foto de profissional: o dono da loja (e o admin).
    return can_manage_money(v_uuid);

  elsif v_tipo = 'clientes' then
    -- A foto de perfil é da própria pessoa. Ninguém troca a foto de ninguém.
    return v_uuid = auth.uid();
  end if;

  return false;
end;
$fn$;

revoke execute on function pode_escrever_imagem(text) from public, anon;
grant execute on function pode_escrever_imagem(text) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. As policies
--
-- `storage.objects` já vem com RLS ligada no Supabase — não é preciso (nem
-- possível, sem ser dono da tabela) mexer nisso aqui.
-- ---------------------------------------------------------------------------

-- Leitura: qualquer um, logado ou não. É o que faz a logo aparecer em /b/[slug]
-- para quem ainda não tem conta.
--
-- ⚠️ RECORTADA EM 22_imagens_leitura_recortada.sql. A versão original era
-- `for select to anon, authenticated using (bucket_id = 'imagens')` — sem
-- filtro de caminho. No Supabase a API de LISTAGEM também é servida por um
-- select sobre storage.objects, então aquela policy deixava qualquer visitante
-- enumerar `clientes/` e obter a foto de rosto de todo cliente junto com o
-- profile_id dele. É o SEC-002.
--
-- Duas policies em vez de uma: `anon` vê só a vitrine; `authenticated` vê a
-- vitrine mais o que pode escrever — este segundo termo é o que mantém
-- `apagarImagemAntiga()` funcionando, porque o remove do Storage faz um select
-- interno para achar o objeto.
drop policy if exists imagens_leitura on storage.objects;

drop policy if exists imagens_leitura_publica on storage.objects;
create policy imagens_leitura_publica on storage.objects
  for select to anon
  using (
    bucket_id = 'imagens'
    and split_part(name, '/', 1) in ('barbearias', 'barbeiros')
  );

drop policy if exists imagens_leitura_privada on storage.objects;
create policy imagens_leitura_privada on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imagens'
    and (
      split_part(name, '/', 1) in ('barbearias', 'barbeiros')
      or pode_escrever_imagem(name)
    )
  );

drop policy if exists imagens_insert on storage.objects;
create policy imagens_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imagens' and pode_escrever_imagem(name));

-- O app nunca sobrescreve (todo arquivo leva carimbo de tempo no nome), mas a
-- policy existe para o caso de o Storage resolver por um upsert por dentro.
drop policy if exists imagens_update on storage.objects;
create policy imagens_update on storage.objects
  for update to authenticated
  using (bucket_id = 'imagens' and pode_escrever_imagem(name))
  with check (bucket_id = 'imagens' and pode_escrever_imagem(name));

-- Delete é o que faz a faxina da imagem antiga funcionar. Sem esta policy o
-- sistema segue funcionando e vai acumulando arquivo órfão em silêncio.
drop policy if exists imagens_delete on storage.objects;
create policy imagens_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'imagens' and pode_escrever_imagem(name));


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_publico boolean;
  v_qtd     integer;
begin
  select public into v_publico from storage.buckets where id = 'imagens';
  if v_publico is null then
    raise exception 'O bucket "imagens" não foi criado.';
  end if;
  if not v_publico then
    raise exception 'O bucket "imagens" não está público — as imagens não apareceriam no site.';
  end if;

  -- Cinco desde a 22: a leitura virou duas policies (anon e authenticated),
  -- com recortes diferentes. Ver SEC-002.
  select count(*) into v_qtd
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname in (
       'imagens_leitura_publica', 'imagens_leitura_privada',
       'imagens_insert', 'imagens_update', 'imagens_delete'
     );

  if v_qtd <> 5 then
    raise exception 'Esperava 5 policies de imagem, encontrei %.', v_qtd;
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'imagens_leitura'
  ) then
    raise exception
      'PERIGO: a policy imagens_leitura (sem recorte) voltou — clientes/ ficaria enumerável por anon. Ver SEC-002.';
  end if;

  raise notice '14 aplicada — bucket "imagens" pronto: leitura pública, escrita do dono.';
end $$;
