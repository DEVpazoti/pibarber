import { Esqueleto, EsqueletoCard, Barra } from "@/components/ui/Skeleton";

/**
 * O que o cliente vê enquanto a tela do app carrega. Vale para /app e todas as
 * subrotas (ver o comentário em src/app/painel/loading.tsx).
 *
 * As medidas seguem a home: saudação em h1 de 2xl, a linha da data embaixo, o
 * campo de busca de h-12 e os cartões. O `gap-6` é o mesmo do <div> da página,
 * senão o conteúdo pula para cima quando o esqueleto sai.
 */
export default function CarregandoApp() {
  return (
    <Esqueleto rotulo="Carregando" className="flex flex-col gap-6">
      <div>
        <Barra className="h-8 w-48" />
        <Barra className="mt-1.5 h-4 w-56 max-w-full" />
      </div>

      {/* O campo de busca falso, na altura do de verdade (h-12). */}
      <Barra className="h-12 w-full" />

      <EsqueletoCard className="h-24" />
      <EsqueletoCard className="h-40" />
    </Esqueleto>
  );
}
