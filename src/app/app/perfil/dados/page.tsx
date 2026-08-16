import type { Metadata } from "next";

import { FormMeusDados } from "@/components/client/FormMeusDados";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Meus Dados" };

export default async function MeusDadosPage() {
  const perfil = await requireRole(["client"]);

  return (
    <>
      <PageHeader titulo="Meus Dados" voltarPara="/app/perfil" />
      <FormMeusDados perfil={perfil} />
    </>
  );
}
