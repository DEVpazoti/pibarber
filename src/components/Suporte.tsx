import { AlertTriangle, ChevronDown, HelpCircle, Mail, MessageCircle } from "lucide-react";

import { avisarSuportePendente, dadosSuporte } from "@/lib/suporte";
import { cn } from "@/lib/utils";

/**
 * O bloco de contato do suporte — o mesmo para o dono e para o cliente.
 *
 * Sem estado e sem hook de propósito: assim serve tanto num Server Component
 * (a Central de ajuda) quanto dentro de um Client Component (a navegação do
 * painel), sem duplicar o texto nem o link.
 *
 * - `variante="cartao"`  → o bloco aberto da Central de ajuda.
 * - `variante="rodape"`  → o rodapé do painel. É um <details> FECHADO por
 *   padrão, e isso não é enfeite: aberto, as linhas de contato empurravam o
 *   menu da lateral de 240px para dentro de uma rolagem e cortavam
 *   "Configurações". Uma linha fechada resolve, e o acordeão nativo já é o
 *   idioma da Central de ajuda.
 *
 * São DOIS canais: WhatsApp e e-mail. Ligação telefônica foi removida de
 * propósito — ver o comentário em `src/lib/suporte.ts`.
 */
export function Suporte({
  variante = "cartao",
  className,
}: {
  variante?: "cartao" | "rodape";
  className?: string;
}) {
  const suporte = dadosSuporte();

  // Falta preencher: avisa em desenvolvimento, some em produção. Um mailto
  // que volta é pior do que canal nenhum.
  if (!suporte.configurado) {
    if (!avisarSuportePendente()) return null;

    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-field border border-dashed border-danger/50 bg-danger-soft px-3 py-2.5",
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <p className="text-xs leading-relaxed text-danger">
          <span className="font-semibold">Suporte não configurado.</span> Preencha{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPORTE_EMAIL</code> e{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPORTE_TELEFONE</code> antes do deploy.
          Este aviso não aparece em produção.
        </p>
      </div>
    );
  }

  const compacto = variante === "rodape";

  const linha = cn(
    "flex items-center gap-2.5 rounded-field text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink",
    compacto ? "min-h-11 px-3 text-xs" : "min-h-[52px] px-4 text-sm",
  );

  // No rodapé o e-mail quebra em vez de truncar: numa lateral estreita,
  // "suporte@…" cortado não serve para ninguém copiar.
  const rotulo = compacto ? "break-all" : "truncate";

  // Dois canais, não três: a opção de LIGAR saiu (o suporte não atende por
  // telefone). Com a linha do meio fora, a divisória passa a ser
  // "todos menos o último" — senão sobra um risco solto embaixo do cartão.
  const contatos = (
    <>
      {suporte.whatsappLink ? (
        <a
          href={suporte.whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linha, !compacto && "border-b border-line")}
        >
          <MessageCircle className="h-4.5 w-4.5 shrink-0 text-ink-faint" aria-hidden />
          <span className={rotulo}>{suporte.telefone} · WhatsApp</span>
        </a>
      ) : null}

      {suporte.emailLink ? (
        <a href={suporte.emailLink} className={linha}>
          <Mail className="h-4.5 w-4.5 shrink-0 text-ink-faint" aria-hidden />
          <span className={rotulo}>{suporte.email}</span>
        </a>
      ) : null}
    </>
  );

  if (compacto) {
    return (
      <details className={cn("group", className)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-field px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink">
          <HelpCircle className="h-4.5 w-4.5 shrink-0" aria-hidden />
          <span className="flex-1">Precisa de ajuda?</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="pt-0.5">{contatos}</div>
      </details>
    );
  }

  return (
    <div className={className}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Falar com o suporte
      </h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">{contatos}</div>
    </div>
  );
}
