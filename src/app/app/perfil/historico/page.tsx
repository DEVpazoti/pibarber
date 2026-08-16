import { History, Search } from "lucide-react";
import type { Metadata } from "next";

import { AppointmentCard } from "@/components/client/AppointmentCard";
import { Button, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { carregarMeusAgendamentos } from "@/lib/queries/cliente";
import { diaBR } from "@/lib/utils";

export const metadata: Metadata = { title: "Histórico" };

/**
 * O histórico completo, com busca e faixa de datas.
 *
 * O filtro é um `<form method="get">`: vive na URL, funciona sem JavaScript e
 * a página segue sendo Server Component — o histórico pode ter centenas de
 * itens, e mandar tudo para o navegador filtrar seria desperdício.
 */
export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string }>;
}) {
  await requireRole(["client"]);
  const { q = "", de = "", ate = "" } = await searchParams;

  const agendamentos = await carregarMeusAgendamentos({
    termo: q,
    de: de || undefined,
    ate: ate || undefined,
  });

  const filtrando = de !== "" || ate !== "";

  return (
    <>
      <PageHeader
        titulo="Histórico"
        descricao="Todos os seus agendamentos, do mais recente ao mais antigo."
        voltarPara="/app/perfil"
      />

      <form method="get" className="mb-4 flex flex-col gap-3">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Buscar por barbearia, serviço ou profissional"
          iconeEsquerda={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Buscar no histórico"
        />

        <div className="rounded-card border border-line bg-surface p-3">
          {filtrando ? (
            <p className="tnum mb-2 text-sm text-ink-soft">
              Filtrando de: <strong className="text-ink">{de ? diaBR(de) : "início"}</strong> até{" "}
              <strong className="text-ink">{ate ? diaBR(ate) : "hoje"}</strong>
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
              De
              <Input type="date" name="de" defaultValue={de} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
              Até
              <Input type="date" name="ate" defaultValue={ate} />
            </label>
            <Button type="submit">Filtrar</Button>
          </div>
        </div>
      </form>

      {agendamentos.length === 0 ? (
        <EmptyState
          icone={<History aria-hidden />}
          titulo={
            q || filtrando
              ? "Nenhum agendamento encontrado no período."
              : "Você ainda não tem histórico"
          }
          descricao={
            q || filtrando
              ? "Tente ampliar a faixa de datas ou limpar a busca."
              : "Depois do seu primeiro atendimento, ele aparece aqui."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {agendamentos.map((a) => (
            <li key={a.id}>
              <AppointmentCard agendamento={a} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
