"use client";

import { AlertCircle, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarBeneficios } from "@/app/actions/shop";
import { Button } from "@/components/ui";
import { iconeDoBeneficio } from "@/lib/beneficios";
import type { Amenity } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * As comodidades que a barbearia anuncia no perfil público — T-5.
 *
 * Lista fechada: o dono marca caixinhas, não digita. O porquê está na
 * migration `09_beneficios.sql`; o resumo é ícone consistente e filtro futuro.
 *
 * Formulário separado do "Dados da barbearia" pela mesma razão que o horário é:
 * são salvos em momentos diferentes. O dono marca o wi-fi uma vez na vida e
 * não deveria ter que reenviar o endereço inteiro para isso.
 *
 * Layout: o painel é desktop-first, mas caixinha é caixinha — a grade cresce de
 * 1 para 3 colunas e cada linha tem 44px de alvo de toque, porque o dono confere
 * o próprio perfil pelo celular. `min-w-0` nos itens é a armadilha nº9: item de
 * grid nasce com `min-width: auto` e um rótulo longo esticaria a página.
 */
export function BeneficiosBarbearia({
  catalogo,
  selecionadosIniciais,
}: {
  catalogo: Amenity[];
  selecionadosIniciais: string[];
}) {
  const router = useRouter();

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecionadosIniciais),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function alternar(id: string) {
    setMensagem(null);
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarBeneficios([...marcados]);

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Benefícios salvos.");
      router.refresh();
    });
  }

  if (catalogo.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Benefícios</h2>
        <p className="text-sm text-ink-soft">
          O que sua barbearia oferece. Aparece numa aba do seu perfil público — se você não
          marcar nenhum, a aba não aparece.
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo.map((beneficio) => {
          const Icone = iconeDoBeneficio(beneficio.icon);
          const ativo = marcados.has(beneficio.id);

          return (
            <li key={beneficio.id} className="min-w-0">
              <label
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-card border p-3 transition-colors",
                  ativo
                    ? "border-brass bg-brass-soft"
                    : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={() => alternar(beneficio.id)}
                  className="h-5 w-5 shrink-0 accent-brass"
                />
                <Icone
                  className={cn("h-4 w-4 shrink-0", ativo ? "text-brass-deep" : "text-ink-faint")}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    ativo ? "font-medium text-brass-deep" : "text-ink",
                  )}
                >
                  {beneficio.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {erro ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {mensagem ? (
        <p className="flex items-start gap-2 text-sm text-money">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mensagem}
        </p>
      ) : null}

      <Button tamanho="lg" larguraTotal carregando={salvando} onClick={salvar}>
        Salvar benefícios
      </Button>
    </section>
  );
}
