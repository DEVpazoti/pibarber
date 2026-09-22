import "server-only";

import type { EnderecoLocalizado } from "@/lib/types";

/**
 * Endereço escrito → latitude e longitude, pela Google Geocoding API.
 *
 * POR QUE ISTO EXISTE: a coordenada é o que faz a barbearia aparecer no filtro
 * "Próximas" do app (`search_barbershops` descarta quem está sem ela). Até o
 * T-4 o dono digitava os dois números à mão, copiados do Google Maps. Ninguém
 * faz isso: ou digita errado, ou deixa em branco — e some da descoberta sem
 * nunca receber um aviso.
 *
 * POR QUE NO SERVIDOR: a chave é `GOOGLE_MAPS_API_KEY`, SEM `NEXT_PUBLIC_`.
 * Chave de geocoding no navegador é chave pública, e chave pública com billing
 * ligado é conta de terceiro. Quem chama daqui é a action `geocodificarEndereco`.
 *
 * POR QUE SÓ O GEOCODING É GOOGLE: o mapa de conferência usa tiles do
 * OpenStreetMap via Leaflet (ver `MapaLocalizacao.tsx`). A Maps JavaScript API
 * do Google cobra por carregamento de mapa, e o Leaflet entrega o mesmo pin
 * arrastável de graça. Paga-se onde a precisão importa — a resolução do
 * endereço —, não onde não importa.
 *
 * ---------------------------------------------------------------------------
 * E QUANDO NÃO HÁ CHAVE: OpenStreetMap (Nominatim), de graça
 * ---------------------------------------------------------------------------
 * Até setembro/2026 a falta da `GOOGLE_MAPS_API_KEY` deixava o botão
 * "Localizar pelo endereço" MORTO: ele respondia "a busca não está configurada
 * neste ambiente". E a chave nunca tinha sido configurada — nem local, nem em
 * produção —, então o botão nunca funcionou para ninguém.
 *
 * Agora o Nominatim entra quando não há chave OU quando o Google falha (cota,
 * billing desligado, rede). Ele é gratuito e não pede cadastro; a precisão
 * costuma ser de RUA, não de porta — o que vira "aproximada" na tela e sugere
 * conferir no mapa. Para o filtro "Próximas", que usa raio de 25 km, uma rua
 * de diferença não muda nada.
 *
 * ⚠️ A política de uso do Nominatim exige: User-Agent que identifique o app,
 * no máximo 1 requisição por segundo, e nada de uso em massa. Um dono tocando
 * num botão cabe folgado — mas NÃO use isto em lote (importação, script de
 * migração, backfill). Para volume, configure a chave do Google.
 *
 * NUNCA LANÇA por causa de resposta ruim: geocoding que falha não pode travar
 * o cadastro da barbearia. Devolve `{ ok: false, motivo }` e quem chama decide
 * o que dizer na tela.
 */

export type FalhaGeocoding =
  /** O endereço não existe, ou está incompleto demais para achar. */
  | "nao_encontrado"
  /** Cota estourada, chave recusada, rede fora. Tentar de novo pode resolver. */
  | "indisponivel";

export type ResultadoGeocoding =
  | { ok: true; endereco: EnderecoLocalizado }
  | { ok: false; motivo: FalhaGeocoding };

/**
 * `location_type` do Google, traduzido para a única distinção que interessa ao
 * dono: "isso é a porta da minha loja" ou "isso é o meio do bairro, confira".
 *
 * ROOFTOP é o telhado do imóvel. RANGE_INTERPOLATED é interpolado entre dois
 * números conhecidos da mesma rua — erra por poucos metros, o que num raio de
 * 25 km é irrelevante. Os outros dois são centro de polígono.
 */
function precisaoDe(tipo: string | undefined): EnderecoLocalizado["precisao"] {
  return tipo === "ROOFTOP" || tipo === "RANGE_INTERPOLATED" ? "exata" : "aproximada";
}

type RespostaGoogle = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    partial_match?: boolean;
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
  }>;
};

/**
 * Monta a linha de endereço que vai para o Google.
 *
 * O CEP entra por último e é o que mais ajuda: no Brasil ele desambigua rua
 * homônima melhor que qualquer outra parte. O complemento fica de fora de
 * propósito — "fundos", "sala 2" só confunde o geocoder.
 */
