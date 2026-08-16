import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";
import { CLASSES_CAMPO } from "./Input";

type PropsSelect = ComponentPropsWithoutRef<"select"> & {
  erro?: boolean;
  /** Opção neutra no topo, quando nada foi escolhido ainda. */
  placeholder?: string;
};

export function Select({
  className,
  erro = false,
  placeholder,
  children,
  ...resto
}: PropsSelect) {
  return (
    <div className="relative">
      <select
        className={cn(
          CLASSES_CAMPO,
          "h-12 cursor-pointer appearance-none pr-10",
          erro && "ring-2 ring-danger ring-inset",
          className,
        )}
        aria-invalid={erro || undefined}
        {...resto}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
    </div>
  );
}
