-- ============================================================================
-- PiBarber — 04_seed.sql
-- Dados de exemplo para desenvolver.
--
-- Cria 4 barbearias em cidades diferentes com latitude e longitude REAIS, para
-- a busca por proximidade ter o que devolver.
--
-- CONTAS CRIADAS (senha de todas: pibarber123)
--   dono.saopaulo@pibarber.dev     dono da Navalha & Cia          (São Paulo)
--   dono.campinas@pibarber.dev     dono da Barbearia do Tião      (Campinas)
--   dono.rio@pibarber.dev          dono da Corte Carioca          (Rio de Janeiro)
--   dono.bh@pibarber.dev           dono da Machado Barbearia      (Belo Horizonte)
--   cliente1@pibarber.dev … cliente6@pibarber.dev
--
-- NUNCA rode este arquivo em produção.
--
-- Por que os lançamentos de caixa são inseridos na mão em vez de chamar
-- complete_appointment(): aquela função confere has_shop_access(), que depende
-- de auth.uid(). No SQL Editor auth.uid() é nulo, e a chamada levantaria
-- exceção. O seed escreve direto nas tabelas, com os mesmos números.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper temporário: cria um usuário em auth.users (o trigger handle_new_user
-- cria o profile sozinho). Idempotente pelo e-mail.
-- ---------------------------------------------------------------------------
-- `extensions` no search_path NÃO é decoração: o Supabase instala o pgcrypto
-- nesse schema, e sem ele crypt() e gen_salt() somem com
-- "42883: function gen_salt(unknown) does not exist".
-- Em Postgres comum o pgcrypto costuma ficar em public, que já vem primeiro —
-- então esta lista funciona nos dois.
create or replace function seed_criar_usuario(p_email text, p_senha text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $fn$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  -- Os quatro campos de token vão como '' e NÃO como null.
  --
  -- Eles são nullable e não têm default, mas o GoTrue é escrito em Go e lê
  -- essas colunas como `string` não-nulo. Deixando null, TODO login da conta
  -- falha com "Database error querying schema" — um erro que não diz nada
  -- sobre a causa real.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, crypt(p_senha, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_nome),
    false,
    '', '', '', ''
  );

  -- Sem a identity, o login por e-mail e senha não funciona no GoTrue.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email),
    'email', v_id::text,
    now(), now(), now()
  );

  return v_id;
end;
$fn$;


-- ###########################################################################
-- 1. AS QUATRO BARBEARIAS
-- ###########################################################################

