"use client";

import type { LinhaHorario } from "@/app/actions/shop";
import type { BusinessHour } from "@/lib/types";
import { DIAS_SEMANA, horaCurta } from "@/lib/utils";

/**
 * Os 7 dias do horário de funcionamento, para editar.
 *
 * Só a lista — quem salva é quem usa: a tela de configurações e o setup
 * guiado. Por isso é CONTROLADO: o estado mora no pai, que também é quem
 * aplica os atalhos do setup ("Seg a Sáb, 9h às 19h").
 */
export function EditorHorarios({
  linhas,
  aoAlterar,
}: {
  linhas: LinhaHorario[];
  aoAlterar: (weekday: number, campos: Partial<LinhaHorario>) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {linhas.map((l) => (
        <li
          key={l.weekday}
          className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3"
        >
          <span className="w-20 shrink-0 text-sm font-medium text-ink">
            {DIAS_SEMANA[l.weekday]}
          </span>

          <label className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={!l.fechado}
              onChange={(e) => aoAlterar(l.weekday, { fechado: !e.target.checked })}
              className="h-4 w-4 accent-brass"
            />
            Aberto
          </label>

          {l.fechado ? (
            <span className="text-sm text-ink-faint">Fechado</span>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <CampoHora
                valor={l.abre}
                rotulo={`Abre ${DIAS_SEMANA[l.weekday]}`}
                aoMudar={(v) => aoAlterar(l.weekday, { abre: v })}
              />
              <span className="text-ink-faint">—</span>
              <CampoHora
                valor={l.fecha}
                rotulo={`Fecha ${DIAS_SEMANA[l.weekday]}`}
                aoMudar={(v) => aoAlterar(l.weekday, { fecha: v })}
              />

              <span className="ml-2 text-xs text-ink-faint">almoço</span>
              <CampoHora
                valor={l.almocoInicio}
                rotulo={`Início do almoço ${DIAS_SEMANA[l.weekday]}`}
                aoMudar={(v) => aoAlterar(l.weekday, { almocoInicio: v })}
              />
              <CampoHora
                valor={l.almocoFim}
                rotulo={`Fim do almoço ${DIAS_SEMANA[l.weekday]}`}
                aoMudar={(v) => aoAlterar(l.weekday, { almocoFim: v })}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** As linhas do editor a partir do que está no banco. Dia sem linha = fechado. */
export function linhasDeHorario(horarios: BusinessHour[]): LinhaHorario[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const h = horarios.find((x) => x.weekday === weekday);
    return {
      weekday,
      fechado: h?.is_closed ?? true,
      abre: horaCurta(h?.opens_at) || "09:00",
      fecha: horaCurta(h?.closes_at) || "19:00",
      almocoInicio: horaCurta(h?.break_start),
      almocoFim: horaCurta(h?.break_end),
    };
  });
}

function CampoHora({
  valor,
  rotulo,
  aoMudar,
}: {
  valor: string;
  rotulo: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={valor}
      aria-label={rotulo}
      onChange={(e) => aoMudar(e.target.value)}
      className="tnum h-11 w-[92px] rounded-field bg-surface-2 px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brass focus:ring-inset"
    />
  );
}
