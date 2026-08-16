-- ============================================================================
-- PiBarber — 12_status_agendado.sql   (ajuste nº 11)
--
-- UNIFICA `confirmed` EM `scheduled`.
--
-- ---------------------------------------------------------------------------
-- O que foi investigado antes de mexer
-- ---------------------------------------------------------------------------
-- Os dois status nunca tiveram diferença funcional. Em TODO lugar onde o
-- sistema pergunta "esse atendimento ainda vai acontecer?", os dois aparecem
-- juntos, como um bloco só:
--
--   appointments_no_overlap   where (status in ('scheduled', 'confirmed'))
--   get_available_slots       a.status in ('scheduled', 'confirmed')
--   dashboard_summary         count(*) filter (where a.status in (...))
--   client_home               a.status in ('scheduled', 'confirmed')
--   painel e app do cliente   status === "scheduled" || status === "confirmed"
--
-- O ÚNICO caminho de escrita era o botão "Marcar como confirmado" do painel,
-- que fazia um update de coluna e nada mais: sem notificação para o cliente,
-- sem fluxo de aprovação, sem efeito no prazo de cancelamento, sem efeito no
-- caixa. Para o cliente, portanto, "Agendado" e "Confirmado" eram dois nomes
-- para o mesmo estado — e a dúvida "meu horário está confirmado ou não?" era
-- criada pela própria tela.
--
-- Este script migra os registros e recria a constraint de sobreposição sem
-- mencionar `confirmed`. O botão e a Server Action já foram removidos do
-- código; sem eles, nada mais escreve esse valor.
--
-- ---------------------------------------------------------------------------
-- Por que o VALOR do enum continua existindo
-- ---------------------------------------------------------------------------
-- Remover um valor de enum no Postgres exige recriar o tipo inteiro, e o tipo
-- está em uso pela coluna `appointments.status` E pela constraint de exclusão
-- `appointments_no_overlap`. É uma operação que trava a tabela e que, se falhar
-- no meio, deixa a agenda sem a trava que impede dois cortes no mesmo horário —
-- a constraint mais valiosa deste banco.
--
-- O ganho seria estético: um valor que ninguém escreve não faz mal nenhum.
-- Por isso a limpeza do enum fica na PARTE B, comentada, opcional, e para ser
-- rodada num momento de calmaria — nunca no meio do expediente.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Não há volta para os dados: quais linhas eram `confirmed` deixa de ser
-- conhecido depois do update. Isso é aceitável porque a informação não
-- distinguia nada. Para restaurar o COMPORTAMENTO antigo, basta recriar a
-- constraint com os dois valores:
--
--   alter table appointments drop constraint appointments_no_overlap;
--   alter table appointments add constraint appointments_no_overlap
--     exclude using gist (professional_id with =, tstzrange(starts_at, ends_at) with &&)
--     where (status in ('scheduled', 'confirmed'));
--
-- Se quiser guardar quem era quem antes de rodar, faça a cópia primeiro:
--   create table _backup_confirmed as
--     select id from appointments where status = 'confirmed';
-- ============================================================================


-- ###########################################################################
-- PARTE A — a migração (rode esta)
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1. Os registros existentes.
--
-- Sem `where`, o update varreria a tabela inteira à toa. O filtro também torna
-- o script idempotente: rodar de novo não muda nada e não custa nada.
-- ---------------------------------------------------------------------------
do $$
declare
  qtd integer;
begin
  update appointments
     set status = 'scheduled'
   where status = 'confirmed';

  get diagnostics qtd = row_count;
  raise notice 'Agendamentos migrados de "confirmed" para "scheduled": %', qtd;
end $$;


-- ---------------------------------------------------------------------------
-- 2. A constraint de sobreposição, sem `confirmed`.
--
-- É a trava que torna FISICAMENTE impossível marcar dois atendimentos no mesmo
-- horário para o mesmo profissional. Ela some por um instante aqui dentro —
-- por isso o arquivo inteiro deve rodar de uma vez, numa transação só. O SQL
-- Editor do Supabase já faz isso quando você cola tudo e roda de uma vez.
--
-- Se o `add` falhar, o `drop` volta atrás junto e a agenda continua protegida.
-- ---------------------------------------------------------------------------
alter table appointments drop constraint if exists appointments_no_overlap;

alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled');


-- ---------------------------------------------------------------------------
-- 3. As funções que citam `confirmed`.
--
-- `get_available_slots`, `dashboard_summary` e `client_home` filtram por
-- `in ('scheduled','confirmed')`. Elas continuam CORRETAS depois desta
-- migração — a lista simplesmente deixa de encontrar linhas `confirmed`, e o
-- resultado é idêntico. Não são tocadas aqui de propósito: mexer em três
-- funções para remover um valor que não existe mais em nenhuma linha é risco
-- sem retorno. Elas serão limpas naturalmente se a PARTE B for aplicada.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Portão: se o resultado não for o esperado, o Postgres desfaz tudo.
-- (o mesmo padrão dos arquivos 07–11)
-- ---------------------------------------------------------------------------
do $$
declare
  v_sobrou   integer;
  v_definicao text;
begin
  select count(*) into v_sobrou from appointments where status = 'confirmed';
  if v_sobrou > 0 then
    raise exception 'Sobraram % agendamentos com status "confirmed".', v_sobrou;
  end if;

  select pg_get_constraintdef(c.oid) into v_definicao
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'appointments' and c.conname = 'appointments_no_overlap';

  if v_definicao is null then
    raise exception 'A constraint appointments_no_overlap não existe — a agenda ficou SEM a trava de horário. NÃO prossiga.';
  end if;
  if v_definicao like '%confirmed%' then
    raise exception 'A constraint ainda menciona "confirmed" — a recriação não pegou.';
  end if;

  raise notice '12 aplicada — status unificado em "Agendado" e trava de horário no lugar.';
end $$;


-- ###########################################################################
-- PARTE B — limpar o valor do enum (OPCIONAL, não precisa rodar)
--
-- Só rode com a barbearia fechada: a tabela `appointments` fica travada
-- enquanto o tipo é trocado, e a constraint de sobreposição não existe durante
-- a operação. O ganho é cosmético — um valor morto a menos no enum.
--
-- Descomente o bloco inteiro e rode de uma vez só.
-- ###########################################################################

-- alter table appointments drop constraint appointments_no_overlap;
--
-- alter type appointment_status rename to appointment_status_antigo;
--
-- create type appointment_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
--
-- alter table appointments
--   alter column status drop default,
--   alter column status type appointment_status using status::text::appointment_status,
--   alter column status set default 'scheduled';
--
-- drop type appointment_status_antigo;
--
-- alter table appointments add constraint appointments_no_overlap
--   exclude using gist (
--     professional_id with =,
--     tstzrange(starts_at, ends_at) with &&
--   ) where (status = 'scheduled');
--
-- -- Depois da PARTE B, as três funções que citam 'confirmed' PRECISAM ser
-- -- reescritas sem ele, senão passam a dar erro de comparação:
-- --   get_available_slots · dashboard_summary · client_home
-- -- (o `in ('scheduled','confirmed')` deixa de compilar contra o novo tipo)
