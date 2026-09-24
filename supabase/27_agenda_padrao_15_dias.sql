-- ============================================================================
-- PiBarber — 27_agenda_padrao_15_dias.sql
--
-- A AGENDA NASCE ABERTA POR 15 DIAS, NÃO 60.
--
-- `max_advance_days` é até quando o cliente consegue marcar. 60 dias era
-- longe demais para barbearia: horário marcado com dois meses de antecedência
-- vira falta. Decisão do negócio (2026-09-23).
--
-- Muda só o PADRÃO de loja nova. Loja já configurada mantém o que o dono
-- escolheu. A exceção são as que ainda estão no setup (`setup_completed_at`
-- nulo) com o 60 intocado: essas ainda não escolheram nada, e o setup mostra
-- o valor da linha — sem o update, continuariam vendo 60.
--
-- Rollback:
--   alter table barbershops alter column max_advance_days set default 60;
-- ============================================================================

alter table barbershops alter column max_advance_days set default 15;

update barbershops
   set max_advance_days = 15
 where setup_completed_at is null
   and max_advance_days = 60;
