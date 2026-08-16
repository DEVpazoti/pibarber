"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Devolve a rolagem ao topo a cada troca de tela.
 *
 * POR QUE ISTO PRECISA EXISTIR: o App Router do Next rola a JANELA quando você
 * navega. No app do cliente a janela não rola — quem rola é o <main>, e essa é
 * justamente a decisão que mantém a barra de abas parada no iPhone (ver o
 * comentário em src/app/app/layout.tsx).
 *
 * Sem isto: você desce até o fim dos seus agendamentos, toca em "Perfil", e a
 * tela nova abre no meio, porque o contêiner guardou o deslocamento anterior.
 * O usuário lê como tela quebrada.
 *
 * `useEffect` e não `useLayoutEffect`: este componente é renderizado no
 * servidor junto do layout, e `useLayoutEffect` avisa no console quando roda
 * em SSR. A diferença prática é no máximo um quadro, imperceptível.
 */
export function RolagemAoTopo({ alvo }: { alvo: string }) {
  const caminho = usePathname();

  useEffect(() => {
    // `getElementById` a cada troca (e não uma ref) porque quem monta o
    // contêiner é o layout, não este componente.
    const elemento = document.getElementById(alvo);
    // `auto` e não `smooth`: rolagem animada ao trocar de aba parece travamento.
    elemento?.scrollTo({ top: 0, behavior: "auto" });
  }, [caminho, alvo]);

  return null;
}
