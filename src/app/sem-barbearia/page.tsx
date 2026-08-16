import { Store } from "lucide-react";
import type { Metadata } from "next";

import { sair } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { EMAIL_COMERCIAL, WHATSAPP_COMERCIAL } from "@/lib/config";
import { linkWhatsApp } from "@/lib/utils";

export const metadata: Metadata = { title: "Sem barbearia" };

/**
 * Tela de escape para quem tem papel de painel mas nenhuma barbearia ligada.
 *
 * Ela mora FORA de /painel de propósito: se estivesse dentro, o layout do
 * painel redirecionaria para cá, e este layout rodaria de novo, em loop.
 */
export default function SemBarbeariaPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Logo />

      <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink-faint">
        <Store className="h-8 w-8" aria-hidden />
      </div>

      <div>
        <h1 className="text-2xl text-ink">Sua conta ainda não tem barbearia</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Seu acesso existe, mas nenhuma barbearia foi ligada a ele ainda. Fale com a
          gente que resolvemos em minutos.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <a
          href={linkWhatsApp(
            WHATSAPP_COMERCIAL,
            "Olá! Minha conta do PiBarber está sem barbearia ligada.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass font-medium text-brass-ink transition-colors hover:bg-brass-deep"
        >
          Falar no WhatsApp
        </a>

        <a
          href={`mailto:${EMAIL_COMERCIAL}`}
          className="inline-flex h-12 w-full items-center justify-center rounded-field bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-line"
        >
          Enviar e-mail
        </a>
      </div>

      <form action={sair}>
        <button
          type="submit"
          className="inline-flex h-11 items-center px-4 text-sm font-medium text-danger hover:underline"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
