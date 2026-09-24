import { Lock } from "lucide-react";

import { sair } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

/**
 * O que o ASSISTENTE vê quando a assinatura da loja vence. Ele não assina nem
 * vê valor — só precisa saber que não é defeito e a quem recorrer.
 */
export function AssinaturaVencidaAssistente({ nomeBarbearia }: { nomeBarbearia: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Logo />

      <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink-faint">
        <Lock className="h-8 w-8" aria-hidden />
      </div>

      <div>
        <h1 className="text-2xl text-ink">O painel está pausado</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          A assinatura da <strong className="text-ink">{nomeBarbearia}</strong> no PiBarber venceu.
          Peça ao dono da barbearia para renovar — assim que ele pagar, o painel volta na hora, com
          tudo como estava.
        </p>
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
