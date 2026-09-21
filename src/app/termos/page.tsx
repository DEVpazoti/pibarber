import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { EMAIL_COMERCIAL, LINK_WHATSAPP_COMERCIAL, MARCA, PRECO } from "@/lib/config";
import { brl } from "@/lib/utils";

/**
 * Termos de Serviço — página pública, estática, sem login.
 *
 * Irmã da /privacidade, e pelo mesmo par de motivos: a Meta pede uma URL de
 * termos no cadastro do app, e um serviço que cobra mensalidade e marca
 * horário em nome de terceiros precisa dizer, por escrito, quem responde pelo
 * quê.
 *
 * ⚠️ A DISTINÇÃO QUE O TEXTO INTEIRO DEFENDE: o PiBarber é o lugar onde o
 * horário é marcado; quem corta o cabelo é a barbearia. Preço, prazo de
 * cancelamento e o atendimento em si são dela. Embaralhar isso criaria a
 * expectativa de que a plataforma responde por um corte malfeito ou por uma
 * loja que abriu atrasada — e não responde.
 *
 * Os números do plano saem de `PRECO`, em src/lib/config.ts, que é a mesma
 * constante que a landing usa. Se o preço mudar num lugar, muda nos dois.
 */

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description:
    "As regras de uso do PiBarber: o que a plataforma faz, o que a barbearia faz e o que se espera de cada um.",
  alternates: { canonical: "/termos" },
};

/** Atualize junto com o texto. */
const ATUALIZADO_EM = "20 de setembro de 2026";

