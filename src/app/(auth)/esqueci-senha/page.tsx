import type { Metadata } from "next";
import Link from "next/link";

import { FormEsqueciSenha } from "@/components/auth/FormEsqueciSenha";
import { ladoDaPorta } from "@/lib/lado";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const lado = ladoDaPorta(tipo);
  const voltar = lado === "barbearia" ? "/entrar?tipo=barbearia" : "/entrar";

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">Esqueci minha senha</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.
      </p>

      <div className="mt-6">
        <FormEsqueciSenha lado={lado} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Lembrou?{" "}
        <Link href={voltar} className="font-medium text-brass hover:text-brass-deep">
          Voltar para entrar
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-faint">
        Criou a conta com o Google? Ela não tem senha — entre pelo botão do Google.
      </p>
    </div>
  );
}
