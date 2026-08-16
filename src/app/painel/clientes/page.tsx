import { ChevronRight, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { BotaoNovoCliente } from "@/components/painel/BotaoNovoCliente";
import { Chip, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brl, dataBR, mascaraTelefone } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes" };

type ClienteDaLista = {
  id: string;
  full_name: string;
  phone: string | null;
  total_visits: number;
  total_spent: number;
  last_visit_at: string | null;
  profile_id: string | null;
  is_walk_in: boolean;
};

/**
 * De onde essa pessoa veio. São três origens, e todas caem na MESMA tabela —
 * é por isso que esta tela não precisa de view nem de união de consultas:
 *
 *   App     → tem conta no PiBarber e agendou pelo site (profile_id preenchido)
 *   Balcão  → o barbeiro cadastrou a ficha na mão
 *   Avulso  → entrou pela porta e sentou; a ficha nasceu no agendamento rápido
 *
 * A ordem do teste importa: um avulso que depois criou conta é, antes de tudo,
 * um cliente do app.
 */
function origem(c: ClienteDaLista): { rotulo: string; tom: "brass" | "info" | "neutro" } {
  if (c.profile_id) return { rotulo: "App", tom: "brass" };
  if (c.is_walk_in) return { rotulo: "Avulso", tom: "neutro" };
  return { rotulo: "Balcão", tom: "info" };
}

/**
 * A lista de clientes da barbearia — TODO MUNDO que já passou por aqui,
 * qualquer que tenha sido a porta de entrada.
 *
 * A busca é um `<form method="get">`: fica na URL, funciona sem JavaScript, e
 * o barbeiro pode mandar o link. Não precisa de estado, então a página inteira
 * segue Server Component.
 *
 * O isolamento por barbearia não depende do `.eq("barbershop_id")` abaixo: a
 * policy `customers_select` (03_rls.sql) exige `has_shop_access(barbershop_id)`,
 * então o Postgres não devolve linha de outra loja nem se a consulta pedir.
 * O filtro está aqui para a consulta usar o índice, não para proteger.
 */
async function listar(shopId: string, termo: string): Promise<ClienteDaLista[]> {
  try {
    const supabase = await createClient();

    // `%` e `,` quebram o `or()` do PostgREST, que separa condições por vírgula.
    const limpo = termo.trim().replace(/[%,()]/g, "");
    const digitos = limpo.replace(/\D/g, "");

    let consulta = supabase
      .from("customers")
      .select(
        "id, full_name, phone, total_visits, total_spent, last_visit_at, profile_id, is_walk_in",
      )
      .eq("barbershop_id", shopId)
      // Mais recentes primeiro. `nullsFirst: false` joga para o fim quem nunca
      // foi atendido — ficha criada e esquecida não empurra para baixo quem
      // esteve na cadeira ontem.
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (limpo !== "") {
      consulta =
        digitos.length >= 3
          ? consulta.or(`full_name.ilike.%${limpo}%,phone.ilike.%${digitos}%`)
          : consulta.ilike("full_name", `%${limpo}%`);
    }

    const { data, error } = await consulta;

    if (error) {
      console.error("[clientes] falha ao listar:", error);
      return [];
    }

    return (data ?? []).map((c) => ({ ...c, total_spent: Number(c.total_spent) }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[clientes] erro inesperado ao listar:", error);
    return [];
  }
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { shopId } = await requireShopContext();
  const { q = "" } = await searchParams;

  const clientes = await listar(shopId, q);

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Todo mundo que já sentou na cadeira — pelo app, pelo balcão ou por ordem de chegada. Toque na ficha para ver histórico e observações."
        acao={<BotaoNovoCliente />}
      />

      <form method="get" className="mb-4">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou telefone"
          iconeEsquerda={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Buscar cliente"
        />
      </form>

      {clientes.length === 0 ? (
        <EmptyState
          icone={<Users aria-hidden />}
          titulo={q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          descricao={
            q
              ? "Tente outro nome ou o telefone com DDD."
              : "Cadastre o primeiro cliente ou marque um atendimento — a ficha nasce sozinha."
          }
          acao={q ? null : <BotaoNovoCliente />}
        />
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {clientes.map((c) => {
            const de = origem(c);
            // O avulso não tem telefone: no lugar dele entra o que ele TEM,
            // que é a contagem de atendimentos. Linha vazia não informa nada.
            const detalhe = c.phone
              ? mascaraTelefone(c.phone)
              : `${c.total_visits} ${c.total_visits === 1 ? "atendimento" : "atendimentos"}`;

            return (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/painel/clientes/${c.id}`}
                  className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {c.full_name}
                      </span>
                      <Chip tom={de.tom}>{de.rotulo}</Chip>
                    </span>
                    <span className="tnum block truncate text-xs text-ink-soft">
                      {detalhe}
                      {c.last_visit_at
                        ? ` · última visita ${dataBR(c.last_visit_at)}`
                        : " · nunca veio"}
                    </span>
                  </span>

                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="tnum block text-sm font-semibold text-ink">
                      {brl(c.total_spent)}
                    </span>
                    <span className="tnum block text-xs text-ink-faint">
                      {c.total_visits} {c.total_visits === 1 ? "visita" : "visitas"}
                    </span>
                  </span>

                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
