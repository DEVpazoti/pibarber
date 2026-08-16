"use client";

import { useEffect } from "react";

/**
 * Registra o service worker.
 *
 * Só serve para o navegador oferecer "Adicionar à tela de início" — não há
 * cache offline (veja o comentário em `public/sw.js`).
 *
 * Falha em silêncio: em navegador sem suporte, ou fora de HTTPS, o registro
 * simplesmente não acontece e o site continua funcionando igual.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Em desenvolvimento o registro só atrapalha: o SW segura versões antigas
    // e o Fast Refresh passa a mentir sobre o que está na tela.
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((erro) => {
      console.error("[pwa] falha ao registrar o service worker:", erro);
    });
  }, []);

  return null;
}
