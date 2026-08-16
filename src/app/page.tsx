import {
  ArrowRight,
  BookX,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  HandCoins,
  MessageCircle,
  PhoneOff,
  Scissors,
  Smartphone,
  TrendingUp,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";

import { VejaPorDentro } from "@/components/landing/VejaPorDentro";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LinkButton } from "@/components/ui";
import {
  EMAIL_COMERCIAL,
  LINK_WHATSAPP_COMERCIAL,
  MARCA,
  PRECO,
} from "@/lib/config";
import { absoluta } from "@/lib/env";
import { brl } from "@/lib/utils";

/**
 * O `title` é `absolute` de propósito: o layout raiz define o template
 * "%s · PiBarber", e sem isso esta página viraria "… para barbearia · PiBarber",
 * estourando os ~60 caracteres que o Google mostra e repetindo a marca duas
 * vezes na mesma linha.
 */
export const metadata: Metadata = {
  title: {
    absolute: "Sistema de agendamento para barbearia — agenda, caixa e comissão",
  },
  description:
    "Programa para barbearia com agenda online, ficha de cliente, caixa, fiado e " +
    "controle de comissão. Seus clientes agendam sozinhos pelo celular. " +
    `${PRECO.diasGratis} dias grátis, sem cartão.`,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: MARCA.nome,
    locale: "pt_BR",
    title: "Sistema de agendamento para barbearia — PiBarber",
    description:
      "Agenda online, caixa, fiado e controle de comissão numa tela só. " +
      "Seus clientes agendam sozinhos pelo celular.",
    // A imagem de compartilhamento é uma captura real do painel, a mesma que
    // abre o "veja por dentro". Quem recebe o link no WhatsApp vê o produto,
    // não um cartão com o logotipo.
    images: [
      {
        url: "/capturas/painel-hoje.png",
        width: 2880,
        height: 1800,
        alt: "A tela Hoje do painel do PiBarber, com o movimento do dia",
      },
    ],
  },
};

const ZAP = LINK_WHATSAPP_COMERCIAL;

/* ========================================================================== */

const DORES = [
  {
    icone: PhoneOff,
    titulo: "O telefone toca no meio do corte",
    texto:
      "Você para a máquina, limpa a mão, atende, anota errado. E ainda perde o cliente que ligou e não foi atendido.",
  },
  {
    icone: BookX,
    titulo: "O caderno some, molha, rasura",
    texto:
      "Um horário anotado duas vezes vira cliente esperando em pé. E se o caderno sumir, sumiu a agenda inteira junto.",
  },
  {
    icone: HandCoins,
    titulo: "Você não sabe quem tá devendo",
    texto:
      "O fiado fica na memória. Passa um mês, você não lembra quanto era nem de quando, e acaba deixando pra lá.",
  },
  {
    icone: TrendingUp,
    titulo: "No fim do mês, sobrou quanto?",
    texto:
      "Entrou dinheiro, saiu dinheiro, pagou a comissão da equipe. Se não tá anotado, o mês fecha no achismo.",
  },
] as const;

