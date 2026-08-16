import { Esqueleto, Barra } from "@/components/ui/Skeleton";

/**
 * O que o visitante vê enquanto o perfil público carrega.
 *
 * Esta é a página que converte: quem chega pela bio do Instagram cai aqui, e
 * uma tela em branco de meio segundo é onde se perde cliente novo. Diferente do
 * painel, aqui não há layout nenhum em volta — a página desenha a casca
 * inteira, então o esqueleto precisa desenhar a casca inteira também.
 *
 * As medidas seguem `page.tsx`: capa de h-40/sm:h-52, o avatar `xl` subindo
 * -mt-10 por cima dela, o h1 de 2xl, e a barra fixa da base com o botão de
 * 50px. A largura máxima é a mesma 560px.
 */
export default function CarregandoPerfil() {
  return (
    <Esqueleto rotulo="Carregando a barbearia" className="min-h-dvh bg-bg pb-28">
      <div className="mx-auto max-w-[560px]">
        {/* Capa */}
        <div className="skeleton h-40 w-full sm:h-52" aria-hidden />

        <div className="px-4">
          {/* Avatar subindo por cima da capa, como no perfil de verdade. */}
          <div className="-mt-10 flex items-end gap-3">
            <Barra className="h-24 w-24 shrink-0 rounded-chip" />
            <div className="flex-1 pb-1">
              <Barra className="h-6 w-28 rounded-chip" />
            </div>
          </div>

          <Barra className="mt-3 h-8 w-3/5" />
          <Barra className="mt-1.5 h-4 w-40" />

          {/* Contato */}
          <div className="mt-5 flex flex-col gap-2">
            <Barra className="h-14 w-full rounded-card" />
            <div className="flex gap-2">
              <Barra className="h-12 flex-1" />
              <Barra className="h-12 flex-1" />
            </div>
          </div>

          {/* A fita de abas e o painel aberto */}
          <div className="mt-6 flex gap-2">
            {["w-20", "w-20", "w-16", "w-24", "w-24"].map((largura, i) => (
              <Barra key={i} className={`h-9 shrink-0 rounded-chip ${largura}`} />
            ))}
          </div>
          <Barra className="mt-4 h-72 w-full rounded-card" />
        </div>
      </div>

      {/* A chamada fixa da base existe desde o primeiro instante: sem ela o
          botão "Agendar" apareceria de repente e empurraria a tela. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-safe pt-3 backdrop-blur">
        <div className="mx-auto max-w-[560px] pb-3">
          <Barra className="h-[50px] w-full" />
        </div>
      </div>
    </Esqueleto>
  );
}
