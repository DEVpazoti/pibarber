import type { Metadata } from "next";

import { FormSenha } from "@/components/client/FormSenha";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Segurança" };

export default async function SegurancaPage() {
  await requireRole(["client"]);

  return (
    <>
      <PageHeader titulo="Segurança" descricao="Altere sua senha." voltarPara="/app/perfil" />
      <FormSenha />
    </>
  );
}
