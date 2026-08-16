import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Um item do menu do perfil: ícone, título, subtítulo em cinza e chevron.
 * A LINHA INTEIRA é clicável — no polegar, um alvo de 64px acerta sempre.
 */
export function ProfileMenuItem({
  href,
  Icone,
  titulo,
  subtitulo,
}: {
  href: string;
  Icone: LucideIcon;
  titulo: string;
  subtitulo: string;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={href}
        className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-surface-2 text-ink-soft">
          <Icone className="h-5 w-5" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{titulo}</span>
          <span className="block truncate text-xs text-ink-faint">{subtitulo}</span>
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </Link>
    </li>
  );
}
