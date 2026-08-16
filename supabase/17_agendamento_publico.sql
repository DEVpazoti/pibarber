-- ============================================================================
-- PiBarber — 17_agendamento_publico.sql   (rodada 2, ajuste nº 4)
--
-- AGENDAMENTO SEM CADASTRO — opcional, por barbearia, com limites no servidor.
--
-- ---------------------------------------------------------------------------
-- ⚠️ LEIA ISTO ANTES DE MEXER EM QUALQUER GRANT DESTE ARQUIVO.
-- ---------------------------------------------------------------------------
-- `book_appointment_publico` NÃO recebe grant para `anon`. Isso não é
-- esquecimento: é o eixo de toda a proteção.
--
-- Os limites por IP só valem se o IP for verdadeiro. Se `anon` pudesse chamar
-- esta função por /rest/v1/rpc/, qualquer um mandaria `p_ip_hash` inventado a
-- cada requisição e o limite por IP viraria enfeite — a função contaria cinco
-- tentativas de cinco "IPs" diferentes que são a mesma pessoa.
--
-- O caminho é UM só:
--
--   navegador → Server Action do Next → service role → esta função
--                      ↑
--       lê o IP de x-forwarded-for, que o cliente não escolhe
--
-- Conceder execute a `anon` aqui derruba o limite por IP inteiro, em silêncio.
--
-- ---------------------------------------------------------------------------
-- Por que o agendamento sem conta já "existia" e mesmo assim este arquivo é grande
-- ---------------------------------------------------------------------------
-- `book_appointment` aceita `p_profile` nulo desde sempre: nome + telefone
-- bastam. O que NÃO existia era:
--
--   1. o liga/desliga por barbearia (a loja não escolhia nada)
--   2. qualquer limite contra abuso no endpoint público
--   3. um jeito de a pessoa acompanhar/cancelar sem conta
--
-- ---------------------------------------------------------------------------
-- O acompanhamento: token na URL, e por que não policy para `anon`
-- ---------------------------------------------------------------------------
-- `appointments.public_token` é um uuid v4 aleatório (122 bits). A pessoa
-- guarda `/a/<token>` e por ali vê e cancela.
--
-- A leitura NÃO é uma policy de select para `anon`. Uma policy do tipo
-- `using (public_token = <o que veio>)` exigiria o token no filtro da query —
-- e quem esquecesse o filtro devolveria a tabela inteira. Em vez disso, uma
-- função SECURITY DEFINER que recebe o token e devolve NO MÁXIMO uma linha,
-- com as colunas escolhidas a dedo. Não há como pedir "todos".
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function if exists book_appointment_publico(uuid, uuid, timestamptz, uuid[], text, text, text, text);
--   drop function if exists agendamento_por_token(uuid);
--   drop function if exists cancelar_por_token(uuid, text);
--   drop function if exists ddd_valido(text);
--   drop table if exists public_booking_attempts;
--   alter table appointments drop column public_token;
--   alter table barbershops drop column allow_public_booking;
--   -- e refaça o grant de update de barbershops SEM allow_public_booking
-- ============================================================================


-- ###########################################################################
-- PARTE 1 — SCHEMA
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1.1 O liga/desliga da barbearia.
--
-- NASCE DESLIGADO, e a escolha é deliberada: ligar isto abre um endereço
-- público que ESCREVE no banco. Nenhuma loja deve descobrir que tem um desses
-- por já ter um. Quem liga, liga sabendo.
--
-- É separado de `accepts_online_booking`: aquele decide se a loja aceita
-- agendamento pelo site; este decide se, dentro do site, dá para agendar SEM
-- conta. Desligar o primeiro tira a página do ar; desligar só o segundo mantém
-- o agendamento online e volta a exigir login.
-- ---------------------------------------------------------------------------
alter table barbershops
  add column if not exists allow_public_booking boolean not null default false;


