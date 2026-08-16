/** Configuração da marca e do contato comercial da PiSystem. */

import { linkWhatsApp } from "@/lib/utils";

export const MARCA = {
  nome: "PiBarber",
  autor: "PiSystem",
  descricao: "Agendamento e gestão para barbearias",
} as const;

/* ==========================================================================
   O WhatsApp comercial — por onde TODO dono de barbearia entra
   ==========================================================================

   Dono de barbearia não se cadastra sozinho (ver docs/promover-dono.md): a
   aquisição é por conversa. Então todo CTA de "quero na minha barbearia" abre
   o WhatsApp, e não o cadastro.

   Número e mensagem vêm de variável de ambiente para você trocar sem mexer no
   código — e sem redeploy de código, só de configuração na Vercel. Os valores
   abaixo são a reserva: se a variável não existir, o site continua funcionando
   com o número atual em vez de gerar um link quebrado.

   As duas precisam ser lidas de forma LITERAL (`process.env.NEXT_PUBLIC_X`).
   É assim que o Next substitui o valor no build; guardar o nome da variável
   numa string não funciona.
*/

const WHATSAPP_RESERVA = "5519987704045";

const MENSAGEM_RESERVA =
  "Olá! Vi o PiBarber e quero saber como funciona para a minha barbearia.";

/** DDI + DDD + número, só dígitos. */
export const WHATSAPP_COMERCIAL =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMERO?.trim() || WHATSAPP_RESERVA;

/** A mensagem que já vem escrita na conversa. */
export const WHATSAPP_MENSAGEM =
  process.env.NEXT_PUBLIC_WHATSAPP_MENSAGEM?.trim() || MENSAGEM_RESERVA;

/**
 * O link pronto, com a mensagem embutida.
 *
 * Use SEMPRE esta constante nos CTAs comerciais. Montar `wa.me` na mão em cada
 * tela é como o número acaba desatualizado em três lugares e certo em um.
 */
export const LINK_WHATSAPP_COMERCIAL = linkWhatsApp(WHATSAPP_COMERCIAL, WHATSAPP_MENSAGEM);

export const EMAIL_COMERCIAL = "contato@pisystem.com.br";

/** Preço da mensalidade mostrado na landing. */
export const PRECO = {
  mensal: 79.9,
  diasGratis: 14,
} as const;
