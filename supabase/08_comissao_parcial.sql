-- ===========================================================================
-- 08 — Pagamento parcial de comissão, PARTE 2 de 2
--
-- ⚠️ RODE O 07 ANTES. Este arquivo usa o valor 'partial' do enum
--    `commission_status`, que só existe depois que o 07 foi commitado.
--    Sem isso, o erro é `55P04: unsafe use of new value`.
--
-- O QUE MUDA, E POR QUÊ
--
-- Até aqui a comissão era tudo-ou-nada: `pagarComissoes` fechava o lote inteiro
-- de um profissional numa tacada. O fiado já sabia receber em partes
-- (`debt_payments` + `paid_amount` + status `open/partial/paid` + `pay_debt`), e
-- esta migration traz a comissão para o MESMO idioma — de propósito. Quem
-- entende o fiado passa a entender a comissão sem reaprender nada.
--
-- A diferença que não dá para espelhar: um pagamento de fiado aponta para UMA
-- dívida; um pagamento de comissão é contra o SALDO do profissional e se
-- espalha por VÁRIAS comissões. O dono paga "R$ 100 hoje, o resto sexta", não
-- "a comissão do corte nº 7". A tela já trabalha assim: a pendente aparece
-- independentemente do período escolhido (o `.or(...)` em
-- src/app/painel/comissoes/page.tsx).
--
-- Por isso o valor é alocado em FIFO — da comissão mais antiga para a mais
-- nova. Isso mantém `commissions.status` significativo (a tela e o índice
-- `commissions_shop_prof_idx` dependem dele) sem inventar um conceito de
-- crédito solto.
--
-- ESTORNO: só o pagamento MAIS RECENTE do profissional. Decisão de produto,
-- tomada nesta sessão. O motivo é aritmético, não preguiça: como o FIFO enche
-- sempre da mais antiga para a mais nova, o último pagamento é exatamente a
-- última fatia alocada, e desalocar da mais nova para a mais antiga devolve o
-- estado anterior linha por linha. Estornar um pagamento do MEIO exigiria
-- guardar a distribuição de cada pagamento numa terceira tabela; sem ela, o
-- saldo até fecharia, mas a atribuição por atendimento ficaria trocada — a
-- lista "atendimentos que eu te paguei" mentiria. Recusar é mais honesto.
--
-- ===========================================================================
-- ROLLBACK — copie o bloco, rode e o banco volta ao estado anterior
-- ===========================================================================
--
--   begin;
--
--   -- 1. Devolve para 'paid'/'pending' o que virou 'partial'. Comissão paga
--   --    pela metade não existia no modelo antigo: ela volta a PENDENTE, e o
--   --    que foi pago dela vira prejuízo de registro (o caixa mantém a saída).
--   update commissions
--      set status = 'pending'::commission_status, paid_at = null
--    where status = 'partial';
--
--   -- 2. Anota quais saídas de caixa nasceram de pay_commissions. Só as que
--   --    têm pagamento vinculado — as do modelo antigo não são tocadas.
--   create temp table _rollback_caixa on commit drop as
--     select transaction_id as id from commission_payments where transaction_id is not null;
--
--   -- 3. A FK é `on delete restrict`: a tabela de pagamentos cai PRIMEIRO — e
--   --    antes dela, a coluna de commissions que a referencia.
--   drop function if exists revert_commission_payment(uuid);
--   drop function if exists pay_commissions(uuid, numeric, payment_method, uuid);
--   alter table commissions drop column if exists payment_id;
--   drop table if exists commission_payments;
--
--   -- 4. Agora as saídas de caixa podem sair.
--   delete from transactions where id in (select id from _rollback_caixa);
--
--   alter table commissions drop constraint if exists commissions_paid_amount_valido;
--   alter table commissions drop column if exists paid_amount;
--
--   commit;
--
--   -- Depois: `git checkout` em src/app/actions/money.ts,
--   -- src/components/painel/ComissoesPainel.tsx e src/app/painel/comissoes/page.tsx,
--   -- e `node supabase/aplicar-sql.mjs --tipos`.
--   --
--   -- O valor 'partial' do enum FICA (o Postgres não remove valor de enum), e
--   -- não faz mal nenhum: depois do passo 1 nenhuma linha o referencia.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. `commissions.paid_amount` — quanto desta comissão já foi pago
--
-- E `commissions.payment_id` — QUAL pagamento encostou nela por último.
--
-- Essa segunda coluna não estava no desenho original, e ela existe por causa de
-- um erro de raciocínio que só o teste de verdade derrubou. O plano era o
-- estorno redescobrir a alocação percorrendo o FIFO ao contrário, apoiado na
-- ideia de que "comissão paga" forma sempre um prefixo da ordem cronológica.
-- **Os dados históricos não obedecem isso**: o seed marcou comissões
-- espalhadas como pagas, sem ordem nenhuma, e ainda gravou `paid_at` no futuro.
-- Qualquer heurística baseada em data desalocava da linha errada.
--
-- Uma coluna de vínculo resolve sem depender de relógio nenhum: o estorno
-- pergunta "quais comissões este pagamento tocou?" e recebe a resposta exata.
-- É bem mais leve que a tabela de alocação que foi descartada (uma coluna, sem
-- RLS nova, sem consulta a mais) porque só precisa sustentar estorno em LIFO,
-- que é a regra escolhida.
-- ---------------------------------------------------------------------------

