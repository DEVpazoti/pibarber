import { Eye } from "lucide-react";

import { encerrarVisualizacao } from "@/app/actions/admin-visualizacao";

/**
 * A faixa fixa do "Ver como o dono". Fica no topo de TODA página do painel
 * enquanto a visualização estiver ativa: o admin nunca pode esquecer que está
 * olhando a loja de outra pessoa — nem achar que um clique salvou algo.
 */
export function BarraVisualizacao({ nomeBarbearia }: { nomeBarbearia: string }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-info px-4 py-2 text-center text-sm text-white">
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Você está vendo o painel de <strong>{nomeBarbearia}</strong> como o dono —{" "}
        <strong>somente leitura</strong>. Nada que você fizer aqui é salvo.
      </span>
      <form action={encerrarVisualizacao}>
        <button
          type="submit"
          className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
        >
          Sair da visualização
        </button>
      </form>
    </div>
  );
}
