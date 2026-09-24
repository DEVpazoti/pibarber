import type { Metadata } from "next";
import Link from "next/link";

import { BotaoGoogle } from "@/components/auth/BotaoGoogle";
import { FormEntrar } from "@/components/auth/FormEntrar";
import { ladoDaPorta } from "@/lib/lado";

export const metadata: Metadata = { title: "Entrar" };

/**
 * AS DUAS PORTAS DE ENTRADA (ver src/lib/lado.ts).
 *
 *   /entrar?tipo=barbearia → "Entrar na sua barbearia": o "Entrar" da landing.
 *   /entrar                → "Entrar para agendar": o "Sou cliente" da landing
 *                            e todo caminho de agendamento.
 *
 * A mesma conta pode passar pelas duas; a porta decide o lado da sessão. O
 * link para a outra porta é discreto, de propósito: é para quem clicou errado,
 * não uma escolha no meio da tela.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string; tipo?: string }>;
}) {
  const { proximo, erro, tipo } = await searchParams;
  const lado = ladoDaPorta(tipo);
  const barbearia = lado === "barbearia";

  // O `proximo` atravessa a troca de porta, para ninguém perder o caminho.
  const comProximo = (base: string) =>
    proximo
      ? `${base}${base.includes("?") ? "&" : "?"}proximo=${encodeURIComponent(proximo)}`
      : base;

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-3xl text-ink">{barbearia ? "Entrar na sua barbearia" : "Entrar"}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        {barbearia ? "Painel, agenda, caixa e equipe." : "Para agendar e acompanhar seus horários."}
      </p>

      <div className="mt-6">
        <FormEntrar proximo={proximo} erroInicial={erro} lado={lado} />
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">ou</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Google nas DUAS portas: quem começou como cliente pelo Google e depois
          abriu uma barbearia não tem senha — sem o botão aqui, ficaria trancado
          fora do painel. */}
      <BotaoGoogle proximo={proximo} lado={lado} />

      <p className="mt-6 text-center text-sm text-ink-soft">
        {barbearia ? "Ainda não tem barbearia no PiBarber? " : "Ainda não tem conta? "}
        <Link
          href={barbearia ? "/criar-conta?tipo=barbearia" : "/criar-conta"}
          className="font-medium text-brass hover:text-brass-deep"
        >
          {barbearia ? "Cadastrar barbearia" : "Criar conta"}
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-ink-faint">
        {barbearia ? "É cliente? " : "Tem uma barbearia? "}
        <Link
          href={comProximo(barbearia ? "/entrar" : "/entrar?tipo=barbearia")}
          className="underline-offset-2 hover:text-ink hover:underline"
        >
          {barbearia ? "Entrar para agendar" : "Entrar no painel"}
        </Link>
      </p>
    </div>
  );
}
