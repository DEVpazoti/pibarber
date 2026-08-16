import { CalendarCheck, Clock3, HandCoins, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

import { AlertaPendencias } from "@/components/painel/AlertaPendencias";
import { ComissaoDoDia } from "@/components/painel/ComissaoDoDia";
import { HojeLista } from "@/components/painel/HojeLista";
import { PageHeader, StatCard } from "@/components/ui";
import { requireShopContext } from "@/lib/auth";
import {
  carregarAgendamentos,
  carregarComissoesDoDia,
  carregarProfissionais,
  carregarResumo,
  carregarServicos,
  contarPendencias,
} from "@/lib/queries/agenda";
import { brl, diaPorExtenso, hojeISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Hoje" };

/**
 * A tela que o barbeiro abre 50 vezes por dia.
 *
 * O ASSISTENTE não vê os cards de dinheiro — e o dado nem é buscado:
 * `dashboard_summary` só devolve as chaves financeiras para quem passa em
 * `can_manage_money`. Esconder com CSS não é esconder.
 */
export default async function PainelPage() {
  const { shopId, podeVerDinheiro } = await requireShopContext();

  // Hoje é resolvido NO SERVIDOR, no fuso de São Paulo. Se viesse do
  // navegador, o atendimento das 23h cairia no dia errado.
  const hoje = hojeISO();

  const [resumo, agendamentos, profissionais, servicos, comissoes, pendencias] =
    await Promise.all([
      carregarResumo(shopId, hoje),
      carregarAgendamentos(shopId, hoje),
      carregarProfissionais(shopId),
      carregarServicos(shopId),
      // A permissão desta é resolvida DENTRO do banco: o dono recebe todos os
      // profissionais, o barbeiro ligado a um acesso recebe só a linha dele, e
      // quem não está ligado a nenhum recebe lista vazia. Por isso ela é
      // buscada sem `if` de papel aqui em cima.
      carregarComissoesDoDia(shopId, hoje),
      contarPendencias(shopId, hoje),
    ]);

  return (
    <>
      <PageHeader titulo="Hoje" descricao={diaPorExtenso(hoje, true)} />

      {/* ANTES dos números do dia, de propósito: enquanto houver pendência, os
          cards abaixo estão contando menos do que a barbearia realmente fez. */}
      <AlertaPendencias quantidade={pendencias} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {podeVerDinheiro ? (
          <StatCard
            rotulo="Entrou hoje"
            valor={brl(resumo?.receita ?? 0)}
            tom="money"
            icone={<TrendingUp className="h-4 w-4" aria-hidden />}
          />
        ) : null}

        <StatCard
          rotulo="Atendimentos"
          valor={resumo?.atendimentos ?? 0}
          dica={`${resumo?.concluidos ?? 0} já concluídos`}
          icone={<CalendarCheck className="h-4 w-4" aria-hidden />}
        />

        <StatCard
          rotulo="Faltam atender"
          valor={resumo?.a_atender ?? 0}
          tom="brass"
          icone={<Clock3 className="h-4 w-4" aria-hidden />}
        />

        {podeVerDinheiro ? (
          <StatCard
            rotulo="Fiado em aberto"
            valor={brl(resumo?.fiado_aberto ?? 0)}
            dica="Total da barbearia, não só de hoje"
            tom="danger"
            icone={<HandCoins className="h-4 w-4" aria-hidden />}
          />
        ) : null}
      </div>

      <HojeLista
        agendamentos={agendamentos}
        profissionais={profissionais}
        servicos={servicos}
        dia={hoje}
        podeVerDinheiro={podeVerDinheiro}
      />

      {/* NO FIM da tela, de propósito: o barbeiro abre esta página para ver a
          agenda, não o próprio bolso. A comissão é o fecho do dia, não a
          manchete. Só aparece para quem tem direito a algum número — o
          assistente que não foi ligado a nenhum profissional não vê o bloco. */}
      {podeVerDinheiro || comissoes.length > 0 ? (
        <ComissaoDoDia
          linhas={comissoes}
          podeVerDinheiro={podeVerDinheiro}
          temPendencias={pendencias > 0}
        />
      ) : null}
    </>
  );
}
