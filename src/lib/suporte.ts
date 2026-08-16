import { mascaraTelefone, soDigitos } from "@/lib/utils";

/**
 * O CANAL DE SUPORTE — a única fonte da verdade.
 *
 * E-mail e telefone vêm de variável de ambiente e são montados aqui. Nenhum
 * JSX do projeto deve escrever um `mailto:` ou um `wa.me` na mão: se amanhã o
 * número mudar, tem que mudar num lugar só.
 *
 * ⚠️ OS VALORES AINDA NÃO EXISTEM. Enquanto `.env.local` trouxer o
 * PREENCHER_ANTES_DO_DEPLOY (ou nada), `configurado` é false e o bloco de
 * suporte NÃO é renderizado em produção — publicar um `mailto:` que volta é
 * pior do que não oferecer o canal. Em desenvolvimento aparece um aviso, para
 * ninguém esquecer.
 *
 * Ver a seção de pendências do ESTADO.md: isto bloqueia o deploy.
 */

const PLACEHOLDER = "PREENCHER_ANTES_DO_DEPLOY";

function valor(bruto: string | undefined): string | null {
  const limpo = bruto?.trim();
  if (!limpo || limpo === PLACEHOLDER) return null;
  return limpo;
}

export type Suporte = {
  /** Endereço para exibir. */
  email: string | null;
  /** Telefone formatado para exibir: (00) 00000-0000 */
  telefone: string | null;
  emailLink: string | null;
  /** wa.me — o barbeiro vive no WhatsApp, não no e-mail. */
  whatsappLink: string | null;
  /** Os dois preenchidos? Se não, não renderize em produção. */
  configurado: boolean;
};

/**
 * Precisa ler `process.env.NEXT_PUBLIC_*` de forma literal: é assim que o Next
 * substitui o valor no build. Guardar o nome numa variável não funciona.
 */
export function dadosSuporte(): Suporte {
  const email = valor(process.env.NEXT_PUBLIC_SUPORTE_EMAIL);
  const telefoneBruto = valor(process.env.NEXT_PUBLIC_SUPORTE_TELEFONE);

  const digitos = telefoneBruto ? soDigitos(telefoneBruto) : "";
  const comPais = digitos ? (digitos.startsWith("55") ? digitos : `55${digitos}`) : "";

  // NÃO existe `tel:` aqui, e é decisão de produto: o suporte do PiBarber
  // atende por WhatsApp e por e-mail. Oferecer ligação criava a expectativa de
  // alguém do outro lado da linha o dia inteiro — expectativa que a operação
  // não sustenta. O telefone continua sendo lido: ele é o número do WhatsApp.
  return {
    email,
    telefone: telefoneBruto ? mascaraTelefone(telefoneBruto) : null,
    emailLink: email ? `mailto:${email}` : null,
    whatsappLink: comPais ? `https://wa.me/${comPais}` : null,
    configurado: Boolean(email && comPais),
  };
}

/** Mostra o aviso de "falta preencher" só fora de produção. */
export function avisarSuportePendente(): boolean {
  return process.env.NODE_ENV !== "production";
}
