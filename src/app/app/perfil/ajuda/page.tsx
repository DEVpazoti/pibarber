import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";

import { Suporte } from "@/components/Suporte";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = { title: "Central de ajuda" };

/**
 * A Central de ajuda.
 *
 * Acordeão em `<details>` puro: sem JavaScript nenhum, abre e fecha nativo,
 * funciona com leitor de tela e não custa um byte de bundle.
 */
export default async function AjudaPage() {
  await requireRole(["client"]);

  return (
    <>
      <PageHeader
        titulo="Central de ajuda"
        descricao="As dúvidas que mais aparecem."
        voltarPara="/app/perfil"
      />

      <div className="flex flex-col gap-6">
        {FAQ.map((secao) => (
          <section key={secao.numero}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
              {secao.numero}. {secao.titulo}
            </h2>

            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {secao.perguntas.map((p) => (
                <details key={p.pergunta} className="group border-b border-line last:border-b-0">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2">
                    <span className="flex-1">{p.pergunta}</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-ink-soft">{p.resposta}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        {/* Fecha o assunto que a seção 6 do FAQ abre: "escreva para o
            suporte" só ajuda se o endereço estiver logo abaixo. */}
        <Suporte />

        <p className="pb-2 text-center text-xs text-ink-faint">
          PiBarber — desenvolvido por PiSystem.
        </p>
      </div>
    </>
  );
}