do $seed$
declare
  v_dono   uuid;
  v_shop   uuid;
  v_linha  record;
  v_prof   text;
  v_i      integer;

  -- nome | slug | cidade | uf | bairro | lat | lng | telefone | descrição
  v_shops constant text[][] := array[
    array['Navalha & Cia', 'navalha-e-cia', 'São Paulo', 'SP', 'Vila Madalena',
          '-23.5546', '-46.6890', '11987654321',
          'Barbearia clássica na Vila Madalena. Corte na tesoura, navalha quente e cerveja gelada.'],
    array['Barbearia do Tião', 'barbearia-do-tiao', 'Campinas', 'SP', 'Cambuí',
          '-22.9099', '-47.0626', '19987704045',
          'Há 18 anos no Cambuí. O corte que seu pai confiava, com o acabamento de hoje.'],
    array['Corte Carioca', 'corte-carioca', 'Rio de Janeiro', 'RJ', 'Copacabana',
          '-22.9711', '-43.1822', '21987654321',
          'A duas quadras da praia. Degradê, barba e aquele papo bom de Copacabana.'],
    array['Machado Barbearia', 'machado-barbearia', 'Belo Horizonte', 'MG', 'Savassi',
          '-19.9386', '-43.9345', '31987654321',
          'Na Savassi desde 2015. Ambiente tranquilo, café na casa e hora marcada respeitada.']
  ];

  v_emails constant text[] := array[
    'dono.saopaulo@pibarber.dev',
    'dono.campinas@pibarber.dev',
    'dono.rio@pibarber.dev',
    'dono.bh@pibarber.dev'
  ];

  v_donos constant text[] := array[
    'Ricardo Almeida', 'Sebastião Ferreira', 'Marcelo Nunes', 'André Machado'
  ];

  -- Equipe de cada barbearia (2 a 4 profissionais).
  --
  -- Uma STRING por barbearia, com os profissionais separados por ";;" — e não
  -- um array de arrays. Motivo: em PL/pgSQL todo array multidimensional exige
  -- que as linhas tenham o MESMO tamanho, e aqui elas têm 3, 2, 4 e 2.
  -- Campos de cada profissional: nome|apelido|bio|comissão
  v_equipes constant text[] := array[
    'Ricardo Almeida|Ricardo|Tesoura e navalha há 20 anos.|45' ||
      ';;Bruno Tavares|Bruninho|Especialista em degradê e freestyle.|40' ||
      ';;Caio Moreira|Caio|Barba desenhada e toalha quente.|40',

    'Sebastião Ferreira|Tião|O dono da cadeira número 1.|50' ||
      ';;Wesley Rocha|Wes|Cortes modernos e platinado.|40',

    'Marcelo Nunes|Celo|Degradê navalhado é comigo.|45' ||
      ';;Diego Barbosa|Diego|Barba e bigode no capricho.|40' ||
      ';;Rafael Pinto|Rafa|Corte infantil sem drama.|35' ||
      ';;Igor Santana|Igor|Sobrancelha e acabamento.|35',

    'André Machado|André|Clássico bem feito nunca sai de moda.|50' ||
      ';;Thiago Lopes|Thiagão|Máquina, tesoura e paciência.|40'
  ];

  -- Catálogo: nome | descrição | preço base | duração
  v_servicos constant text[][] := array[
    array['Corte social', 'Corte clássico na tesoura, com acabamento na navalha.', '40', '30'],
    array['Corte degradê', 'Degradê baixo, médio ou alto, do jeito que você pedir.', '45', '40'],
    array['Corte + barba', 'O combo completo: corte, barba e toalha quente.', '70', '60'],
    array['Barba', 'Barba feita na navalha, com toalha quente e balm.', '30', '25'],
    array['Barba modelada', 'Desenho, alinhamento e hidratação da barba.', '35', '30'],
    array['Pezinho', 'Acabamento na nuca e nas costeletas.', '15', '15'],
    array['Sobrancelha', 'Limpeza e alinhamento na navalha.', '15', '15'],
    array['Platinado', 'Descoloração completa com matização e tratamento.', '150', '120']
  ];
begin
  for v_i in 1 .. array_length(v_shops, 1) loop

    -- Já existe? Pula (o script é idempotente).
    if exists (select 1 from barbershops where slug = v_shops[v_i][2]) then
      continue;
    end if;

    v_dono := seed_criar_usuario(v_emails[v_i], 'pibarber123', v_donos[v_i]);

    insert into barbershops (
      owner_id, name, slug, description, phone, whatsapp,
      zip_code, street, number, neighborhood, city, state,
      latitude, longitude, accepts_online_booking,
      min_advance_minutes, max_advance_days, cancel_deadline_hours,
      logo_url, cover_url
    ) values (
      v_dono, v_shops[v_i][1], v_shops[v_i][2], v_shops[v_i][9],
      v_shops[v_i][8], v_shops[v_i][8],
      '00000-000', 'Rua Exemplo', v_i::text || '00',
      v_shops[v_i][5], v_shops[v_i][3], v_shops[v_i][4],
      v_shops[v_i][6]::numeric, v_shops[v_i][7]::numeric, true,
      60, 60, 2,
      null, null
    )
    returning id into v_shop;

    -- --- Horário: fechado domingo, seg-sex 9h-19h, sábado 8h-17h -----------
    insert into business_hours (barbershop_id, weekday, opens_at, closes_at, break_start, break_end, is_closed)
    values
      (v_shop, 0, null, null, null, null, true),
      (v_shop, 1, '09:00', '19:00', '12:00', '13:00', false),
      (v_shop, 2, '09:00', '19:00', '12:00', '13:00', false),
      (v_shop, 3, '09:00', '19:00', '12:00', '13:00', false),
      (v_shop, 4, '09:00', '19:00', '12:00', '13:00', false),
      (v_shop, 5, '09:00', '19:00', '12:00', '13:00', false),
      (v_shop, 6, '08:00', '17:00', null, null, false);

    -- --- Equipe -------------------------------------------------------------
    foreach v_prof in array string_to_array(v_equipes[v_i], ';;') loop
      insert into professionals (
        barbershop_id, name, nickname, bio, commission_percent, is_active, sort_order
      ) values (
        v_shop,
        split_part(v_prof, '|', 1),
        split_part(v_prof, '|', 2),
        split_part(v_prof, '|', 3),
        split_part(v_prof, '|', 4)::numeric,
        true,
        (select count(*) from professionals where barbershop_id = v_shop)
      );
    end loop;

    -- --- Catálogo (preço varia um pouco por praça) --------------------------
    for v_linha in
      select generate_subscripts(v_servicos, 1) as k
    loop
      insert into services (
        barbershop_id, name, description, price, duration_minutes, is_active, sort_order
      ) values (
        v_shop,
        v_servicos[v_linha.k][1],
        v_servicos[v_linha.k][2],
        round(v_servicos[v_linha.k][3]::numeric * (0.9 + v_i * 0.05), 2),
        v_servicos[v_linha.k][4]::integer,
        true,
        v_linha.k
      );
    end loop;

  end loop;
