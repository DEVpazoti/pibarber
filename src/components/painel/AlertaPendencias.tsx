import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * "Você tem N atendimentos de dias anteriores sem conclusão."
 *
 * Componente de SERVIDOR: só texto e um link. O contador vem pronto de quem
 * renderiza — o banner não consulta nada.
 *
 * Aparece em DUAS telas, e a escolha é deliberada:
 *
 *   · HOJE, porque é a tela que o barbeiro abre dezenas de vezes por dia e é
 *     onde ele conclui atendimento. Se o hábito de concluir falhou, é ali que
 *     ele precisa ser lembrado.
 *   · AGENDA, porque é onde ele vai quando quer olhar outro dia — e "outro dia"
 *     é exatamente o que ficou para trás.
 *
 * Fora dessas duas ele não aparece: repetir o mesmo aviso em Clientes, Caixa e
 * Fiado transformaria um alerta em ruído de fundo, e ruído de fundo se aprende
 * a ignorar.
 *
 * O tom é `danger` porque isto é dinheiro fora do faturamento, não uma dica.
 */
export function AlertaPendencias({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;

  return (
    <Link
      href="/painel/pendencias"
      className="mb-4 flex items-center gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 transition-colors hover:bg-danger/15"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-danger" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-danger">
          {quantidade === 1
            ? "1 atendimento de dia anterior sem conclusão"
            : `${quantidade} atendimentos de dias anteriores sem conclusão`}
        </span>
        <span className="block text-xs text-danger/80">
          Enquanto ficarem assim, esse dinheiro não entra no seu faturamento.
        </span>
      </span>

      <ChevronRight className="h-5 w-5 shrink-0 text-danger" aria-hidden />
    </Link>
  );
}
