import {
  Esqueleto,
  EsqueletoCabecalho,
  EsqueletoLista,
  Barra,
} from "@/components/ui/Skeleton";

/**
 * O que o dono vê enquanto a tela do painel carrega.
 *
 * Vale para /painel e TODAS as subrotas — no App Router um `loading.tsx` cobre
 * o segmento e os descendentes que não tiverem o seu próprio.
 *
 * POR QUE ISTO EXISTE (G2 do PERFORMANCE.md): sem este arquivo, clicar em
 * "Caixa" na lateral deixava a tela ANTERIOR congelada por ~1,4 s — medido, não
 * suposto (`node scripts/medir.mjs macio`). O servidor não ficou mais rápido
 * com este arquivo; o que muda é que a troca passa a ter resposta imediata.
 *
 * POR QUE O DESENHO É NEUTRO: metade das telas do painel abre com uma fileira
 * de <StatCard> (Hoje, Caixa, Comissões, Fiado, Relatórios, Avaliações) e a
 * outra metade não (Agenda, Clientes, Serviços, Equipe, Espera, Configurações).
 * Um esqueleto com os tiles acertaria seis telas e provocaria deslocamento de
 * layout nas outras seis — e esqueleto que salta na troca é pior do que não ter
 * esqueleto. A faixa de controles abaixo do título, essa sim, existe em todas:
 * ora filtro, ora busca, ora navegação de data.
 */
export default function CarregandoPainel() {
  return (
    <Esqueleto rotulo="Carregando a tela">
      <EsqueletoCabecalho />

      {/* A faixa de controles: filtro, busca ou navegação de data. */}
      <Barra className="mb-6 h-11 w-full max-w-sm" />

      <EsqueletoLista linhas={6} />
    </Esqueleto>
  );
}
