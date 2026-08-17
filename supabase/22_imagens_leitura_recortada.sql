-- ============================================================================
-- PiBarber — 22_imagens_leitura_recortada.sql
--
-- A FOTO DE ROSTO DE TODO CLIENTE ERA ENUMERÁVEL POR QUEM NUNCA FEZ CONTA.
--
-- O bucket `imagens` guarda quatro coisas de naturezas diferentes no mesmo
-- espaço (src/lib/imagens.ts:44-49):
--
--     barbearias/{shop_id}/logo-{carimbo}.webp     ← vitrine, tem que ser público
--     barbearias/{shop_id}/capa-{carimbo}.webp     ← vitrine
--     barbeiros/{shop_id}/foto-{carimbo}.webp      ← vitrine
--     clientes/{profile_id}/foto-{carimbo}.webp    ← ISTO NÃO É VITRINE
--
-- E a policy de leitura não tinha recorte nenhum:
--
--     create policy imagens_leitura on storage.objects
--       for select to anon, authenticated
--       using (bucket_id = 'imagens');
--
-- A intenção era certa e continua valendo: a logo precisa aparecer em
-- /b/[slug] para quem não tem conta. O que passou despercebido é que, no
-- Supabase, a API de LISTAGEM (`POST /storage/v1/object/list/{bucket}`)
-- também é servida por um `select` sobre `storage.objects` — e portanto é
-- governada pela mesma policy. Sem filtro de caminho, ela concede junto a
-- enumeração de todo o bucket:
--
--     curl -X POST "$URL/storage/v1/object/list/imagens" \
--       -H "apikey: $ANON" -H "Content-Type: application/json" \
--       -d '{"prefix":"clientes/","limit":1000,"offset":0}'
--
-- Cada entrada devolve um `profile_id`. E `profile_id` NÃO é opaco neste
-- sistema: ele sai por `reviews.profile_id` (SEC-004) e por
-- `professionals.profile_id` (SEC-003), ambos legíveis por `anon`. O
-- resultado combinado é rosto + barbearias frequentadas + avaliações
-- escritas, montável por qualquer pessoa em minutos. Isso é tratamento de
-- dado pessoal fora do consentimento — a pessoa concordou em ter uma foto de
-- perfil, não em ter o rosto num conjunto de dados enumerável.
--
-- Sem a listagem, o carimbo de tempo em milissegundos no nome do arquivo tem
-- ~13 dígitos e não é adivinhável por força bruta. É a listagem, e só ela,
-- que transforma "URL pública não secreta" em "enumerável em massa".
--
-- ---------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO NÃO RESOLVE
-- ---------------------------------------------------------------------------
-- O bucket continua `public = true`, e num bucket público o endpoint
-- `/storage/v1/object/public/...` serve o arquivo SEM consultar a RLS. Ou
-- seja: quem já souber o caminho completo de uma foto continua baixando.
--
-- A correção de fundo é separar `clientes/` para um bucket privado e servir a
-- foto por URL assinada de curta duração — ver SEC-002, opção 1, em
-- AUDITORIA_SEGURANCA.md. Custa uma migration de bucket, mover os objetos
-- existentes e trocar `urlPublica` por `createSignedUrl` naquele destino.
-- Está registrado como PENDENTE. Este arquivo fecha a enumeração em massa,
-- que é o que torna o achado grave, e não move arquivo nenhum.
--
-- ---------------------------------------------------------------------------
-- POR QUE SÃO DUAS POLICIES, E NÃO UMA
-- ---------------------------------------------------------------------------
-- A armadilha desta correção está no DELETE, não no SELECT.
--
-- `apagarImagemAntiga()` (src/lib/imagens.ts:192-203) chama
-- `storage.remove([caminho])` para apagar a foto anterior quando a pessoa
-- troca a dela. O Storage faz um SELECT interno para localizar o objeto antes
-- de removê-lo. Se `clientes/` sumir do select, esse remove passa a falhar —
-- e a função engole o erro DE PROPÓSITO (o comentário nas linhas 185-189
-- explica por quê: a troca já foi salva, falhar ali não pode desfazê-la).
--
-- Ou seja: a faxina pararia de funcionar em silêncio, e o bucket acumularia
-- foto órfã sem que nada aparecesse em lugar nenhum. Por isso a policy de
-- `authenticated` inclui `pode_escrever_imagem(name)` — quem pode escrever
-- precisa poder enxergar para poder apagar.
--
-- Nenhuma tela quebra: a aplicação NUNCA chama `.list()` (os três únicos usos
-- do Storage em src/ são `getPublicUrl`, `upload` e `remove`), e
-- `getPublicUrl` só monta a string — não faz requisição e não passa por RLS.
--
-- ---------------------------------------------------------------------------
-- SE PRECISAR VOLTAR ATRÁS
-- ---------------------------------------------------------------------------
--   drop policy if exists imagens_leitura_publica on storage.objects;
--   drop policy if exists imagens_leitura_privada on storage.objects;
--   create policy imagens_leitura on storage.objects
--     for select to anon, authenticated using (bucket_id = 'imagens');
--   -- E aceite que as fotos dos clientes voltam a ser enumeráveis.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A policy antiga sai inteira.
-- ---------------------------------------------------------------------------
drop policy if exists imagens_leitura on storage.objects;


-- ---------------------------------------------------------------------------
-- 1. anon — só a vitrine
--
-- `split_part(name, '/', 1)` é o primeiro segmento do caminho, que é a pasta
-- de tipo. Mesma leitura que `pode_escrever_imagem()` faz com
-- `string_to_array` — se um dia os nomes de pasta mudarem em
-- src/lib/imagens.ts (DESTINOS), os dois lugares mudam juntos.
-- ---------------------------------------------------------------------------
drop policy if exists imagens_leitura_publica on storage.objects;
create policy imagens_leitura_publica on storage.objects
  for select to anon
  using (
    bucket_id = 'imagens'
    and split_part(name, '/', 1) in ('barbearias', 'barbeiros')
  );


-- ---------------------------------------------------------------------------
-- 2. authenticated — a vitrine mais o que a pessoa pode escrever
--
-- `pode_escrever_imagem(name)` já resolve os dois casos e não duplica regra:
--   · `clientes/<auth.uid()>/…`   → a própria foto (é o que salva o remove)
--   · `barbearias|barbeiros/<shop>/…` → quem tem can_manage_money naquela loja
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- Portão
-- ---------------------------------------------------------------------------
do $$
declare
  v_qtd  integer;
  v_qual text;
begin
  -- A policy sem recorte NÃO pode existir. Se ela voltar — e o caminho mais
  -- provável é reaplicar o 14_storage_imagens.sql —, a enumeração volta
  -- junto, e nada na aplicação denuncia isso.
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'imagens_leitura'
  ) then
    raise exception
      'PERIGO: a policy imagens_leitura (sem recorte de caminho) voltou a existir. Com ela, qualquer visitante lista clientes/ e obtém a foto de rosto de todo cliente junto com o profile_id. Ver SEC-002.';
  end if;

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

  -- O recorte precisa estar DENTRO da policy de anon, não só no nome dela.
  select qual into v_qual
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'imagens_leitura_publica';

  if v_qual not like '%barbearias%' or v_qual is null then
    raise exception 'A policy imagens_leitura_publica existe mas não recorta por pasta.';
  end if;

  if v_qual like '%clientes%' then
    raise exception 'A policy de anon menciona clientes/ — o recorte está invertido. Ver SEC-002.';
  end if;

  raise notice '22 aplicada — anon enxerga só barbearias/ e barbeiros/; clientes/ deixou de ser enumerável.';
end $$;
