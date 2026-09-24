import { redirect } from "next/navigation";

import { BarraVisualizacao } from "@/components/painel/BarraVisualizacao";
import { FaixaAssinatura } from "@/components/painel/FaixaAssinatura";
import { PainelNav } from "@/components/painel/PainelNav";
import { requireShopContext } from "@/lib/auth";
import { contarPendencias } from "@/lib/queries/agenda";
import { hojeISO, primeiroNome } from "@/lib/utils";

/**
 * Casca do PAINEL — dono e assistente.
 *
 * Este layout NÃO redireciona para uma subrota de /painel. Um layout que
 * manda para dentro do próprio grupo roda de novo e trava em loop. A tela de
 * escape (/sem-barbearia) mora fora daqui de propósito — e o setup guiado
 * (/configurar) também, pelo mesmo motivo.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // `shopName` vem junto do contexto desde o G4 do PERFORMANCE.md. Este layout
  // consultava `barbershops` uma segunda vez, pela MESMA linha que o
  // requireShopContext acabara de ler, só para pegar esta coluna — ~175 ms de
  // ida e volta ao us-east-2 em toda página do painel.
  const {
    profile,
    shopId,
    shopName,
    podeVerDinheiro,
    setupConcluido,
    assinaturaLiberada,
    assinatura,
    somenteLeitura,
  } = await requireShopContext();

  // Dono de loja recém-criada ainda sem horário, serviço e profissional: o
  // painel estaria vazio e a página pública não agendaria nada. Primeiro o
  // setup. `setupConcluido` já vem na consulta do contexto — não custa ida ao banco.
  if (!setupConcluido) redirect("/configurar");

  // Teste acabou ou o período pago venceu (+1 dia): o painel inteiro vira a
  // tela de assinatura. Nada é apagado — pagar libera na hora. O assistente
  // também vai para lá, e a tela diz a ele para falar com o dono.
  if (!assinaturaLiberada) redirect("/assinatura");
  const nomeBarbearia = shopName || "Minha barbearia";

  /**
   * O contador do badge, em toda página do painel.
   *
   * É uma consulta a mais por página, e ela é barata de propósito: `head: true`
   * não traz linha nenhuma, só a contagem, e o índice parcial
   * `appointments_pendencias_idx` (16_pendencias.sql) cobre exatamente este
   * filtro. Sem o índice isso seria uma varredura na tabela que mais cresce,
   * em toda navegação — por isso ele veio junto na mesma migração.
   *
   * Fica no LAYOUT, e não em cada página, porque o badge mora na navegação: se
   * cada tela tivesse de buscar o número, esquecer uma faria o aviso sumir
   * justamente ali.
   */
  const pendencias = await contarPendencias(shopId, hojeISO());

  return (
    <div className="min-h-dvh bg-bg">
      {somenteLeitura ? <BarraVisualizacao nomeBarbearia={nomeBarbearia} /> : null}
      <PainelNav
        podeVerDinheiro={podeVerDinheiro}
        nome={primeiroNome(profile.full_name) || "Você"}
        nomeBarbearia={nomeBarbearia}
        planoAtual={podeVerDinheiro ? (assinatura?.planoPago ?? null) : null}
        shopId={shopId}
        somenteLeitura={somenteLeitura}
        pendencias={pendencias}
      />

      {/* lg:pl-60 abre espaço para a lateral; pb-24 para a barra do celular. */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {podeVerDinheiro ? <FaixaAssinatura assinatura={assinatura} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
