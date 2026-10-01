/**
 * "Como você conheceu o PiBarber?" — a pergunta da etapa 1 do setup.
 *
 * O valor no banco é em inglês; o rótulo da tela, em português. A regra que
 * vale é a do Postgres (`barbershop_acquisition` e `salvar_como_conheceu()`,
 * supabase/35_como_conheceu.sql): esta lista e `erroComoConheceu()` são
 * ESPELHO, para o erro aparecer antes da ida ao servidor. Mudou lá, muda aqui.
 */

export const CANAIS = [
  "instagram",
  "tiktok",
  "google",
  "barber_referral",
  "friend_referral",
  "pibarber_team",
  "other",
] as const;

export type CanalDeAquisicao = (typeof CANAIS)[number];

export const ROTULO_CANAL: Record<CanalDeAquisicao, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  barber_referral: "Indicação de outro barbeiro",
  friend_referral: "Indicação de amigo ou cliente",
  pibarber_team: "Visita ou contato da equipe PiBarber",
  other: "Outro",
};

/** O rótulo de quem não respondeu — as lojas de antes da pergunta. */
export const NAO_INFORMADO = "Não informado";

export const DETALHE_MAXIMO = 100;

/** O campo de detalhe que cada canal mostra (nulo = nenhum). */
export function campoDeDetalhe(
  canal: CanalDeAquisicao | "",
): { rotulo: string; obrigatorio: boolean } | null {
  if (canal === "barber_referral" || canal === "friend_referral") {
    return { rotulo: "Quem indicou?", obrigatorio: false };
  }
  if (canal === "other") return { rotulo: "Qual?", obrigatorio: true };
  return null;
}

export function ehCanal(valor: string | null | undefined): valor is CanalDeAquisicao {
  return (CANAIS as readonly string[]).includes(valor ?? "");
}

/** "Indicação de outro barbeiro — João da Navalha", ou "Não informado". */
export function rotuloComoConheceu(
  canal: string | null | undefined,
  detalhe: string | null | undefined,
): string {
  if (!ehCanal(canal)) return NAO_INFORMADO;
  return detalhe ? `${ROTULO_CANAL[canal]} — ${detalhe}` : ROTULO_CANAL[canal];
}

/** A mensagem de erro da pergunta, ou null se a resposta serve. */
export function erroComoConheceu(canal: string, detalhe: string): string | null {
  if (!ehCanal(canal)) return "Escolha como você conheceu o PiBarber.";
  const campo = campoDeDetalhe(canal);
  const limpo = detalhe.trim();
  if (campo?.obrigatorio && !limpo) return "Conte qual foi o canal.";
  if (limpo.length > DETALHE_MAXIMO) return `Use até ${DETALHE_MAXIMO} caracteres.`;
  return null;
}