alter table commissions
  add column if not exists paid_amount numeric(12, 2) not null default 0;

-- Backfill ANTES da constraint: o que hoje está `paid` foi pago por inteiro.
-- Nada some, nada muda de status — só ganha o valor explícito.
update commissions
   set paid_amount = amount
 where status = 'paid'
   and paid_amount <> amount;

-- `add constraint` não aceita `if not exists`; o guard faz o papel dele e
-- mantém o arquivo reaplicável.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'commissions_paid_amount_valido'
  ) then
    alter table commissions
      add constraint commissions_paid_amount_valido
      check (paid_amount >= 0 and paid_amount <= amount);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. `commission_payments` — o extrato, espelhando `debt_payments`
--
-- `transaction_id` é o que torna o estorno possível: sem ele o estorno não
-- saberia qual saída de caixa apagar, e comissão estornada com a saída ainda
-- lançada faria o lucro do mês mentir — exatamente o erro que o `pagarComissoes`
-- antigo já se dava ao trabalho de desfazer à mão.
-- ---------------------------------------------------------------------------

create table if not exists commission_payments (
  id              uuid primary key default gen_random_uuid(),
  barbershop_id   uuid not null references barbershops (id) on delete cascade,
  professional_id uuid not null references professionals (id) on delete restrict,
  amount          numeric(12, 2) not null check (amount > 0),
  payment_method  payment_method not null default 'cash',
  -- Nulo só nas linhas do backfill: são pagamentos anteriores a esta migration,
  -- cuja saída de caixa não dá para reconhecer com segurança. O estorno recusa
  -- essas, e diz por quê.
  --
  -- `on delete restrict`, não `set null`: o Postgres passa a RECUSAR apagar uma
  -- saída de caixa que tem pagamento de comissão apontando para ela. Sem isso,
  -- `apagarLancamento` (que apaga qualquer despesa manual) sumiria com a saída e
  -- deixaria a comissão marcada como paga sem contrapartida no caixa — o lucro
  -- do mês passaria a mentir, silenciosamente. Isso já era possível no modelo
  -- antigo; aqui fica fechado no banco, não só na interface.
  transaction_id  uuid references transactions (id) on delete restrict,
  -- DUAS datas, e a diferença importa:
  --   `paid_at`    quando o dinheiro trocou de mão (dado de negócio, exibido)
  --   `created_at` quando a linha foi escrita (ordem real dos lançamentos)
  -- O estorno TEM de usar `created_at`. O seed grava `paid_at` no futuro, então
  -- ordenar por ele fazia "o pagamento mais recente" apontar para uma linha
  -- histórica e o estorno recusar o pagamento que acabara de ser lançado.
  -- Descoberto exercitando a RPC de verdade — ler o SQL não mostraria.
  paid_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles (id) on delete set null
);

-- Para bancos onde a versão anterior desta migration já rodou.
alter table commission_payments
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  -- Troca `on delete set null` por `on delete restrict` se a FK antiga ficou.
  if exists (
    select 1 from pg_constraint
     where conrelid = 'commission_payments'::regclass
       and contype = 'f' and confdeltype = 'n'
  ) then
    alter table commission_payments
      drop constraint commission_payments_transaction_id_fkey;
    alter table commission_payments
      add constraint commission_payments_transaction_id_fkey
      foreign key (transaction_id) references transactions (id) on delete restrict;
  end if;
end $$;

