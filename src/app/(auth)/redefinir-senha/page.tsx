import type { Metadata } from "next";
import Link from "next/link";

import { FormRedefinirSenha } from "@/components/auth/FormRedefinirSenha";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Criar nova senha", robots: { index: false } };

/**
 * Chega-se aqui pelo link do e-mail, via /callback, que já abriu a sessão.
 * Sem sessão (link aberto de novo, expirado), não há o que redefinir.
 */
export default async function RedefinirSenhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      {user ? (
        <>
          <h1 className="text-3xl text-ink">Criar nova senha</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Para a conta <strong className="text-ink">{user.email}</strong>.
          </p>
          <div className="mt-6">
            <FormRedefinirSenha />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-3xl text-ink">Link expirado</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Este link já foi usado ou passou da validade. Peça outro — leva um minuto.
          </p>
          <Link
            href="/esqueci-senha"
            className="mt-6 inline-block font-medium text-brass hover:text-brass-deep"
          >
            Pedir um novo link
          </Link>
        </>
      )}
    </div>
  );
}
