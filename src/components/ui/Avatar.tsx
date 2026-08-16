/* eslint-disable @next/next/no-img-element */
import { Star } from "lucide-react";

import { cn, iniciais } from "@/lib/utils";

export type TamanhoAvatar = "sm" | "md" | "lg" | "xl";

const TAMANHOS: Record<TamanhoAvatar, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

/**
 * Avatar circular. Sem foto, cai nas iniciais sobre fundo de latão suave.
 *
 * `anel` liga o anel em gradiente — é o tratamento dos "Últimos acessos" da
 * home do app. `nota` põe o badge ★ sobreposto no canto superior direito.
 *
 * Usa <img> em vez de next/image de propósito: a URL da logo é texto livre
 * cadastrado pelo dono, de domínio arbitrário.
 */
export function Avatar({
  src,
  nome,
  tamanho = "md",
  anel = false,
  nota,
  className,
}: {
  src?: string | null;
  nome?: string | null;
  tamanho?: TamanhoAvatar;
  anel?: boolean;
  nota?: number | null;
  className?: string;
}) {
  const conteudo = src ? (
    <img
      src={src}
      alt={nome ?? "Foto"}
      className="h-full w-full rounded-full object-cover"
      loading="lazy"
    />
  ) : (
    <span className="font-semibold text-brass-deep">{iniciais(nome)}</span>
  );

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "grid place-items-center overflow-hidden rounded-full bg-brass-soft",
          TAMANHOS[tamanho],
          anel && "ring-gradient rounded-full p-0.5",
        )}
      >
        {conteudo}
      </div>

      {nota != null ? (
        <span
          className={cn(
            "absolute -right-1 -top-1 inline-flex items-center gap-0.5 rounded-chip",
            "bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-card",
            "border border-line",
          )}
        >
          <Star className="h-2.5 w-2.5 fill-brass text-brass" aria-hidden />
          <span className="tnum">{nota.toFixed(1)}</span>
        </span>
      ) : null}
    </div>
  );
}
