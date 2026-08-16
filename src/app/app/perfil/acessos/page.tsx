import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { GerenciarAcessos, type MetodoDeAcesso } from "@/components/client/GerenciarAcessos";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Acessos" };

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await requireRole(["client"]);
  const { erro } = await searchParams;

  let metodos: MetodoDeAcesso[] = [];

  try {
    const supabase = await createClient();

    // A lista real de identidades do Supabase — não o que a tela supõe.
    const { data, error } = await supabase.auth.getUserIdentities();

    if (error) console.error("[acessos] falha ao listar identidades:", error);
    else {
      metodos = (data?.identities ?? []).map((i) => ({
        provider: i.provider,
        identificador:
          typeof i.identity_data?.email === "string" ? i.identity_data.email : null,
        criadoEm: i.created_at ?? null,
      }));
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("[acessos] erro inesperado ao listar identidades:", error);
  }

  return (
    <>
      <PageHeader
        titulo="Acessos"
        descricao="Os jeitos de entrar na sua conta."
        voltarPara="/app/perfil"
      />

      {erro ? (
        <p className="mb-4 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {erro}
        </p>
      ) : null}

      <GerenciarAcessos metodos={metodos} />
    </>
  );
}
