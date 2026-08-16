"use client";

import { AlertCircle, KeyRound, Mail, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { desvincularAcesso } from "@/app/actions/client";
import { Button } from "@/components/ui";

/**
 * Os métodos de login da conta: Google e/ou e-mail e senha.
 *
 * REGRA DURA: o último método nunca é removido. Quem ficasse sem nenhum
 * perderia a conta para sempre, e não haveria caminho de volta — nem por
 * suporte. Por isso o botão some e a explicação aparece no lugar.
 */

export type MetodoDeAcesso = {
  provider: string;
  identificador: string | null;
  criadoEm: string | null;
};

const ROTULOS: Record<string, { nome: string; descricao: string }> = {
  google: { nome: "Google", descricao: "Entrar com um toque, sem senha" },
  email: { nome: "E-mail e senha", descricao: "Entrar digitando a senha" },
};

export function GerenciarAcessos({ metodos }: { metodos: MetodoDeAcesso[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const oUnico = metodos.length <= 1;
  const faltando = (["google", "email"] as const).filter(
    (p) => !metodos.some((m) => m.provider === p),
  );

  return (
    <div className="flex flex-col gap-5">
      {erro ? (
        <p className="flex items-start gap-2 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-base font-semibold text-ink">Vinculados</h2>

        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {metodos.map((m) => {
            const rotulo = ROTULOS[m.provider] ?? {
              nome: m.provider,
              descricao: "Método de login",
            };

            return (
              <li
                key={m.provider}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-surface-2 text-ink-soft">
                  {m.provider === "email" ? (
                    <Mail className="h-5 w-5" aria-hidden />
                  ) : (
                    <KeyRound className="h-5 w-5" aria-hidden />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{rotulo.nome}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {m.identificador ?? rotulo.descricao}
                  </span>
                </span>

                {oUnico ? null : (
                  <Button
                    variante="danger"
                    tamanho="sm"
                    carregando={ocupado}
                    onClick={() => {
                      setErro(null);
                      iniciar(async () => {
                        const resultado = await desvincularAcesso(m.provider);
                        if (!resultado.ok) {
                          setErro(resultado.message ?? "Não consegui desvincular.");
                          return;
                        }
                        router.refresh();
                      });
                    }}
                  >
                    Desvincular
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {oUnico ? (
          <p className="mt-2 flex items-start gap-2 rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este é o seu único jeito de entrar, por isso ele não pode ser removido. Vincule
            outro método antes.
          </p>
        ) : null}
      </section>

      {faltando.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">Vincular acesso</h2>

          <ul className="flex flex-col gap-2">
            {faltando.map((p) => (
              <li
                key={p}
                className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {ROTULOS[p]?.nome ?? p}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {ROTULOS[p]?.descricao}
                  </span>
                </span>

                {p === "google" ? (
                  <a
                    href="/app/perfil/acessos/google"
                    className="inline-flex h-11 items-center rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
                  >
                    Vincular
                  </a>
                ) : (
                  <a
                    href="/app/perfil/seguranca"
                    className="inline-flex h-11 items-center rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
                  >
                    Criar senha
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
