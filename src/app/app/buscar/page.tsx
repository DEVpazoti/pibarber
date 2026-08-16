import type { Metadata } from "next";

import { BuscaBarbearias } from "@/components/client/BuscaBarbearias";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Buscar" };

/**
 * Buscar estabelecimento.
 *
 * A busca em si roda no cliente (precisa de teclado, de debounce e da
 * geolocalização do navegador), mas quem consulta é sempre uma server action —
 * o navegador nunca fala direto com o banco.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ focar?: string }>;
}) {
  await requireRole(["client"]);
  const { focar } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl leading-tight text-ink">Buscar</h1>
      <BuscaBarbearias focarAoAbrir={focar === "1"} />
    </div>
  );
}