end;
$seed$;


-- ###########################################################################
-- 2. OS CLIENTES
--
-- 6 deles têm conta no PiBarber (profile_id preenchido) — é o que permite
-- favoritos, últimos acessos e avaliações. O resto é ficha que o dono
-- cadastrou na mão, com profile_id nulo: o caso mais comum na vida real.
-- ###########################################################################

do $seed$
declare
  v_shop     uuid;
  v_perfil   uuid;
  v_i        integer;
  v_n        integer;
  v_nome     text;
  v_tel      text;

  v_nomes constant text[] := array[
    'Marcos Vinícius Souza','Diego Ramos','Paulo Henrique Lima','Fernando Costa',
    'Rodrigo Alves','Lucas Martins','Gabriel Oliveira','Tiago Barbosa',
    'Vitor Hugo Dias','Leonardo Prado','Felipe Andrade','Mateus Carvalho',
    'Henrique Batista','Renato Siqueira','Gustavo Peixoto','Eduardo Vasques',
    'Alexandre Pires','Danilo Freitas','Murilo Teixeira','Otávio Bastos',
    'Samuel Rocha','Caio Nogueira','Bruno Cardoso','Anderson Melo',
    'Wagner Fonseca','Júlio César Maia','Emerson Tavares','Ricardo Brandão',
    'Nelson Aguiar','Cristiano Padilha'
  ];
begin
  -- Os 6 com conta.
  for v_i in 1 .. 6 loop
    perform seed_criar_usuario(
      'cliente' || v_i || '@pibarber.dev', 'pibarber123', v_nomes[v_i]
    );
  end loop;

  -- Telefone e data de nascimento no perfil, para a tela "Meus Dados" não
  -- nascer vazia.
  for v_i in 1 .. 6 loop
    update profiles
       set phone = '119' || lpad((10000000 + v_i * 137)::text, 8, '0'),
           birth_date = date '1990-01-01' + (v_i * 421)
     where email = 'cliente' || v_i || '@pibarber.dev';
  end loop;

  -- Espalha as fichas pelas barbearias.
  v_n := 0;
  for v_shop in select id from barbershops order by created_at loop
    for v_i in 1 .. 8 loop
      v_n := v_n + 1;
      exit when v_n > array_length(v_nomes, 1);

      v_nome := v_nomes[v_n];
      v_tel  := '119' || lpad((10000000 + v_n * 137)::text, 8, '0');

      -- Os 6 primeiros nomes são os que têm conta: casa pelo telefone,
      -- exatamente como book_appointment() faria.
      select p.id into v_perfil
        from profiles p
       where p.email = 'cliente' || v_n || '@pibarber.dev';

      insert into customers (
        barbershop_id, profile_id, full_name, phone, notes
      ) values (
        v_shop, v_perfil, v_nome, v_tel,
        case when v_n % 4 = 0 then 'Máquina 2 nas laterais, tesoura em cima.'
             when v_n % 4 = 1 then 'Não gosta de conversa. Corte e pronto.'
             when v_n % 4 = 2 then 'Sempre atrasa uns 10 minutos.'
             else null end
      )
      on conflict (barbershop_id, phone) do nothing;

      v_perfil := null;
    end loop;
  end loop;
