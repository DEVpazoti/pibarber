import { HandCoins, Info } from "lucide-react";
import Link from "next/link";

import type { ComissaoDoDia as Linha } from "@/lib/types";
import { brl, pct } from "@/lib/utils";

/**
 * COMISSÃO DE HOJE — o bloco no fim da aba HOJE.
 *
 * Componente de SERVIDOR: não tem estado, não tem interação, e renderizar no
 * servidor evita mandar mais JavaScript para um celular que já carrega a lista
 * da agenda inteira.
 *
 * Quem decide o que aparece aqui é `comissoes_do_dia()`, no Postgres. O dono
 * recebe todos os profissionais; o assistente ligado a um profissional recebe
 * só a própria linha. Esta tela não filtra nada — ela desenha o que veio.
 *
 * O layout é de LISTA, não de tabela. Quatro colunas de números num celular de
 * 360px ou estouram a largura ou viram fonte de 10px; a lista empilha nome em
 * cima, números embaixo, e cresce bem no desktop sem virar outra coisa.
 */
export function ComissaoDoDia({
  linhas,
  podeVerDinheiro,
  temPendencias,
}: {
  linhas: Linha[];
  /** Dono vê todo mundo e o total geral; assistente vê só a linha dele. */
  podeVerDinheiro: boolean;
  /** Há atendimento de dia anterior sem concluir? Muda o texto do rodapé. */
  temPendencias: boolean;
}) {
  const totalComissao = linhas.reduce((soma, l) => soma + l.comissao, 0);
  const totalGerado = linhas.reduce((soma, l) => soma + l.total_gerado, 0);
  const totalAtendimentos = linhas.reduce((soma, l) => soma + l.atendimentos, 0);

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <HandCoins className="h-4.5 w-4.5 text-brass" aria-hidden />
        {podeVerDinheiro ? "Comissão de hoje" : "Sua comissão de hoje"}
      </h2>

      {linhas.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-4 py-5 text-center text-sm text-ink-soft">
          {podeVerDinheiro
            ? "Nenhum atendimento concluído hoje ainda. A comissão aparece aqui conforme você conclui."
            : "Nenhuma comissão hoje ainda. Ela aparece aqui assim que um atendimento seu for concluído."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <ul>
            {linhas.map((l) => (
              <li
                key={l.professional_id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{l.nome}</p>
                  <p className="tnum truncate text-xs text-ink-soft">
                    {l.atendimentos} {l.atendimentos === 1 ? "atendimento" : "atendimentos"} ·{" "}
                    {brl(l.total_gerado)} × {pct(l.percent, 0)}
                  </p>
                </div>

                <p className="tnum shrink-0 text-base font-semibold text-brass-deep">
                  {brl(l.comissao)}
                </p>
              </li>
            ))}
          </ul>

          {/* Total geral só para quem vê a loja inteira. Para o assistente ele
              seria a repetição da única linha acima. */}
          {podeVerDinheiro && linhas.length > 1 ? (
            <div className="flex items-center gap-3 border-t-2 border-line bg-surface-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Total do dia</p>
                <p className="tnum truncate text-xs text-ink-soft">
                  {totalAtendimentos}{" "}
                  {totalAtendimentos === 1 ? "atendimento" : "atendimentos"} ·{" "}
                  {brl(totalGerado)} gerados
                </p>
              </div>
              <p className="tnum shrink-0 text-lg font-semibold text-brass-deep">
                {brl(totalComissao)}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* O aviso que conecta com o ajuste nº 2: número baixo aqui quase sempre
          é atendimento esquecido em aberto, não dia fraco. */}
      <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-faint">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Só entra atendimento <strong className="font-semibold">concluído</strong>. O que ainda
          está em aberto não está contado aqui.
          {temPendencias ? (
            <>
              {" "}
              <Link
                href="/painel/pendencias"
                className="font-semibold text-brass underline underline-offset-2"
              >
                Você tem atendimentos de dias anteriores sem concluir.
              </Link>
            </>
          ) : null}
        </span>
      </p>
    </section>
  );
}
