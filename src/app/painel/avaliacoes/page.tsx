import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import {
  AvaliacoesPainel,
  type AvaliacaoNoPainel,
} from "@/components/painel/AvaliacoesPainel";
import { PageHeader, StatCard } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/utils";

export const metadata: Metadata = { title: "Avaliações" };

export default async function AvaliacoesPage() {
  const { shopId } = await requireOwnerContext();

  const { avaliacoes, media, quantidade } = await carregar(shopId);

  const semResposta = avaliacoes.filter((a) => !a.reply).length;

  return (
    <>
      <PageHeader
        titulo="Avaliações"
        descricao="O que os clientes escreveram. Sua resposta aparece no perfil público."
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard
          rotulo="Nota média"
          valor={quantidade > 0 ? media.toFixed(1) : "—"}
          tom="brass"
        />
        <StatCard rotulo="Avaliações" valor={quantidade} />
        <StatCard
          rotulo="Sem resposta"
          valor={semResposta}
          tom={semResposta > 0 ? "info" : "neutro"}
        />
      </div>

      <AvaliacoesPainel avaliacoes={avaliacoes} />
    </>
  );
}

async function carregar(shopId: string): Promise<{
  avaliacoes: AvaliacaoNoPainel[];
  media: number;
  quantidade: number;
}> {
  try {
    const supabase = await createClient();

    const { data: loja, error: erroLoja } = await supabase
      .from("barbershops")
      .select("rating_avg, rating_count")
      .eq("id", shopId)
      .maybeSingle();

    if (erroLoja) console.error("[avaliações] falha ao ler a nota da loja:", erroLoja);

    const { data, error } = await supabase
      .from("reviews")
      .select(
        `id, rating, comment, reply, created_at,
         autor:profiles!reviews_profile_id_fkey(full_name),
         profissional:professionals!reviews_professional_id_fkey(name, nickname)`,
      )
      .eq("barbershop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[avaliações] falha ao listar:", error);
      return { avaliacoes: [], media: 0, quantidade: 0 };
    }

    const avaliacoes: AvaliacaoNoPainel[] = (data ?? []).map((r) => {
      const prof = one(r.profissional);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        reply: r.reply,
        created_at: r.created_at,
        autor: one(r.autor)?.full_name ?? null,
        profissional: prof ? (prof.nickname ?? prof.name) : null,
      };
    });

    return {
      avaliacoes,
      media: Number(loja?.rating_avg ?? 0),
      quantidade: loja?.rating_count ?? avaliacoes.length,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[avaliações] erro inesperado ao listar:", error);
    return { avaliacoes: [], media: 0, quantidade: 0 };
  }
}
