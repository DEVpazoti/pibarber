"use client";

import { Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { sairDaEspera } from "@/app/actions/client";
import { Button, Chip, EmptyState, LinkButton } from "@/components/ui";
import { PERIODOS } from "@/lib/types";
import { diaPorExtenso } from "@/lib/utils";

export type EsperaDoCliente = {
  id: string;
  desired_date: string;
  period: string;
  status: string;
  barbearia: { name: string; slug: string } | null;
};

const ROTULO_PERIODO = Object.fromEntries(PERIODOS.map((p) => [p.valor, p.rotulo]));

/**
 * A lista de espera do cliente: o que ele está aguardando, e o botão de sair
 * da fila. Quando alguém cancela naquele dia e período, chega notificação.
 */
export function ListaEspera({ entradas }: { entradas: EsperaDoCliente[] }) {
  const router = useRouter();
  const [saindo, iniciar] = useTransition();

  if (entradas.length === 0) {
    return (
      <EmptyState
        icone={<Clock aria-hidden />}
        titulo="Você não está em nenhuma lista de espera"
        descricao="Quando o dia que você quer estiver lotado, dá para entrar na fila e ser avisado se vagar."
        acao={<LinkButton href="/app/buscar">Encontrar uma barbearia</LinkButton>}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entradas.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {e.barbearia?.name ?? "Barbearia"}
            </p>
            <p className="text-xs text-ink-soft">
              {diaPorExtenso(e.desired_date, true)} ·{" "}
              {ROTULO_PERIODO[e.period] ?? "Qualquer horário"}
            </p>
          </div>

          {e.status === "notified" ? <Chip tom="brass">Vagou um horário!</Chip> : null}

          <div className="flex w-full gap-2 sm:w-auto">
            {e.barbearia ? (
              <LinkButton
                href={`/b/${e.barbearia.slug}/agendar`}
                tamanho="sm"
                larguraTotal
                className="sm:w-auto"
              >
                Ver horários
              </LinkButton>
            ) : null}

            <Button
              variante="danger"
              tamanho="sm"
              carregando={saindo}
              onClick={() =>
                iniciar(async () => {
                  await sairDaEspera(e.id);
                  router.refresh();
                })
              }
            >
              Sair da fila
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
