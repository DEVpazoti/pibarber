-- ============================================================================
-- PiBarber — 16_pendencias.sql   (rodada 2, ajuste nº 2)
--
-- ATENDIMENTO DE DIA ANTERIOR QUE FICOU SEM CONCLUSÃO.
--
-- ---------------------------------------------------------------------------
-- ⚠️ A MUDANÇA MAIS IMPORTANTE DESTE ARQUIVO ESTÁ NA PARTE 1, E ELA VALE PARA
--    TODA CONCLUSÃO DO SISTEMA — não só para as pendências.
-- ---------------------------------------------------------------------------
-- `complete_appointment` lançava a receita no caixa com
--
--     occurred_at = (now() at time zone 'America/Sao_Paulo')::date
--
-- ou seja: a data em que o botão foi APERTADO. Enquanto o barbeiro concluía no
-- mesmo dia, isso e a data do atendimento eram a mesma coisa e ninguém notou.
--
-- É justamente o que quebra no caso deste ajuste. O barbeiro esquece a
-- quinta-feira inteira, lembra no sábado e conclui os seis atendimentos: os
-- R$ 400 da quinta entram no caixa do SÁBADO. Quinta fica zerada e sábado fica
-- inflado — nos dois dias o relatório mente, e o gráfico de faturamento passa
-- a ter um buraco e um pico que nunca existiram.
--
-- Agora a receita entra na DATA DO ATENDIMENTO. Concluir no mesmo dia continua
-- caindo no mesmo dia (o caso comum não muda em nada); concluir depois devolve
-- o dinheiro para o dia em que o serviço foi prestado, que é onde ele sempre
-- pertenceu.
--
-- O que NÃO muda: `completed_at` continua sendo o instante real do clique. A
-- pergunta "quando isso foi registrado?" continua tendo resposta.
--
-- ---------------------------------------------------------------------------
-- O status "não compareceu" NÃO é criado aqui, porque JÁ EXISTE
-- ---------------------------------------------------------------------------
-- `no_show` está no enum `appointment_status` desde o 01_schema.sql, a função
-- `mark_no_show()` existe e incrementa `customers.no_show_count`, e ele já não
-- entra no faturamento — só `complete_appointment` escreve em `transactions`.
--
-- O que faltava era EXPOR isso onde o barbeiro fosse encontrar. Isso é tela,
-- não banco.
--
-- ---------------------------------------------------------------------------
-- Por que "desfazer" NÃO desfaz conclusão
-- ---------------------------------------------------------------------------
-- Reverter um `completed` significaria, numa transação só: apagar a entrada do
-- caixa, apagar a comissão (que pode JÁ TER SIDO PAGA, com saída de caixa
-- própria), apagar a dívida de fiado (que pode já ter recebido pagamento
-- parcial) e descontar as estatísticas da ficha do cliente.
--
-- Cada um desses tem um caminho de "já foi usado depois" que transformaria o
-- desfazer em corrupção silenciosa de dinheiro. Este banco recusa operação de
-- dinheiro pela metade — é a razão de `complete_appointment` conferir a soma
-- ANTES de escrever qualquer coisa.
--
-- Então: `reverter_status_agendamento` cobre `no_show` e `cancelled`, que não
-- movem um centavo. Contra o "concluí 20 por engano", a defesa é a confirmação
-- ANTES, com o total à vista, e não o desfazer depois.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   -- 1. a data do caixa volta a ser a da conclusão: reaplique o 02_functions.sql
--   --    (ATENÇÃO: o 02 também tem o book_appointment ANTIGO, sem as travas do
--   --     11 e sem o avulso do 13. Reaplicar o 02 inteiro é REGRESSÃO.
--   --     Copie SÓ o corpo de complete_appointment.)
--   drop function if exists complete_appointments_lote(uuid[], payment_method);
--   drop function if exists reverter_status_agendamento(uuid);
--   drop index if exists appointments_pendencias_idx;
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — complete_appointment: a receita vai para a data do ATENDIMENTO
--
-- Base: 02_functions.sql. É o único arquivo que já definiu esta função — não
-- há versão posterior a preservar, ao contrário de `book_appointment`, cuja
-- base obrigatória é o 11 (e depois o 13).
--
-- Muda UMA coisa: o `occurred_at` do insert em `transactions`. O resto é
-- palavra por palavra, e o portão no fim do arquivo confere isso.
-- ###########################################################################

