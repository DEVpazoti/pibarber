import type { Metadata } from "next";

import { ListaBarbearias } from "@/components/admin/ListaBarbearias";
import { PageHeader } from "@/components/ui";
import type { LinhaBarbearia } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Barbearias · Admin" };

/** Todas as barbearias, com situação e uso calculados no banco. */
export default async function BarbeariasAdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_barbearias");
  if (error) console.error("[admin] falha ao listar barbearias:", error);

  return (
    <>
      <PageHeader
        titulo="Barbearias"
        descricao="Todas as barbearias da plataforma. Toque numa para ver a ficha completa."
      />
      <ListaBarbearias linhas={(data ?? []) as LinhaBarbearia[]} />
    </>
  );
}
