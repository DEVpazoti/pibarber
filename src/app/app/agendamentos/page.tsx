import type { Metadata } from "next";

import { ErroAoCarregar } from "@/components/client/ErroAoCarregar";
import { ListaAgendamentos } from "@/components/client/ListaAgendamentos";
import { requireRole } from "@/lib/auth";
import { carregarMeusAgendamentos } from "@/lib/queries/cliente";

export const metadata: Metadata = { title: "Meus Agendamentos" };

export default async function AgendamentosPage() {
  await requireRole(["client", "owner", "assistant"]);

  const resultado = await carregarMeusAgendamentos();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl leading-tight text-ink">Meus Agendamentos</h1>
      {resultado.ok ? (
        <ListaAgendamentos agendamentos={resultado.data ?? []} />
      ) : (
        <ErroAoCarregar
          titulo="Não consegui carregar seus agendamentos"
          mensagem={resultado.message}
        />
      )}
    </div>
  );
}
