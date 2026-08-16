import { NextResponse } from "next/server";

import { getProfile } from "@/lib/auth";
import { urlDoSite } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Vincula o Google a uma conta que já existe.
 *
 * É `linkIdentity`, não `signInWithOAuth`: a diferença é que o Google passa a
 * ser mais um jeito de entrar NESTA conta, em vez de criar uma segunda conta
 * com o mesmo e-mail — o que deixaria a pessoa com dois históricos separados.
 */
export async function GET() {
  const perfil = await getProfile();
  if (!perfil) return NextResponse.redirect(`${urlDoSite()}/entrar`);

  const supabase = await createClient();

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${urlDoSite()}/callback?proximo=/app/perfil/acessos` },
  });

  if (error || !data?.url) {
    console.error("[acessos] falha ao vincular o Google:", error);
    return NextResponse.redirect(
      `${urlDoSite()}/app/perfil/acessos?erro=${encodeURIComponent(
        "Não consegui abrir o login do Google. Tente de novo.",
      )}`,
    );
  }

  return NextResponse.redirect(data.url);
}
