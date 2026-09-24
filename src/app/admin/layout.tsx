import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { primeiroNome } from "@/lib/utils";

/**
 * Casca do painel do SUPER ADMIN. `requireAdmin()` aqui e em cada página e
 * action: o layout sozinho não protege nada (uma action pode ser chamada sem
 * passar por ele).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requireAdmin();

  // O badge de relatos, no menu de toda página. `head: true` só conta.
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("feedbacks")
    .select("id", { count: "exact", head: true })
    .eq("status", "novo");
  if (error) console.error("[admin] falha ao contar relatos:", error);

  return (
    <div className="min-h-dvh bg-bg">
      <AdminNav nome={primeiroNome(perfil.full_name) || "Admin"} relatosNovos={count ?? 0} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>
    </div>
  );
}