const RECURSOS = [
  {
    icone: CalendarDays,
    titulo: "Agenda de verdade",
    texto:
      "Uma coluna por profissional, por dia ou por semana. No celular vira lista. O banco recusa dois cortes no mesmo horário — não tem como furar.",
  },
  {
    icone: Smartphone,
    titulo: "O cliente agenda sozinho",
    texto:
      "Ele instala o app na tela inicial, escolhe o serviço, o profissional e o horário. Você só vê aparecer na agenda.",
  },
  {
    icone: Users,
    titulo: "Ficha de cada cliente",
    texto:
      "Histórico, quanto já gastou, quantas faltou, e a observação que só você lê: “máquina 2 nas laterais”.",
  },
  {
    icone: Wallet,
    titulo: "Caixa que fecha",
    texto:
      "Cada atendimento concluído entra no caixa na hora. Pode dividir o pagamento: R$ 40 no pix e R$ 20 no fiado.",
  },
  {
    icone: HandCoins,
    titulo: "Fiado sob controle",
    texto:
      "Quem deve, quanto, e há quantos dias. Os vencidos em destaque, com a cobrança pronta para mandar no WhatsApp.",
  },
  {
    icone: ClipboardList,
    titulo: "Comissão calculada",
    texto:
      "O percentual de cada profissional roda sozinho. Você marca como pago e a saída já entra no caixa.",
  },
  {
    icone: TrendingUp,
    titulo: "Relatório sem planilha",
    texto:
      "Faturamento por dia, serviços que mais vendem, ticket médio, taxa de falta, e a comparação com o mês anterior.",
  },
  {
    icone: UserCog,
    titulo: "Acesso para o assistente",
    texto:
      "Ele agenda, atende e recebe. Faturamento, comissão e relatório ele não vê — e não é menu escondido, é bloqueio no banco.",
  },
] as const;

const PASSOS = [
  {
    numero: "1",
    titulo: "A gente cadastra sua barbearia",
    texto:
      "Você manda o nome, o endereço, os serviços e a equipe. Em pouco tempo sua barbearia está no ar com link próprio.",
  },
  {
    numero: "2",
    titulo: "Você divulga o link",
    texto:
      "Põe na bio do Instagram e manda no grupo do WhatsApp. Quem clicar já agenda direto, sem precisar falar com ninguém.",
  },
  {
    numero: "3",
    titulo: "Você opera do celular",
    texto:
      "Abre a agenda, conclui o atendimento, recebe o pagamento. No fim do dia o caixa já está fechado.",
  },
] as const;

const INCLUI = [
  "Agenda por profissional, sem limite de agendamento",
  "App para os seus clientes agendarem sozinhos",
  "Página pública da barbearia, com link para a bio",
  "Ficha de cliente com histórico e observações",
  "Caixa, fiado e comissão",
  "Relatórios de faturamento e desempenho",
  "Acesso separado para o assistente, sem ver dinheiro",
  "Lista de espera e avaliações",
] as const;

/* ========================================================================== */

/**
 * Dados estruturados — é como o Google entende que esta página descreve um
 * *produto de software*, e não um artigo qualquer sobre barbearia.
 *
 * `offers` declara a mensalidade e o teste grátis, os dois números que a página
 * já mostra na tela. Declarar aqui um preço diferente do que está escrito acima
 * é o tipo de contradição que derruba o rich result inteiro — por isso os dois
 * lados leem a MESMA constante `PRECO`.
 */
