import type { MetadataRoute } from "next";

/**
 * O manifesto do PWA.
 *
 * É o que permite instalar o PiBarber na tela inicial do celular sem passar
 * por loja de aplicativos. `start_url` aponta para /app — quem instalou é
 * cliente, e ele quer cair na home do app, não na landing de venda.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PiBarber — agendamento para barbearias",
    short_name: "PiBarber",
    description:
      "Encontre barbearias, agende seu horário e acompanhe seus atendimentos.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    dir: "ltr",
    background_color: "#F7F5F2",
    theme_color: "#B87A2E",
    categories: ["lifestyle", "business"],
    // Um SVG só. Ele escala para qualquer tamanho, e apontar para PNGs que
    // não existem daria 404 justamente na hora de instalar.
    // `maskable` deixa o Android recortar no formato do launcher sem cortar a
    // marca — por isso o ícone tem margem interna generosa.
    icons: [
      {
        src: "/icone.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icone.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