export type PartesDoEndereco = {
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
};

export function linhaDeEndereco(partes: PartesDoEndereco): string {
  const rua = partes.rua?.trim();
  const numero = partes.numero?.trim();
  const cep = partes.cep?.replace(/\D/g, "");

  return [
    rua && numero ? `${rua}, ${numero}` : rua,
    partes.bairro?.trim(),
    partes.cidade?.trim(),
    partes.estado?.trim(),
    cep && cep.length === 8 ? cep : undefined,
  ]
    .filter((p): p is string => Boolean(p))
    .join(" - ");
}

/**
 * Valida o par antes de gravar. Devolve a frase para a tela, ou null se está bom.
 *
 * As duas coordenadas andam juntas: uma sozinha não localiza nada, e a
 * `search_barbershops` exige as duas não-nulas. Meio par gravado é pior que
 * nenhum — parece preenchido e não funciona.
 *
 * A coluna é `numeric(10, 7)`: 3 dígitos antes da vírgula. Longitude -180 cabe;
 * qualquer coisa além estoura o `numeric` com um erro do Postgres em inglês.
 */
export function erroDeCoordenada(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  const temLat = latitude !== null && latitude !== undefined;
  const temLng = longitude !== null && longitude !== undefined;

  if (!temLat && !temLng) return null;
  if (temLat !== temLng) {
    return "A localização ficou pela metade. Use “Localizar pelo endereço” de novo.";
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "A localização não é um ponto válido. Use “Localizar pelo endereço” de novo.";
  }
  if (latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180) {
    return "A localização caiu fora do mapa. Use “Localizar pelo endereço” de novo.";
  }
  return null;
}

/**
 * Resolve o endereço. Google primeiro, se houver chave; OpenStreetMap quando
 * não houver, ou quando o Google falhar.
 *
 * "Não encontrado" do Google também passa pelo OpenStreetMap: os dois têm
 * bases diferentes, e rua nova de loteamento às vezes existe só em um deles.
 */
export async function geocodificar(partes: PartesDoEndereco): Promise<ResultadoGeocoding> {
  const chave = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (chave) {
    const google = await viaGoogle(linhaDeEndereco(partes), chave);
    if (google.ok) return google;

    const osm = await viaOpenStreetMap(partes);
    if (osm.ok) return osm;

    // Os dois falharam. "Não encontrado" é a informação mais útil para o dono
    // (ele pode corrigir a rua); "indisponível" só se nenhum dos dois achou
    // que o endereço existe.
    return google.motivo === "nao_encontrado" || osm.motivo === "nao_encontrado"
      ? { ok: false, motivo: "nao_encontrado" }
      : { ok: false, motivo: "indisponivel" };
  }

  return viaOpenStreetMap(partes);
}

/* ==========================================================================
   Google
   ========================================================================== */

async function viaGoogle(endereco: string, chave: string): Promise<ResultadoGeocoding> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", endereco);
  url.searchParams.set("key", chave);
  url.searchParams.set("language", "pt-BR");
  // Sem isto, "Rua São João, Campinas" pode voltar em Portugal.
  url.searchParams.set("components", "country:BR");
  url.searchParams.set("region", "br");

  try {
    const resposta = await fetch(url, {
      headers: { Accept: "application/json" },
      // Cadastro de barbearia não pode ficar pendurado num serviço lento.
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!resposta.ok) {
      console.error("[geocoding] resposta não-ok:", resposta.status);
      return { ok: false, motivo: "indisponivel" };
    }

    const dados = (await resposta.json()) as RespostaGoogle;

    if (dados.status === "ZERO_RESULTS") return { ok: false, motivo: "nao_encontrado" };

    if (dados.status !== "OK") {
      // REQUEST_DENIED (chave inválida ou billing desligado), OVER_QUERY_LIMIT,
      // INVALID_REQUEST. O `error_message` do Google é para o log, nunca para a
      // tela do barbeiro — costuma vir em inglês e citar console do Google Cloud.
      console.error("[geocoding] status:", dados.status, dados.error_message ?? "");
      return { ok: false, motivo: "indisponivel" };
    }

    const primeiro = dados.results?.[0];
    const lat = primeiro?.geometry?.location?.lat;
    const lng = primeiro?.geometry?.location?.lng;

    if (typeof lat !== "number" || typeof lng !== "number") {
      console.error("[geocoding] OK sem coordenada utilizável");
      return { ok: false, motivo: "nao_encontrado" };
    }

    return {
      ok: true,
      endereco: {
        latitude: lat,
        longitude: lng,
        enderecoFormatado: primeiro?.formatted_address?.trim() || endereco,
        // `partial_match` significa que o Google não bateu tudo que foi pedido.
        // Vale rebaixar para "aproximada" mesmo quando o location_type é bom:
        // é exatamente o caso de rua parecida na cidade errada.
        precisao: primeiro?.partial_match
          ? "aproximada"
          : precisaoDe(primeiro?.geometry?.location_type),
      },
    };
  } catch (error) {
    console.error("[geocoding] falha na consulta:", error);
    return { ok: false, motivo: "indisponivel" };
  }
}

