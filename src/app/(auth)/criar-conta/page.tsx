import type { Metadata } from "next";
import Link from "next/link";

import { BotaoGoogle } from "@/components/auth/BotaoGoogle";
import { FormCriarConta } from "@/components/auth/FormCriarConta";

export const metadata: Metadata = { title: "Criar conta" };

export default function CriarContaPage() {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">Criar conta</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Para agendar nas barbearias do PiBarber.
      </p>

      <div className="mt-6">
        <FormCriarConta />
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">ou</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <BotaoGoogle rotulo="Criar conta com o Google" />

      <p className="mt-6 text-center text-sm text-ink-soft">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-brass hover:text-brass-deep">
          Entrar
        </Link>
      </p>

      {/* O barbeiro não se cadastra sozinho: a conta de dono nasce no /admin. */}
      <p className="mt-4 rounded-field bg-surface-2 px-3.5 py-3 text-center text-xs leading-relaxed text-ink-soft">
        É dono de barbearia? A conta do seu estabelecimento é criada pela PiSystem —{" "}
        <Link href="/#contato" className="font-medium text-brass hover:text-brass-deep">
          fale com a gente
        </Link>
        .
      </p>
    </div>
  );
}
