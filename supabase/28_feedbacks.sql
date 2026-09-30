-- ============================================================================
-- PiBarber — 28_feedbacks.sql
--
-- O BARBEIRO REPORTA PROBLEMA, SUGESTÃO OU ELOGIO DE DENTRO DO PAINEL.
--
-- ---------------------------------------------------------------------------
-- O que entra
-- ---------------------------------------------------------------------------
--   1. `feedbacks` — cada relato, com o CONTEXTO que o sistema junta sozinho
--      (página, papel, plano, navegador): metade dos "não funciona" se resolve
--      sem precisar perguntar nada de volta.
--
--      Quem escreve: dono e assistente da loja (has_shop_access), sempre em
--      nome de si mesmo (`author_id = auth.uid()`). Quem lê e muda a situação:
--      só o admin da plataforma. O barbeiro não vê a lista — a resposta vai
--      pelo WhatsApp.
--
--   2. Limite de 10 relatos por barbearia por hora (trigger). Contra clique
--      repetido e contra alguém usando o formulário como canal de spam.
--
--   3. O bucket PRIVADO `feedbacks`, para o print da tela. Não é o `imagens`
--      de propósito: aquele é público (logo, capa, foto), e um print do painel
--      pode mostrar nome e telefone de cliente da barbearia. Aqui ninguém lê
--      pela URL — o /admin abre com link assinado, gerado no servidor.
--      Caminho: `<barbershop_id>/<arquivo>`; a primeira pasta é a loja, e é
--      ela que a policy confere.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   drop policy if exists feedbacks_print_insert on storage.objects;
--   drop policy if exists feedbacks_print_select on storage.objects;
--   delete from storage.objects where bucket_id = 'feedbacks';
--   delete from storage.buckets where id = 'feedbacks';
--   drop trigger if exists on_feedback_limite on feedbacks;
--   drop function if exists feedbacks_limite();
--   drop table if exists feedbacks;
-- ============================================================================

create table if not exists feedbacks (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  author_id       uuid references profiles (id) on delete set null,
  kind            text not null check (kind in ('problema', 'sugestao', 'elogio')),
  message         text not null check (char_length(message) between 5 and 2000),
  -- Onde o barbeiro estava quando abriu o formulário (ex.: /painel/agenda).
  page            text check (page is null or char_length(page) <= 300),
  -- Navegador, tela, papel, plano — o que o sistema juntou sozinho.
  context         jsonb not null default '{}'::jsonb,
  -- Caminho do print dentro do bucket `feedbacks` (não é URL: o bucket é
  -- privado, e o /admin gera o link assinado na hora).
  attachment_path text,
  status          text not null default 'novo'
                    check (status in ('novo', 'em_analise', 'resolvido')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists feedbacks_status_idx on feedbacks (status, created_at desc);
create index if not exists feedbacks_loja_idx on feedbacks (barbershop_id, created_at desc);

alter table feedbacks enable row level security;

drop policy if exists feedbacks_insert on feedbacks;
create policy feedbacks_insert on feedbacks
  for insert to authenticated
  with check (
    has_shop_access(barbershop_id)
    and author_id = auth.uid()
    and status = 'novo'
  );

drop policy if exists feedbacks_select on feedbacks;
create policy feedbacks_select on feedbacks
  for select to authenticated
  using (is_platform_admin());

drop policy if exists feedbacks_update on feedbacks;
create policy feedbacks_update on feedbacks
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

grant select, insert, update on feedbacks to authenticated;


-- ---------------------------------------------------------------------------
-- 10 por barbearia por hora.
-- ---------------------------------------------------------------------------
create or replace function feedbacks_limite()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if (
    select count(*) from feedbacks
     where barbershop_id = new.barbershop_id
       and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Muitos relatos em pouco tempo. Tente de novo daqui a pouco, ou fale com a gente pelo WhatsApp.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_feedback_limite on feedbacks;
create trigger on_feedback_limite
  before insert on feedbacks
  for each row execute function feedbacks_limite();


-- ---------------------------------------------------------------------------
-- O bucket privado do print.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedbacks', 'feedbacks', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Envia: quem opera a loja da primeira pasta do caminho. O `~` antes do cast
-- evita erro de conversão com nome malformado — vira "não pode", e pronto.
drop policy if exists feedbacks_print_insert on storage.objects;
create policy feedbacks_print_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedbacks'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and has_shop_access(split_part(name, '/', 1)::uuid)
  );

-- Lê: só o admin da plataforma. (O link assinado do /admin é gerado pela
-- service role, mas a policy fica aqui para não depender só disso.)
drop policy if exists feedbacks_print_select on storage.objects;
create policy feedbacks_print_select on storage.objects
  for select to authenticated
  using (bucket_id = 'feedbacks' and is_platform_admin());
