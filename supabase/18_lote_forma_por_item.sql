-- ============================================================================
-- PiBarber — 18_lote_forma_por_item.sql   (correção do ajuste nº 2)
--
-- A CONCLUSÃO EM LOTE PASSA A ACEITAR UMA FORMA DE PAGAMENTO POR ATENDIMENTO.
--
-- ---------------------------------------------------------------------------
-- O que estava errado
-- ---------------------------------------------------------------------------
-- `complete_appointments_lote(uuid[], payment_method)` recebia UMA forma de
-- pagamento e a aplicava a todos os selecionados. Na prática isso não existe:
-- o barbeiro que esqueceu de registrar a quinta-feira inteira atendeu gente que
-- pagou em dinheiro, gente que pagou no débito e gente que pagou no pix.
--
-- Forçar uma forma só para o lote inteiro fazia o caixa fechar com o valor
-- certo e as FORMAS erradas — e o relatório por forma de pagamento passava a
-- mentir sem ninguém perceber, porque o total continuava batendo.
--
-- ---------------------------------------------------------------------------
-- A troca de assinatura
-- ---------------------------------------------------------------------------
-- De  (p_ids uuid[], p_forma payment_method)
-- para (p_itens jsonb)  →  [{"id": "<uuid>", "method": "cash"}, ...]
--
-- É `drop` + `create`, e não `create or replace`: mudar os TIPOS dos parâmetros
-- cria uma sobrecarga nova em vez de substituir a função, e as duas versões
-- passariam a conviver. A antiga só foi usada pela tela de Pendências, que é
-- atualizada no mesmo commit — não há outro chamador para quebrar.
--
-- O que NÃO muda: continua sendo `complete_appointment` quem conclui, uma vez
-- por atendimento, dentro da MESMA transação. Tudo ou nada segue valendo.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function if exists complete_appointments_lote(jsonb);
--   -- e reaplique a PARTE 2 do 16_pendencias.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A versão antiga sai — QUALQUER versão antiga.
--
-- O caminho óbvio seria
--     drop function if exists complete_appointments_lote(uuid[], payment_method);
-- e ele tem um defeito silencioso: se a assinatura no banco não bater EXATAMENTE
-- com a escrita aqui, o `if exists` não acha nada, não reclama, e a função velha
-- sobrevive ao lado da nova. Duas funções de mesmo nome e aridade diferente
-- convivem sem erro — e a partir daí é o Postgres quem escolhe qual chamar.
--
-- Varrer pelo NOME e derrubar tudo que aparecer não depende de eu ter escrito
-- a assinatura certa. É o único jeito de garantir a mesa limpa antes do create.
-- ---------------------------------------------------------------------------
do $$
declare
  v_assinatura text;
