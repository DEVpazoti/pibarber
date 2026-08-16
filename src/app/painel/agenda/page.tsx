import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { AgendaGrid } from "@/components/painel/AgendaGrid";
import { AlertaPendencias } from "@/components/painel/AlertaPendencias";
import { PageHeader } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import {
  carregarAgendamentos,
  carregarProfissionais,
  carregarServicos,
  contarPendencias,
  semanaDe,
} from "@/lib/queries/agenda";
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

/** "09:30:00" → 570. Volta null quando o horário não veio. */
function paraMinutos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const [h = "0", m = "0"] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * De que hora a que hora a grade é desenhada.
 *
 * Pega o horário mais cedo e o mais tarde da semana inteira, não o do dia:
 * assim a régua não muda de altura ao virar a página, e o olho não precisa se
 * reorientar toda vez.
 */
async function faixaDaGrade(shopId: string): Promise<{ abre: number; fecha: number }> {
  const padrao = { abre: 8 * 60, fecha: 20 * 60 };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_hours")
      .select("opens_at, closes_at, is_closed")
      .eq("barbershop_id", shopId)
      .eq("is_closed", false);

    if (error) {
      console.error("[agenda] falha ao ler o horário da loja:", error);
      return padrao;
    }
    if (!data || data.length === 0) return padrao;

    const aberturas = data.map((d) => paraMinutos(d.opens_at)).filter((n): n is number => n != null);
    const fechamentos = data
      .map((d) => paraMinutos(d.closes_at))
      .filter((n): n is number => n != null);

    if (aberturas.length === 0 || fechamentos.length === 0) return padrao;

    return {
      abre: Math.min(...aberturas),
      fecha: Math.max(...fechamentos),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agenda] erro inesperado ao ler o horário da loja:", error);
    return padrao;
  }
}

/** Aceita só o que a grade sabe desenhar — o resto vira o padrão. */
function normalizarDia(valor: string | undefined, hoje: string): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoje;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; modo?: string }>;
}) {
  const { shopId } = await requireShopContext();
  const params = await searchParams;

  const hoje = hojeISO();
  const dia = normalizarDia(params.dia, hoje);
  const modo = params.modo === "semana" ? "semana" : "dia";

  const dias = semanaDe(dia);
  const primeiro = modo === "semana" ? (dias[0] ?? dia) : dia;
  const ultimo = modo === "semana" ? (dias[6] ?? dia) : dia;

  const [agendamentos, profissionais, servicos, faixa, pendencias] = await Promise.all([
    carregarAgendamentos(shopId, primeiro, ultimo),
    carregarProfissionais(shopId),
    carregarServicos(shopId),
    faixaDaGrade(shopId),
    contarPendencias(shopId, hoje),
  ]);

  return (
    <>
      <PageHeader
        titulo="Agenda"
        descricao="Toque num vazio para encaixar alguém; num atendimento para concluir, cancelar ou marcar falta."
      />

      {/* A Agenda é onde o barbeiro vai quando quer olhar OUTRO dia — e "outro
          dia" é exatamente o que ficou para trás sem conclusão. */}
      <AlertaPendencias quantidade={pendencias} />

      <AgendaGrid
        dia={dia}
        modo={modo}
        diasDaSemana={dias}
        agendamentos={agendamentos}
        profissionais={profissionais}
        servicos={servicos}
        abreEm={faixa.abre}
        fechaEm={faixa.fecha}
        hoje={hoje}
      />
    </>
  );
}
