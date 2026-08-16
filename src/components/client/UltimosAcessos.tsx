"use client";

import { Store, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removerAcessoRecente } from "@/app/actions/client";
import { ShopRow } from "@/components/client/ShopCard";
import { EmptyState, LinkButton } from "@/components/ui";
import type { HomeDoCliente } from "@/lib/types";

/**
 * "Últimos acessos" — as barbearias que o cliente abriu recentemente.
 *
 * O botão "Editar lista" liga o modo de remoção, que troca o chevron por um X
 * em cada linha. É o padrão da referência, e evita um X permanente na tela,
 * que convida ao toque errado.
 */
export function UltimosAcessos({ itens }: { itens: HomeDoCliente["ultimos_acessos"] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [removendo, iniciar] = useTransition();

  if (itens.length === 0) {
    return (
      <EmptyState
        icone={<Store aria-hidden />}
        titulo="Você ainda não visitou nenhuma barbearia"
        descricao="Encontre uma pelo nome, pela cidade ou pelas que estão perto de você."
        acao={<LinkButton href="/app/buscar">Encontrar uma barbearia</LinkButton>}
      />
    );
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Últimos acessos</h2>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="h-11 px-2 text-sm font-medium text-brass transition-opacity hover:opacity-80"
        >
          {editando ? "Concluir" : "Editar lista"}
        </button>
      </div>

      <ul className="divide-y divide-line">
        {itens.map((b) => (
          <li key={b.id}>
            <ShopRow
              slug={b.slug}
              nome={b.name}
              logo={b.logo_url}
              nota={Number(b.rating_avg)}
              avaliacoes={b.rating_count}
              endereco={[b.neighborhood, b.city].filter(Boolean).join(", ")}
              acao={
                editando ? (
                  <button
                    type="button"
                    disabled={removendo}
                    onClick={() =>
                      iniciar(async () => {
                        await removerAcessoRecente(b.id);
                        router.refresh();
                      })
                    }
                    aria-label={`Remover ${b.name} da lista`}
                    className="grid h-11 w-11 place-items-center rounded-chip bg-danger-soft text-danger transition-opacity hover:opacity-80"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