end;
$seed$;


-- ###########################################################################
-- 3. OS AGENDAMENTOS
--
-- Espalhados pelas últimas 4 semanas e nas próximas 2, em vários status.
--
-- Os horários saem de uma grade fixa de 90 em 90 minutos. Isso NÃO é
-- preciosismo: a constraint appointments_no_overlap recusaria dois
-- atendimentos sobrepostos do mesmo profissional, e um seed com horário
-- aleatório quebraria na cara do usuário.
-- ###########################################################################

do $seed$
declare
  v_shop      record;
  v_prof      record;
  v_cli       record;
  v_serv      record;
  v_dia       date;
  v_d         integer;
  v_k         integer;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio    timestamptz;
  v_status    appointment_status;
  v_appt      uuid;
  v_total     numeric(10, 2);
  v_dur       integer;
  v_metodo    payment_method;
  v_percent   numeric(5, 2);
  v_criados   integer := 0;
  v_grade     constant time[] := array['09:00','10:30','14:00','15:30','17:00']::time[];
begin
  for v_shop in select id, owner_id from barbershops order by created_at loop
    for v_d in -28 .. 14 loop
      v_dia := v_hoje + v_d;

      -- Domingo a loja fecha.
      continue when extract(dow from v_dia) = 0;

      for v_prof in
        select id, commission_percent from professionals
         where barbershop_id = v_shop.id and is_active
         order by sort_order
      loop
        -- Nem todo profissional tem agenda todo dia.
        continue when random() < 0.55;

        for v_k in 1 .. (1 + floor(random() * 2)::integer) loop

          -- Escolhe um serviço e um cliente desta barbearia.
          select id, price, duration_minutes into v_serv
            from services
           where barbershop_id = v_shop.id and is_active
           order by random() limit 1;

          select id, profile_id into v_cli
            from customers
           where barbershop_id = v_shop.id
           order by random() limit 1;

          continue when v_serv.id is null or v_cli.id is null;

          v_inicio := (v_dia + v_grade[v_k]) at time zone 'America/Sao_Paulo';
          v_total  := v_serv.price;
          v_dur    := v_serv.duration_minutes;

          -- Passado vira concluído (com uma pitada de falta e cancelamento);
          -- futuro fica agendado ou confirmado.
          if v_dia < v_hoje then
            v_status := case
              when random() < 0.82 then 'completed'
              when random() < 0.6  then 'no_show'
              else 'cancelled'
            end;
          elsif v_dia = v_hoje then
            v_status := case when random() < 0.5 then 'completed' else 'confirmed' end;
          else
            v_status := case when random() < 0.5 then 'scheduled' else 'confirmed' end;
          end if;

          begin
            insert into appointments (
              barbershop_id, professional_id, customer_id,
              starts_at, ends_at, status, total_price, source, created_by,
              completed_at
            ) values (
              v_shop.id, v_prof.id, v_cli.id,
              v_inicio, v_inicio + make_interval(mins => v_dur),
              v_status, v_total,
              case when random() < 0.4 then 'online' else 'manual' end::appointment_source,
              v_shop.owner_id,
              case when v_status = 'completed' then v_inicio + make_interval(mins => v_dur) end
            )
            returning id into v_appt;
          exception when exclusion_violation then
            -- A grade fixa já evita, mas se dois laços caírem no mesmo ponto
            -- o banco recusa e o seed simplesmente segue.
            continue;
          end;

          v_criados := v_criados + 1;

          insert into appointment_services (appointment_id, service_id, price, duration_minutes)
          values (v_appt, v_serv.id, v_serv.price, v_serv.duration_minutes);

          -- --- O dinheiro do atendimento concluído --------------------------
          if v_status = 'completed' then
            v_metodo := (array['cash','pix','debit','credit','pix','pix'])[1 + floor(random() * 6)]::payment_method;

            if random() < 0.12 then
              -- ~12% saem no fiado: é o que dá vida à tela /painel/fiado.
              insert into debts (
                barbershop_id, customer_id, appointment_id,
                original_amount, paid_amount, status, due_date
              ) values (
                v_shop.id, v_cli.id, v_appt,
                v_total, 0, 'open', v_dia + 15
              );
            else
              insert into transactions (
                barbershop_id, type, amount, payment_method,
                category, description, appointment_id, occurred_at, created_by
              ) values (
                v_shop.id, 'income', v_total, v_metodo,
                'Atendimento', 'Atendimento concluído', v_appt, v_dia, v_shop.owner_id
              );
            end if;

            v_percent := v_prof.commission_percent;
            if coalesce(v_percent, 0) > 0 then
              insert into commissions (
                barbershop_id, professional_id, appointment_id,
                base_amount, percent, amount, status, paid_at
              ) values (
                v_shop.id, v_prof.id, v_appt,
                v_total, v_percent, round(v_total * v_percent / 100, 2),
                case when v_dia < v_hoje - 14 then 'paid' else 'pending' end::commission_status,
                case when v_dia < v_hoje - 14 then v_inicio + interval '20 days' end
              )
              on conflict (appointment_id) do nothing;
            end if;

            update customers
               set total_visits  = total_visits + 1,
                   total_spent   = total_spent + v_total,
                   last_visit_at = greatest(coalesce(last_visit_at, v_inicio), v_inicio)
             where id = v_cli.id;

          elsif v_status = 'no_show' then
            update customers set no_show_count = no_show_count + 1 where id = v_cli.id;
          end if;

        end loop;
      end loop;
    end loop;
  end loop;

  raise notice 'Agendamentos criados: %', v_criados;
