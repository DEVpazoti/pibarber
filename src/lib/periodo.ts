import { hojeISO, inicioDaSemana, somarDias } from "@/lib/utils";

/**
 * O período das telas de dinheiro e do relatório.
 *
 * Vive na URL (`?p=mes` ou `?de=…&ate=…`), não em estado: assim o dono manda o
 * link do fechamento de julho para o contador, e o botão de voltar funciona.
 *
 * TODA data aqui é resolvida NO SERVIDOR, no fuso de São Paulo. Se "hoje"
 * viesse do navegador, o fechamento das 23h cairia no dia seguinte.
 */

export type NomePeriodo = "hoje" | "semana" | "mes" | "personalizado";

export type Periodo = {
  de: string;
  ate: string;
  nome: NomePeriodo;
  rotulo: string;
};

export const PRESETS: { nome: NomePeriodo; rotulo: string }[] = [
  { nome: "hoje", rotulo: "Hoje" },
  { nome: "semana", rotulo: "Esta semana" },
  { nome: "mes", rotulo: "Este mês" },
  { nome: "personalizado", rotulo: "Escolher" },
];

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** O primeiro dia do mês daquele dia: "2026-08-14" → "2026-08-01". */
export function primeiroDiaDoMes(diaISO: string): string {
  return `${diaISO.slice(0, 7)}-01`;
}

/** O último dia do mês: vai para o dia 1 do mês seguinte e volta um. */
export function ultimoDiaDoMes(diaISO: string): string {
  const [ano = 0, mes = 1] = diaISO.split("-").map(Number);
  const proximoMes = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  return somarDias(proximoMes, -1);
}

/**
 * Lê a URL e devolve o intervalo.
 *
 * Datas fora do formato aaaa-mm-dd são ignoradas em silêncio — a tela nunca
 * quebra por causa de um parâmetro digitado errado.
 */
export function resolverPeriodo(params: {
  p?: string;
  de?: string;
  ate?: string;
}): Periodo {
  const hoje = hojeISO();

  const deValido = params.de && DIA_ISO.test(params.de) ? params.de : null;
  const ateValido = params.ate && DIA_ISO.test(params.ate) ? params.ate : null;

  if (deValido && ateValido) {
    // Intervalo invertido acontece com quem preenche o "até" primeiro.
    const [de, ate] = deValido <= ateValido ? [deValido, ateValido] : [ateValido, deValido];
    return { de, ate, nome: "personalizado", rotulo: "Período escolhido" };
  }

  switch (params.p) {
    case "hoje":
      return { de: hoje, ate: hoje, nome: "hoje", rotulo: "Hoje" };

    case "semana": {
      const domingo = inicioDaSemana(hoje);
      return {
        de: domingo,
        ate: somarDias(domingo, 6),
        nome: "semana",
        rotulo: "Esta semana",
      };
    }

    default:
      // Mês é o padrão: é como o dono pensa o dinheiro.
      return {
        de: primeiroDiaDoMes(hoje),
        ate: ultimoDiaDoMes(hoje),
        nome: "mes",
        rotulo: "Este mês",
      };
  }
}

/** O mesmo intervalo, deslocado para trás — o comparativo do relatório. */
export function periodoAnterior(periodo: Periodo): { de: string; ate: string } {
  const dias =
    Math.round(
      (Date.parse(`${periodo.ate}T00:00:00Z`) - Date.parse(`${periodo.de}T00:00:00Z`)) / 86_400_000,
    ) + 1;

  return {
    de: somarDias(periodo.de, -dias),
    ate: somarDias(periodo.de, -1),
  };
}
