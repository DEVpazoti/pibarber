import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { Pronto } from "@/components/setup/SetupGuiado";
import { requireRole, requireShopContext } from "@/lib/auth";
import { urlDoSite } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Barbearia no ar",
  robots: { index: false, follow: false },
};

/**
 * O fim do setup: "Sua barbearia está no ar!", com o link da página e o
 * botão de divulgar. `concluirSetup` manda para cá por redirect — ver o
 * comentário lá (src/app/actions/setup.ts).
 *
 * `?fora=1`: a plataforma tinha bloqueado a loja; o setup terminou, mas ela
 * não abriu, e a tela diz isso.
 */
export default async function SetupProntoPage({
  searchParams,
}: {
  searchParams: Promise<{ fora?: string }>;
}) {
  await requireRole(["owner"]);
  const { shopId, setupConcluido } = await requireShopContext();
  if (!setupConcluido) redirect("/configurar");

  const { fora } = await searchParams;
  const supabase = await createClient();
  const { data: loja, error } = await supabase
    .from("barbershops")
    .select("slug")
    .eq("id", shopId)
    .maybeSingle();
  if (error) console.error("[configurar/pronto] falha ao ler a barbearia:", error);
  if (!loja) redirect("/painel");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-2 sm:px-6">
        <Pronto slug={loja.slug} urlPublica={urlDoSite()} noAr={fora !== "1"} />
      </main>
    </div>
  );
}
