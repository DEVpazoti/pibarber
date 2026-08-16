"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";

/**
 * O mapa de conferência: um pin arrastável sobre o ponto da barbearia.
 *
 * CARREGADO SOB DEMANDA. Quem importa este arquivo é o `next/dynamic` do
 * `LocalizacaoBarbearia`, com `ssr: false`, e só quando o dono clica em
 * "Ajustar no mapa". O Leaflet e o CSS dele ficam num chunk separado: o painel
 * já leva ~1 s por rota (ver PERFORMANCE.md) e quem nunca abre o mapa não pode
 * pagar o JS dele.
 *
 * TILES DO OPENSTREETMAP, geocoding do Google. A decisão de custo do T-4 foi
 * usar o Google onde a precisão importa — resolver o endereço escrito. Desenhar
 * o mapa é commodity, e a Maps JavaScript API cobra por carregamento. A
 * atribuição no rodapé do mapa não é enfeite: a licença do OSM exige.
 *
 * Leaflet é imperativo e mexe no DOM por fora do React. Por isso tudo mora em
 * refs e o efeito de criação roda uma vez só — recriar o mapa a cada render
 * perderia o zoom que o dono acabou de dar.
 */
export function MapaLocalizacao({
  latitude,
  longitude,
  zoom = 16,
  aoMover,
}: {
  latitude: number;
  longitude: number;
  /** 16 é quarteirão; 14 quando o ponto veio por aproximação e precisa de contexto. */
  zoom?: number;
  aoMover: (latitude: number, longitude: number) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);

  // O callback vive num ref para não entrar na dependência do efeito de criação:
  // ele muda a cada render do pai, e recriar o mapa por causa disso destruiria
  // a navegação do usuário no meio do arrasto.
  const aoMoverRef = useRef(aoMover);
  aoMoverRef.current = aoMover;

  useEffect(() => {
    if (!container.current || mapa.current) return;

    const m = L.map(container.current, {
      center: [latitude, longitude],
      zoom,
      // O painel é desktop-first, mas o dono confere pelo celular: a rolagem da
      // página não pode ser sequestrada pelo zoom do mapa ao passar o dedo.
      scrollWheelZoom: false,
      attributionControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);

    // Ícone próprio em vez do marcador padrão do Leaflet: o padrão aponta para
    // arquivos PNG por caminho relativo, que o bundler não resolve, e o pin
    // simplesmente não aparece. Um divIcon é HTML nosso — e usa o latão do
    // design system, não o azul do Leaflet.
    const icone = L.divIcon({
      className: "",
      html: `<div style="
        width:24px;height:24px;border-radius:9999px;
        background:var(--color-brass);
        border:3px solid var(--color-surface);
        box-shadow:0 2px 8px rgb(0 0 0 / 0.4);
        cursor:grab;
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const p = L.marker([latitude, longitude], {
      icon: icone,
      draggable: true,
      keyboard: true,
      title: "Arraste para ajustar o ponto da barbearia",
      alt: "Ponto da barbearia",
    }).addTo(m);

    p.on("dragend", () => {
      const { lat, lng } = p.getLatLng();
      aoMoverRef.current(lat, lng);
    });

    // Tocar no mapa também move o pin: no celular, arrastar um alvo de 24px é
    // bem pior do que apontar onde ele deve ficar.
    m.on("click", (evento: L.LeafletMouseEvent) => {
      p.setLatLng(evento.latlng);
      aoMoverRef.current(evento.latlng.lat, evento.latlng.lng);
    });

    mapa.current = m;
    pin.current = p;

    return () => {
      m.remove();
      mapa.current = null;
      pin.current = null;
    };
    // Só na montagem: a sincronização com props novas fica no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O ponto pode mudar por fora do mapa — o dono clica em "Localizar pelo
  // endereço" com o mapa aberto. Aí o pin acompanha, sem recriar o mapa.
  useEffect(() => {
    if (!mapa.current || !pin.current) return;

    const atual = pin.current.getLatLng();
    // Sem esta comparação, o `setView` desfaria o próprio arrasto do usuário:
    // o dragend avisa o pai, o pai re-renderiza com o valor novo, e o mapa
    // saltaria de volta ao centro a cada arrasto.
    if (Math.abs(atual.lat - latitude) < 1e-7 && Math.abs(atual.lng - longitude) < 1e-7) return;

    pin.current.setLatLng([latitude, longitude]);
    mapa.current.setView([latitude, longitude], zoom);
  }, [latitude, longitude, zoom]);

  return (
    <div
      ref={container}
      className="h-64 w-full overflow-hidden rounded-card border border-line"
      role="application"
      aria-label="Mapa para ajustar o ponto da barbearia. Arraste o marcador ou toque no local."
    />
  );
}
