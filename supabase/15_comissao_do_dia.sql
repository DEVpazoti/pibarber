-- ============================================================================
-- PiBarber — 15_comissao_do_dia.sql   (rodada 2, ajuste nº 3)
--
-- A COMISSÃO DE CADA BARBEIRO NO DIA, na aba HOJE — e a permissão que faz
-- "cada um vê a sua" valer no banco, não só na tela.
--
-- ---------------------------------------------------------------------------
-- O campo de comissão JÁ EXISTIA. O que faltava era outra coisa.
-- ---------------------------------------------------------------------------
-- `professionals.commission_percent` existe desde o 01_schema.sql e já é usado
-- por `complete_appointment` para gerar a linha em `commissions`. Não há schema
-- novo a criar para o VALOR.
--
-- O que não existia é a resposta para a pergunta que o ajuste faz:
--
--     "um barbeiro comum deve ver APENAS a própria comissão"
--
-- Hoje isso é impossível de responder. `profiles` (quem faz login, papel
-- `assistant`) e `professionals` (quem corta cabelo) são duas tabelas SEM
-- nenhuma ligação entre si — foi uma decisão deliberada do modelo, documentada
-- em 02_functions.sql: "profissional NÃO é login e NÃO tem painel".
--
-- O sistema sabe que o assistente João tem acesso à loja. Não sabe que ele é o
-- profissional João. Sem essa ligação, "a própria comissão" não tem sujeito.
--
-- ---------------------------------------------------------------------------
-- A ligação: uma coluna NULÁVEL, e por que nulável
-- ---------------------------------------------------------------------------
-- `professionals.profile_id` aponta para o login daquele profissional, quando
-- ele tem um. NULO é o caso normal e continua sendo: a barbearia com três
-- barbeiros e um único login (o do dono) não muda em nada.
--
-- Fosse obrigatória, todo profissional passaria a exigir uma conta — o oposto
-- exato da decisão de modelagem que este projeto tomou.
--
-- ---------------------------------------------------------------------------
-- ⚠️ ISTO AMPLIA O QUE O ASSISTENTE ENXERGA
-- ---------------------------------------------------------------------------
-- Até aqui o assistente não via NENHUM valor financeiro: `transactions` e
-- `commissions` são fechadas em `can_manage_money()`, que é só dono e admin.
--
-- Com `comissoes_do_dia`, um assistente LIGADO a um profissional passa a ver:
--   · quantos atendimentos ele mesmo concluiu hoje
--   · quanto ele mesmo gerou de receita hoje
--   · quanto ele mesmo tem de comissão hoje
--
-- Dele, e só dele. Nunca do colega, nunca da loja, nunca de outro dia. A
-- tabela `commissions` continua fechada: esta função é a única porta, e ela é
-- SECURITY DEFINER justamente para poder ler o que o chamador não lê.
--
-- Assistente SEM ligação com profissional nenhum recebe lista vazia.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function if exists comissoes_do_dia(uuid, date);
--   drop trigger if exists on_professional_profile on professionals;
--   drop function if exists professionals_guard_profile();
--   drop index if exists professionals_profile_unico;
--   alter table professionals drop column profile_id;
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — A LIGAÇÃO LOGIN ↔ PROFISSIONAL
-- ###########################################################################

-- `on delete set null`: remover o acesso de alguém (que é o que
-- `removerAssistente` faz) NÃO pode apagar o profissional nem o histórico de
-- atendimentos dele. A ficha fica; só perde o login.
alter table professionals
  add column if not exists profile_id uuid references profiles (id) on delete set null;


-- ---------------------------------------------------------------------------
-- Um login para no máximo UM profissional dentro da mesma barbearia.
--
-- Sem isto, o dono poderia apontar dois profissionais para o mesmo assistente
-- e `comissoes_do_dia` passaria a devolver duas linhas para "a própria
-- comissão" — sem erro, sem aviso, com o número somado errado na tela.
--
-- Índice único PARCIAL, e não `unique (barbershop_id, profile_id)`: no Postgres
-- NULL nunca é igual a NULL, então a constraint simples deixaria passar dez
-- profissionais sem login por acidente e não por regra. Mesmo raciocínio do
-- índice de telefone no 13_agendamento_avulso.sql.
-- ---------------------------------------------------------------------------
create unique index if not exists professionals_profile_unico
  on professionals (barbershop_id, profile_id)
  where profile_id is not null;

create index if not exists professionals_profile_idx
  on professionals (profile_id)
  where profile_id is not null;


-- ---------------------------------------------------------------------------
-- A TRAVA: o login precisa ser DAQUELA barbearia.
--
-- A RLS de `professionals` já garante que só o dono escreve na tabela. O que
-- ela NÃO garante é o CONTEÚDO da coluna: nada impediria o dono de apontar
-- `profile_id` para o assistente de OUTRA barbearia — ou para um cliente
-- qualquer, bastando ter o uuid. Aquela pessoa passaria a ver a comissão de um
-- profissional de uma loja que não é a dela.
--
-- RLS filtra LINHA, não valor de coluna. Isso é trabalho de trigger, exatamente
-- como `reviews_guard_reply()` em 03_rls.sql resolve o caso irmão (o cliente
-- que não pode forjar a resposta da barbearia na própria avaliação).
--
-- Quem vale: o DONO da loja, ou um ASSISTENTE cujo `barbershop_id` é a loja.
-- ---------------------------------------------------------------------------
create or replace function professionals_guard_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.profile_id is null then
    return new;
  end if;

  -- Só confere quando o valor MUDOU: um update de nome ou de comissão numa
  -- linha já ligada não precisa pagar a consulta de novo.
  if tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id then
    return new;
  end if;

  if not exists (
    select 1 from profiles p
     where p.id = new.profile_id
       and (
         -- o assistente daquela loja
         (p.role = 'assistant' and p.barbershop_id = new.barbershop_id)
         -- ou o próprio dono, que também corta cabelo em boa parte das lojas
         or exists (
           select 1 from barbershops b
            where b.id = new.barbershop_id and b.owner_id = p.id
         )
       )
  ) then
    raise exception
      'Esse acesso não pertence a esta barbearia. Só dá para ligar um profissional a quem já entra no painel desta loja.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_professional_profile on professionals;
