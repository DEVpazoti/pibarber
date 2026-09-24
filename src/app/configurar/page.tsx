import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupGuiado, type PassoDoSetup } from "@/components/setup/SetupGuiado";
import { requireRole, requireShopContext } from "@/lib/auth";
import { urlDoSite } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Configurar barbearia",
  robots: { index: false, follow: false },
};

/**
 * O SETUP GUIADO — a primeira coisa que o dono vê numa loja recém-criada.
 *
 * Mora FORA de /painel: o layout de lá manda para cá enquanto o setup não
 * termina, e um layout que redireciona para dentro do próprio grupo roda de
 * novo e trava em loop. Pelo mesmo motivo, daqui só se sai para /painel
 * quando `setup_completed_at` já está gravado.
 *
 * Não há coluna de "etapa atual". A etapa em que o dono volta é deduzida do
 * que já existe no banco — a primeira que ainda falta.
 */
export default async function ConfigurarPage() {
  // Assistente não configura a loja: volta para o painel dele.
  await requireRole(["owner"]);
  const { profile, shopId, setupConcluido } = await requireShopContext();
  if (setupConcluido) redirect("/painel");

  const supabase = await createClient();

  const [loja, horarios, servicos, profissionais] = await Promise.all([
    supabase.from("barbershops").select("*").eq("id", shopId).maybeSingle(),
    supabase
      .from("business_hours")
      .select("*")
      .eq("barbershop_id", shopId)
      .order("weekday", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("professionals")
      .select("id, name, commission_percent, is_active, profile_id")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: true }),
  ]);

  for (const r of [loja, horarios, servicos, profissionais]) {
    if (r.error) console.error("[configurar] falha ao carregar o setup:", r.error);
  }
  if (!loja.data) redirect("/sem-barbearia");

  const temEndereco = loja.data.latitude != null;
  const temHorario = (horarios.data ?? []).some((h) => !h.is_closed);
  const temServico = (servicos.data ?? []).some((s) => s.is_active);
  const temEquipe = (profissionais.data ?? []).some((p) => p.is_active);

  // Nada feito ainda → começa do começo. Senão, a primeira etapa obrigatória
  // que falta; com todas feitas, as regras de agendamento.
  const passoInicial: PassoDoSetup =
    !temEndereco && !temHorario && !temServico && !temEquipe
      ? "barbearia"
      : !temEndereco
        ? "endereco"
        : !temHorario
          ? "horario"
          : !temServico
            ? "servicos"
            : !temEquipe
              ? "equipe"
              : "regras";

  return (
    <SetupGuiado
      loja={loja.data}
      horarios={horarios.data ?? []}
      servicos={servicos.data ?? []}
      profissionais={profissionais.data ?? []}
      dono={{ id: profile.id, nome: profile.full_name ?? "" }}
      urlPublica={urlDoSite()}
      passoInicial={passoInicial}
    />
  );
}
