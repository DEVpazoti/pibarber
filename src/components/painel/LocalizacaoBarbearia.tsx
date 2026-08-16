"use client";

import { AlertTriangle, Check, Crosshair, Map as MapaIcone, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { geocodificarEndereco, type EnderecoParaLocalizar } from "@/app/actions/shop";
import { Button } from "@/components/ui";

/**
 * Onde a barbearia fica — o bloco que substituiu os dois campos de digitar
 * latitude e longitude à mão.
 *
 * O PROBLEMA QUE ISTO RESOLVE (T-4): a coordenada é o que faz a loja aparecer
 * no filtro "Próximas" do app. Pedir os dois números ao dono era pedir o
 * impossível — ele não sabe a coordenada dele. Quem não sabia deixava em branco
 * e sumia da descoberta sem nunca ser avisado. Agora o sistema resolve, e
 * quando não resolve, ele AVISA.
 *
 * Três caminhos até o ponto, em ordem de facilidade para o dono:
 *   1. o endereço que ele já preencheu acima (geocoding do Google);
 *   2. o GPS do aparelho, para quem está preenchendo dentro da loja;
 *   3. o pin arrastável, para endereço ambíguo ou loja em galeria/fundos.
 *
 * A latitude e a longitude continuam visíveis, mas só de leitura: servem de
 * conferência para quem sabe ler coordenada, e não são mais um campo a digitar.
 */

const MapaLocalizacao = dynamic(
  () => import("./MapaLocalizacao").then((m) => m.MapaLocalizacao),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-64 w-full animate-pulse rounded-card border border-line bg-surface-2"
        aria-label="Carregando o mapa"
      />
    ),
  },
);

export function LocalizacaoBarbearia({
  latitude,
  longitude,
  endereco,
  aoMudar,
}: {
  latitude: number | null;
  longitude: number | null;
  /** Os campos de endereço como estão na tela AGORA, ainda não salvos. */
  endereco: EnderecoParaLocalizar;
  aoMudar: (latitude: number, longitude: number) => void;
}) {
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [enderecoAchado, setEnderecoAchado] = useState<string | null>(null);
  const [aproximado, setAproximado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pedindoGps, setPedindoGps] = useState(false);
  const [buscando, iniciarBusca] = useTransition();

  const temPonto = latitude !== null && longitude !== null;

  function localizarPeloEndereco() {
    setErro(null);
    setAviso(null);
    setEnderecoAchado(null);

    iniciarBusca(async () => {
      const resultado = await geocodificarEndereco(endereco);

      if (!resultado.ok || !resultado.data) {
        setErro(resultado.message ?? "Não consegui localizar o endereço.");
        return;
      }

      aoMudar(resultado.data.latitude, resultado.data.longitude);
      setEnderecoAchado(resultado.data.enderecoFormatado);
      setAproximado(resultado.data.precisao === "aproximada");
      setAviso(resultado.message ?? null);

      // Ponto aproximado é o caso em que o mapa vale mais: abre sozinho, para
      // o dono ver que caiu no meio do bairro em vez da porta dele.
      if (resultado.data.precisao === "aproximada") setMostrarMapa(true);
    });
  }

  function usarLocalizacaoAtual() {
    setErro(null);
    setAviso(null);
    setEnderecoAchado(null);

    if (!("geolocation" in navigator)) {
      setErro("Este navegador não sabe informar a localização.");
      return;
    }

    setPedindoGps(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setPedindoGps(false);
        aoMudar(posicao.coords.latitude, posicao.coords.longitude);
        setAproximado(false);
        setAviso("Peguei sua localização atual. Confira no mapa se o ponto é o da loja.");
        setMostrarMapa(true);
      },
      (falhaGps) => {
        setPedindoGps(false);
        console.error("[localização] GPS recusado ou indisponível:", falhaGps.message);
        setErro(
          falhaGps.code === falhaGps.PERMISSION_DENIED
            ? "Você bloqueou o acesso à localização. Libere nas permissões do navegador, ou marque o ponto no mapa."
            : "Não consegui pegar sua localização. Marque o ponto no mapa.",
        );
      },
      // `enableHighAccuracy` liga o GPS de verdade no celular: o dono está
      // dentro da loja, e o erro de rede/wi-fi seria de quarteirões.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      {/* --- O estado atual, sem rodeio ---------------------------------- */}
      {temPonto ? (
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-money" aria-hidden />
          <span>
            <strong className="text-ink">Sua barbearia aparece no filtro “Próximas”</strong> do
            app, para quem estiver perto dela.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm text-ink-soft" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span>
            <strong className="text-ink">
              Sua barbearia não aparece no filtro “Próximas”
            </strong>{" "}
            do app — hoje só te acha quem buscar pelo nome ou pela cidade. Localize o endereço
            abaixo para resolver.
          </span>
        </p>
      )}

      {/* --- Os três caminhos até o ponto -------------------------------- */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variante="secondary"
          tamanho="sm"
          carregando={buscando}
          onClick={localizarPeloEndereco}
          iconeEsquerda={<Search className="h-4 w-4" aria-hidden />}
        >
          Localizar pelo endereço
        </Button>

        <Button
          variante="secondary"
          tamanho="sm"
          carregando={pedindoGps}
          onClick={usarLocalizacaoAtual}
          iconeEsquerda={<Crosshair className="h-4 w-4" aria-hidden />}
        >
          Usar minha localização atual
        </Button>

        <Button
          variante="ghost"
          tamanho="sm"
          onClick={() => setMostrarMapa((v) => !v)}
          iconeEsquerda={<MapaIcone className="h-4 w-4" aria-hidden />}
          aria-expanded={mostrarMapa}
        >
          {mostrarMapa ? "Fechar mapa" : "Ajustar no mapa"}
        </Button>
      </div>

      {/* --- Retorno da busca -------------------------------------------- */}
      {erro ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {aviso ? (
        <p
          className={`mt-3 flex items-start gap-2 text-sm ${
            aproximado ? "text-ink-soft" : "text-money"
          }`}
        >
          {aproximado ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {aviso}
        </p>
      ) : null}

      {enderecoAchado ? (
        <p className="mt-1 text-sm text-ink-soft">
          Endereço encontrado: <span className="text-ink">{enderecoAchado}</span>
        </p>
      ) : null}

      {/* --- O mapa, só quando pedido ------------------------------------ */}
      {mostrarMapa ? (
        <div className="mt-3">
          <MapaLocalizacao
            // O centro padrão é a Praça da Sé, São Paulo: quando ainda não há
            // ponto, é preciso abrir o mapa em ALGUM lugar do Brasil para o
            // dono poder navegar até a loja dele.
            latitude={latitude ?? -23.5505}
            longitude={longitude ?? -46.6333}
            zoom={temPonto ? (aproximado ? 14 : 16) : 4}
            aoMover={aoMudar}
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            {temPonto
              ? "Arraste o pin ou toque no mapa para ajustar. Depois é só salvar."
              : "Toque no mapa para marcar onde fica a barbearia. Depois é só salvar."}
          </p>
        </div>
      ) : null}

      {/* --- A coordenada, só de leitura --------------------------------- */}
      <p className="mt-3 text-xs text-ink-faint">
        {temPonto ? (
          <>
            Coordenada:{" "}
            <span className="tnum text-ink-soft">
              {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
            </span>
          </>
        ) : (
          "Coordenada: ainda não definida."
        )}
      </p>
    </div>
  );
}
