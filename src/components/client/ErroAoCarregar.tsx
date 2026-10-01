"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui";

/**
 * A consulta FALHOU — e a tela diz isso, em vez de fingir que não há nada.
 *
 * É o oposto do estado vazio: "Nenhum agendamento" para quem tem horário
 * amanhã faz a pessoa acreditar e não aparecer. A mensagem já chega traduzida
 * (`traduzirErroBanco`); o detalhe técnico ficou no log do servidor.
 *
 * "Tentar de novo" é `router.refresh()`: refaz a consulta do Server Component
 * sem recarregar a página, e mantém os filtros que estão na URL.
 */
export function ErroAoCarregar({ titulo, mensagem }: { titulo: string; mensagem?: string }) {
  const router = useRouter();
  const [tentando, iniciar] = useTransition();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-8 w-8" aria-hidden />
      </div>

      <div>
        <p className="text-base font-semibold text-ink">{titulo}</p>
        {mensagem ? (
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{mensagem}</p>
        ) : null}
      </div>

      <Button
        variante="secondary"
        carregando={tentando}
        onClick={() => iniciar(() => router.refresh())}
        iconeEsquerda={<RotateCcw className="h-4 w-4" aria-hidden />}
      >
        Tentar de novo
      </Button>
    </div>
  );
}
