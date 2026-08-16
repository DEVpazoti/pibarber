import { cn } from "@/lib/utils";

const TAMANHOS = {
  sm: { caixa: "h-8 w-8 text-base", texto: "text-lg" },
  md: { caixa: "h-9 w-9 text-lg", texto: "text-xl" },
  lg: { caixa: "h-12 w-12 text-2xl", texto: "text-3xl" },
} as const;

/**
 * A marca. Fraunces só aparece aqui e nos h1 — é o tempero do design system.
 * O "Pi" sai em latão, o "Barber" na cor da tinta.
 */
export function Logo({
  tamanho = "md",
  soIcone = false,
  className,
}: {
  tamanho?: keyof typeof TAMANHOS;
  soIcone?: boolean;
  className?: string;
}) {
  const t = TAMANHOS[tamanho];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-field font-display font-semibold",
          "bg-gradient-to-br from-brass to-amber text-brass-ink",
          t.caixa,
        )}
        aria-hidden
      >
        π
      </span>
      {!soIcone ? (
        <span className={cn("font-display font-semibold tracking-tight", t.texto)}>
          <span className="text-brass">Pi</span>
          <span className="text-ink">Barber</span>
        </span>
      ) : null}
    </span>
  );
}
