import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type VarianteBotao =
  | "primary" // latão preenchido — a ação principal da tela
  | "secondary" // fundo suave, para a ação secundária ao lado
  | "outline" // só contorno, sobre fundo colorido
  | "ghost" // sem caixa, para ícone e ação discreta
  | "danger" // texto vermelho SEM caixa: Sair, Excluir conta
  | "dangerSolid"; // vermelho preenchido — só na confirmação de um diálogo

export type TamanhoBotao = "sm" | "md" | "lg";

const VARIANTES: Record<VarianteBotao, string> = {
  primary: "bg-brass text-brass-ink hover:bg-brass-deep active:bg-brass-deep shadow-sm",
  secondary: "bg-surface-2 text-ink hover:bg-line",
  outline: "border border-line-strong bg-transparent text-ink hover:bg-surface-2",
  ghost: "bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink",
  danger: "bg-transparent text-danger hover:bg-danger-soft",
  dangerSolid: "bg-danger text-danger-ink hover:opacity-90",
};

// Altura mínima de 44px em todos os tamanhos: alvo de toque do design system.
const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: "h-11 px-4 text-sm gap-1.5",
  md: "h-12 px-5 text-sm gap-2",
  lg: "h-[50px] px-6 text-base gap-2", // o primário de formulário no celular
};

export function classesBotao({
  variante = "primary",
  tamanho = "md",
  larguraTotal = false,
  className,
}: {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  larguraTotal?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center rounded-field font-medium",
    // Rótulo de botão nunca quebra linha: quebrar deforma a altura e estraga
    // o alvo de toque de 44px.
    "whitespace-nowrap",
    "transition-all duration-150 active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTES[variante],
    TAMANHOS[tamanho],
    larguraTotal && "w-full",
    className,
  );
}

type PropsBotao = ComponentPropsWithoutRef<"button"> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  larguraTotal?: boolean;
  carregando?: boolean;
  iconeEsquerda?: ReactNode;
  iconeDireita?: ReactNode;
};

export function Button({
  variante = "primary",
  tamanho = "md",
  larguraTotal = false,
  carregando = false,
  iconeEsquerda,
  iconeDireita,
  className,
  children,
  disabled,
  type = "button",
  ...resto
}: PropsBotao) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={classesBotao({ variante, tamanho, larguraTotal, className })}
      {...resto}
    >
      {carregando ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        iconeEsquerda
      )}
      {children}
      {!carregando && iconeDireita}
    </button>
  );
}

type PropsLinkBotao = ComponentPropsWithoutRef<typeof Link> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  larguraTotal?: boolean;
  iconeEsquerda?: ReactNode;
  iconeDireita?: ReactNode;
};

/** Mesmo visual do Button, mas navega. Use quando a ação é ir para outra tela. */
export function LinkButton({
  variante = "primary",
  tamanho = "md",
  larguraTotal = false,
  iconeEsquerda,
  iconeDireita,
  className,
  children,
  ...resto
}: PropsLinkBotao) {
  return (
    <Link
      className={classesBotao({ variante, tamanho, larguraTotal, className })}
      {...resto}
    >
      {iconeEsquerda}
      {children}
      {iconeDireita}
    </Link>
  );
}
