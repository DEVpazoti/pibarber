/**
 * Service worker mínimo do PiBarber.
 *
 * A ÚNICA função dele é habilitar a instalação na tela inicial: o navegador só
 * oferece "Adicionar à tela de início" quando existe um service worker
 * registrado com um handler de fetch.
 *
 * NÃO faz cache offline de propósito. Um cache mal calibrado num sistema de
 * agenda é pior que não ter cache nenhum: o barbeiro veria um horário livre
 * que já foi preenchido, e agendaria por cima. Cache offline é assunto para
 * depois da v1, e com estratégia pensada tela a tela.
 */

self.addEventListener("install", () => {
  // Assume o controle sem esperar a aba antiga fechar.
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Deliberadamente vazio: tudo passa direto para a rede.
});
