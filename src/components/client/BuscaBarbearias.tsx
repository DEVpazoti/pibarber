"use client";

import { Heart, MapPin, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { alternarFavorito } from "@/app/actions/client";
import { buscarBarbearias, type FiltroBusca } from "@/app/actions/booking";
import { ShopCard } from "@/components/client/ShopCard";
import { Button, EmptyState, FilterChip, Input } from "@/components/ui";
import type { BarbeariaEncontrada } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A BUSCA — três filtros, um ativo por vez: Nome · Cidade · Próximas.
 *
 * "Próximas" pede a localização do navegador. Se o cliente negar, a tela NÃO
 * fica travada num pedido pendente: aparece um aviso educado e o atalho para
 * buscar por cidade. Tela travada em permissão negada é o jeito mais rápido de
 * perder alguém que estava a um toque de agendar.
 */

type Modo = FiltroBusca["modo"];

const CHIPS: { modo: Modo; rotulo: string }[] = [
  { modo: "nome", rotulo: "Nome" },
  { modo: "cidade", rotulo: "Cidade" },
  { modo: "proximas", rotulo: "Próximas" },
];

type EstadoLocal = "ocioso" | "pedindo" | "negado" | "indisponivel" | "pronto";

export function BuscaBarbearias({ focarAoAbrir }: { focarAoAbrir: boolean }) {
  const campo = useRef<HTMLInputElement>(null);

  const [modo, setModo] = useState<Modo>("nome");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<BarbeariaEncontrada[] | null>(null);
  const [local, setLocal] = useState<EstadoLocal>("ocioso");
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();

  // Chegou pela home tocando no campo de busca: o teclado já sobe.
  useEffect(() => {
    if (focarAoAbrir) campo.current?.focus();
  }, [focarAoAbrir]);

  // Busca por texto, com folga de 350ms. Sem termo, não busca nada: a tela
  // vazia com a lupa é o estado inicial de propósito.
  useEffect(() => {
    if (modo === "proximas") return;

    if (termo.trim() === "") {
      setResultados(null);
      return;
    }

    const relogio = setTimeout(() => {
      iniciar(async () => {
        setErro(null);
        const resultado = await buscarBarbearias({ modo, termo });
        if (!resultado.ok) {
          setErro(resultado.message ?? "Não consegui buscar.");
          return;
        }
        setResultados(resultado.data ?? []);
      });
    }, 350);

    return () => clearTimeout(relogio);
  }, [termo, modo]);

  function pedirLocalizacao() {
    setErro(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocal("indisponivel");
      return;
    }

    setLocal("pedindo");

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocal("pronto");
        iniciar(async () => {
          const resultado = await buscarBarbearias({
            modo: "proximas",
            lat: posicao.coords.latitude,
            lng: posicao.coords.longitude,
          });
          if (!resultado.ok) {
            setErro(resultado.message ?? "Não consegui buscar.");
            return;
          }
          setResultados(resultado.data ?? []);
        });
      },
      (falhaLocal) => {
        console.error("[busca] localização recusada ou indisponível:", falhaLocal.message);
        setLocal(falhaLocal.code === falhaLocal.PERMISSION_DENIED ? "negado" : "indisponivel");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function trocarModo(novo: Modo) {
    setModo(novo);
    setResultados(null);
    setErro(null);
    if (novo === "proximas") pedirLocalizacao();
    else setLocal("ocioso");
  }

  return (
    <div className="flex flex-col gap-4">
      {modo !== "proximas" ? (
        <Input
          ref={campo}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder={
            modo === "nome" ? "Nome da barbearia" : "Cidade — ex: Campinas"
          }
          iconeEsquerda={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Buscar barbearia"
          autoComplete="off"
        />
      ) : null}

      <div className="flex gap-2">
        {CHIPS.map((c) => (
          <FilterChip
            key={c.modo}
            ativo={modo === c.modo}
            onClick={() => trocarModo(c.modo)}
          >
            {c.modo === "proximas" ? <MapPin className="h-4 w-4" aria-hidden /> : null}
            {c.rotulo}
          </FilterChip>
        ))}
      </div>

      {erro ? (
        <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {erro}
        </p>
      ) : null}

      {/* --- Localização negada: nunca deixe a tela parada aqui --------- */}
      {modo === "proximas" && (local === "negado" || local === "indisponivel") ? (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm font-medium text-ink">
            {local === "negado"
              ? "Você não permitiu o acesso à sua localização"
              : "Seu aparelho não conseguiu informar a localização"}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Sem problema — dá para achar do mesmo jeito buscando pela cidade.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variante="secondary" onClick={() => trocarModo("cidade")}>
              Buscar por cidade
            </Button>
            <Button variante="ghost" onClick={pedirLocalizacao}>
              Tentar de novo
            </Button>
          </div>
        </div>
      ) : null}

      {modo === "proximas" && local === "pedindo" ? (
        <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-soft">
          Pedindo sua localização…
        </p>
      ) : null}

      {/* --- Resultados -------------------------------------------------- */}
      {buscando && resultados === null ? (
        <ul className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="skeleton h-40 rounded-card" aria-hidden />
          ))}
        </ul>
      ) : resultados === null ? (
        modo !== "proximas" ? (
          <EmptyState
            icone={<Search aria-hidden />}
            titulo="Encontre uma barbearia"
            descricao="Pesquise pelo nome ou pela cidade."
          />
        ) : null
      ) : resultados.length === 0 ? (
        <EmptyState
          icone={<SearchX aria-hidden />}
          titulo="Nenhuma barbearia encontrada"
          descricao={
            modo === "proximas"
              ? "Nenhuma barbearia cadastrada perto de você ainda. Tente buscar pela cidade."
              : "Tente escrever menos — só o começo do nome, ou só a cidade."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {resultados.map((b) => (
            <li key={b.id}>
              <ShopCard
                slug={b.slug}
                nome={b.name}
                logo={b.logo_url}
                capa={b.cover_url}
                nota={b.rating_avg}
                avaliacoes={b.rating_count}
                bairro={b.neighborhood}
                cidade={b.city}
                distancia={b.dist_km}
                acao={<BotaoFavorito id={b.id} inicial={b.favorita ?? false} />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O coração. Muda de estado na hora e só depois confirma com o servidor —
 * favoritar é reversível e barato, então esperar o round-trip só faria a tela
 * parecer lenta.
 */
export function BotaoFavorito({ id, inicial }: { id: string; inicial: boolean }) {
  const [favorita, setFavorita] = useState(inicial);
  const [ocupado, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={ocupado}
      aria-pressed={favorita}
      aria-label={favorita ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={() => {
        const proximo = !favorita;
        setFavorita(proximo);
        iniciar(async () => {
          const resultado = await alternarFavorito(id);
          // Deu errado no servidor: volta o coração para a verdade.
          if (!resultado.ok) setFavorita(!proximo);
          else if (resultado.data) setFavorita(resultado.data.favoritada);
        });
      }}
      className="grid h-11 w-11 place-items-center rounded-chip bg-surface/90 shadow-card backdrop-blur transition-transform active:scale-90"
    >
      <Heart
        className={cn(
          "h-5 w-5 transition-colors",
          favorita ? "fill-danger text-danger" : "text-ink-soft",
        )}
        aria-hidden
      />
    </button>
  );
}