export default function TermosDeServico() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Voltar para a página inicial">
            <Logo tamanho="sm" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center text-sm text-ink-soft transition-colors hover:text-brass"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-ink">Termos de Serviço</h1>
        <p className="mt-2 text-sm text-ink-faint">Atualizados em {ATUALIZADO_EM}.</p>

        <p className="mt-6 text-ink-soft">
          Estes termos valem para quem usa o {MARCA.nome} — tanto o cliente que marca um horário
          quanto a barbearia que atende. Ao criar uma conta ou agendar, você concorda com o que
          está escrito aqui. Se não concordar, é só não usar.
        </p>
        <p className="mt-3 text-ink-soft">
          O tratamento dos seus dados está na{" "}
          <Link href="/privacidade" className="text-brass hover:underline">
            Política de Privacidade
          </Link>
          , que faz parte destes termos.
        </p>

        <Secao titulo="1. O que o PiBarber é — e o que ele não é">
          <P>
            O {MARCA.nome} é uma plataforma que conecta clientes a barbearias: ele mostra as
            lojas, os horários livres e registra o agendamento. Também é a ferramenta com que a
            barbearia organiza agenda, clientes e caixa.
          </P>
          <P>
            <strong className="text-ink">Quem corta o cabelo é a barbearia.</strong> Ela define
            os serviços, os preços, a duração, o horário de funcionamento e o prazo de
            cancelamento. O atendimento é um contrato entre você e ela — o {MARCA.nome} não
            presta serviço de barbearia, não emprega os profissionais e não responde pelo
            resultado do atendimento.
          </P>
        </Secao>

        <Secao titulo="2. Sua conta">
          <Lista>
            <li>É preciso ter 18 anos ou mais para criar conta.</li>
            <li>Os dados informados devem ser verdadeiros — principalmente o telefone, que é
              por onde a barbearia e os avisos chegam.</li>
            <li>A senha é sua responsabilidade. Se desconfiar que alguém a descobriu, troque.</li>
            <li>Uma pessoa, uma conta. Criar contas para reservar horários que você não vai
              usar é motivo de bloqueio.</li>
          </Lista>
          <P>
            Um responsável pode cadastrar um dependente (um filho, por exemplo) e agendar o
            atendimento dele. Nesse caso, quem responde pelo agendamento é o responsável.
          </P>
        </Secao>

        <Secao titulo="3. Agendar, cancelar e faltar">
          <P>
            O horário só existe depois que a plataforma confirma. Se dois clientes tocarem no
            mesmo horário ao mesmo tempo, fica com quem confirmou primeiro — o outro recebe o
            aviso na hora e escolhe outro.
          </P>
          <P>
            <strong className="text-ink">Cancelamento:</strong> cada barbearia define com
            quantas horas de antecedência você pode cancelar sozinho. Passado esse prazo, o
            cancelamento é pelo telefone da loja. O prazo aparece na tela do agendamento.
          </P>
          <P>
            <strong className="text-ink">Falta:</strong> não aparecer sem cancelar ocupa um
            horário que outra pessoa queria e é prejuízo para a barbearia. A loja pode
            registrar a falta na sua ficha e, se isso virar hábito, recusar novos agendamentos.
          </P>
          <P>
            A barbearia também pode cancelar ou remarcar — por imprevisto, falta do
            profissional ou fechamento. Nesse caso você é avisado, e nenhum valor é cobrado
            pela plataforma.
          </P>
        </Secao>

        <Secao titulo="4. Pagamento do atendimento">
          <P>
            <strong className="text-ink">Você paga direto na barbearia.</strong> O {MARCA.nome}{" "}
            não processa o pagamento do corte, não cobra taxa do cliente e não guarda dados de
            cartão. Preço, forma de pagamento, desconto e fiado são combinados com a loja.
          </P>
          <P>
            Os valores que aparecem na tela são os informados pela barbearia e servem de
            referência. Divergência no balcão se resolve com ela.
          </P>
        </Secao>

        <Secao titulo="5. Para a barbearia: o plano">
          <P>
            A barbearia usa o {MARCA.nome} por assinatura mensal de{" "}
            <strong className="text-ink">{brl(PRECO.mensal)}</strong>, com os primeiros{" "}
            <strong className="text-ink">{PRECO.diasGratis} dias gratuitos</strong> e sem
            pedido de cartão para testar.
          </P>
          <Lista>
            <li><strong className="text-ink">Sem fidelidade.</strong> Dá para cancelar quando quiser, e o acesso vai até o fim do período já pago.</li>
            <li>A barbearia é responsável pelo que cadastra: dados da loja, preços, fotos e as informações que registra sobre os clientes dela.</li>
            <li>Quem opera a conta — dono e assistentes — responde pelo uso que faz dela.</li>
            <li>Preços de plano podem mudar, com aviso antes de valer para você.</li>
          </Lista>
        </Secao>

        <Secao titulo="6. Avisos e mensagens">
          <P>
            Ao usar a plataforma, você concorda em receber avisos sobre os seus horários —
            confirmação, lembrete e cancelamento — pelo aplicativo e pelo WhatsApp. Eles são
            parte do serviço: um lembrete que não chega vira falta.
          </P>
          <P>
            Não mandamos propaganda por WhatsApp. Para parar de receber, responda{" "}
            <strong className="text-ink">PARAR</strong> na conversa; a saída é imediata e vale
            para todas as barbearias. Detalhes na{" "}
            <Link href="/privacidade" className="text-brass hover:underline">
              Política de Privacidade
            </Link>
            .
          </P>
        </Secao>

        <Secao titulo="7. Avaliações e conteúdo">
          <P>
            Só quem foi atendido pode avaliar, e cada atendimento rende no máximo uma
            avaliação. A barbearia pode responder publicamente.
          </P>
          <P>
            Escreva sobre a sua experiência. Não são aceitos insulto, discriminação, dado
            pessoal de terceiros, acusação sem relação com o atendimento nem avaliação
            comprada. Conteúdo assim pode ser removido, e o uso reincidente leva a bloqueio.
          </P>
          <P>
            O que você escreve continua seu; ao publicar, você autoriza o {MARCA.nome} a exibir
            aquilo na plataforma.
          </P>
        </Secao>

        <Secao titulo="8. Uso proibido">
          <Lista>
            <li>Agendar horário sem intenção de comparecer, ou em nome de outra pessoa sem que ela saiba.</li>
            <li>Usar dados falsos, ou o telefone de outra pessoa.</li>
            <li>Tentar acessar conta, ficha ou dado de quem quer que seja.</li>
            <li>Automatizar acesso, raspar dados, sobrecarregar o sistema ou driblar os limites de segurança.</li>
            <li>Usar a plataforma para o que é ilegal, ou para oferecer serviço que não é o da barbearia.</li>
          </Lista>
          <P>
            Podemos suspender ou encerrar contas que façam isso, sem aviso prévio quando houver
            risco a outras pessoas.
          </P>
        </Secao>

        <Secao titulo="9. Disponibilidade">
          <P>
            Trabalhamos para manter a plataforma no ar, mas ela pode ficar indisponível por
            manutenção, falha de fornecedor ou problema de internet. Não prometemos
            funcionamento ininterrupto.
          </P>
          <P>
            Se a plataforma estiver fora do ar na hora do seu horário, o agendamento continua
            valendo: fale direto com a barbearia.
          </P>
        </Secao>

        <Secao titulo="10. Responsabilidade">
          <P>
            O {MARCA.nome} responde pelo funcionamento da plataforma. Não responde pela
            qualidade do atendimento, pelo atraso, pelo fechamento da loja, pelo preço cobrado
            no balcão nem por acordo feito fora do sistema.
          </P>
          <P>
            Nada aqui afasta os direitos que o Código de Defesa do Consumidor garante a você.
          </P>
        </Secao>

        <Secao titulo="11. Encerrar a conta">
          <P>
            Você pode encerrar sua conta quando quiser, pelo aplicativo ou pedindo pelos canais
            do item 13. O histórico de atendimentos permanece com a barbearia, porque é o
            registro comercial dela — está explicado na{" "}
            <Link href="/privacidade#exclusao-de-dados" className="text-brass hover:underline">
              Política de Privacidade
            </Link>
            .
          </P>
        </Secao>

        <Secao titulo="12. Mudanças nestes termos">
          <P>
            Podemos atualizar estes termos. Mudança relevante é avisada pelo aplicativo antes
            de valer. Continuar usando depois disso significa concordar com a versão nova.
          </P>
        </Secao>

        <Secao titulo="13. Lei aplicável e contato">
          <P>
            Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do
            consumidor para resolver o que não se resolver conversando.
          </P>
          <ul className="mt-2 flex flex-col gap-1 text-ink-soft">
            <li>
              E-mail:{" "}
              <a className="text-brass hover:underline" href={`mailto:${EMAIL_COMERCIAL}`}>
                {EMAIL_COMERCIAL}
              </a>
            </li>
            <li>
              WhatsApp:{" "}
              <a
                className="text-brass hover:underline"
                href={LINK_WHATSAPP_COMERCIAL}
                target="_blank"
                rel="noopener noreferrer"
              >
                falar com o {MARCA.nome}
              </a>
            </li>
          </ul>
        </Secao>

        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-faint">
          © {new Date().getFullYear()} {MARCA.autor}. {MARCA.nome} — {MARCA.descricao}.
        </p>
      </main>
    </div>
  );
}

/* ==========================================================================
   Pedaços da página — iguais aos da /privacidade, de propósito
   ========================================================================== */

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-soft">{children}</p>;
}

function Lista({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-ink-soft marker:text-ink-faint">
      {children}
    </ul>
  );
}
