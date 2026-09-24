import type { Metadata } from "next";

import { FormAbrirBarbearia } from "@/components/client/FormAbrirBarbearia";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Abrir minha barbearia" };

/**
 * O cliente que quer abrir a barbearia dele sem criar outra conta.
 * A regra toda está em `abrirMinhaBarbearia` (actions/client.ts).
 */
export default async function AbrirBarbeariaPage({
  searchParams,
}: {
  searchParams: Promise<{ pela?: string }>;
}) {
  // Conta só de cliente que entrou pela porta da barbearia (src/lib/lado.ts):
  // em vez de erro, o convite para criar a loja com a mesma conta.
  const { pela } = await searchParams;
  const perfil = await requireRole(["client"]);

  return (
    <>
      <PageHeader titulo="Abrir minha barbearia" voltarPara="/app/perfil" />
      {pela === "porta-da-barbearia" ? (
        <p className="mb-4 rounded-card border border-brass/40 bg-brass-soft px-4 py-3 text-sm text-ink">
          Sua conta ainda não tem barbearia. Crie a sua abaixo — com o mesmo e-mail e senha.
        </p>
      ) : null}
      <FormAbrirBarbearia telefoneAtual={perfil.phone ?? ""} />
    </>
  );
}
