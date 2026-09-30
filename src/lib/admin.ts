import type { Database } from "@/lib/database.types";

/**
 * Tipos e rótulos do painel do SUPER ADMIN. Pode ser importado do cliente.
 *
 * Os números e a `situacao` são calculados no banco
 * (`admin_barbearias()` e `admin_metricas()`, em 29_admin_dashboard.sql);
 * aqui só se decide como mostrar.
 */

export type LinhaBarbearia = Database["public"]["Functions"]["admin_barbearias"]["Returns"][number];

export type SituacaoBarbearia =
  "bloqueada" | "setup" | "pagante" | "cancelada" | "atrasada" | "teste" | "pausada";

export const SITUACOES: Record<
  SituacaoBarbearia,
  { rotulo: string; tom: "money" | "danger" | "neutro" | "info" | "brass" }
> = {
  pagante: { rotulo: "Pagante", tom: "money" },
  teste: { rotulo: "Teste grátis", tom: "brass" },
  setup: { rotulo: "Em configuração", tom: "info" },
  atrasada: { rotulo: "Pagamento atrasado", tom: "danger" },
  pausada: { rotulo: "Pausada", tom: "danger" },
  cancelada: { rotulo: "Cancelada (paga até o fim)", tom: "neutro" },
  bloqueada: { rotulo: "Bloqueada", tom: "neutro" },
};

export function situacao(linha: Pick<LinhaBarbearia, "situacao">): SituacaoBarbearia {
  return (linha.situacao as SituacaoBarbearia) ?? "teste";
}

/** Variação em % contra o período anterior; null quando não dá para comparar. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