end;
$seed$;


-- ###########################################################################
-- 4. DESPESAS — para o caixa ter os dois lados
-- ###########################################################################

do $seed$
declare
  v_shop record;
  v_m    integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for v_shop in select id, owner_id from barbershops loop
    for v_m in 0 .. 1 loop
      insert into transactions (barbershop_id, type, amount, category, description, occurred_at, created_by)
      values
        (v_shop.id, 'expense', 1800.00, 'Aluguel',   'Aluguel do ponto',            date_trunc('month', v_hoje)::date - (v_m * 30), v_shop.owner_id),
        (v_shop.id, 'expense',  320.50, 'Produtos',  'Pomada, gel e lâminas',       date_trunc('month', v_hoje)::date - (v_m * 30) + 4, v_shop.owner_id),
        (v_shop.id, 'expense',  240.00, 'Energia',   'Conta de luz',                date_trunc('month', v_hoje)::date - (v_m * 30) + 9, v_shop.owner_id),
        (v_shop.id, 'expense',  120.00, 'Internet',  'Internet da loja',            date_trunc('month', v_hoje)::date - (v_m * 30) + 11, v_shop.owner_id);
    end loop;
  end loop;
end;
$seed$;


-- ###########################################################################
-- 5. AVALIAÇÕES, FAVORITOS, ÚLTIMOS ACESSOS E LISTA DE ESPERA
--
-- Só clientes COM conta avaliam — reviews.profile_id é obrigatório.
-- O trigger review_after_insert() recalcula a nota da barbearia sozinho.
-- ###########################################################################

do $seed$
declare
  v_appt    record;
  v_perfil  uuid;
  v_n       integer := 0;

  v_comentarios constant text[] := array[
    'Corte impecável, saí novo. Voltarei sem dúvida.',
    'Atendimento no horário e sem enrolação. É isso que eu procuro.',
    'Melhor degradê que já fizeram em mim. Recomendo demais.',
    'Ambiente tranquilo, café bom e corte caprichado.',
    'Profissional atencioso, entendeu exatamente o que eu queria.',
    'Bom corte, mas esperei uns 15 minutos além do marcado.',
    'Barba feita com capricho, toalha quente é outro nível.',
    'Preço justo pelo que entrega. Virei cliente fixo.'
  ];
