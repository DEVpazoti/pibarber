import { CalendarDays, ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { AvisoTelefone } from "@/components/client/AvisoTelefone";
import { UltimosAcessos } from "@/components/client/UltimosAcessos";
import { Avatar, Card, CLASSES_CAMPO } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { HomeDoCliente } from "@/lib/types";
import { cn, dataPorExtenso, dataBR, horaBR, primeiroNome } from "@/lib/utils";

export const metadata: Metadata = { title: "Início" };

/**
 * A home do app do cliente.
 *
 * Tudo vem de `client_home()`, uma chamada só: último agendamento, próximos,
 * últimos acessos e favoritos. Quatro consultas separadas num celular em 4G
 * custam meio segundo cada — e a home é a primeira impressão do app.
 */
export default async function AppPage() {
  const perfil = await requireRole(["client"]);

  let home: HomeDoCliente = {
    proximo: null,
    proximos: [],
    ultimos_acessos: [],
    favoritos: [],
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("client_home", { p_profile: perfil.id });

    if (error) console.error("[app] falha ao montar a home:", error);
    else if (data) home = data as unknown as HomeDoCliente;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[app] erro inesperado ao montar a home:", error);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- Saudação --------------------------------------------------- */}
      <header>
        <h1 className="text-2xl leading-tight text-ink">
          Olá, <span className="text-brass">{primeiroNome(perfil.full_name) || "tudo bem"}</span>
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">{dataPorExtenso(new Date())}</p>
      </header>

      {/* Quem entrou pelo Google chega aqui sem telefone — o Google não devolve
          esse dado. Aviso dispensável, nunca bloqueio. */}
      {!perfil.phone ? <AvisoTelefone /> : null}

      {/* --- Busca. Focar navega para a tela de busca de verdade. -------- */}
      <Link
        href="/app/buscar?focar=1"
        className={cn(
          CLASSES_CAMPO,
          "flex h-12 items-center gap-2.5 text-ink-faint",
          "hover:bg-line",
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        Encontre uma barbearia
      </Link>

      {/* --- Último agendamento: o elemento mais chamativo da tela ------- */}
      {home.proximo ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">Seu próximo horário</h2>

          <Link href="/app/agendamentos" className="block">
            <Card destaque className="flex items-center gap-3">
              <Avatar src={home.proximo.logo_url} nome={home.proximo.shop_name} tamanho="lg" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {home.proximo.shop_name}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {home.proximo.servicos ?? "Atendimento"} · {home.proximo.professional_name}
                </p>
                <p className="tnum mt-1 text-sm font-semibold text-brass-deep">
                  {dataBR(home.proximo.starts_at)} às {horaBR(home.proximo.starts_at)}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-brass" aria-hidden />
            </Card>
          </Link>
        </section>
      ) : null}

      {/* --- Os próximos, se houver mais de um -------------------------- */}
      {home.proximos.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">Depois desse</h2>
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {home.proximos.map((a) => (
              <li key={a.id} className="border-b border-line last:border-b-0">
                <Link
                  href="/app/agendamentos"
                  className="flex min-h-[56px] items-center gap-3 px-3 py-2.5"
                >
                  <CalendarDays className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {a.shop_name}
                    </span>
                    <span className="tnum block text-xs text-ink-soft">
                      {dataBR(a.starts_at)} às {horaBR(a.starts_at)} · {a.professional_name}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Últimos acessos. Vazio, ele mesmo ensina o próximo passo. --- */}
      <UltimosAcessos itens={home.ultimos_acessos} />
    </div>
  );
}
