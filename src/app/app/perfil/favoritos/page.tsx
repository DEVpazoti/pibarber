import { HeartCrack } from "lucide-react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { BotaoFavorito } from "@/components/client/BuscaBarbearias";
import { ShopCard } from "@/components/client/ShopCard";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/utils";

export const metadata: Metadata = { title: "Favoritos" };

type Favorita = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  rating_avg: number;
  rating_count: number;
  neighborhood: string | null;
  city: string | null;
};

export default async function FavoritosPage() {
  const perfil = await requireRole(["client"]);

  const favoritas = await carregar(perfil.id);

  return (
    <>
      <PageHeader
        titulo="Favoritos"
        descricao="As barbearias que você marcou com o coração."
        voltarPara="/app/perfil"
      />

      {favoritas.length === 0 ? (
        <EmptyState
          icone={<HeartCrack aria-hidden />}
          titulo="Nenhuma barbearia favoritada ainda"
          descricao="Toque no coração quando encontrar uma que você gostou — ela fica sempre à mão aqui."
          acao={<LinkButton href="/app/buscar">Encontrar uma barbearia</LinkButton>}
        />
      ) : (
        <ul className="grid gap-3">
          {favoritas.map((b) => (
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
                acao={<BotaoFavorito id={b.id} inicial />}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function carregar(profileId: string): Promise<Favorita[]> {
  try {
    const supabase = await createClient();

    // A FK é nomeada de propósito: `barbershops` tem dois caminhos até
    // `profiles` (owner_id e favorites), e o embed genérico daria PGRST201.
    const { data, error } = await supabase
      .from("favorites")
      .select(
        `barbearia:barbershops!favorites_barbershop_id_fkey(
           id, name, slug, logo_url, cover_url, rating_avg, rating_count, neighborhood, city, is_active
         )`,
      )
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[favoritos] falha ao listar:", error);
      return [];
    }

    return (data ?? [])
      .map((f) => one(f.barbearia))
      .filter((b): b is NonNullable<typeof b> => b != null && b.is_active)
      .map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo_url: b.logo_url,
        cover_url: b.cover_url,
        rating_avg: Number(b.rating_avg),
        rating_count: b.rating_count,
        neighborhood: b.neighborhood,
        city: b.city,
      }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[favoritos] erro inesperado ao listar:", error);
    return [];
  }
}
