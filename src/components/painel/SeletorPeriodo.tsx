"use client";

import { CalendarRange } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button, FilterChip, Input } from "@/components/ui";
import type { Periodo } from "@/lib/periodo";
import { PRESETS } from "@/lib/periodo";
import { diaBR } from "@/lib/utils";

/**
 * O seletor de período das telas de dinheiro.
 *
 * Empurra o resultado para a URL em vez de guardar estado: a página é Server
 * Component e busca os números de novo, com a RLS valendo. Nenhum dado
 * financeiro passa pelo navegador antes da hora.
 */
export function SeletorPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const caminho = usePathname();

  const [abrindoCustom, setAbrindoCustom] = useState(periodo.nome === "personalizado");
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);

  function escolher(nome: string) {
    if (nome === "personalizado") {
      setAbrindoCustom(true);
      return;
    }
    setAbrindoCustom(false);
    router.push(`${caminho}?p=${nome}`);
  }

  function aplicar() {
    if (!de || !ate) return;
    router.push(`${caminho}?de=${de}&ate=${ate}`);
  }

  return (
    <div className="mb-5 flex flex-col gap-3">
      {/*
        `flex-wrap`, e não rolagem horizontal, de propósito.
        São quatro chips fixos: em 375px eles cabem em duas linhas e ficam
        todos à vista. Com `overflow-x-auto` o Chrome móvel expandia a janela
        de layout para 413px, e a barra inferior — que é `fixed inset-x-0` —
        esticava junto, criando rolagem horizontal na página inteira.
      */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <FilterChip
            key={p.nome}
            ativo={periodo.nome === p.nome}
            onClick={() => escolher(p.nome)}
          >
            {p.rotulo}
          </FilterChip>
        ))}
      </div>

      {abrindoCustom ? (
        <div className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
            De
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-ink">
            Até
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <Button onClick={aplicar} iconeEsquerda={<CalendarRange className="h-4 w-4" aria-hidden />}>
            Filtrar
          </Button>
        </div>
      ) : null}

      <p className="tnum text-xs text-ink-faint">
        {periodo.de === periodo.ate
          ? diaBR(periodo.de)
          : `${diaBR(periodo.de)} até ${diaBR(periodo.ate)}`}
      </p>
    </div>
  );
}
