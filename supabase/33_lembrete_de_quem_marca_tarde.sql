-- ============================================================================
-- PiBarber — 33_lembrete_de_quem_marca_tarde.sql
--
-- QUEM MARCA DEPOIS DAS 18h DA VÉSPERA VOLTA A RECEBER O LEMBRETE.
--
-- A 25_lembrete_diz_o_dia.sql (22/09) tirou o lembrete de quem agenda depois
-- das 18h da véspera, com um motivo que era verdade na época: "a CONFIRMAÇÃO
-- já fez esse trabalho". Em 30/09 a confirmação por WhatsApp foi desligada
-- (decisão do negócio — src/lib/whatsapp/catalogo.ts, EVENTOS). As duas juntas
-- deixaram um buraco: quem marca à noite para o dia seguinte, ou no próprio
-- dia, não recebia NADA pelo WhatsApp. Observado em produção em 30/09: agendou
-- às 20:37 para as 10:00 do dia seguinte, e nenhuma mensagem.
--
-- A CORREÇÃO: sai só a condição de `created_at`. Quem marca tarde entra na
-- fila na próxima rodada do cron (5 min) e o lembrete sai em seguida — é ele
-- que faz o papel da confirmação agora.
--
-- O que a 25 resolveu CONTINUA resolvido: o texto do lembrete é o v2, com o
-- dia como parâmetro ("hoje", "amanhã", "sexta, 26/09" — `palavraDoDia` em
-- src/lib/whatsapp/fila.ts), calculado na hora de enfileirar. O lembrete que
-- sai logo depois de marcar diz o dia certo; foi a palavra "amanhã" fixa no
-- texto, e não o horário do envio, que causou o bug de 22/09.
--
-- Os agendamentos que a regra velha deixou para trás (futuros, sem lembrete)
-- entram na primeira rodada depois desta migração — `reminder_sent_at`
-- continua nulo neles.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK: reaplique a PARTE 2 da 25_lembrete_diz_o_dia.sql.
-- ============================================================================

create or replace function whatsapp_lembretes_pendentes(p_limite integer default 200)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id
    from appointments a
    join barbershops b on b.id = a.barbershop_id
    join customers c   on c.id = a.customer_id
   where a.status in ('scheduled', 'confirmed')
     and a.reminder_sent_at is null
     and a.starts_at > now()
     and a.starts_at <= now() + interval '36 hours'
     and b.is_active
     and b.whatsapp_reminder_enabled
     and c.phone is not null
   order by a.starts_at
   limit greatest(1, least(coalesce(p_limite, 200), 1000));
$fn$;

revoke execute on function whatsapp_lembretes_pendentes(integer) from public, anon, authenticated;
grant execute on function whatsapp_lembretes_pendentes(integer) to service_role;


-- ---------------------------------------------------------------------------
-- Portão: saiu a condição da 25, e NENHUM filtro da 24 saiu junto.
-- ---------------------------------------------------------------------------
do $$
declare
  v_corpo text;
begin
  select pg_get_functiondef(p.oid) into v_corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'whatsapp_lembretes_pendentes';

  if v_corpo like '%created_at%' then
    raise exception 'A condição de "agendou depois das 18h da véspera" ainda está na função.';
  end if;
  if v_corpo not like '%whatsapp_reminder_enabled%' then
    raise exception 'REGRESSÃO: o interruptor da barbearia sumiu do filtro.';
  end if;
  if v_corpo not like '%c.phone is not null%' then
    raise exception 'REGRESSÃO: o filtro de telefone sumiu — o avulso voltaria em toda rodada.';
  end if;
  if v_corpo not like '%reminder_sent_at is null%' then
    raise exception 'REGRESSÃO: o filtro de lembrete pendente sumiu.';
  end if;
  if v_corpo not like '%36 hours%' then
    raise exception 'REGRESSÃO: a janela de 36 horas sumiu.';
  end if;

  raise notice '33 aplicada — quem marca depois das 18h da véspera recebe o lembrete na próxima rodada.';
end $$;
