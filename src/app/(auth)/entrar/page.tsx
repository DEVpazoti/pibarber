import type { Metadata } from "next";
import Link from "next/link";

import { BotaoGoogle } from "@/components/auth/BotaoGoogle";
import { FormEntrar } from "@/components/auth/FormEntrar";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>;
}) {
  const { proximo, erro } = await searchParams;

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">Entrar</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Bem-vindo de volta. Vamos ver sua agenda.
      </p>

      <div className="mt-6">
        <FormEntrar proximo={proximo} erroInicial={erro} />
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">ou</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <BotaoGoogle proximo={proximo} />

      <p className="mt-6 text-center text-sm text-ink-soft">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="font-medium text-brass hover:text-brass-deep">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
