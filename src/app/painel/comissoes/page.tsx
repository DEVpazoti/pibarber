import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import {
  ComissoesPainel,
  type ComissaoPorProfissional,
  type ItemComissao,
  type PagamentoComissao,
} from "@/components/painel/ComissoesPainel";
import { SeletorPeriodo } from "@/components/painel/SeletorPeriodo";
import { PageHeader, StatCard } from "@/components/ui";
import { requireOwnerContext } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/periodo";
import { createClient } from "@/lib/supabase/server";
import { brl, faixaDoDia, one } from "@/lib/utils";

export const metadata: Metadata = { title: "Comissões" };

/**
 * COMISSÕES — só o dono. A RLS de `commissions` exige `can_manage_money`.
 *
 * A leitura junta duas coisas: as PENDENTES (independentemente de quando
 * nasceram — dívida antiga não some da tela) e as PAGAS dentro do período
 * escolhido, que é o histórico do fechamento.
 *
 * "Pendente" agora inclui `partial`: comissão paga pela metade continua tendo
 * saldo, e saldo é o que esta tela existe para mostrar. O que entra na conta é
 * `amount - paid_amount`, não `amount`.
 */
export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; de?: string; ate?: string }>;
}) {
  const { shopId } = await requireOwnerContext();
  const periodo = resolverPeriodo(await searchParams);

  const [grupos, pagamentos] = await Promise.all([
    carregarComissoes(shopId, periodo.de, periodo.ate),
    carregarPagamentos(shopId, periodo.de, periodo.ate),
  ]);

  for (const g of grupos) {
    g.pagamentos = pagamentos.get(g.professionalId) ?? [];
  }

  const pendente = grupos.reduce((acc, g) => acc + g.totalPendente, 0);
  const pago = grupos.reduce((acc, g) => acc + g.totalPago, 0);

  return (
    <>
      <PageHeader
        titulo="Comissões"
        descricao="Quanto cada profissional tem a receber, e o que já foi pago."
      />

      <SeletorPeriodo periodo={periodo} />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard rotulo="A pagar" valor={brl(pendente)} tom="brass" />
        <StatCard rotulo="Pago no período" valor={brl(pago)} tom="money" />
      </div>

      <ComissoesPainel grupos={grupos} />
    </>
  );
}

/* ==========================================================================
   Consulta
   ========================================================================== */

type LinhaComissao = {
  id: string;
  amount: number | string;
  paid_amount: number | string;
  base_amount: number | string;
  percent: number | string;
  status: "pending" | "partial" | "paid";
  paid_at: string | null;
  created_at: string;
  professional_id: string;
  profissional: { name: string; nickname: string | null } | { name: string; nickname: string | null }[] | null;
  atendimento:
    | { starts_at: string; cliente: { full_name: string } | { full_name: string }[] | null }
    | { starts_at: string; cliente: { full_name: string } | { full_name: string }[] | null }[]
    | null;
};

async function carregarComissoes(
  shopId: string,
  de: string,
  ate: string,
): Promise<ComissaoPorProfissional[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("commissions")
      .select(
        `id, amount, paid_amount, base_amount, percent, status, paid_at, created_at, professional_id,
         profissional:professionals!commissions_professional_id_fkey(name, nickname),
         atendimento:appointments!commissions_appointment_id_fkey(
           starts_at,
           cliente:customers!appointments_customer_id_fkey(full_name)
         )`,
      )
      .eq("barbershop_id", shopId)
      // Com saldo entra sempre (pendente OU parcial — as duas têm a receber);
      // quitada só se foi quitada dentro do período.
      .or(
        `status.eq.pending,status.eq.partial,and(status.eq.paid,paid_at.gte.${faixaDoDia(de).de},paid_at.lt.${faixaDoDia(ate).ate})`,
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[comissões] falha ao listar:", error);
      return [];
    }

    const porProfissional = new Map<string, ComissaoPorProfissional>();

    for (const linha of (data ?? []) as unknown as LinhaComissao[]) {
      const prof = one(linha.profissional);
      const atendimento = one(linha.atendimento);

      const grupo = porProfissional.get(linha.professional_id) ?? {
        professionalId: linha.professional_id,
        nome: prof?.nickname || prof?.name || "Profissional",
        pendentes: [],
        pagas: [],
        pagamentos: [],
        totalPendente: 0,
        totalPago: 0,
      };

      const item: ItemComissao = {
        id: linha.id,
        amount: Number(linha.amount),
        paid_amount: Number(linha.paid_amount),
        base_amount: Number(linha.base_amount),
        percent: Number(linha.percent),
        status: linha.status,
        paid_at: linha.paid_at,
        created_at: linha.created_at,
        cliente: one(atendimento?.cliente)?.full_name ?? null,
        quando: atendimento?.starts_at ?? null,
      };

      if (item.status === "paid") {
        grupo.pagas.push(item);
        grupo.totalPago += item.amount;
      } else {
        // O que soma é o SALDO. Uma comissão parcial já teve parte lançada no
        // caixa; contar o valor cheio faria a tela pedir dinheiro duas vezes.
        grupo.pendentes.push(item);
        grupo.totalPendente += item.amount - item.paid_amount;
      }

      porProfissional.set(linha.professional_id, grupo);
    }

    return [...porProfissional.values()].sort((a, b) => b.totalPendente - a.totalPendente);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[comissões] erro inesperado ao listar:", error);
    return [];
  }
}

/**
 * O extrato de pagamentos do período, por profissional.
 *
 * Ordenado por `created_at` decrescente — a MESMA ordem que
 * `revert_commission_payment` usa para decidir qual é o estornável. `paid_at`
 * não serve aqui: é data de negócio, e no seed chega a ser futura.
 *
 * A consulta NÃO filtra por período, e o recorte é feito depois, em memória. O
 * motivo é o botão de estorno: só o pagamento mais recente do profissional pode
 * ser estornado, e "mais recente" é global. Filtrando no banco, um período
 * antigo faria a primeira linha da lista parecer a mais recente e o botão
 * apareceria onde o servidor vai recusar. Uma consulta só, e a dica na tela
 * concorda com a regra do banco.
 */
async function carregarPagamentos(
  shopId: string,
  de: string,
  ate: string,
): Promise<Map<string, PagamentoComissao[]>> {
  const porProfissional = new Map<string, PagamentoComissao[]>();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("commission_payments")
      .select("id, professional_id, amount, payment_method, paid_at, transaction_id")
      .eq("barbershop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[comissões] falha ao listar pagamentos:", error);
      return porProfissional;
    }

    const inicio = faixaDoDia(de).de;
    const fim = faixaDoDia(ate).ate;
    const jaVisto = new Set<string>();

    for (const p of data ?? []) {
      // Primeira aparição do profissional = pagamento mais recente dele.
      const maisRecente = !jaVisto.has(p.professional_id);
      jaVisto.add(p.professional_id);

      if (p.paid_at < inicio || p.paid_at >= fim) continue;

      const lista = porProfissional.get(p.professional_id) ?? [];
      lista.push({
        id: p.id,
        amount: Number(p.amount),
        payment_method: p.payment_method,
        paid_at: p.paid_at,
        // Pagamento sem saída de caixa vinculada veio do backfill da migration;
        // a função recusa estorná-lo, então o botão nem aparece.
        estornavel: maisRecente && p.transaction_id != null,
      });
      porProfissional.set(p.professional_id, lista);
    }

    return porProfissional;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[comissões] erro inesperado ao listar pagamentos:", error);
    return porProfissional;
  }
}
