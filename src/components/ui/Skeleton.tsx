import { cn } from "@/lib/utils";

/**
 * Barra cinza que pulsa enquanto o dado não chegou.
 *
 * O shimmer em si já existia como utilitário `skeleton` no globals.css e já
 * era usado à mão em dois componentes (BookingWizard e BuscaBarbearias). Isto
 * aqui só dá nome à coisa — não inventa animação nova.
 *
 * Sempre `aria-hidden`: quem usa leitor de tela não quer ouvir sete barras
 * anunciadas uma a uma. Quem avisa é o `<Esqueleto>` em volta, com uma frase.
 */
export function Barra({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-field", className)} aria-hidden />;
}

/**
 * A moldura de um esqueleto de página inteira.
 *
 * `role="status"` + `aria-busy` fazem o leitor de tela anunciar "Carregando"
 * uma vez, em vez de ler o desenho. Sem isto o esqueleto seria melhora só para
 * quem enxerga.
 */
export function Esqueleto({
  children,
  rotulo = "Carregando",
  className,
}: {
  children: React.ReactNode;
  rotulo?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{rotulo}…</span>
      {children}
    </div>
  );
}

/**
 * Cabeçalho de página em esqueleto, nas medidas do <PageHeader> de verdade:
 * h1 de 2xl/3xl e a descrição de `text-sm` embaixo, com o mesmo `mb-5`.
 * Bater as medidas é o ponto — esqueleto que não bate vira deslocamento de
 * layout na troca, que é pior do que não ter esqueleto.
 */
export function EsqueletoCabecalho({ comDescricao = true }: { comDescricao?: boolean }) {
  return (
    <div className="mb-5">
      <Barra className="h-8 w-44 sm:h-9" />
      {comDescricao ? <Barra className="mt-1.5 h-4 w-60 max-w-full" /> : null}
    </div>
  );
}

/** Bloco no formato do <Card>: mesmo raio, mesma borda, mesma sombra. */
export function EsqueletoCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-card border border-line bg-surface p-4 shadow-card", className)}
      aria-hidden
    >
      <Barra className="h-4 w-1/3" />
      <Barra className="mt-3 h-3 w-2/3" />
      <Barra className="mt-2 h-3 w-1/2" />
    </div>
  );
}

/** Lista de linhas dentro de um card só — o formato de quase toda tela de lista. */
export function EsqueletoLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-hidden>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line p-4 last:border-b-0">
          <Barra className="h-10 w-10 shrink-0 rounded-chip" />
          <div className="min-w-0 flex-1">
            <Barra className="h-3.5 w-2/5" />
            <Barra className="mt-2 h-3 w-3/5" />
          </div>
          <Barra className="h-3.5 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}