create trigger on_professional_profile
  before insert or update on professionals
  for each row execute function professionals_guard_profile();


-- ###########################################################################
-- PARTE 2 — A COMISSÃO DO DIA
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Por dia, por profissional: quantos atendimentos, quanto gerou, quanto é de
-- comissão.
--
-- DE ONDE VEM CADA NÚMERO — e por que não vem tudo do mesmo lugar:
--
--   atendimentos e total gerado  →  `appointments`
--   comissão                     →  `commissions`
--
-- A comissão NÃO é recalculada aqui como `total × percent_atual`. Ela é lida
-- da linha que `complete_appointment` gravou, com o percentual CONGELADO no
-- momento da conclusão. Se o dono mudar o percentual do profissional de 40%
-- para 50% hoje à tarde, os atendimentos da manhã continuam valendo 40% — que
-- é o que foi combinado quando o serviço foi prestado. Recalcular reescreveria
-- o passado a cada mudança de tabela.
--
-- O `left join` é o que sustenta o profissional com comissão ZERO: sem ele,
-- quem tem `commission_percent = 0` não teria linha em `commissions` (a
-- inserção é condicional) e sumiria da lista, apesar de ter atendido e gerado
-- receita. Ele aparece, com R$ 0,00 de comissão.
--
-- O DIA é o dia do ATENDIMENTO (`starts_at`), não o da conclusão. É a mesma
-- regra do ajuste nº 2: concluir hoje um atendimento de ontem devolve o valor
-- para ontem, onde ele aconteceu.
--
-- Fuso de São Paulo em toda parte. Às 22h de Brasília o UTC já virou amanhã, e
-- a comissão do dia zeraria no meio do expediente.
-- ---------------------------------------------------------------------------
create or replace function comissoes_do_dia(
  p_shop uuid,
  p_dia  date default null
)
returns table (
  professional_id uuid,
  nome            text,
  atendimentos    integer,
  total_gerado    numeric,
  percent         numeric,
  comissao        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_fuso     text := 'America/Sao_Paulo';
  v_dia      date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_dinheiro boolean;
  v_meu_prof uuid;
begin
  -- SECURITY DEFINER ignora RLS: a permissão é conferida aqui, na mão.
  if not has_shop_access(p_shop) then
    raise exception 'Você não tem acesso a esta barbearia.';
  end if;

  v_dinheiro := can_manage_money(p_shop);

  -- Qual profissional é quem está chamando? Nulo para o dono que não corta.
  select pr.id into v_meu_prof
    from professionals pr
   where pr.barbershop_id = p_shop
     and pr.profile_id = auth.uid();

  -- Assistente sem ligação com profissional nenhum: não há "a comissão dele"
  -- para mostrar. Lista vazia, e a tela explica o que fazer.
  if not v_dinheiro and v_meu_prof is null then
    return;
  end if;

  return query
  select
    pr.id,
    coalesce(nullif(btrim(pr.nickname), ''), pr.name)          as nome,
    count(a.id)::integer                                        as atendimentos,
    coalesce(sum(a.total_price - a.discount), 0)::numeric       as total_gerado,
    pr.commission_percent::numeric                              as percent,
    coalesce(sum(c.amount), 0)::numeric                         as comissao
  from appointments a
  join professionals pr on pr.id = a.professional_id
  left join commissions c on c.appointment_id = a.id
  where a.barbershop_id = p_shop
    and a.status = 'completed'
    and (a.starts_at at time zone v_fuso)::date = v_dia
    -- O RECORTE DA PERMISSÃO. Não é filtro de tela: quem não gerencia dinheiro
    -- só passa por aqui com a própria linha, e `v_meu_prof` veio de auth.uid(),
    -- não de parâmetro. Não há como pedir a comissão de outro.
    and (v_dinheiro or pr.id = v_meu_prof)
  group by pr.id, pr.name, pr.nickname, pr.commission_percent
  order by comissao desc, nome asc;
end;
$fn$;

revoke execute on function comissoes_do_dia(uuid, date) from public, anon;
grant execute on function comissoes_do_dia(uuid, date) to authenticated;


-- ---------------------------------------------------------------------------
-- Portão: se algo não entrou, o Postgres desfaz tudo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'professionals' and column_name = 'profile_id'
  ) then
    raise exception 'A coluna professionals.profile_id não foi criada.';
  end if;

  if not exists (select 1 from pg_indexes where indexname = 'professionals_profile_unico') then
    raise exception 'O índice único parcial do login do profissional não foi criado.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'on_professional_profile') then
    raise exception 'A trava que confere a barbearia do acesso não foi criada.';
  end if;

  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'comissoes_do_dia';

  if v_corpo is null then
    raise exception 'comissoes_do_dia não foi criada.';
  end if;

  -- O recorte de permissão é a razão de existir da função. Se ele sumir numa
  -- edição futura, todo assistente ligado passa a ver a comissão da loja
  -- inteira — em silêncio, porque a tela não teria como perceber.
  if v_corpo not like '%v_dinheiro or pr.id = v_meu_prof%' then
    raise exception 'REGRESSÃO: comissoes_do_dia perdeu o recorte "cada um vê a sua".';
  end if;

  raise notice '15 aplicada — comissão do dia com o recorte de permissão no banco.';
end $$;