const DADOS_ESTRUTURADOS = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: MARCA.nome,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Sistema de agendamento para barbearia",
  operatingSystem: "Web, Android, iOS",
  description:
    "Programa para barbearia com agenda online, ficha de cliente, caixa, fiado e " +
    "controle de comissão. Os clientes agendam sozinhos pelo celular.",
  inLanguage: "pt-BR",
  url: absoluta("/"),
  screenshot: absoluta("/capturas/painel-hoje.png"),
  offers: {
    "@type": "Offer",
    price: PRECO.mensal.toFixed(2),
    priceCurrency: "BRL",
    category: "subscription",
  },
  featureList: [
    "Agenda por profissional, com bloqueio de horário sobreposto",
    "Agendamento online pelo celular do cliente",
    "Ficha de cliente com histórico e observações",
    "Caixa com pagamento dividido",
    "Controle de fiado",
    "Cálculo e pagamento de comissão",
    "Relatórios de faturamento e desempenho",
    "Acesso separado para assistente, sem ver dinheiro",
  ],
  provider: { "@type": "Organization", name: MARCA.autor, email: EMAIL_COMERCIAL },
};

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      {/* JSON-LD. O conteúdo é nosso e fixo — não há entrada de usuário aqui,
          que é o que tornaria este dangerouslySetInnerHTML perigoso de fato. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DADOS_ESTRUTURADOS) }}
      />

      {/* ---------- Topo ---------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {/* Em 375px a linha logo + tema + os dois botões estoura por ~11px
                e alarga o documento inteiro. "Criar conta" é a ação que
                converte, então "Entrar" é a que sai — /criar-conta leva para o
                login de quem já tem conta.

                O `hidden` vai no wrapper, não no botão: o botão já traz
                `inline-flex`, que vence o `hidden` por vir depois no CSS. */}
            <span className="hidden sm:contents">
              <LinkButton href="/entrar" variante="ghost" tamanho="sm">
                Entrar
              </LinkButton>
            </span>
            <LinkButton href="/criar-conta" variante="primary" tamanho="sm">
              Criar conta
            </LinkButton>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Chamada principal ---------- */}
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-brass-soft px-3 py-1 text-xs font-medium text-brass-deep">
                <Scissors className="h-3.5 w-3.5" aria-hidden />
                Feito para barbearia, não para salão genérico
              </span>

              {/* O h1 é curto de propósito: seis palavras cabem em uma linha no
                  celular e batem antes de o polegar rolar.

                  O TERMO DE BUSCA MUDOU DE LUGAR, não sumiu. "Sistema de
                  agendamento para barbearia" abre o parágrafo logo abaixo, e
                  continua no <title>, na descrição e no Open Graph — que é de
                  onde o Google tira o resultado. O h1 passou a fazer o trabalho
                  que só ele faz: convencer em dois segundos. */}
              <h1 className="mt-5 text-4xl leading-[1.1] text-ink sm:text-5xl lg:text-6xl">
                Corte. O resto{" "}
                <span className="text-brass">é com a gente</span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
                Sistema de agendamento para barbearia com agenda online, ficha de cliente,
                caixa, fiado e controle de comissão numa tela só. Seu cliente marca o
                horário sozinho pelo celular, e no fim do dia o caixa já está fechado — sem
                caderno, sem planilha, sem achismo.
              </p>

              {/* Três CTAs, duas audiências. O dono é o primário e vai para o
                  WhatsApp (ele não se cadastra sozinho); o cliente final tem
                  caminho próprio, porque ele TAMBÉM cria conta aqui — e até
                  agora só encontrava o "Criar conta" pequeno do topo.

                  `flex-wrap` em vez de três colunas fixas: em 375px eles
                  empilham em largura total, e a partir de sm acomodam duas
                  linhas sem estourar a caixa. */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <LinkButton
                  href={ZAP}
                  target="_blank"
                  rel="noopener noreferrer"
                  tamanho="lg"
                  larguraTotal
                  className="sm:w-auto"
                  iconeEsquerda={<MessageCircle className="h-5 w-5" aria-hidden />}
                >
                  Quero na minha barbearia
                </LinkButton>
                <LinkButton
                  href="#como-funciona"
                  variante="secondary"
                  tamanho="lg"
                  larguraTotal
                  className="sm:w-auto"
                  iconeDireita={<ArrowRight className="h-4 w-4" aria-hidden />}
                >
                  Ver como funciona
                </LinkButton>
                <LinkButton
                  href="/entrar"
                  variante="outline"
                  tamanho="lg"
                  larguraTotal
                  className="sm:w-auto"
                  iconeEsquerda={<UserRound className="h-5 w-5" aria-hidden />}
                >
                  Sou cliente
                </LinkButton>
              </div>

              <p className="mt-4 text-sm text-ink-faint">
                {PRECO.diasGratis} dias para testar. Sem cartão, sem fidelidade.
              </p>
            </div>

            {/* Prévia da tela Hoje — o que o dono abre 50 vezes por dia. */}
            <div className="border-gradient p-5 shadow-float">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                    Hoje
                  </p>
                  <p className="text-lg font-semibold text-ink">Sexta, 14 ago</p>
                </div>
                <span className="rounded-chip bg-money-soft px-2.5 py-1 text-xs font-medium text-money">
                  8 atendimentos
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-field bg-surface-2 p-3">
                  <p className="text-xs text-ink-faint">Entrou hoje</p>
                  <p className="tnum mt-1 text-xl font-semibold text-money">R$ 640,00</p>
                </div>
                <div className="rounded-field bg-surface-2 p-3">
                  <p className="text-xs text-ink-faint">Em aberto no fiado</p>
                  <p className="tnum mt-1 text-xl font-semibold text-danger">R$ 120,00</p>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-line">
                {[
                  { hora: "14:00", nome: "Marcos Vinícius", servico: "Corte + barba" },
                  { hora: "14:45", nome: "Diego Ramos", servico: "Corte social" },
                  { hora: "15:30", nome: "Paulo Henrique", servico: "Barba" },
                ].map((linha) => (
                  <li key={linha.hora} className="flex items-center gap-3 py-3">
                    <span className="tnum w-12 shrink-0 text-sm font-semibold text-brass">
                      {linha.hora}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {linha.nome}
                      </span>
                      <span className="block truncate text-xs text-ink-faint">
                        {linha.servico}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-chip bg-brass-soft px-2.5 py-1 text-xs font-medium text-brass-deep">
                      Concluir
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- O problema do caderno ---------- */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                O caderno funciona — até o dia em que não funciona.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                Nenhum barbeiro perde cliente por cortar mal. Perde por horário marcado
                errado, por não lembrar de quem devia e por não saber o que sobrou no fim do
                mês.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {DORES.map((dor) => (
                <div
                  key={dor.titulo}
                  className="rounded-card border border-line bg-bg p-5"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-field bg-danger-soft text-danger">
                    <dor.icone className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink">{dor.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{dor.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- O que o sistema faz ---------- */}
        <section id="recursos" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              O que um software para barbearia precisa ter — e nada além disso.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">
              Nada de módulo que você nunca vai abrir. Se o barbeiro não usa toda semana,
              não está aqui.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RECURSOS.map((recurso) => (
              <div
                key={recurso.titulo}
                className="rounded-card border border-line bg-surface p-5 shadow-card"
              >
                <span className="grid h-10 w-10 place-items-center rounded-field bg-brass-soft text-brass-deep">
                  <recurso.icone className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{recurso.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {recurso.texto}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Veja por dentro ----------
            Sem borda e sem `bg-surface`: a seção seguinte ("Como funciona") já é
            uma faixa clara com borda, e duas coladas viram um bloco só com
            linha dupla no meio. Aqui quem separa é o peso do quadro da imagem. */}
        <section id="por-dentro" className="bg-bg">
          <div className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                Veja o programa por dentro, antes de falar com a gente.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                São telas do sistema rodando de verdade — não desenho de como poderia ser.
                Os nomes e valores são de uma barbearia de demonstração.
              </p>
            </div>

            <VejaPorDentro />
          </div>
        </section>

        {/* ---------- Como funciona ---------- */}
        <section
          id="como-funciona"
          className="border-y border-line bg-surface"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                Do primeiro contato ao primeiro agendamento.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                Você não precisa configurar nada sozinho. A gente monta e te entrega
                funcionando.
              </p>
            </div>

            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {PASSOS.map((passo) => (
                <li key={passo.numero} className="relative">
                  <span className="font-display grid h-12 w-12 place-items-center rounded-full bg-brass text-xl font-semibold text-brass-ink">
                    {passo.numero}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-ink">{passo.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {passo.texto}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex items-start gap-3 rounded-card border border-line bg-bg p-5">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brass" aria-hidden />
              <p className="text-sm leading-relaxed text-ink-soft">
                <strong className="font-semibold text-ink">
                  Não precisa mudar como você trabalha.
                </strong>{" "}
                Quem prefere marcar no balcão continua marcando — você lança na agenda em
                dois toques. O app é para quem quiser agendar sozinho, de madrugada, sem te
                incomodar.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Preço ---------- */}
        <section id="preco" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                Um preço só. Sem taxa por agendamento.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-soft">
                Sem cobrança por cliente cadastrado, sem porcentagem em cima do que você
                fatura. Você paga a mensalidade e usa à vontade.
              </p>
              <p className="mt-4 text-sm text-ink-faint">
                Cancelou, para na hora. Sem multa e sem fidelidade.
              </p>
            </div>

            <div className="border-gradient p-6 shadow-float sm:p-8">
              <p className="text-sm font-medium text-brass-deep">Plano único</p>

              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="tnum text-5xl font-semibold text-ink">
                  {brl(PRECO.mensal)}
                </span>
                <span className="text-base text-ink-faint">/mês</span>
              </p>

              <p className="mt-2 text-sm text-ink-soft">
                Os primeiros {PRECO.diasGratis} dias são gratuitos. Não pedimos cartão para
                começar.
              </p>

              <ul className="mt-6 space-y-2.5">
                {INCLUI.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-money"
                      aria-hidden
                    />
                    <span className="text-sm leading-relaxed text-ink-soft">{item}</span>
                  </li>
                ))}
              </ul>

              <LinkButton
                href={ZAP}
                target="_blank"
                rel="noopener noreferrer"
                tamanho="lg"
                larguraTotal
                className="mt-7"
                iconeEsquerda={<MessageCircle className="h-5 w-5" aria-hidden />}
              >
                Começar pelo WhatsApp
              </LinkButton>
            </div>
          </div>
        </section>

        {/* ---------- Contato ---------- */}
        <section id="contato" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20">
            <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              Manda uma mensagem. A gente responde de verdade.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
              Sem formulário comprido e sem robô. Chama no WhatsApp que a gente te mostra o
              sistema rodando e tira suas dúvidas na hora.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <LinkButton
                href={ZAP}
                target="_blank"
                rel="noopener noreferrer"
                tamanho="lg"
                larguraTotal
                className="sm:w-auto"
                iconeEsquerda={<MessageCircle className="h-5 w-5" aria-hidden />}
              >
                Falar no WhatsApp
              </LinkButton>
              <LinkButton
                href={`mailto:${EMAIL_COMERCIAL}`}
                variante="secondary"
                tamanho="lg"
                larguraTotal
                className="sm:w-auto"
              >
                Prefiro por e-mail
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Rodapé ---------- */}
      <footer className="border-t border-line bg-bg">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo tamanho="sm" />
            <p className="mt-2 text-sm text-ink-faint">
              {MARCA.descricao}. Desenvolvido por{" "}
              <span className="font-medium text-ink-soft">{MARCA.autor}</span>.
            </p>
          </div>

          {/* -mx-3 compensa o padding dos links: eles ganham 44px de altura de
              toque sem afastar o texto da margem da coluna. */}
          <nav className="-mx-3 flex flex-wrap text-sm text-ink-soft">
            <a
              href="#recursos"
              className="inline-flex h-11 items-center px-3 transition-colors hover:text-brass"
            >
              Recursos
            </a>
            <a
              href="#por-dentro"
              className="inline-flex h-11 items-center px-3 transition-colors hover:text-brass"
            >
              Por dentro
            </a>
            <a
              href="#como-funciona"
              className="inline-flex h-11 items-center px-3 transition-colors hover:text-brass"
            >
              Como funciona
            </a>
            <a
              href="#preco"
              className="inline-flex h-11 items-center px-3 transition-colors hover:text-brass"
            >
              Preço
            </a>
            <a
              href={ZAP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center px-3 transition-colors hover:text-brass"
            >
              WhatsApp
            </a>
          </nav>
        </div>

        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-faint sm:px-6">
            © {new Date().getFullYear()} {MARCA.autor}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