-- O estorno pergunta "qual foi o último pagamento deste profissional?" a cada
-- chamada, e a tela lista o extrato na mesma ordem.
create index if not exists commission_payments_prof_idx
  on commission_payments (barbershop_id, professional_id, created_at desc);

alter table commission_payments enable row level security;

-- ⚠️ GRANT, e não é detalhe: o Supabase tem ALTER DEFAULT PRIVILEGES concedendo
-- tudo a `anon` em toda tabela nova do schema `public`. O `revoke ... from anon`
-- do 03_rls.sql rodou ANTES desta tabela existir e não a alcança. Sem as linhas
-- abaixo, `GET /rest/v1/commission_payments` com a chave anônima devolve
-- **200** (vazio, porque a RLS filtra) em vez do 401 que toda tabela de dinheiro
-- deste projeto devolve. Verificado com a chave anônima de verdade.
revoke all on commission_payments from anon;
grant select, insert, update, delete on commission_payments to authenticated;

-- Chave de idempotência: a defesa contra lançar o mesmo pagamento duas vezes.
--
-- Não é hipótese. Com dois cliques no mesmo tique do navegador, `useTransition`
-- ainda não re-renderizou e o botão ainda não está desabilitado: as duas
-- chamadas saem, cada uma cabe no saldo, e o profissional recebe em dobro.
-- Reproduzido no Chrome antes desta coluna existir — R$ 71,00 lançados duas
-- vezes sem erro nenhum na tela.
--
-- Nem o `advisory lock` nem a checagem de saldo pegam isso: os dois pagamentos
-- são individualmente válidos. Só um identificador que o cliente gera UMA vez
-- por formulário distingue "paguei duas vezes" de "cliquei duas vezes".
alter table commission_payments
  add column if not exists idempotency_key uuid;

create unique index if not exists commission_payments_idem_idx
  on commission_payments (idempotency_key) where idempotency_key is not null;

-- Só agora: a coluna referencia a tabela que acabou de nascer.
-- `on delete set null` porque o estorno apaga o pagamento; as comissões que ele
-- tocou já foram desvinculadas à mão dentro da função, e isto é a rede.
alter table commissions
  add column if not exists payment_id uuid references commission_payments (id) on delete set null;

create index if not exists commissions_payment_idx on commissions (payment_id);

-- Mesma regra de `commissions` e `transactions`: dinheiro é do dono.
-- O assistente não lê nem escreve, e não é a UI que garante isso — é o
-- Postgres não devolver a linha.
drop policy if exists commission_payments_all on commission_payments;
create policy commission_payments_all on commission_payments
  for all to authenticated
  using (can_manage_money(barbershop_id))
  with check (can_manage_money(barbershop_id));


-- ---------------------------------------------------------------------------
-- 3. Backfill do histórico — o que já estava pago vira pagamento integral
--
-- O agrupamento por `paid_at` não é arbitrário: o `pagarComissoes` antigo
-- gravava o MESMO timestamp em todas as comissões do lote, então agrupar por
-- (loja, profissional, paid_at) reconstrói os lotes de verdade. Neste banco
-- isso devolve 67 pagamentos para 72 comissões pagas — 66 marcações
-- individuais vindas do seed e 1 lote real de 6 atendimentos (R$ 197,50, o
-- pagamento feito na sessão do T-3).
--
-- `created_by` fica nulo: não dá para saber quem registrou o que veio do seed,
-- e inventar um responsável seria pior do que admitir que não se sabe.
-- ---------------------------------------------------------------------------

insert into commission_payments (
  barbershop_id, professional_id, amount, payment_method, transaction_id, paid_at, created_by
)
select c.barbershop_id, c.professional_id, round(sum(c.amount), 2), 'cash', null, c.paid_at, null
  from commissions c
 where c.status = 'paid'
   and c.paid_at is not null
   -- Guard de reaplicação: não duplica se o arquivo rodar duas vezes.
   and not exists (
     select 1 from commission_payments p
      where p.barbershop_id = c.barbershop_id
        and p.professional_id = c.professional_id
        and p.paid_at = c.paid_at
   )
 group by c.barbershop_id, c.professional_id, c.paid_at;

-- Amarra cada comissão paga ao pagamento que a representa. Sem isto, as
-- comissões históricas ficariam com `payment_id` nulo e o extrato seria um
-- conjunto de linhas soltas, sem dizer o que cada uma quitou.
update commissions c
   set payment_id = p.id
  from commission_payments p
 where c.status = 'paid'
   and c.payment_id is null
   and p.barbershop_id = c.barbershop_id
   and p.professional_id = c.professional_id
   and p.paid_at = c.paid_at;