-- ⚠️ O GRANT DE COLUNA NÃO VEM DE GRAÇA.
--
-- O 03_rls.sql fez `revoke update on barbershops from authenticated` e devolveu
-- a permissão COLUNA POR COLUNA, para o dono não conseguir transferir a posse
-- da loja nem mexer na própria nota com um PATCH direto na API REST.
--
-- Coluna nova nasce FORA dessa lista. Sem a linha abaixo, o dono marcaria a
-- caixinha, a tela dria "salvo", e o valor não teria mudado — o Postgres recusa
-- a coluna sem grant. A lista é repetida inteira porque `grant update (col)`
-- ACRESCENTA à lista existente, mas repetir deixa explícito o conjunto atual.
grant update (
  name, description, phone, whatsapp,
  zip_code, street, number, complement, neighborhood, city, state,
  latitude, longitude, logo_url, cover_url,
  accepts_online_booking, min_advance_minutes, max_advance_days,
  cancel_deadline_hours, slug,
  allow_public_booking
) on barbershops to authenticated;


-- ---------------------------------------------------------------------------
-- 1.2 O token de acompanhamento.
--
-- Nulo em todo agendamento que tem dono: quem tem conta acompanha pelo app, e
-- um token a mais seria uma segunda porta para a mesma sala.
--
-- Índice único PARCIAL: só as linhas com token entram. Um índice comum sobre a
-- coluna guardaria um NULL para cada agendamento já existente, sem serventia.
-- ---------------------------------------------------------------------------
alter table appointments
  add column if not exists public_token uuid;

create unique index if not exists appointments_public_token_idx
  on appointments (public_token)
  where public_token is not null;


