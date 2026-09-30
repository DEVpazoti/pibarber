"use client";

import { ChevronRight, Download, Plus, Search, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { NovaBarbeariaDialog } from "@/components/admin/AdminPainel";
import { Button, Chip, EmptyState, Input, Select } from "@/components/ui";
import { SITUACOES, situacao, type LinhaBarbearia, type SituacaoBarbearia } from "@/lib/admin";
import { rotuloDoCiclo } from "@/lib/assinatura";
import type { SubscriptionCycle } from "@/lib/types";
import { dataBR } from "@/lib/utils";

/**
 * A lista de barbearias do /admin: busca, filtros, exportação e o atalho para
 * a ficha. Tabela no computador, cartões no celular — os mesmos dados.
 */
export function ListaBarbearias({ linhas }: { linhas: LinhaBarbearia[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | SituacaoBarbearia>("todas");
  const [filtroPlano, setFiltroPlano] = useState("todos");
  const [nova, setNova] = useState(false);

  const planos = useMemo(
    () => [...new Set(linhas.map((l) => l.plano_nome).filter((p): p is string => Boolean(p)))],
    [linhas],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtroSituacao !== "todas" && situacao(l) !== filtroSituacao) return false;
      if (filtroPlano === "sem" && l.plano_nome) return false;
      if (filtroPlano !== "todos" && filtroPlano !== "sem" && l.plano_nome !== filtroPlano) {
        return false;
      }
      if (!termo) return true;
      return [l.name, l.dono_nome, l.dono_email, l.city, l.slug]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [linhas, busca, filtroSituacao, filtroPlano]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="lg:flex-1">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por barbearia, dono, e-mail ou cidade"
            aria-label="Buscar barbearia"
            iconeEsquerda={<Search className="h-4 w-4 text-ink-faint" aria-hidden />}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <Select
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
            aria-label="Filtrar por situação"
          >
            <option value="todas">Todas as situações</option>
            {Object.entries(SITUACOES).map(([id, s]) => (
              <option key={id} value={id}>
                {s.rotulo}
              </option>
            ))}
          </Select>
          <Select
            value={filtroPlano}
            onChange={(e) => setFiltroPlano(e.target.value)}
            aria-label="Filtrar por plano"
          >
            <option value="todos">Todos os planos</option>
            {planos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="sem">Sem plano pago</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variante="secondary"
            onClick={() => exportarCsv(visiveis)}
            iconeEsquerda={<Download className="h-4 w-4" aria-hidden />}
            className="flex-1 lg:flex-none"
          >
            CSV
          </Button>
          <Button
            onClick={() => setNova(true)}
            iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
            className="flex-1 lg:flex-none"
          >
            Nova
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        {visiveis.length} de {linhas.length} barbearias
      </p>

      {visiveis.length === 0 ? (
        <EmptyState
          icone={<Store aria-hidden />}
          titulo="Nenhuma barbearia encontrada"
          descricao="Mude a busca ou os filtros."
        />
      ) : (
        <>
          {/* ---------- Computador: tabela ---------- */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs text-ink-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Barbearia</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Plano</th>
                  <th className="px-4 py-2.5 text-right font-medium">Agend. 30d</th>
                  <th className="px-4 py-2.5 text-right font-medium">Prof.</th>
                  <th className="px-4 py-2.5 font-medium">Criada</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/admin/barbearias/${l.id}`)}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/barbearias/${l.id}`}
                        className="font-medium text-ink hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {l.name}
                      </Link>
                      <p className="text-xs text-ink-faint">
                        {l.dono_nome ?? "—"}
                        {l.city ? ` · ${l.city}${l.state ? `/${l.state}` : ""}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <ChipSituacao linha={l} />
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{rotuloPlano(l)}</td>
                    <td className="tnum px-4 py-3 text-right text-ink">{l.agendamentos_30d}</td>
                    <td className="tnum px-4 py-3 text-right text-ink">{l.profissionais}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{dataBR(l.created_at)}</td>
                    <td className="pr-3 text-ink-faint">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------- Celular: cartões ---------- */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {visiveis.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/admin/barbearias/${l.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{l.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {l.dono_nome ?? "—"}
                      {l.city ? ` · ${l.city}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ChipSituacao linha={l} />
                      <span className="text-xs text-ink-soft">{rotuloPlano(l)}</span>
                      <span className="tnum text-xs text-ink-faint">
                        {l.agendamentos_30d} agend. 30d
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <NovaBarbeariaDialog
        aberto={nova}
        aoFechar={() => setNova(false)}
        aoCriar={() => router.refresh()}
      />
    </div>
  );
}

export function ChipSituacao({ linha }: { linha: Pick<LinhaBarbearia, "situacao"> }) {
  const s = SITUACOES[situacao(linha)];
  return <Chip tom={s.tom}>{s.rotulo}</Chip>;
}

function rotuloPlano(l: LinhaBarbearia): string {
  if (!l.plano_nome) return "—";
  return `${l.plano_nome} · ${rotuloDoCiclo(l.ciclo as SubscriptionCycle)}${l.parcelado ? " (parc.)" : ""}`;
}

/**
 * Exporta o que está na tela (já filtrado). Separador `;` e BOM: é o que o
 * Excel em português abre certo, com acento e sem juntar tudo numa coluna.
 */
function exportarCsv(linhas: LinhaBarbearia[]) {
  const colunas: [string, (l: LinhaBarbearia) => unknown][] = [
    ["Barbearia", (l) => l.name],
    ["Link", (l) => l.slug],
    ["Situação", (l) => SITUACOES[situacao(l)].rotulo],
    ["Plano", (l) => l.plano_nome ?? ""],
    ["Período", (l) => rotuloDoCiclo(l.ciclo as SubscriptionCycle)],
    ["Parcelado", (l) => (l.parcelado ? "sim" : "não")],
    ["Teste até", (l) => dataBR(l.teste_ate)],
    ["Pago até", (l) => dataBR(l.pago_ate)],
    ["Dono", (l) => l.dono_nome ?? ""],
    ["E-mail", (l) => l.dono_email ?? ""],
    ["Telefone", (l) => l.dono_telefone ?? ""],
    ["Cidade", (l) => l.city ?? ""],
    ["UF", (l) => l.state ?? ""],
    ["Profissionais", (l) => l.profissionais],
    ["Agendamentos 30d", (l) => l.agendamentos_30d],
    ["Clientes", (l) => l.clientes],
    ["Nota", (l) => (l.avaliacoes ? String(l.nota).replace(".", ",") : "")],
    ["Criada em", (l) => dataBR(l.created_at)],
  ];

  const celula = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = [
    colunas.map(([t]) => celula(t)).join(";"),
    ...linhas.map((l) => colunas.map(([, f]) => celula(f(l))).join(";")),
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `barbearias-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