-- ---------------------------------------------------------------------------
-- 4. `pay_commissions` — pagar (parte d)o saldo de um profissional
--
-- Uma transação só: valida, aloca em FIFO, lança a saída no caixa e registra o
-- pagamento. Se qualquer passo falhar, nada acontece — é o que o
-- `pagarComissoes` antigo tentava fazer à mão em TypeScript, com um "desfaz"
-- que podia falhar por sua vez.
--
-- Não recebe `barbershop_id`: a loja sai do próprio profissional. Um parâmetro
-- a menos é uma mentira a menos que o chamador pode contar.
-- ---------------------------------------------------------------------------

-- Assinatura mudou (ganhou `p_idem`), e `create or replace` criaria uma
-- SOBRECARGA em vez de substituir — duas funções com o mesmo nome, e o
-- PostgREST escolhendo uma delas por contagem de argumentos. Derruba a antiga.
drop function if exists pay_commissions(uuid, numeric, payment_method);

create or replace function pay_commissions(
  p_professional uuid,
  p_valor        numeric,
  p_forma        payment_method default 'cash',
  p_idem         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_nome      text;
  v_valor     numeric(12, 2) := round(coalesce(p_valor, 0), 2);
  v_restante  numeric(12, 2);
  v_sobra     numeric(12, 2);
  v_aplicar   numeric(12, 2);
  v_quantas   int := 0;
  v_parcial   boolean;
  v_transacao uuid;
  v_pagamento uuid;
  v_tocadas   uuid[] := '{}';
  c           record;
begin
  select pr.barbershop_id, coalesce(nullif(pr.nickname, ''), pr.name)
    into v_shop, v_nome
    from professionals pr
   where pr.id = p_professional;

  if v_shop is null then
    raise exception 'Não encontrei esse profissional.';
  end if;

  -- Comissão é dinheiro do dono. O assistente vê fiado (é ele quem cobra no
  -- balcão), mas não paga comissão. Aqui, não só no menu.
  if not can_manage_money(v_shop) then
    raise exception 'Você não tem permissão para pagar comissão nesta barbearia.';
  end if;

  if p_forma = 'fiado' then
    raise exception 'Não dá para pagar comissão como fiado. Escolha outra forma.';
  end if;

  if v_valor <= 0 then
    raise exception 'O valor pago precisa ser maior que zero.';
  end if;

  -- Serializa por profissional. Sem isto, dois cliques simultâneos leem o mesmo
  -- saldo, cada um se acha dentro do limite, e os dois passam.
  perform pg_advisory_xact_lock(hashtextextended(p_professional::text, 0));

  -- DEPOIS do lock, de propósito: duas chamadas simultâneas com a mesma chave
  -- serializam aqui, a primeira insere e a segunda encontra. Devolver o mesmo
  -- id em vez de levantar erro é o comportamento certo — para quem chamou, o
  -- pagamento foi registrado, e foi mesmo. O índice único é a rede embaixo.
  if p_idem is not null then
    select id into v_pagamento from commission_payments where idempotency_key = p_idem;
    if v_pagamento is not null then
      return v_pagamento;
    end if;
  end if;

  select coalesce(sum(round(amount - paid_amount, 2)), 0)
    into v_restante
    from commissions
   where barbershop_id = v_shop
     and professional_id = p_professional
     and status <> 'paid';

  if v_restante <= 0 then
    raise exception 'Este profissional não tem comissão pendente.';
  end if;

  if v_valor > v_restante then
    raise exception 'O valor é maior que a comissão pendente (R$ %).',
      to_char(v_restante, 'FM999999990.00');
  end if;

  v_parcial := v_valor < v_restante;
  v_sobra := v_valor;

  -- FIFO: a comissão mais antiga é quitada primeiro. `id` no desempate para a
  -- ordem ser total — duas comissões podem nascer no mesmo instante, e o
  -- estorno precisa percorrer exatamente esta ordem ao contrário.
  for c in
    select id, amount, paid_amount
      from commissions
     where barbershop_id = v_shop
       and professional_id = p_professional
       and status <> 'paid'
     order by created_at, id
     for update
  loop
    exit when v_sobra <= 0;

    v_aplicar := least(v_sobra, round(c.amount - c.paid_amount, 2));
    if v_aplicar <= 0 then
      continue;
    end if;

    update commissions
       set paid_amount = round(paid_amount + v_aplicar, 2),
           status = case
             when round(paid_amount + v_aplicar, 2) >= amount then 'paid'::commission_status
             else 'partial'::commission_status
           end,
           -- `paid_at` passa a significar "quando foi QUITADA". Enquanto for
           -- parcial fica nulo, e é isso que mantém funcionando o filtro de
           -- período da tela de comissões, que lê esta coluna.
           paid_at = case
             when round(paid_amount + v_aplicar, 2) >= amount then now()
             else null
           end
     where id = c.id;

    v_sobra := round(v_sobra - v_aplicar, 2);
    v_quantas := v_quantas + 1;
    v_tocadas := v_tocadas || c.id;
  end loop;

  insert into transactions (
    barbershop_id, type, amount, payment_method,
    category, description, occurred_at, created_by
  ) values (
    v_shop, 'expense', v_valor, p_forma,
    'Comissão',
    'Comissão de ' || coalesce(v_nome, 'profissional') ||
      case when v_parcial then ' — pagamento parcial'
           else ' — ' || v_quantas || ' atendimento(s)' end,
    (now() at time zone 'America/Sao_Paulo')::date, auth.uid()
  )
  returning id into v_transacao;

  insert into commission_payments (
    barbershop_id, professional_id, amount, payment_method,
    transaction_id, idempotency_key, created_by
  ) values (
    v_shop, p_professional, v_valor, p_forma, v_transacao, p_idem, auth.uid()
  )
  returning id into v_pagamento;

  -- O vínculo, gravado por último porque só agora o pagamento tem id. É ele que
  -- o estorno vai ler — nenhuma data entra nessa conta.
  update commissions set payment_id = v_pagamento where id = any(v_tocadas);

  return v_pagamento;
end $fn$;


-- ---------------------------------------------------------------------------
-- 5. `revert_commission_payment` — desfaz o pagamento MAIS RECENTE
--
-- Percorre APENAS as comissões que este pagamento tocou (`payment_id`), da mais
-- nova para a mais antiga — o inverso exato do FIFO que as encheu.
--
-- Por que a ordem inversa acerta a fatia certa mesmo quando uma comissão foi
-- tocada por dois pagamentos: dentro das linhas de um pagamento, a única que
-- pode ter recebido valor de alguém antes é a MAIS ANTIGA (o FIFO só avança
-- quando a anterior enche). Descendo da mais nova para a mais antiga, quando o
-- laço chega nela o que restou de `v_sobra` é exatamente o que este pagamento
-- pôs ali — nem um centavo do pagamento anterior.
--
-- E é por isso que só o último pode ser estornado: o penúltimo pode ter uma
-- fatia coberta pelo último, e desfazer fora de ordem embaralharia a atribuição
-- por atendimento. A recusa é regra de correção, não limitação de interface.
-- ---------------------------------------------------------------------------

create or replace function revert_commission_payment(p_payment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_prof      uuid;
  v_valor     numeric(12, 2);
  v_transacao uuid;
  v_ultimo    uuid;
  v_anterior  uuid;
  v_sobra     numeric(12, 2);
  v_tirar     numeric(12, 2);
  c           record;
begin
  select p.barbershop_id, p.professional_id, p.amount, p.transaction_id
    into v_shop, v_prof, v_valor, v_transacao
    from commission_payments p
   where p.id = p_payment
   for update;

  if v_shop is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  if not can_manage_money(v_shop) then
    raise exception 'Você não tem permissão para estornar comissão nesta barbearia.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_prof::text, 0));

  -- Por `created_at`, NÃO por `paid_at`: o que precisa ser desfeito é o último
  -- lançamento escrito, e `paid_at` é data de negócio — pode ser anterior (ou,
  -- no seed, posterior) à ordem real em que as linhas entraram.
  select p.id into v_ultimo
    from commission_payments p
   where p.barbershop_id = v_shop
     and p.professional_id = v_prof
   order by p.created_at desc, p.id desc
   limit 1;

  if v_ultimo is distinct from p_payment then
    raise exception 'Só dá para estornar o pagamento mais recente deste profissional. Estorne os mais novos primeiro.';
  end if;

  if v_transacao is null then
    raise exception 'Este pagamento é anterior ao controle de pagamento parcial e não tem saída de caixa vinculada. Ajuste pelo Caixa, à mão.';
  end if;

  -- O pagamento que volta a ser o mais recente. É para ele que aponta a única
  -- comissão que pode sobrar com saldo depois do estorno — a mais antiga do
  -- lote, que o pagamento anterior tinha deixado pela metade.
  select p.id into v_anterior
    from commission_payments p
   where p.barbershop_id = v_shop
     and p.professional_id = v_prof
     and p.id <> p_payment
   order by p.created_at desc, p.id desc
   limit 1;

  v_sobra := v_valor;

  for c in
    select id, amount, paid_amount
      from commissions
     where payment_id = p_payment
     order by created_at desc, id desc
     for update
  loop
    exit when v_sobra <= 0;

    v_tirar := least(v_sobra, c.paid_amount);

    update commissions
       set paid_amount = round(paid_amount - v_tirar, 2),
           status = case
             when round(paid_amount - v_tirar, 2) <= 0 then 'pending'::commission_status
             when round(paid_amount - v_tirar, 2) >= amount then 'paid'::commission_status
             else 'partial'::commission_status
           end,
           paid_at = case
             when round(paid_amount - v_tirar, 2) >= amount then paid_at
             else null
           end,
           payment_id = case
             when round(paid_amount - v_tirar, 2) <= 0 then null
             else v_anterior
           end
     where id = c.id;

    v_sobra := round(v_sobra - v_tirar, 2);
  end loop;

  -- Cinto e suspensório: se sobrou valor sem onde desalocar, alguém mexeu no
  -- banco por fora. Levantar aqui desfaz a transação inteira e não deixa o
  -- caixa e a comissão discordarem.
  if v_sobra > 0 then
    raise exception 'Não consegui desfazer o pagamento inteiro (sobraram R$ %). Nada foi alterado.',
      to_char(v_sobra, 'FM999999990.00');
  end if;

  -- Nesta ordem, obrigatoriamente: a FK é `on delete restrict`, então o
  -- pagamento sai primeiro e só depois a saída de caixa que ele apontava.
  delete from commission_payments where id = p_payment;
  delete from transactions where id = v_transacao and barbershop_id = v_shop;

  return v_prof;
end $fn$;


-- ---------------------------------------------------------------------------
-- 6. Grants — armadilha nº 6 do ESTADO.md
--
-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função criada.
-- Conceder para `authenticated` NÃO tira esse padrão: sem o revoke abaixo,
-- `anon` chama as duas por /rest/v1/rpc/. Elas falhariam por dentro
-- (`auth.uid()` nulo → `can_manage_money` falso), mas é superfície à toa — e o
-- lint de segurança acusa.
-- ---------------------------------------------------------------------------

revoke execute on function pay_commissions(uuid, numeric, payment_method, uuid) from public, anon;
revoke execute on function revert_commission_payment(uuid) from public, anon;

grant execute on function pay_commissions(uuid, numeric, payment_method, uuid) to authenticated;
grant execute on function revert_commission_payment(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. Conferência — o que a migration deixou para trás
-- ---------------------------------------------------------------------------

do $$
declare
  v_pagamentos int;
  v_soma       numeric;
  v_pagas      numeric;
  v_divergente int;
begin
  select count(*), coalesce(sum(amount), 0) into v_pagamentos, v_soma
    from commission_payments;

  select coalesce(sum(paid_amount), 0) into v_pagas from commissions;

  select count(*) into v_divergente
    from commissions
   where (status = 'paid'    and paid_amount <> amount)
      or (status = 'pending' and paid_amount <> 0)
      or (status = 'partial' and (paid_amount <= 0 or paid_amount >= amount))
      -- Toda comissão com dinheiro em cima precisa dizer de qual pagamento ele
      -- veio; sem isso o estorno não teria como achá-la.
      or (paid_amount > 0 and payment_id is null);

  raise notice '08 concluído.';
  raise notice '  commission_payments: % linha(s), somando R$ %', v_pagamentos, v_soma;
  raise notice '  commissions.paid_amount somado: R$ %', v_pagas;
  raise notice '  linhas com status incoerente com paid_amount: %', v_divergente;

  if v_soma <> v_pagas then
    raise exception 'INCONSISTÊNCIA: o extrato (R$ %) não bate com o pago nas comissões (R$ %).',
      v_soma, v_pagas;
  end if;

  if v_divergente > 0 then
    raise exception 'INCONSISTÊNCIA: % comissão(ões) com status que não corresponde ao paid_amount.',
      v_divergente;
  end if;
end $$;
