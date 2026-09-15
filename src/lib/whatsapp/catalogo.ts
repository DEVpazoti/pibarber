/**
 * O CATÁLOGO DE TEMPLATES DO WHATSAPP — os três textos que a plataforma envia.
 *
 * ---------------------------------------------------------------------------
 * Por que os textos moram em código, e não no banco
 * ---------------------------------------------------------------------------
 * Eles são FIXOS. Cada texto é um template aprovado uma vez na WABA do
 * PiBarber, com o nome da barbearia entrando como parâmetro. Mudar uma vírgula
 * é submeter outro template (`_v2`), esperar a análise da Meta e só então
 * trocar o nome aqui. Não existe "editar" — por isso a barbearia não edita
 * (CONTEXT §9), e por isso não há tela para isso.
 *
 * A mesma lista serve para três coisas, e é o motivo de ser uma só:
 *   1. submeter à Meta (scripts/whatsapp-templates.mjs lê daqui);
 *   2. montar os parâmetros do envio, na ordem certa;
 *   3. mostrar a pré-visualização em /painel/configuracoes.
 *
 * Espelho em `supabase/24_whatsapp.sql` (PARTE 4). Mudou aqui, muda lá.
 *
 * ---------------------------------------------------------------------------
 * Regras da Meta que o texto respeita — e que um texto novo precisa respeitar
 * ---------------------------------------------------------------------------
 *   · Parâmetro nunca no começo nem no fim do corpo.
 *   · Dois parâmetros nunca colados ("{{1}}{{2}}" é recusado).
 *   · Texto fixo suficiente entre os parâmetros — template que é "só
 *     variável" é reprovado como spam.
 *   · No envio: parâmetro nunca vazio, sem quebra de linha, sem tabulação e
 *     sem mais de quatro espaços seguidos. `limparParametro()` garante isso.
 *
 * ⚠️ SEM IMPORT NENHUM, de propósito. Este arquivo é lido também pelo
 * navegador (a tela de configurações) e por um script Node puro, que não
 * entende o apelido "@/". Mantenha-o autossuficiente.
 */

export type EventoWhatsapp = "confirmation" | "reminder" | "cancellation";

/** A ordem em que aparecem na tela. */
export const EVENTOS: readonly EventoWhatsapp[] = ["confirmation", "reminder", "cancellation"];

/** Os pedaços de informação que um template pode pedir. */
export type CampoMensagem = "nome" | "barbearia" | "data" | "hora" | "profissional" | "link";

export type DadosMensagem = Partial<Record<CampoMensagem, string | null | undefined>>;

export type TemplateDoCatalogo = {
  evento: EventoWhatsapp;
  /** O nome na Meta. Texto novo, nome novo. */
  nomeMeta: string;
  idioma: "pt_BR";
  /** Utilidade custa ~9× menos que Marketing. Os três são Utilidade de fato. */
  categoria: "UTILITY";
  /** Como aparece para o dono na tela. */
  rotulo: string;
  /** Quando sai — a linha de explicação debaixo do rótulo. */
  quando: string;
  texto: string;
  /** Um campo por `{{n}}`, NA ORDEM. `campos[0]` é o `{{1}}`. */
  campos: readonly CampoMensagem[];
  /** A Meta exige um exemplo de cada parâmetro para analisar o template. */
  exemplo: readonly string[];
};

export const CATALOGO: Readonly<Record<EventoWhatsapp, TemplateDoCatalogo>> = {
  confirmation: {
    evento: "confirmation",
    nomeMeta: "pibarber_confirmacao_v1",
    idioma: "pt_BR",
    categoria: "UTILITY",
    rotulo: "Confirmação",
    quando: "Assim que o cliente agenda pelo app ou pelo link público.",
    texto:
      "Olá {{1}}! Seu horário na {{2}} está confirmado para {{3}} às {{4}} com {{5}}. Para acompanhar ou cancelar, acesse {{6}}.",
    campos: ["nome", "barbearia", "data", "hora", "profissional", "link"],
    exemplo: [
      "João",
      "Barbearia do Zé",
      "sexta, 18/09",
      "14:30",
      "Carlos",
      "https://pibarber.vercel.app/app/agendamentos",
    ],
  },
  reminder: {
    evento: "reminder",
    nomeMeta: "pibarber_lembrete_v1",
    idioma: "pt_BR",
    categoria: "UTILITY",
    rotulo: "Lembrete",
    quando: "Às 18h da véspera do atendimento.",
    texto:
      "Olá {{1}}! Lembrete: você tem horário amanhã na {{2}}, às {{3}}, com {{4}}. Se não puder vir, cancele em {{5}} para liberar o horário.",
    campos: ["nome", "barbearia", "hora", "profissional", "link"],
    exemplo: [
      "João",
      "Barbearia do Zé",
      "14:30",
      "Carlos",
      "https://pibarber.vercel.app/app/agendamentos",
    ],
  },
  cancellation: {
    evento: "cancellation",
    nomeMeta: "pibarber_cancelamento_v1",
    idioma: "pt_BR",
    categoria: "UTILITY",
    rotulo: "Cancelamento",
    quando: "Quando o horário é cancelado — pela barbearia ou pelo próprio cliente.",
    texto:
      "Olá {{1}}! Seu horário na {{2}} em {{3}} às {{4}} foi cancelado. Você pode marcar outro em {{5}}.",
    campos: ["nome", "barbearia", "data", "hora", "link"],
    exemplo: [
      "João",
      "Barbearia do Zé",
      "sexta, 18/09",
      "14:30",
      "https://pibarber.vercel.app/b/barbearia-do-ze",
    ],
  },
};

/** Sem valor, vai isto. A Meta recusa o envio inteiro por um parâmetro vazio. */
export const SEM_VALOR = "—";

/**
 * Deixa um valor pronto para virar parâmetro de template.
 *
 * O nome do cliente é digitado por ele mesmo no agendamento público — e pode
 * vir com quebra de linha, tabulação ou uma fileira de espaços. Qualquer um
 * desses faz a Meta recusar a mensagem com erro de parâmetro, que é falha
 * PERMANENTE: a confirmação simplesmente não sairia, por causa de um Enter.
 */
export function limparParametro(valor: string | null | undefined): string {
  const limpo = (valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    // Folga larga: o limite da Meta é por mensagem, e nome de barbearia não
    // tem 200 caracteres. Isto só segura lixo.
    .slice(0, 200);
  return limpo === "" ? SEM_VALOR : limpo;
}

/** Os valores de `{{1}}..{{n}}`, na ordem que aquele template pede. */
export function montarParametros(evento: EventoWhatsapp, dados: DadosMensagem): string[] {
  return CATALOGO[evento].campos.map((campo) => limparParametro(dados[campo]));
}

/** O texto como chega no celular. É o que a tela de configurações mostra. */
export function previa(evento: EventoWhatsapp, params: readonly string[]): string {
  return CATALOGO[evento].texto.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    return params[Number(n) - 1] ?? SEM_VALOR;
  });
}

/**
 * O corpo do `POST /{waba}/message_templates`.
 *
 * `example.body_text` não é opcional na prática: sem ele a Meta devolve erro
 * na criação de todo template que tenha parâmetro.
 */
export function corpoParaMeta(evento: EventoWhatsapp) {
  const t = CATALOGO[evento];
  return {
    name: t.nomeMeta,
    language: t.idioma,
    category: t.categoria,
    components: [
      {
        type: "BODY",
        text: t.texto,
        example: { body_text: [[...t.exemplo]] },
      },
    ],
  };
}
