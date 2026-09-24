import type { Metadata } from "next";
import Link from "next/link";

import { BotaoGoogle } from "@/components/auth/BotaoGoogle";
import { FormCriarBarbearia } from "@/components/auth/FormCriarBarbearia";
import { FormCriarConta } from "@/components/auth/FormCriarConta";

export const metadata: Metadata = { title: "Criar conta" };

/**
 * Dois cadastros no mesmo endereço, SEM alternância entre eles.
 *
 *   /criar-conta?tipo=barbearia → só o do dono. É para onde a landing manda:
 *                                 ela vende o sistema para a barbearia, e quem
 *                                 chega por ali não deve ver opção de cliente.
 *   /criar-conta                → só o do cliente. É para onde o fluxo de
 *                                 agendamento, o /entrar e a seção "Sou
 *                                 cliente" mandam.
 *
 * Não há abas de propósito: cada porta de entrada já sabe quem está chegando,
 * e oferecer a outra opção só criava conta do tipo errado.
 */
export default async function CriarContaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;

  return tipo === "barbearia" ? <CadastroBarbearia /> : <CadastroCliente />;
}

function CadastroBarbearia() {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">Cadastre sua barbearia</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Crie a conta da sua barbearia. Em seguida a gente configura horário, serviços e equipe
        com você, passo a passo.
      </p>

      {/* Sem Google: a conta de barbearia precisa do telefone, e o OAuth não
          pergunta nada antes de criar o usuário. */}
      <div className="mt-6">
        <FormCriarBarbearia />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Já tem uma barbearia no PiBarber?{" "}
        <Link href="/entrar" className="font-medium text-brass hover:text-brass-deep">
          Entrar
        </Link>
      </p>
    </div>
  );
}

function CadastroCliente() {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">Criar conta</h1>
      <p className="mt-1.5 text-sm text-ink-soft">Para agendar nas barbearias do PiBarber.</p>

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
    </div>
  );
}