begin
  for v_assinatura in
    select pg_get_function_identity_arguments(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'complete_appointments_lote'
  loop
    execute format('drop function public.complete_appointments_lote(%s)', v_assinatura);
    raise notice 'Removida a versão anterior: complete_appointments_lote(%)', v_assinatura;
  end loop;
end $$;


create or replace function complete_appointments_lote(p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  item      jsonb;
  v_id      uuid;
  v_metodo  payment_method;
  v_total   numeric(10, 2);
  v_status  appointment_status;
  v_shop    uuid;
  v_nome    text;
  v_quantos integer := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Nenhum atendimento foi selecionado.';
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum atendimento foi selecionado.';
  end if;

  -- Um teto para o lote. Não é medo de lentidão: um array gigante aqui quase
  -- sempre é engano de tela, e o estrago seria proporcional.
  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Dá para concluir até 100 atendimentos de uma vez.';
  end if;

  for item in select * from jsonb_array_elements(p_itens) loop
    v_id := (item ->> 'id')::uuid;

    if v_id is null then
      raise exception 'Um dos itens veio sem identificação. Atualize a tela.';
    end if;

    -- Forma inválida vira erro aqui, no cast, e não um lançamento silencioso
    -- com o padrão. `coalesce` para 'cash' seria pior: gravaria dinheiro onde
    -- o barbeiro quis outra coisa.
    v_metodo := (item ->> 'method')::payment_method;

    -- FIADO NÃO ENTRA NO LOTE, e continua não entrando.
    --
    -- Ele precisa de uma data de vencimento POR ATENDIMENTO e cria uma dívida
    -- por cliente — decisão individual, que não cabe num "concluir tudo com um
    -- toque". A tela deixa isso claro e manda concluir esses um a um.
    if v_metodo = 'fiado' then
      raise exception 'Fiado precisa ser lançado atendimento por atendimento, com a data de vencimento.';
    end if;

    select a.barbershop_id, a.status, a.total_price, c.full_name
      into v_shop, v_status, v_total, v_nome
      from appointments a
      join customers c on c.id = a.customer_id
     where a.id = v_id;

    if v_shop is null then
      raise exception 'Um dos atendimentos selecionados não existe mais. Atualize a tela.';
    end if;

    -- Conferido aqui TAMBÉM, e não só dentro de complete_appointment: a
    -- mensagem fica específica e o lote para antes de escrever qualquer coisa.
    if not has_shop_access(v_shop) then
      raise exception 'Você não tem permissão para concluir estes atendimentos.';
    end if;

    -- Já resolvido por outra pessoa enquanto a tela estava aberta. O nome entra
    -- na mensagem porque, num lote de quinze, "um dos atendimentos" não ajuda
    -- ninguém a descobrir qual.
    if v_status <> 'scheduled' then
      raise exception 'O atendimento de % já foi resolvido por outra pessoa. Atualize a tela e tente de novo.',
        coalesce(v_nome, 'um cliente');
    end if;

    perform complete_appointment(
      v_id,
      -- Atendimento de graça (total zero) recebe array VAZIO: a soma dá zero,
      -- bate com o líquido zero, e nenhum lançamento de R$ 0,00 entra no caixa.
      -- Mandar um pagamento de zero seria recusado — `complete_appointment`
      -- exige valor maior que zero em cada item.
      case
        when v_total > 0 then jsonb_build_array(
          jsonb_build_object('method', v_metodo::text, 'amount', v_total)
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

revoke execute on function complete_appointments_lote(jsonb) from public, anon;
grant execute on function complete_appointments_lote(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- Portão
--
-- ⚠️ A conferência compara TIPO, não texto de assinatura.
--
-- A primeira versão deste portão fazia
--     pg_get_function_identity_arguments(p.oid) = 'jsonb'
-- e reprovava a migração mesmo com a função criada corretamente.
--
-- A CAUSA, confirmada consultando o pg_proc do banco: apesar do nome, essa
-- função devolve os argumentos COM O NOME DO PARÂMETRO junto. O valor real é
--     'p_itens jsonb'
-- e não 'jsonb'. A comparação nunca teria como bater.
--
-- (`identity arguments` ali significa "os argumentos que IDENTIFICAM a função
-- para um DROP/ALTER" — ou seja, sem os DEFAULTs. Não significa "só os tipos",
-- que foi a leitura errada que produziu o bug.)
--
-- `pronargs` + `proargtypes` compara o que o Postgres realmente guardou: uma
-- função com exatamente um argumento, do tipo jsonb. Sem texto no meio.
--
-- E quando falha, o portão DIZ O QUE ENCONTROU, em vez de só afirmar que algo
-- não existe — a mensagem tem que servir para consertar, não só para acusar.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo    text;
  v_achadas  text;
begin
  -- Tudo que existe hoje com esse nome, para as mensagens abaixo poderem ser
  -- específicas.
  select string_agg(
           format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
           ', ' order by p.oid
         )
    into v_achadas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'complete_appointments_lote';

  -- A antiga não pode ter sobrado: com as duas no banco, uma chamada ambígua
  -- escolheria a errada sem avisar.
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'complete_appointments_lote'
       and p.pronargs = 2
  ) then
    raise exception 'A versão antiga de complete_appointments_lote continua no banco. Encontradas: %', v_achadas;
  end if;

  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'complete_appointments_lote'
     and p.pronargs = 1
     and p.proargtypes[0] = 'jsonb'::regtype;

  if v_corpo is null then
    raise exception
      'A nova complete_appointments_lote(jsonb) não foi criada. O que existe com esse nome: %',
      coalesce(v_achadas, 'nada');
  end if;

  -- A razão de existir desta migração: a forma sai de DENTRO de cada item.
  if v_corpo not like '%method%' then
    raise exception 'REGRESSÃO: o lote voltou a usar uma forma de pagamento única.';
  end if;

  if v_corpo not like '%complete_appointment%' then
    raise exception 'REGRESSÃO: o lote deixou de delegar para complete_appointment.';
  end if;

  raise notice '18 aplicada — conclusão em lote com forma de pagamento por atendimento.';
end $$;