create or replace function complete_appointment(
  p_appointment uuid,
  p_pagamentos  jsonb,
  p_desconto    numeric default 0,
  p_vencimento  date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop      uuid;
  v_prof      uuid;
  v_customer  uuid;
  v_status    appointment_status;
  v_total     numeric(10, 2);
  v_desconto  numeric(10, 2) := round(coalesce(p_desconto, 0)::numeric, 2);
  v_liquido   numeric(10, 2);
  v_soma      numeric(10, 2) := 0;
  v_fiado     numeric(10, 2) := 0;
  v_percent   numeric(5, 2);
  v_comissao  numeric(12, 2);
  v_profile   uuid;
  v_shop_nome text;
  pgto        jsonb;
  v_metodo    payment_method;
  v_valor     numeric(12, 2);
  v_dia_caixa date;   -- nº 2
begin
  -- Trava a linha: dois cliques no botão "Concluir" não podem lançar duas vezes.
  -- `starts_at` entra no select por causa do nº 2.
  select a.barbershop_id, a.professional_id, a.customer_id, a.status, a.total_price,
         (a.starts_at at time zone 'America/Sao_Paulo')::date
    into v_shop, v_prof, v_customer, v_status, v_total, v_dia_caixa
    from appointments a
   where a.id = p_appointment
     for update;

  if v_shop is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  -- SECURITY DEFINER ignora RLS: a permissão precisa ser conferida aqui.
  if not has_shop_access(v_shop) then
    raise exception 'Você não tem permissão para concluir este atendimento.';
  end if;

  if v_status = 'completed' then
    raise exception 'Este atendimento já foi concluído.';
  end if;

  if v_status in ('cancelled', 'no_show') then
    raise exception 'Este atendimento foi cancelado e não pode ser concluído.';
  end if;

  if v_desconto > v_total then
    raise exception 'O desconto não pode ser maior que o total do atendimento.';
  end if;

  v_liquido := round(v_total - v_desconto, 2);

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' then
    raise exception 'Informe como o cliente pagou.';
  end if;

  -- 1. A soma tem que bater ANTES de escrever qualquer coisa.
  for pgto in select * from jsonb_array_elements(p_pagamentos) loop
    v_valor := round(coalesce((pgto ->> 'amount')::numeric, 0), 2);
    if v_valor <= 0 then
      raise exception 'Todo pagamento precisa ter valor maior que zero.';
    end if;
    v_soma := v_soma + v_valor;
    if (pgto ->> 'method') = 'fiado' then
      v_fiado := v_fiado + v_valor;
    end if;
  end loop;

  if v_soma <> v_liquido then
    raise exception
      'A soma dos pagamentos (R$ %) não bate com o total do atendimento (R$ %).',
      to_char(v_soma, 'FM999999990.00'), to_char(v_liquido, 'FM999999990.00');
  end if;

  if v_fiado > 0 and p_vencimento is null then
    raise exception 'Informe a data de vencimento do fiado.';
  end if;

  -- 2. Conclui. `completed_at` continua sendo o instante REAL do clique — a
  --    pergunta "quando isso foi registrado?" não pode perder a resposta.
  update appointments
     set status = 'completed',
         completed_at = now(),
         discount = v_desconto
   where id = p_appointment;

  -- 3 e 4. Cada forma de pagamento vira caixa; o fiado vira dívida.
  for pgto in select * from jsonb_array_elements(p_pagamentos) loop
    v_metodo := (pgto ->> 'method')::payment_method;
    v_valor  := round(coalesce((pgto ->> 'amount')::numeric, 0), 2);

    if v_metodo = 'fiado' then
      insert into debts (
        barbershop_id, customer_id, appointment_id,
        original_amount, paid_amount, status, due_date
      ) values (
        v_shop, v_customer, p_appointment,
        v_valor, 0, 'open', p_vencimento
      );
    else
      insert into transactions (
        barbershop_id, type, amount, payment_method,
        category, description, appointment_id, occurred_at, created_by
      ) values (
        v_shop, 'income', v_valor, v_metodo,
        'Atendimento', 'Atendimento concluído', p_appointment,
        -- ==================================================================
        -- nº 2 — A DATA DO ATENDIMENTO, não a da conclusão.
        --
        -- Era `(now() at time zone 'America/Sao_Paulo')::date`. Concluir no
        -- sábado a quinta esquecida jogava o dinheiro da quinta no sábado:
        -- quinta zerada, sábado inflado, e o relatório mentindo nos dois.
        -- ==================================================================
        v_dia_caixa, auth.uid()
      );
    end if;
  end loop;

  -- 5. Comissão sobre o valor líquido — o fiado também conta, porque o serviço
  --    foi prestado. O que muda é quando o dinheiro entra, não o que é devido.
  select pr.commission_percent into v_percent
    from professionals pr where pr.id = v_prof;

  if coalesce(v_percent, 0) > 0 then
    v_comissao := round(v_liquido * v_percent / 100, 2);

    insert into commissions (
      barbershop_id, professional_id, appointment_id,
      base_amount, percent, amount, status
    ) values (
      v_shop, v_prof, p_appointment,
      v_liquido, v_percent, v_comissao, 'pending'
    )
    on conflict (appointment_id) do nothing;
  end if;

  -- 6. Estatísticas da ficha do cliente.
  update customers
     set total_visits  = total_visits + 1,
         total_spent   = total_spent + v_liquido,
         last_visit_at = now()
   where id = v_customer;

  -- 7. Convite para avaliar — é o que alimenta a nota da barbearia.
  select c.profile_id into v_profile from customers c where c.id = v_customer;
  select b.name into v_shop_nome from barbershops b where b.id = v_shop;

  if v_profile is not null then
    insert into notifications (profile_id, type, title, body, link)
    values (
      v_profile, 'review',
      'Como foi seu atendimento?',
      'Conte como foi na ' || coalesce(v_shop_nome, 'barbearia') || '. Leva 10 segundos.',
      '/app/agendamentos'
    );
  end if;

  return p_appointment;
end;
$fn$;

-- A assinatura não mudou; o grant do 03_rls.sql continua valendo. Reafirmado
-- por garantia, como nos arquivos 11 e 13.
revoke execute on function complete_appointment(uuid, jsonb, numeric, date) from public, anon;
grant execute on function complete_appointment(uuid, jsonb, numeric, date) to authenticated;


-- ###########################################################################
-- PARTE 2 — CONCLUSÃO EM LOTE
--
-- O caso de uso real: o barbeiro atendeu todo mundo na quinta e só esqueceu de
-- registrar. Ele quer marcar os seis de uma vez, não abrir seis modais.
--
-- NÃO reimplementa a conclusão. Chama `complete_appointment` uma vez por
-- atendimento, dentro da MESMA transação — assim caixa, comissão, estatística
-- do cliente e notificação de avaliação saem idênticos ao caminho de um a um.
-- Reescrever a lógica aqui criaria dois caminhos para a operação mais delicada
-- do sistema, e um dia eles divergiriam.
--
-- TUDO OU NADA: uma função plpgsql roda numa transação só. Se o atendimento
-- número 4 falhar, os três primeiros voltam atrás. É o comportamento certo —
-- "concluí 6 e 3 entraram" é pior do que "não concluí nada, corrija e tente de
-- novo", porque o barbeiro não teria como saber quais foram.
-- ###########################################################################

create or replace function complete_appointments_lote(
  p_ids   uuid[],
  p_forma payment_method default 'cash'
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id       uuid;
  v_total    numeric(10, 2);
  v_status   appointment_status;
  v_shop     uuid;
  v_quantos  integer := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Nenhum atendimento foi selecionado.';
  end if;

  -- Um teto para o lote. Não é medo de lentidão: é que um array gigante aqui
  -- quase sempre é engano de tela, e o estrago seria proporcional.
  if array_length(p_ids, 1) > 100 then
    raise exception 'Dá para concluir até 100 atendimentos de uma vez.';
  end if;

  -- Fiado NÃO entra no lote. Ele exige data de vencimento por atendimento e
  -- cria uma dívida por cliente — decisão individual, que não cabe num
  -- "concluir tudo com um toque".
  if p_forma = 'fiado' then
    raise exception 'Fiado precisa ser lançado atendimento por atendimento, com a data de vencimento.';
  end if;

  foreach v_id in array p_ids loop
    select a.barbershop_id, a.status, a.total_price
      into v_shop, v_status, v_total
      from appointments a
     where a.id = v_id;

    if v_shop is null then
      raise exception 'Um dos atendimentos selecionados não existe mais. Atualize a tela.';
    end if;

    -- Confere aqui TAMBÉM, e não só dentro de complete_appointment: a mensagem
    -- fica específica, e o lote inteiro para antes de escrever qualquer coisa.
    if not has_shop_access(v_shop) then
      raise exception 'Você não tem permissão para concluir estes atendimentos.';
    end if;

    -- Já resolvido por outra pessoa enquanto a tela estava aberta. Pular em
    -- silêncio seria mentir na contagem; parar tudo é o certo.
    if v_status <> 'scheduled' then
      raise exception 'Um dos atendimentos já foi resolvido por outra pessoa. Atualize a tela e tente de novo.';
    end if;

    perform complete_appointment(
      v_id,
      -- Atendimento de graça (total zero) recebe array VAZIO: a soma dá zero,
      -- bate com o líquido zero, e nenhum lançamento de R$ 0,00 entra no caixa.
      -- Mandar um pagamento de zero seria recusado — `complete_appointment`
      -- exige valor maior que zero em cada item.
      case
        when v_total > 0 then jsonb_build_array(
          jsonb_build_object('method', p_forma::text, 'amount', v_total)
        )
        else '[]'::jsonb
      end,
      0,      -- sem desconto: desconto é decisão individual
      null    -- sem vencimento: fiado já foi barrado acima
    );

    v_quantos := v_quantos + 1;
  end loop;

  return v_quantos;
end;
$fn$;

revoke execute on function complete_appointments_lote(uuid[], payment_method) from public, anon;
grant execute on function complete_appointments_lote(uuid[], payment_method) to authenticated;


-- ###########################################################################
-- PARTE 3 — DESFAZER falta e cancelamento
--
-- Cobre os dois status que NÃO movem dinheiro. Conclusão não tem volta por
-- aqui, pelo motivo explicado no cabeçalho.
-- ###########################################################################

create or replace function reverter_status_agendamento(p_appointment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shop     uuid;
  v_status   appointment_status;
  v_customer uuid;
begin
  select a.barbershop_id, a.status, a.customer_id
    into v_shop, v_status, v_customer
    from appointments a
   where a.id = p_appointment
     for update;

  if v_shop is null then
    raise exception 'Atendimento não encontrado.';
  end if;

  if not has_shop_access(v_shop) then
    raise exception 'Você não tem permissão para alterar este atendimento.';
  end if;

  if v_status = 'scheduled' then
    raise exception 'Este atendimento já está como agendado.';
  end if;

  if v_status = 'completed' then
    raise exception
      'Atendimento concluído não volta atrás: o valor já entrou no caixa e a comissão já foi gerada. Para corrigir, lance o ajuste no Caixa.';
  end if;

  -- A falta some da ficha junto. Deixar `no_show_count` inflado por um erro de
  -- toque puniria o cliente numa estatística que ele não causou.
  -- `greatest(...,0)`: a coluna não pode ficar negativa se algo já a tiver
  -- zerado por outro caminho.
  if v_status = 'no_show' then
    update customers
       set no_show_count = greatest(no_show_count - 1, 0)
     where id = v_customer;
  end if;

  -- Volta a `scheduled` e limpa o rastro do cancelamento — deixá-lo faria a
  -- tela mostrar "cancelado por Fulano" num atendimento ativo.
  --
  -- ⚠️ Aqui a constraint `appointments_no_overlap` volta a valer para esta
  -- linha. Se o horário já foi ocupado por outra pessoa nesse meio-tempo, o
  -- banco RECUSA (23P01) — e é o certo: dois cortes no mesmo horário seriam
  -- pior que o desfazer não funcionar. A aplicação traduz esse erro.
  update appointments
     set status = 'scheduled',
         cancel_reason = null,
         cancelled_by = null
   where id = p_appointment;

  return p_appointment;
end;
$fn$;

revoke execute on function reverter_status_agendamento(uuid) from public, anon;
grant execute on function reverter_status_agendamento(uuid) to authenticated;


-- ###########################################################################
-- PARTE 4 — O ÍNDICE DO CONTADOR
--
-- O badge da navegação conta as pendências em TODA página do painel. Sem
-- índice, cada uma delas custa uma varredura na tabela que mais cresce.
--
-- Índice PARCIAL: só as linhas `scheduled` interessam. Um índice sobre a
-- tabela inteira guardaria todo atendimento concluído desde a abertura da
-- barbearia para responder uma pergunta que nunca é sobre eles.
-- ###########################################################################

create index if not exists appointments_pendencias_idx
  on appointments (barbershop_id, starts_at)
  where status = 'scheduled';


-- ---------------------------------------------------------------------------
-- Portão: confere o que entrou E o que NÃO PODE ter saído.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'complete_appointment';

  if v_corpo is null then
    raise exception 'complete_appointment sumiu.';
  end if;

  -- O que ENTROU
  if v_corpo not like '%v_dia_caixa%' then
    raise exception 'nº 2 NÃO aplicado: a receita ainda cai na data da conclusão.';
  end if;

  -- O que NÃO PODE ter saído — as travas que já existiam no 02
  if v_corpo not like '%não bate com o total do atendimento%' then
    raise exception 'REGRESSÃO: a conferência da soma dos pagamentos sumiu.';
  end if;
  if v_corpo not like '%has_shop_access(v_shop)%' then
    raise exception 'REGRESSÃO: a checagem de permissão sumiu.';
  end if;
  if v_corpo not like '%for update%' then
    raise exception 'REGRESSÃO: a trava da linha contra duplo clique sumiu.';
  end if;
  if v_corpo not like '%completed_at = now()%' then
    raise exception 'REGRESSÃO: completed_at deixou de guardar o instante do registro.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'complete_appointments_lote'
  ) then
    raise exception 'complete_appointments_lote não foi criada.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'reverter_status_agendamento'
  ) then
    raise exception 'reverter_status_agendamento não foi criada.';
  end if;

  if not exists (select 1 from pg_indexes where indexname = 'appointments_pendencias_idx') then
    raise exception 'O índice das pendências não foi criado.';
  end if;

  raise notice '16 aplicada — receita na data do atendimento, conclusão em lote e desfazer de falta/cancelamento.';
end $$;
