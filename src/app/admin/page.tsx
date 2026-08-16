import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { sair } from "@/app/actions/auth";
import { AdminPainel, type BarbeariaNoAdmin } from "@/components/admin/AdminPainel";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin da plataforma" };

/**
 * /admin — protegida por `is_platform_admin`.
 *
 * Não é um papel: é uma permissão extra que convive com `client` ou `owner`.
 * `requireAdmin()` no topo redireciona quem não tem a flag para a casa dele.
 */
export default async function AdminPage() {
  await requireAdmin();

  const barbearias = await carregar();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={sair}>
              <button
                type="submit"
                className="h-11 rounded-field px-3 text-sm font-medium text-danger transition-opacity hover:opacity-80"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <PageHeader
          titulo="Barbearias"
          descricao="As barbearias da plataforma. Cadastre a conta do dono e a loja de uma vez."
        />

        <AdminPainel barbearias={barbearias} />
      </main>
    </div>
  );
}

async function carregar(): Promise<BarbeariaNoAdmin[]> {
  try {
    const supabase = await createClient();

    // A FK é nomeada porque `barbershops` tem dois caminhos até `profiles`:
    // direto por `owner_id` e indireto por `favorites`. Sem nomear, PGRST201.
    const { data, error } = await supabase
      .from("barbershops")
      .select(
        `id, name, slug, city, state, rating_avg, rating_count, is_active, created_at,
         dono:profiles!barbershops_owner_id_fkey(full_name, email)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[admin] falha ao listar barbearias:", error);
      return [];
    }

    return (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      city: b.city,
      state: b.state,
      rating_avg: Number(b.rating_avg),
      rating_count: b.rating_count,
      is_active: b.is_active,
      created_at: b.created_at,
      dono: one(b.dono),
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[admin] erro inesperado ao listar barbearias:", error);
    return [];
  }
}
