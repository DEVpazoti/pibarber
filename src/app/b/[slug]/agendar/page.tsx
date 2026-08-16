import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";

import { BookingWizard } from "@/components/booking/BookingWizard";
import { getProfile } from "@/lib/auth";
import { carregarBarbeariaPorSlug } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import type { Dependent } from "@/lib/types";
import { hojeISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Agendar" };

/**
 * O fluxo de agendamento.
 *
 * Funciona SEM LOGIN — dá para agendar informando nome e telefone. Quando há
 * sessão, os campos já vêm preenchidos e o passo "Para quem?" aparece se a
 * pessoa tiver dependentes cadastrados.
 */
export default async function AgendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dados = await carregarBarbeariaPorSlug(slug);

  if (!dados) notFound();

  const { loja, servicos, profissionais } = dados;

  // Agendamento online desligado: a página não existe. Quem chegar pela URL
  // volta para o perfil, onde estão o telefone e o WhatsApp.
  if (!loja.accepts_online_booking) notFound();

  const perfil = await getProfile();
  const dependentes = perfil ? await carregarDependentes(perfil.id) : [];

  return (
    <BookingWizard
      shopId={loja.id}
      slug={loja.slug}
      nomeLoja={loja.name}
      servicos={servicos}
      profissionais={profissionais}
      dependentes={dependentes}
      maxDiasAntecedencia={loja.max_advance_days}
      nomeInicial={perfil?.full_name ?? ""}
      telefoneInicial={perfil?.phone ?? ""}
      logado={perfil != null}
      // Nasce DESLIGADO em toda barbearia. Ligado, o visitante sem conta
      // conclui com nome e telefone; desligado, ele vê o convite para entrar —
      // o fluxo que existia antes deste ajuste.
      permiteSemCadastro={loja.allow_public_booking}
      hoje={hojeISO()}
    />
  );
}

async function carregarDependentes(profileId: string): Promise<Dependent[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dependents")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[agendar] falha ao listar dependentes:", error);
      return [];
    }
    return data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[agendar] erro inesperado ao listar dependentes:", error);
    return [];
  }
}
