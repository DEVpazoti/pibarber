import {
  Accessibility,
  Baby,
  Beer,
  Car,
  Coffee,
  CreditCard,
  Dog,
  Gamepad2,
  QrCode,
  Snowflake,
  Sparkles,
  Tv,
  Wifi,
  type LucideIcon,
} from "lucide-react";

/**
 * Os benefícios (comodidades) da barbearia — T-5.
 *
 * O catálogo mora no banco (tabela `amenities`, migration 09), não aqui: é
 * lista fechada, e um filtro futuro no app ("barbearias com estacionamento")
 * precisa consultá-lo por SQL. O que mora aqui é só a ponte que o banco não
 * pode guardar — o COMPONENTE do ícone.
 *
 * `amenities.icon` guarda o nome ("Wifi"), e este mapa o resolve. O mapa é
 * explícito de propósito: importar o lucide inteiro para resolver um nome em
 * tempo de execução arrastaria a biblioteca completa para o bundle, e este é o
 * perfil público — a página que precisa ser leve.
 *
 * Ícone desconhecido não quebra a tela: cai no genérico. Isso importa porque o
 * banco pode ganhar um benefício novo por migration antes do deploy do front.
 *
 * NÃO é `server-only`: o formulário do dono é `"use client"` e usa este mapa.
 */
const ICONES: Record<string, LucideIcon> = {
  Wifi,
  Snowflake,
  Car,
  Accessibility,
  CreditCard,
  QrCode,
  Tv,
  Coffee,
  Beer,
  Baby,
  Dog,
  Gamepad2,
};

export function iconeDoBeneficio(nome: string): LucideIcon {
  return ICONES[nome] ?? Sparkles;
}
