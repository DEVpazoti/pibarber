import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { FormEndereco } from "@/components/client/FormEndereco";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserAddress } from "@/lib/types";

export const metadata: Metadata = { title: "Endereço" };

export default async function EnderecoPage() {
  const perfil = await requireRole(["client"]);

  let endereco: UserAddress | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("profile_id", perfil.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) console.error("[app] falha ao carregar o endereço:", error);
    else endereco = data;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app] erro inesperado ao carregar o endereço:", error);
  }

  return (
    <>
      <PageHeader
        titulo="Endereço"
        descricao="Digite o CEP e o resto se preenche sozinho."
        voltarPara="/app/perfil"
      />
      <FormEndereco endereco={endereco} />
    </>
  );
}
