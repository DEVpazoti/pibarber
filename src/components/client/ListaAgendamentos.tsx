"use client";

import { CalendarX } from "lucide-react";
import { useMemo, useState } from "react";

import { AppointmentCard } from "@/components/client/AppointmentCard";
import { EmptyState, LinkButton, Select } from "@/components/ui";
import { emAberto, type MeuAgendamento } from "@/lib/types";

/**
 * "Meus Agendamentos" — a prova de que isto é um marketplace.
 *
 * A lista mistura barbearias diferentes, e o dropdown filtra por
 * estabelecimento trazendo SÓ onde esta pessoa já agendou. Num sistema de uma
 * barbearia só, este filtro não faria sentido nenhum.
 */
export function ListaAgendamentos({ agendamentos }: { agendamentos: MeuAgendamento[] }) {
  const [loja, setLoja] = useState("");

  const lojas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const a of agendamentos) {
      if (a.barbearia) mapa.set(a.barbearia.id, a.barbearia.name);
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [agendamentos]);

  const filtrados = loja === "" ? agendamentos : agendamentos.filter((a) => a.barbearia?.id === loja);

  const abertos = filtrados.filter((a) => emAberto(a.status));
  const anteriores = filtrados.filter((a) => !emAberto(a.status));

  return (
    <div className="flex flex-col gap-5">
      {lojas.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Filtrar por estabelecimento</span>
          <Select value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Todos</option>
            {lojas.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      <section>
        <h2 className="mb-2 text-base font-semibold text-ink">Em aberto</h2>

        {abertos.length === 0 ? (
          <EmptyState
            icone={<CalendarX aria-hidden />}
            titulo="Nenhum agendamento em aberto"
            descricao="Escolha uma barbearia e marque seu horário — leva menos de um minuto."
            acao={<LinkButton href="/app/buscar">Agendar agora</LinkButton>}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {/* Do mais próximo para o mais distante: é o que importa agora. */}
            {[...abertos]
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((a) => (
                <li key={a.id}>
                  <AppointmentCard agendamento={a} />
                </li>
              ))}
          </ul>
        )}
      </section>

      {anteriores.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">Anteriores</h2>
          <ul className="flex flex-col gap-3">
            {anteriores.map((a) => (
              <li key={a.id}>
                <AppointmentCard agendamento={a} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
