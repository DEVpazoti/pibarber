import { unstable_rethrow } from "next/navigation";

import { AppHeader } from "@/components/client/AppHeader";
import { RolagemAoTopo } from "@/components/client/RolagemAoTopo";
import { TabBar } from "@/components/client/TabBar";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** O contêiner que rola. O id liga o <main> ao RolagemAoTopo. */
const ID_ROLAGEM = "conteudo-do-app";

/**
 * Casca do APP DO CLIENTE.
 *
 * No desktop é a mesma coisa, centralizada em 480px — não existe layout
 * separado para telas grandes, de propósito.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Não confie só no middleware: toda área protegida confere aqui também.
  const perfil = await requireRole(["client"]);

  let naoLidas = 0;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", perfil.id)
      .is("read_at", null);

    if (error) console.error("[app] falha ao contar notificações:", error);
    else naoLidas = count ?? 0;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app] erro inesperado ao contar notificações:", error);
  }

  return (
    /*
     * CASCA DE APLICATIVO — o DOCUMENTO NÃO ROLA. Quem rola é o <main>.
     *
     * Isto não é preferência de layout: é o que faz a barra de abas ficar
     * parada no iPhone.
     *
     * Antes, a barra era `position: fixed; bottom: 0` e a página inteira
     * rolava. No Safari do iOS isso não funciona bem: a barra de endereço
     * encolhe e cresce conforme você rola, mudando a altura da viewport, e o
     * navegador só reposiciona os elementos `fixed` no FIM do gesto. Durante a
     * rolagem (e principalmente na inércia) a barra escorrega para baixo e
     * volta — foi exatamente o que apareceu no iPhone 13.
     *
     * Com a altura travada em `h-dvh` e o transbordo no <main>, o documento
     * nunca rola. Sem rolagem de documento, o Safari não recolhe a barra de
     * endereço, a viewport não muda de tamanho e a barra de abas fica
     * genuinamente imóvel — sem truque de CSS e sem JavaScript ouvindo scroll.
     *
     * `overflow-hidden` aqui é o cinto de segurança: garante que nada empurre
     * o documento para além da tela e reintroduza a rolagem que acabamos de
     * tirar.
     */
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <AppHeader naoLidas={naoLidas} />

      {/*
       * `overscroll-contain` impede o encadeamento da rolagem: ao chegar no fim
       * da lista, o puxão não vaza para o documento e não dispara o efeito
       * elástico do iOS — que é justamente o que mexeria na barra de endereço.
       */}
      <main id={ID_ROLAGEM} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-[480px] px-4 pb-6 pt-4">{children}</div>
      </main>

      {/*
       * Agora a barra é irmã do conteúdo, não uma camada por cima dele. Por
       * isso o <main> não precisa mais reservar espaço embaixo (era `pb-24`):
       * ela ocupa o lugar dela no fluxo e nunca cobre nada.
       */}
      <TabBar />

      <RolagemAoTopo alvo={ID_ROLAGEM} />
    </div>
  );
}
