import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { ListaDependentes } from "@/components/client/ListaDependentes";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Dependent } from "@/lib/types";

export const metadata: Metadata = { title: "Quem eu agendo" };

export default async function PessoasPage() {
  const perfil = await requireRole(["client"]);

  let dependentes: Dependent[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dependents")
      .select("*")
      .eq("profile_id", perfil.id)
      .order("created_at", { ascending: true });

    if (error) console.error("[app] falha ao listar dependentes:", error);
    else dependentes = data ?? [];
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app] erro inesperado ao listar dependentes:", error);
  }

  return (
    <>
      <PageHeader
        titulo="Quem eu agendo"
        descricao="Filhos e familiares que você leva junto."
        voltarPara="/app/perfil"
      />
      <ListaDependentes dependentes={dependentes} />
    </>
  );
}
