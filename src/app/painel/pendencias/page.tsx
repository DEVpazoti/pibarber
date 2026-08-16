import type { Metadata } from "next";

import { PendenciasPainel } from "@/components/painel/PendenciasPainel";
import { PageHeader } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { carregarPendencias } from "@/lib/queries/agenda";
import { hojeISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Pendências" };

/**
 * PENDÊNCIAS — atendimento de dia anterior que ficou como "agendado".
 *
 * NÃO é tela só do dono. O assistente precisa dela mais do que ele: é o
 * assistente que opera o balcão e é quem esquece de concluir. Ele resolve as
 * pendências sem ver valor nenhum — o mesmo recorte do resto do painel.
 *
 * "Hoje" é resolvido NO SERVIDOR, no fuso de São Paulo. Se viesse do navegador,
 * um celular com fuso torto marcaria os atendimentos desta noite como
 * pendentes de ontem — ou esconderia os de ontem de verdade.
 */
export default async function PendenciasPage() {
  const { shopId, podeVerDinheiro } = await requireShopContext();

  const hoje = hojeISO();
  const grupos = await carregarPendencias(shopId, hoje);

  const total = grupos.reduce((soma, g) => soma + g.itens.length, 0);

  return (
    <>
      <PageHeader
        titulo="Pendências"
        descricao={
          total === 0
            ? "Atendimentos de dias anteriores que ficaram sem conclusão aparecem aqui."
            : "Marque vários e conclua de uma vez. Cada um entra no faturamento da data original dele."
        }
      />

      <PendenciasPainel grupos={grupos} podeVerDinheiro={podeVerDinheiro} />
    </>
  );
}
