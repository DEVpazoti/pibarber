"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { alternarFavorito } from "@/app/actions/client";
import { cn } from "@/lib/utils";

/**
 * O coração do perfil público.
 *
 * Sem sessão, ele não some — leva para o login. Sumir esconderia da pessoa que
 * existe a possibilidade de favoritar, e ela é um bom motivo para criar conta.
 */
export function BotaoFavoritoPublico({
  barbershopId,
  inicial,
  logado,
}: {
  barbershopId: string;
  inicial: boolean;
  logado: boolean;
}) {
  const router = useRouter();
  const [favorita, setFavorita] = useState(inicial);
  const [ocupado, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={ocupado}
      aria-pressed={favorita}
      aria-label={favorita ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={() => {
        if (!logado) {
          router.push("/entrar?proximo=/app/perfil/favoritos");
          return;
        }

        const proximo = !favorita;
        setFavorita(proximo);
        iniciar(async () => {
          const resultado = await alternarFavorito(barbershopId);
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
