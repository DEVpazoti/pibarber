import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import { urlDoSite } from "@/lib/env";
import { SCRIPT_TEMA } from "@/lib/theme";

import "./globals.css";

// Inter carrega todo o texto; Fraunces só a marca e os h1.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  // Com `metadataBase`, todo caminho relativo de canonical e de Open Graph vira
  // URL absoluta sozinho. Sem ele o Next avisa no build e cai numa origem
  // adivinhada — e a imagem de compartilhamento simplesmente não aparece.
  metadataBase: new URL(urlDoSite()),
  title: {
    default: "PiBarber — agendamento e gestão para barbearias",
    template: "%s · PiBarber",
  },
  description:
    "Agenda, clientes, caixa, comissão e fiado numa tela só. Seus clientes agendam sozinhos pelo celular, sem você parar o corte para atender o telefone.",
  applicationName: "PiBarber",
  authors: [{ name: "PiSystem" }],
  openGraph: {
    title: "PiBarber — agendamento e gestão para barbearias",
    description:
      "Seus clientes agendam sozinhos. Você acompanha agenda, caixa e fiado do celular.",
    siteName: "PiBarber",
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0C0E" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // libera o env(safe-area-inset-*) no iPhone
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning` no <html> é OBRIGATÓRIO aqui, e não é remendo.
     *
     * O SCRIPT_TEMA logo abaixo roda no <head>, antes da primeira pintura, e
     * carimba `data-theme="dark"` no <html>. Ou seja: quando o React vai
     * hidratar, o elemento raiz do DOM tem um atributo que o HTML do servidor
     * não tinha — e o React acusa "some attributes of the server rendered HTML
     * didn't match the client properties".
     *
     * As três saídas possíveis, e por que esta é a certa:
     *
     *   1. Tirar o script  → volta o flash de tema errado no primeiro frame.
     *      É o problema que o script existe para resolver.
     *   2. Renderizar o tema no servidor → exigiria cookie em vez de
     *      localStorage e tornaria TODA página dinâmica. Preço alto demais
     *      por um atributo.
     *   3. Suprimir o aviso NESTE elemento → é o caso de uso para o qual a
     *      prop foi criada.
     *
     * ⚠️ Ela vale UM NÍVEL SÓ: silencia os atributos do próprio <html> e nada
     * mais. Divergência dentro da árvore continua sendo acusada normalmente —
     * isto não é um "ignorar tudo".
     */
    <html
      lang="pt-BR"
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Antes da primeira pintura, para o tema escuro não piscar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        {children}
        {/* Só habilita "Adicionar à tela de início". Sem cache offline. */}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