/* ==========================================================================
   OpenStreetMap (Nominatim)
   ========================================================================== */

type RespostaNominatim = Array<{
  lat?: string;
  lon?: string;
  display_name?: string;
  /** "house", "building", "road", "suburb", "postcode"… */
  addresstype?: string;
}>;

/** Nominatim devolve porta só quando acha o número. O resto é rua ou região. */
function precisaoOsm(tipo: string | undefined): EnderecoLocalizado["precisao"] {
  return tipo === "house" || tipo === "building" ? "exata" : "aproximada";
}

/** A política do Nominatim pede no máximo 1 requisição por segundo. */
const INTERVALO_NOMINATIM_MS = 1100;

async function viaOpenStreetMap(partes: PartesDoEndereco): Promise<ResultadoGeocoding> {
  const rua = partes.rua?.trim();
  const numero = partes.numero?.trim();
  const cidade = partes.cidade?.trim();
  const estado = partes.estado?.trim();
  const cep = partes.cep?.replace(/\D/g, "");
  const cepFormatado = cep && cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : undefined;

  // Do mais preciso ao mais largo. Para na primeira que achar.
  //
  // O CEP sai da segunda tentativa de propósito: o OpenStreetMap tem muito CEP
  // desatualizado. No teste real, "R Albano José de Carvalho, CEP 14091-400"
  // estava cadastrada com 14091-450 — e com o CEP junto, a busca não bate.
  // A última tentativa é só o CEP: acha o centro dele, que ainda serve para o
  // filtro "Próximas".
  const tentativas: Array<Record<string, string>> = [];
  if (rua && cidade) {
    const street = numero ? `${numero} ${rua}` : rua;
    if (cepFormatado) {
      tentativas.push({ street, city: cidade, ...(estado && { state: estado }), postalcode: cepFormatado });
    }
    tentativas.push({ street, city: cidade, ...(estado && { state: estado }) });
  }
  if (cepFormatado) tentativas.push({ postalcode: cepFormatado });

  if (tentativas.length === 0) return { ok: false, motivo: "nao_encontrado" };

  let houveFalha = false;

  for (const [i, campos] of tentativas.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_NOMINATIM_MS));

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("accept-language", "pt-BR");
    for (const [chave, valor] of Object.entries(campos)) url.searchParams.set(chave, valor);

    try {
      const resposta = await fetch(url, {
        headers: {
          Accept: "application/json",
          // Obrigatório pela política de uso. Sem ele, o Nominatim bloqueia.
          "User-Agent": "PiBarber/1.0 (+https://pibarber.vercel.app)",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      if (!resposta.ok) {
        console.error("[geocoding] nominatim não-ok:", resposta.status);
        houveFalha = true;
        continue;
      }

      const [primeiro] = (await resposta.json()) as RespostaNominatim;
      const lat = Number(primeiro?.lat);
      const lng = Number(primeiro?.lon);
      if (!primeiro || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      return {
        ok: true,
        endereco: {
          latitude: lat,
          longitude: lng,
          enderecoFormatado: primeiro.display_name?.trim() || linhaDeEndereco(partes),
          // Achou só pelo CEP é, por definição, aproximado — é o centro dele.
          precisao: campos.street ? precisaoOsm(primeiro.addresstype) : "aproximada",
        },
      };
    } catch (error) {
      console.error("[geocoding] falha no nominatim:", error);
      houveFalha = true;
    }
  }

  return { ok: false, motivo: houveFalha ? "indisponivel" : "nao_encontrado" };
}