begin
  for v_appt in
    select a.id, a.barbershop_id, a.professional_id, a.starts_at, c.profile_id
      from appointments a
      join customers c on c.id = a.customer_id
     where a.status = 'completed'
       and c.profile_id is not null
     order by random()
     limit 40
  loop
    -- reviews.appointment_id é unique: um atendimento, uma avaliação.
    continue when exists (select 1 from reviews r where r.appointment_id = v_appt.id);

    v_n := v_n + 1;

    insert into reviews (
      barbershop_id, appointment_id, profile_id, professional_id,
      rating, comment, reply, replied_at, created_at
    ) values (
      v_appt.barbershop_id, v_appt.id, v_appt.profile_id, v_appt.professional_id,
      case when random() < 0.72 then 5 when random() < 0.8 then 4 else 3 end,
      v_comentarios[1 + (v_n % array_length(v_comentarios, 1))],
      case when random() < 0.35 then 'Valeu demais pelo retorno! Te esperamos na próxima.' end,
      case when random() < 0.35 then v_appt.starts_at + interval '2 days' end,
      v_appt.starts_at + interval '1 day'
    );
  end loop;

  -- Favoritos e últimos acessos dos clientes com conta.
  for v_perfil in select id from profiles where email like 'cliente%@pibarber.dev' loop
    insert into favorites (profile_id, barbershop_id)
    select v_perfil, b.id from barbershops b order by random() limit 2
    on conflict (profile_id, barbershop_id) do nothing;

    insert into shop_visits (profile_id, barbershop_id, last_viewed_at)
    select v_perfil, b.id, now() - (random() * interval '10 days')
      from barbershops b order by random() limit 3
    on conflict (profile_id, barbershop_id)
      do update set last_viewed_at = excluded.last_viewed_at;
  end loop;

  -- Alguém na fila de espera, para /painel/espera não nascer vazia.
  insert into waitlist_entries (barbershop_id, profile_id, desired_date, period, status)
  select b.id, p.id,
         (now() at time zone 'America/Sao_Paulo')::date + 2,
         (array['morning','afternoon','evening','any'])[1 + floor(random() * 4)],
         'waiting'
    from barbershops b
    cross join lateral (
      select id from profiles where email like 'cliente%@pibarber.dev' order by random() limit 1
    ) p;

  -- Uma notificação não lida, para o sino aparecer com o ponto em latão.
  insert into notifications (profile_id, type, title, body, link)
  select id, 'system', 'Bem-vindo ao PiBarber!',
         'Encontre uma barbearia perto de você e agende em poucos toques.',
         '/app/buscar'
    from profiles where email like 'cliente%@pibarber.dev';
end;
$seed$;


-- ---------------------------------------------------------------------------
-- Limpa o helper temporário — ele cria usuário sem senha forte e não deve
-- ficar disponível depois do seed.
-- ---------------------------------------------------------------------------
drop function if exists seed_criar_usuario(text, text, text);


-- ---------------------------------------------------------------------------
-- Confirmação
-- ---------------------------------------------------------------------------
do $seed$
declare
  b integer; p integer; s integer; c integer; a integer; t integer; r integer; d integer;
begin
  select count(*) into b from barbershops;
  select count(*) into p from professionals;
  select count(*) into s from services;
  select count(*) into c from customers;
  select count(*) into a from appointments;
  select count(*) into t from transactions;
  select count(*) into r from reviews;
  select count(*) into d from debts;

  raise notice '04_seed.sql concluído.';
  raise notice '  barbearias: %  profissionais: %  serviços: %', b, p, s;
  raise notice '  clientes: %  agendamentos: %', c, a;
  raise notice '  lançamentos no caixa: %  avaliações: %  fiados: %', t, r, d;
  raise notice 'Login de teste: dono.campinas@pibarber.dev / pibarber123';
end;
$seed$;
