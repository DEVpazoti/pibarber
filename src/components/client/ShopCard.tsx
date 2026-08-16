/* eslint-disable @next/next/no-img-element */
import { ChevronRight, MapPin, Star } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui";
import { cn, distanciaKm } from "@/lib/utils";

/**
 * Os dois formatos de cartão de barbearia do app do cliente.
 *
 * `ShopCard` é o da BUSCA: capa, logo, nota, endereço e o coração.
 * `ShopRow` é o de LISTA — "Últimos acessos" na home e a grade de favoritos:
 * avatar com anel em gradiente e o badge de nota sobreposto no canto.
 */

export function ShopCard({
  slug,
  nome,
  logo,
  capa,
  nota,
  avaliacoes,
  bairro,
  cidade,
  distancia,
  acao,
}: {
  slug: string;
  nome: string;
  logo: string | null;
  capa: string | null;
  nota: number;
  avaliacoes: number;
  bairro: string | null;
  cidade: string | null;
  distancia?: number | null;
  /** O coração de favoritar, sobreposto no canto da capa. */
  acao?: React.ReactNode;
}) {
  return (
    <article className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <Link href={`/b/${slug}`} className="block">
        <div className="relative h-28 w-full bg-surface-2">
          {capa ? (
            <img src={capa} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </div>

        <div className="flex items-start gap-3 p-3">
          <div className="-mt-8">
            <Avatar src={logo} nome={nome} tamanho="lg" anel />
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="truncate text-sm font-semibold text-ink">{nome}</h3>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
              {avaliacoes > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-brass text-brass" aria-hidden />
                  <span className="tnum font-semibold text-ink">{nota.toFixed(1)}</span>
                  <span className="text-ink-faint">({avaliacoes})</span>
                </span>
              ) : (
                <span className="text-ink-faint">Sem avaliações</span>
              )}

              {distancia != null ? (
                <span className="tnum text-brass-deep">{distanciaKm(distancia)}</span>
              ) : null}
            </p>

            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="line-clamp-1">
                {[bairro, cidade].filter(Boolean).join(", ") || "Endereço não informado"}
              </span>
            </p>
          </div>
        </div>
      </Link>

      {acao ? <div className="absolute right-2 top-2">{acao}</div> : null}
    </article>
  );
}

export function ShopRow({
  slug,
  nome,
  logo,
  nota,
  avaliacoes,
  endereco,
  acao,
  className,
}: {
  slug: string;
  nome: string;
  logo: string | null;
  nota: number;
  avaliacoes: number;
  endereco: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Link href={`/b/${slug}`} className="flex min-w-0 flex-1 items-center gap-3 py-2">
        <Avatar
          src={logo}
          nome={nome}
          tamanho="lg"
          anel
          nota={avaliacoes > 0 ? nota : null}
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{nome}</span>
          <span className="line-clamp-1 text-xs text-ink-faint">{endereco}</span>
        </span>

        {acao ? null : <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
      </Link>

      {acao ? <div className="shrink-0">{acao}</div> : null}
    </div>
  );
}
