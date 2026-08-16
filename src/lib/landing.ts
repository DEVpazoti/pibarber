/**
 * As telas do visualizador "veja por dentro" da landing — T-6.
 *
 * São capturas do sistema rodando de verdade, não mockup: geradas por
 * `scripts/capturar-telas.mjs`, que loga com as contas de teste e fotografa a
 * tela. Todo dado que aparece nelas vem do seed, que é inteiramente fictício.
 * Para refazer, veja `public/capturas/README.md`.
 *
 * As dimensões abaixo são as do arquivo e precisam bater com ele: é o que
 * permite ao `next/image` reservar o espaço antes de a imagem chegar, e é o que
 * evita o deslocamento de layout que estraga o CLS.
 */

import { LINK_WHATSAPP_COMERCIAL } from "@/lib/config";

/** Painel: 1440×900 em telas de 2× — o dono conhece o sistema no computador. */
const PAINEL_LARGURA = 2880;
const PAINEL_ALTURA = 1800;

/** App do cliente: 390×844 em 2× — um iPhone, que é onde ele vive. */
const APP_LARGURA = 780;
const APP_ALTURA = 1688;

export type TelaDoProduto = {
  /** Nome do arquivo em public/capturas, sem extensão. */
  arquivo: string;
  /** O texto do botão que troca para esta tela. */
  rotulo: string;
  /** O que a tela resolve. Uma frase — é legenda, não parágrafo. */
  legenda: string;
  largura: number;
  altura: number;
};

export type VisaoDoProduto = {
  id: string;
  /** O texto do botão que troca de visão. */
  rotulo: string;
  titulo: string;
  texto: string;
  /** `contain` no celular deitado não corta a barra lateral do painel. */
  formato: "desktop" | "celular";
  /**
   * `externo` manda abrir em outra aba — é o caso do WhatsApp. Sem ele o
   * componente usa `next/link`, que só sabe navegar dentro do site.
   */
  cta: { texto: string; href: string; externo?: boolean };
  telas: TelaDoProduto[];
};

export const VISOES: VisaoDoProduto[] = [
  {
    id: "dono",
    rotulo: "Sou dono de barbearia",
    titulo: "O painel que fica aberto o dia inteiro",
    texto:
      "É o que você abre de manhã e fecha à noite. Agenda, caixa, comissão e relatório " +
      "no mesmo lugar, sem planilha no meio.",
    formato: "desktop",
    // Dono NÃO cria conta sozinho — a barbearia é cadastrada pela PiSystem
    // (ver docs/promover-dono.md). Mandar este botão para /criar-conta criava
    // uma conta de CLIENTE para quem queria uma barbearia, e o sujeito ficava
    // preso numa área que não é a dele.
    cta: { texto: "Quero na minha barbearia", href: LINK_WHATSAPP_COMERCIAL, externo: true },
    telas: [
      {
        arquivo: "painel-hoje",
        rotulo: "Hoje",
        legenda:
          "O dia inteiro numa tela: quanto já entrou, quantos ainda faltam atender e o " +
          "botão de concluir do lado de cada nome.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-agenda",
        rotulo: "Agenda",
        legenda:
          "Uma coluna por profissional, por dia ou por semana. O banco recusa dois cortes " +
          "no mesmo horário — agenda furada deixa de existir.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-caixa",
        rotulo: "Caixa",
        legenda:
          "Cada atendimento concluído entra no caixa na hora, com a forma de pagamento. " +
          "O mesmo corte pode ser metade no pix e metade no fiado.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-comissoes",
        rotulo: "Comissões",
        legenda:
          "O controle de comissão da barbearia calculado sozinho, no percentual de cada " +
          "profissional. Dá para pagar o saldo inteiro ou só uma parte.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-relatorios",
        rotulo: "Relatórios",
        legenda:
          "Faturamento por dia, ticket médio, taxa de falta e os serviços que mais vendem, " +
          "comparados com o período anterior.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-clientes",
        rotulo: "Clientes",
        legenda:
          "Todo mundo que já sentou na cadeira, com quanto gastou e quando veio pela última " +
          "vez — venha ele do app, do balcão ou por ordem de chegada.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-fiado",
        rotulo: "Fiado",
        legenda:
          "Quem deve, quanto e há quantos dias. Os vencidos em destaque, com a cobrança " +
          "pronta para mandar no WhatsApp.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-equipe",
        rotulo: "Equipe",
        legenda:
          "Cada profissional com o percentual de comissão e a jornada dele. E o acesso do " +
          "assistente, que agenda e recebe sem ver o faturamento.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
      {
        arquivo: "painel-servicos",
        rotulo: "Serviços",
        legenda:
          "Sua tabela de preços e a duração de cada serviço — é ela que monta os horários " +
          "livres que o cliente enxerga.",
        largura: PAINEL_LARGURA,
        altura: PAINEL_ALTURA,
      },
    ],
  },
  {
    id: "cliente",
    rotulo: "Sou cliente",
    titulo: "O app que o seu cliente instala",
    texto:
      "Ele agenda o horário sozinho, de madrugada, sem te ligar. Instala pelo navegador, " +
      "na tela inicial do celular — sem passar por loja de aplicativos.",
    formato: "celular",
    cta: { texto: "Criar minha conta", href: "/criar-conta" },
    telas: [
      {
        arquivo: "app-inicio",
        rotulo: "Início",
        legenda:
          "O próximo horário em cima de tudo, e os seguintes logo abaixo. Ele abre o app e " +
          "já sabe quando é.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
      {
        arquivo: "app-buscar",
        rotulo: "Buscar",
        legenda:
          "As barbearias mais próximas, com nota e distância. É por aqui que cliente novo " +
          "chega até a sua cadeira.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
      {
        arquivo: "app-agendamentos",
        rotulo: "Agendamentos",
        legenda:
          "Marcar, remarcar e cancelar sem falar com ninguém — e sem ocupar o seu telefone " +
          "no meio do corte.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
      {
        arquivo: "app-perfil",
        rotulo: "Perfil",
        legenda:
          "Histórico de cortes, barbearias favoritas e lista de espera. Tudo que ele " +
          "resolve sozinho é uma pergunta que não chega em você.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
      {
        arquivo: "app-barbearia",
        rotulo: "Sua página",
        legenda:
          "A página pública da sua barbearia, com link próprio para a bio do Instagram. " +
          "É o que o cliente vê quando clica.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
      {
        arquivo: "app-agendar",
        rotulo: "Agendando",
        legenda:
          "Serviço, profissional e horário em três toques. Só aparece horário que existe " +
          "de verdade na sua agenda.",
        largura: APP_LARGURA,
        altura: APP_ALTURA,
      },
    ],
  },
];
