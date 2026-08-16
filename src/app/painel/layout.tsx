import { PainelNav } from "@/components/painel/PainelNav";
import { requireShopContext } from "@/lib/auth";
import { contarPendencias } from "@/lib/queries/agenda";
import { hojeISO, primeiroNome } from "@/lib/utils";

/**
 * Casca do PAINEL — dono e assistente.
 *
 * Este layout NÃO redireciona para uma subrota de /painel. Um layout que
 * manda para dentro do próprio grupo roda de novo e trava em loop. A tela de
 * escape (/sem-barbearia) mora fora daqui de propósito.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // `shopName` vem junto do contexto desde o G4 do PERFORMANCE.md. Este layout
  // consultava `barbershops` uma segunda vez, pela MESMA linha que o
  // requireShopContext acabara de ler, só para pegar esta coluna — ~175 ms de
  // ida e volta ao us-east-2 em toda página do painel.
  const { profile, shopId, shopName, podeVerDinheiro } = await requireShopContext();
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
      <PainelNav
        podeVerDinheiro={podeVerDinheiro}
        nome={primeiroNome(profile.full_name) || "Você"}
        nomeBarbearia={nomeBarbearia}
        pendencias={pendencias}
      />

      {/* lg:pl-60 abre espaço para a lateral; pb-24 para a barra do celular. */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
