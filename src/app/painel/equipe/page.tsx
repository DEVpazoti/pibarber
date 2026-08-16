import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { EquipeAcessos, type AssistenteDaEquipe } from "@/components/painel/EquipeAcessos";
import {
  EquipeProfissionais,
  type AcessoDaLoja,
  type FolgaDaEquipe,
  type ProfissionalDaEquipe,
} from "@/components/painel/EquipeProfissionais";
import { PageHeader } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, many, timestampSP } from "@/lib/utils";

export const metadata: Metadata = { title: "Equipe" };

/**
 * EQUIPE — só o dono.
 *
 * `requireOwnerContext()` redireciona o assistente para /painel antes de
 * renderizar qualquer coisa, e a RLS recusaria a escrita mesmo que ele
 * chegasse aqui de algum jeito.
 */
export default async function EquipePage() {
  const { shopId, profile } = await requireOwnerContext();

  const [profissionais, folgas, assistentes] = await Promise.all([
    carregarProfissionais(shopId),
    carregarFolgas(shopId),
    carregarAssistentes(shopId),
  ]);

  /**
   * Quem pode ser ligado a um profissional: os assistentes da loja E o próprio
   * dono — em boa parte das barbearias é ele quem mais corta cabelo, e sem esta
   * linha ele não conseguiria ligar a si mesmo ao próprio registro.
   *
   * A mesma lista é validada de novo no banco, pelo trigger
   * `professionals_guard_profile`: montar a lista aqui é conveniência de tela,
   * não é a trava.
   */
  const acessos: AcessoDaLoja[] = [
    { id: profile.id, full_name: `${profile.full_name ?? "Você"} (dono)`, email: profile.email },
    ...assistentes,
  ];

  return (
    <>
      <PageHeader
        titulo="Equipe"
        descricao="Quem corta o cabelo e quem entra no sistema. São duas listas diferentes."
      />

      <EquipeProfissionais
        profissionais={profissionais}
        folgas={folgas}
        shopId={shopId}
        acessos={acessos}
      />
      <EquipeAcessos assistentes={assistentes} />
    </>
  );
}

/* ==========================================================================
   Consultas
   ========================================================================== */

async function carregarProfissionais(shopId: string): Promise<ProfissionalDaEquipe[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("professionals")
      .select(
        `id, name, nickname, bio, avatar_url, commission_percent, is_active, profile_id,
         jornada:professional_schedules(weekday, starts_at, ends_at, is_off)`,
      )
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[equipe] falha ao listar profissionais:", error);
      return [];
    }

    return (data ?? []).map((p) => ({
      ...p,
      commission_percent: Number(p.commission_percent),
      jornada: many(p.jornada),
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[equipe] erro inesperado ao listar profissionais:", error);
    return [];
  }
}

/** Só folga que ainda vale: o que já passou não ajuda a decidir nada. */
async function carregarFolgas(shopId: string): Promise<FolgaDaEquipe[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("time_off")
      .select("id, professional_id, starts_at, ends_at, reason")
      .eq("barbershop_id", shopId)
      .gte("ends_at", timestampSP(hojeISO(), "00:00"))
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("[equipe] falha ao listar folgas:", error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[equipe] erro inesperado ao listar folgas:", error);
    return [];
  }
}

async function carregarAssistentes(shopId: string): Promise<AssistenteDaEquipe[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("barbershop_id", shopId)
      .eq("role", "assistant")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[equipe] falha ao listar assistentes:", error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[equipe] erro inesperado ao listar assistentes:", error);
    return [];
  }
}