-- ---------------------------------------------------------------------------
-- 1.3 O registro das tentativas — é ele que sustenta TODOS os limites.
--
-- Por que uma tabela e não memória: a Vercel roda cada requisição numa
-- instância que pode ser nova. Um Map em memória zeraria a cada chamada fria, e
-- o "limite" seria por instância, não por pessoa. Contador em banco é o único
-- que vale num ambiente sem servidor fixo.
--
-- O IP entra como HASH, nunca em claro. O hash serve para contar ("esta mesma
-- origem tentou 40 vezes"), que é para o que o limite existe, e evita guardar
-- dado pessoal identificável num log que o dono da loja lê. Quem calcula o
-- hash é a Server Action, no servidor do Next, a partir do x-forwarded-for.
--
-- Guarda tentativa BEM-SUCEDIDA também, e não só bloqueio: sem as que passaram
-- não há como contar "5 por dia" — a sexta só é bloqueada porque as cinco
-- primeiras estão aqui.
-- ---------------------------------------------------------------------------
create table if not exists public_booking_attempts (
  id            bigint generated always as identity primary key,
  barbershop_id uuid references barbershops (id) on delete cascade,
  /** sha-256 do IP, em hexa. Calculado na Server Action. */
  ip_hash       text not null,
  /** Só dígitos, já normalizado. Nulo quando o bloqueio foi antes de validar. */
  phone         text,
  ok            boolean not null default false,
  /** Por que barrou. Nulo quando passou. */
  motivo        text,
  created_at    timestamptz not null default now()
);

-- Os dois índices que as contagens usam. Sem eles cada tentativa varre a
-- tabela inteira, e ela cresce justamente quando estiver sob ataque.
create index if not exists public_booking_ip_idx
  on public_booking_attempts (ip_hash, created_at desc);

create index if not exists public_booking_phone_idx
  on public_booking_attempts (phone, created_at desc)
  where phone is not null;

alter table public_booking_attempts enable row level security;

-- Nenhuma policy, e nenhum grant. De propósito.
--
-- `anon` e `authenticated` não leem nem escrevem aqui: com RLS ligada e zero
-- policies, o Postgres nega tudo. Quem escreve é a função SECURITY DEFINER,
-- que roda com os privilégios do dono dela e não depende de grant do chamador.
-- Um log de segurança que o público consegue ler é um mapa do próprio limite.
revoke all on public_booking_attempts from anon, authenticated;


-- ###########################################################################
-- PARTE 2 — VALIDAÇÃO DE TELEFONE
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- O DDD existe mesmo?
--
-- Sem isto, "00" e "99999999999" passam: são 11 dígitos, o formato bate, e a
-- ficha nasce com um telefone que nunca vai tocar. Pior — o limite POR TELEFONE
-- deixa de funcionar, porque cada lixo digitado é um "cliente novo".
--
-- A lista é a dos DDDs em uso no Brasil. `immutable` para o Postgres poder
-- avaliá-la sem custo repetido.
-- ---------------------------------------------------------------------------
create or replace function ddd_valido(p_ddd text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_ddd in (
    '11','12','13','14','15','16','17','18','19',
    '21','22','24','27','28',
    '31','32','33','34','35','37','38',
    '41','42','43','44','45','46','47','48','49',
    '51','53','54','55',
    '61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79',
    '81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99'
  );
$fn$;

revoke execute on function ddd_valido(text) from public, anon;
grant execute on function ddd_valido(text) to authenticated;


-- ###########################################################################
-- PARTE 3 — O AGENDAMENTO PÚBLICO
--
-- Ordem das checagens, e ela importa: as baratas primeiro, e a escrita por
-- último. Quem for barrado por limite não chega a custar uma consulta de
-- horários livres.
-- ###########################################################################

--
-- ⚠️ DEVOLVE jsonb, E NÃO O TOKEN. O motivo é técnico e não é estético:
--
-- Todo bloqueio precisa ir para o log — é o log que sustenta a contagem do
-- próximo pedido E a pergunta "estou sendo atacado?". Mas `raise exception`
-- DESFAZ A TRANSAÇÃO INTEIRA, e o `insert` do log iria embora junto com ela.
-- O log ficaria só com as tentativas bem-sucedidas: exatamente as que não
-- interessam para detectar abuso.
--
-- Sub-transação com bloco `exception` não resolve: ela protege o que acontece
-- DENTRO dela, e a exceção de fora continua levando o insert.
--
-- Então limite atingido NÃO levanta exceção — devolve `{ok:false, motivo}`, o
-- insert commita junto, e a Server Action traduz. Erro de VALIDAÇÃO (telefone
-- inválido, serviço inexistente) continua levantando: esse não precisa de log
-- e a mensagem já é específica.
--
create or replace function book_appointment_publico(
  p_shop         uuid,
  p_professional uuid,
  p_quando       timestamptz,
  p_service_ids  uuid[],
  p_nome         text,
  p_telefone     text,
  p_ip_hash      text,
  p_obs          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fuso       text := 'America/Sao_Paulo';
  v_permite    boolean;
  v_ativa      boolean;
  v_online     boolean;
  v_telefone   text;
  v_nome       text;
  v_ddd        text;
  v_duracao    integer;
  v_qtd        integer;
  v_dia        date;
  v_appointment uuid;
  v_token      uuid;
  v_motivo     text;
  v_n          integer;
begin
  -- ==========================================================================
  -- 0. O que sempre precisa existir
  -- ==========================================================================
  if p_ip_hash is null or btrim(p_ip_hash) = '' then
    -- Só acontece se alguém chamar a função por fora do caminho previsto.
    raise exception 'Origem da requisição não identificada.';
  end if;

  if p_shop is null or p_professional is null or p_quando is null then
    raise exception 'Dados do agendamento incompletos.';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.';
  end if;

  -- ==========================================================================
  -- 1. A LOJA PERMITE?
  --
  -- Primeiro de tudo, e no BANCO. A tela esconde o formulário quando a opção
  -- está desligada, mas esconder não é impedir: o endereço continua existindo.
  -- ==========================================================================
  select b.is_active, b.accepts_online_booking, b.allow_public_booking
    into v_ativa, v_online, v_permite
    from barbershops b
   where b.id = p_shop;

  if not coalesce(v_ativa, false) or not coalesce(v_online, false) then
    raise exception 'Esta barbearia não está aceitando agendamento online no momento.';
  end if;

  if not coalesce(v_permite, false) then
    raise exception 'Esta barbearia pede cadastro para agendar. Crie sua conta — leva menos de um minuto.';
  end if;

  -- ==========================================================================
  -- 2. O TELEFONE, de verdade
  --
  -- Normaliza ANTES de qualquer limite. "(11) 98765-4321" e "11987654321" são
  -- o mesmo número: sem normalizar, alternar a formatação driblaria o limite
  -- por telefone sem esforço nenhum.
  -- ==========================================================================
  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome     := nullif(btrim(coalesce(p_nome, '')), '');

  if v_nome is null or length(v_nome) < 3 then
    raise exception 'Informe seu nome completo.';
  end if;

  if length(v_telefone) not in (10, 11) then
    raise exception 'Informe um celular válido, com DDD.';
  end if;

  v_ddd := left(v_telefone, 2);
  if not ddd_valido(v_ddd) then
    raise exception 'Esse DDD não existe. Confira o número.';
  end if;

  -- Celular no Brasil tem 11 dígitos e o nono é sempre 9. Com 11 dígitos e o
  -- terceiro diferente de 9, o número é impossível — quase sempre é o fixo
  -- digitado com um dígito a mais.
  if length(v_telefone) = 11 and substr(v_telefone, 3, 1) <> '9' then
    raise exception 'Esse celular não parece válido. Confira o número.';
  end if;

  -- ==========================================================================
  -- 3. OS LIMITES
  --
  -- Todos contados AQUI, no banco, numa transação. Contar na aplicação abriria
  -- uma janela entre a contagem e a escrita — duas requisições simultâneas
  -- passariam as duas pelo mesmo "só falta uma".
  --
  -- A mensagem devolvida NÃO diz a regra exata. "Você já tem 2 agendamentos e o
  -- limite é 2" ensina exatamente o que contornar.
  -- ==========================================================================

  -- 3.1 Rajada: uma tentativa a cada 30 segundos por origem.
  select count(*) into v_n
    from public_booking_attempts a
   where a.ip_hash = p_ip_hash
     and a.created_at > now() - interval '30 seconds';

  if v_n >= 1 then
    v_motivo := 'rajada_ip';
  end if;

  -- 3.2 Por origem, na hora.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.ip_hash = p_ip_hash
       and a.ok
       and a.created_at > now() - interval '1 hour';

    if v_n >= 3 then
      v_motivo := 'limite_ip_hora';
    end if;
  end if;

  -- 3.3 Por origem, no dia.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.ip_hash = p_ip_hash
       and a.ok
       and a.created_at > now() - interval '24 hours';

    if v_n >= 5 then
      v_motivo := 'limite_ip_dia';
    end if;
  end if;

  -- 3.4 Por telefone, no dia.
  if v_motivo is null then
    select count(*) into v_n
      from public_booking_attempts a
     where a.phone = v_telefone
       and a.ok
       and a.created_at > now() - interval '24 hours';

    if v_n >= 3 then
      v_motivo := 'limite_telefone_dia';
    end if;
  end if;

  -- 3.5 Agendamentos ATIVOS por telefone naquela barbearia.
  --
  -- Este é o limite que mais importa: sem ele, um único número entope a agenda
  -- da loja com horários que ninguém vai ocupar. Conta só o que ainda está em
  -- pé e no futuro — histórico não conta, senão o cliente fiel seria bloqueado
  -- justamente por ser fiel.
  if v_motivo is null then
    select count(*) into v_n
      from appointments ap
      join customers c on c.id = ap.customer_id
     where ap.barbershop_id = p_shop
       and c.phone = v_telefone
       and ap.status = 'scheduled'
       and ap.starts_at > now();

    if v_n >= 2 then
      v_motivo := 'limite_ativos_telefone';
    end if;
  end if;

  if v_motivo is not null then
    -- O bloqueio vai para o log E A FUNÇÃO RETORNA — não levanta exceção.
    -- Levantar desfaria a transação e levaria este insert junto (ver o bloco
    -- de comentário na assinatura da função).
    insert into public_booking_attempts (barbershop_id, ip_hash, phone, ok, motivo)
    values (p_shop, p_ip_hash, v_telefone, false, v_motivo);

    -- `motivo` volta para o log da aplicação, NUNCA para a tela: dizer qual
    -- regra pegou entrega o mapa de como contorná-la. Quem monta a frase que
    -- o cliente lê é a Server Action, e ela é a mesma para todos os limites.
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  -- ==========================================================================
  -- 4. O HORÁRIO existe mesmo?
  --
  -- `get_available_slots` já sabe TODAS as regras: horário da loja, jornada
  -- individual, almoço, folga, antecedência mínima e máxima, e o que já está
  -- ocupado. Conferir contra ela cobre de uma vez "no passado", "fora do
  -- expediente" e "já ocupado" — sem reimplementar nenhuma dessas regras aqui,
  -- que é como elas divergiriam com o tempo.
  --
  -- A constraint `appointments_no_overlap` continua sendo a palavra final
  -- contra duas pessoas tocando o mesmo horário no mesmo segundo. Esta
  -- checagem é a que devolve mensagem boa nos outros 99% dos casos.
  -- ==========================================================================
  select coalesce(sum(s.duration_minutes), 0), count(*)
    into v_duracao, v_qtd
    from services s
   where s.id = any (p_service_ids)
     and s.barbershop_id = p_shop
     and s.is_active;

  if v_qtd = 0 then
    raise exception 'Nenhum serviço válido foi escolhido.';
  end if;

  v_dia := (p_quando at time zone v_fuso)::date;

  if not exists (
    select 1 from get_available_slots(p_professional, v_dia, v_duracao) g
     where g.slot = p_quando
  ) then
    raise exception 'Esse horário não está mais disponível. Escolha outro.';
  end if;

  -- ==========================================================================
  -- 5. AGENDA
  --
  -- Delega para `book_appointment`, que é quem sabe criar/reaproveitar a ficha
  -- do cliente pelo telefone, congelar preço e duração em
  -- `appointment_services` e aplicar as regras da loja.
  --
  -- `p_profile` nulo: agendamento sem conta. `p_source` fica no padrão
  -- 'online' — a trava C-1 do arquivo 11 só deixaria 'manual' passar para quem
  -- tem acesso à loja, e aqui não tem ninguém logado.
  --
  -- É esta delegação que faz o agendamento sem cadastro cair na Agenda e na
  -- aba Clientes exatamente como qualquer outro, sem tratamento especial.
  -- ==========================================================================
  v_appointment := book_appointment(
    p_shop         => p_shop,
    p_professional => p_professional,
    p_quando       => p_quando,
    p_service_ids  => p_service_ids,
    p_profile      => null,
    p_dependent    => null,
    p_nome         => v_nome,
    p_telefone     => v_telefone,
    p_obs          => p_obs,
    p_source       => 'online'
  );

  -- O token de acompanhamento. `gen_random_uuid()` é aleatório de verdade
  -- (122 bits): não dá para adivinhar nem para percorrer.
  v_token := gen_random_uuid();
  update appointments set public_token = v_token where id = v_appointment;

  -- A tentativa BEM-SUCEDIDA também entra no log: é ela que faz a contagem do
  -- próximo agendamento saber que este aconteceu.
  insert into public_booking_attempts (barbershop_id, ip_hash, phone, ok, motivo)
  values (p_shop, p_ip_hash, v_telefone, true, null);

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$fn$;

-- ⚠️ SEM GRANT PARA `anon`. Ver o aviso no topo do arquivo: com ele, o limite
-- por IP deixa de valer, porque o chamador escolheria o próprio `p_ip_hash`.
revoke execute on function book_appointment_publico(uuid, uuid, timestamptz, uuid[], text, text, text, text)
  from public, anon, authenticated;

-- ⚠️ O GRANT PARA `service_role` NÃO É OPCIONAL, e é fácil de esquecer.
--
-- O Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, e é por
-- essa herança que a service role costuma alcançar tudo. O `revoke ... from
-- public` acima tira essa herança de TODO MUNDO, service role inclusive — e aí
-- a Server Action receberia "permission denied for function" em produção,
-- depois de tudo parecer certo no código.
--
-- É preciso devolver explicitamente para quem é o único chamador previsto.
grant execute on function book_appointment_publico(uuid, uuid, timestamptz, uuid[], text, text, text, text)
  to service_role;


-- ###########################################################################
-- PARTE 4 — ACOMPANHAR E CANCELAR PELO TOKEN
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- O que a página /a/[token] mostra.
--
-- Devolve NO MÁXIMO uma linha, com as colunas escolhidas a dedo. Repare no que
-- NÃO está aqui: `notes` do agendamento, telefone, nada da ficha do cliente
-- além do primeiro nome. Quem tem o link tem o horário — não a ficha.
-- ---------------------------------------------------------------------------
create or replace function agendamento_por_token(p_token uuid)
returns table (
  id                    uuid,
  starts_at             timestamptz,
  ends_at               timestamptz,
  status                appointment_status,
  total_price           numeric,
  cliente_nome          text,
  profissional          text,
  servicos              text,
  shop_nome             text,
  shop_slug             text,
  shop_telefone         text,
  shop_whatsapp         text,
  shop_endereco         text,
  cancel_deadline_hours integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    a.id, a.starts_at, a.ends_at, a.status, a.total_price,
    -- Só o primeiro nome: o link pode acabar num print num grupo de WhatsApp.
    split_part(btrim(c.full_name), ' ', 1) as cliente_nome,
    coalesce(nullif(btrim(pr.nickname), ''), pr.name) as profissional,
    (select string_agg(s.name, ' + ' order by s.name)
       from appointment_services aps
       join services s on s.id = aps.service_id
      where aps.appointment_id = a.id) as servicos,
    b.name, b.slug, b.phone, b.whatsapp,
    nullif(btrim(concat_ws(', ',
      nullif(btrim(concat_ws(', ', b.street, b.number)), ''),
      b.neighborhood, b.city
    )), '') as shop_endereco,
    b.cancel_deadline_hours
  from appointments a
  join customers c      on c.id = a.customer_id
  join professionals pr on pr.id = a.professional_id
  join barbershops b    on b.id = a.barbershop_id
  where a.public_token = p_token
  limit 1;
$fn$;

-- ---------------------------------------------------------------------------
-- O cancelamento pelo link.
--
-- Respeita o `cancel_deadline_hours` da loja, igual ao cliente com conta —
-- quem agenda sem cadastro não ganha um prazo melhor por isso.
--
-- Delega para `cancel_appointment`? NÃO PODE: aquela função exige ou
-- `has_shop_access`, ou que `auth.uid()` seja o dono da ficha. Aqui não há
-- sessão nenhuma; quem autentica é a posse do token. Por isso o cancelamento é
-- escrito aqui, com a mesma regra de prazo e o mesmo aviso à lista de espera.
-- ---------------------------------------------------------------------------
create or replace function cancelar_por_token(
  p_token  uuid,
  p_motivo text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id        uuid;
  v_shop      uuid;
  v_inicio    timestamptz;
  v_status    appointment_status;
  v_prazo     integer;
  v_dia       date;
  v_hora      integer;
  v_periodo   text;
  v_shop_nome text;
begin
  select a.id, a.barbershop_id, a.starts_at, a.status, b.cancel_deadline_hours, b.name
    into v_id, v_shop, v_inicio, v_status, v_prazo, v_shop_nome
    from appointments a
    join barbershops b on b.id = a.barbershop_id
   where a.public_token = p_token
     for update of a;

  if v_id is null then
    raise exception 'Não encontrei esse agendamento. Confira o link.';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Este agendamento já foi cancelado.';
  end if;

  if v_status in ('completed', 'no_show') then
    raise exception 'Este atendimento já foi finalizado e não pode ser cancelado.';
  end if;

  if now() > v_inicio - make_interval(hours => coalesce(v_prazo, 2)) then
    raise exception
      'O prazo para cancelar sozinho já passou (% horas antes). Fale com a barbearia.',
      coalesce(v_prazo, 2);
  end if;

  update appointments
     set status = 'cancelled',
         cancel_reason = nullif(btrim(coalesce(p_motivo, '')), ''),
         cancelled_by = null   -- não há usuário: quem cancelou foi o portador do link
   where id = v_id;

  -- Avisa a lista de espera, igual ao `cancel_appointment`. Uma vaga que abre é
  -- uma vaga que abre — não importa por qual porta o cancelamento entrou.
  v_dia  := (v_inicio at time zone 'America/Sao_Paulo')::date;
  v_hora := extract(hour from (v_inicio at time zone 'America/Sao_Paulo'))::integer;

  v_periodo := case
    when v_hora < 12 then 'morning'
    when v_hora < 18 then 'afternoon'
    else 'evening'
  end;

  insert into notifications (profile_id, type, title, body, link)
  select w.profile_id, 'waitlist',
         'Vagou um horário!',
         'Abriu uma vaga na ' || coalesce(v_shop_nome, 'barbearia') ||
           ' no dia ' || to_char(v_dia, 'DD/MM') || '. Corre que é por ordem de chegada.',
         '/b/' || (select b.slug from barbershops b where b.id = v_shop) || '/agendar'
    from waitlist_entries w
   where w.barbershop_id = v_shop
     and w.desired_date = v_dia
     and w.status = 'waiting'
     and w.period in (v_periodo, 'any');

  update waitlist_entries
     set status = 'notified', notified_at = now()
   where barbershop_id = v_shop
     and desired_date = v_dia
     and status = 'waiting'
     and period in (v_periodo, 'any');

  return true;
end;
$fn$;

-- Estas duas também passam SÓ pela service role. Não é pelo IP — é que um
-- endpoint público que aceita uuid e responde "achei" ou "não achei" é um
-- oráculo: dá para descobrir se um token existe sem ter o link. Passando pela
-- Server Action, quem responde é o nosso servidor, não o PostgREST.
revoke execute on function agendamento_por_token(uuid) from public, anon, authenticated;
revoke execute on function cancelar_por_token(uuid, text) from public, anon, authenticated;

-- E o grant de volta para o único chamador — mesmo motivo do bloco acima: sem
-- isto a página /a/[token] responderia "não encontrei" para TODO token, porque
-- a consulta falharia por permissão antes de chegar ao banco de verdade.
grant execute on function agendamento_por_token(uuid) to service_role;
grant execute on function cancelar_por_token(uuid, text) to service_role;


-- ---------------------------------------------------------------------------
-- Portão: confere o que entrou E o que NÃO PODE ter entrado.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tem_grant boolean;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'barbershops' and column_name = 'allow_public_booking'
  ) then
    raise exception 'A coluna barbershops.allow_public_booking não foi criada.';
  end if;

  -- O grant de coluna é o erro silencioso mais provável deste arquivo: sem
  -- ele a caixinha da tela "salva" e não muda nada.
  if not exists (
    select 1 from information_schema.column_privileges
     where table_name = 'barbershops'
       and column_name = 'allow_public_booking'
       and grantee = 'authenticated'
       and privilege_type = 'UPDATE'
  ) then
    raise exception 'Falta o grant de update em barbershops.allow_public_booking — o dono não conseguiria ligar a opção.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_name = 'appointments' and column_name = 'public_token'
  ) then
    raise exception 'A coluna appointments.public_token não foi criada.';
  end if;

  if not exists (select 1 from pg_tables where tablename = 'public_booking_attempts') then
    raise exception 'A tabela public_booking_attempts não existe.';
  end if;

  -- A TRAVA QUE SUSTENTA O LIMITE POR IP.
  --
  -- Se um dia alguém conceder execute a `anon` "para simplificar", o limite por
  -- IP morre em silêncio: o chamador passaria a escolher o próprio p_ip_hash.
  -- Este portão faz a migração falhar em vez de deixar isso passar despercebido.
  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'book_appointment_publico'
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )
  ) into v_tem_grant;

  if v_tem_grant then
    raise exception
      'PERIGO: book_appointment_publico está acessível por anon/authenticated. Com isso o limite por IP deixa de valer — só a service role pode chamá-la.';
  end if;

  -- O espelho do teste acima: sem o grant para service_role a função existe,
  -- está bem protegida, e NINGUÉM consegue chamá-la. O agendamento público
  -- falharia com "permission denied" em toda tentativa.
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('book_appointment_publico', 'agendamento_por_token', 'cancelar_por_token')
       and has_function_privilege('service_role', p.oid, 'EXECUTE')
    having count(*) = 3
  ) then
    raise exception 'Falta o grant de execute para service_role numa das três funções públicas — o agendamento sem cadastro não funcionaria.';
  end if;

  raise notice '17 aplicada — agendamento sem cadastro, desligado por padrão, com limites no servidor.';
end $$;
