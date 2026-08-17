import { MailCheck } from "lucide-react";
import type { Metadata } from "next";

import { LinkButton } from "@/components/ui";
import { getProfile, rotaInicial } from "@/lib/auth";

export const metadata: Metadata = {
  title: "E-mail confirmado",
  // Página de destino de link privado: não tem por que virar item de índice.
  robots: { index: false, follow: false },
};

/**
 * O fim do cadastro: onde a pessoa cai depois de clicar no link do e-mail.
 *
 * Ela chega aqui pelo /callback, que é quem troca o `code` por sessão — esta
 * página só comemora. O caminho vem no `?proximo=` que `criarConta()` embute
 * no `emailRedirectTo`.
 *
 * DOIS estados, e os dois são normais:
 *
 *   com sessão  → o link foi aberto no mesmo navegador do cadastro. Já está
 *                 logado; o botão leva para a casa do papel dele.
 *   sem sessão  → abriu no app do Gmail, ou no celular quando o cadastro foi
 *                 no notebook. O e-mail está confirmado do mesmo jeito (quem
 *                 confirma é o Supabase, antes de mandar para cá), mas o
 *                 verificador do PKCE ficou no outro navegador e não há sessão
 *                 para criar. Aí o botão é o de entrar.
 */
export default async function EmailConfirmadoPage() {
  const perfil = await getProfile();
  const destino = perfil ? rotaInicial(perfil) : "/entrar";

  return (
    <div className="rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-money-soft text-money">
        <MailCheck className="h-8 w-8" aria-hidden />
      </span>

      <h1 className="mt-5 text-3xl text-ink">E-mail confirmado!</h1>

      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {perfil
          ? "Sua conta está pronta. Agora é só escolher a barbearia e marcar o seu horário."
          : "Sua conta está pronta. Entre com seu e-mail e senha para marcar o seu horário."}
      </p>

      <div className="mt-6">
        <LinkButton href={destino} tamanho="lg" larguraTotal>
          {perfil ? rotuloDoDestino(destino) : "Entrar"}
        </LinkButton>
      </div>
    </div>
  );
}

function rotuloDoDestino(destino: string): string {
  if (destino === "/painel") return "Ir para o painel";
  if (destino === "/admin") return "Ir para o admin";
  return "Encontrar uma barbearia";
}
