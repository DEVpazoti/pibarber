import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { EMAIL_COMERCIAL, LINK_WHATSAPP_COMERCIAL, MARCA } from "@/lib/config";
import { dadosSuporte } from "@/lib/suporte";

/**
 * Política de Privacidade — página pública, estática, sem login.
 *
 * Ela existe por duas razões, e as duas importam:
 *
 *   1. LGPD. O PiBarber trata nome, telefone, e-mail e histórico de
 *      atendimento de pessoas físicas. A lei pede que esse tratamento seja
 *      informado em linguagem clara.
 *   2. A Meta EXIGE uma URL de política de privacidade para publicar o app
 *      que manda as mensagens de WhatsApp. Sem esta página, o app fica preso
 *      em modo de desenvolvimento e o webhook só recebe evento de teste.
 *
 * ⚠️ O TEXTO DESCREVE O QUE O CÓDIGO FAZ DE VERDADE. Cada dado citado aqui
 * existe numa coluna do banco, e cada terceiro citado é um serviço que o
 * projeto realmente usa. Mudou o que é coletado, ou entrou um serviço novo,
 * esta página muda junto — uma política que descreve outro sistema é pior do
 * que nenhuma.
 */

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como o PiBarber coleta, usa, compartilha e protege os dados de quem agenda e de quem atende.",
  alternates: { canonical: "/privacidade" },
};

/** Atualize junto com o texto. É a data que o rodapé e a lei pedem. */
const ATUALIZADO_EM = "19 de setembro de 2026";

export default function PoliticaDePrivacidade() {
  const suporte = dadosSuporte();

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
        <h1 className="font-display text-3xl font-semibold text-ink">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-ink-faint">
          Atualizada em {ATUALIZADO_EM}.
        </p>

        <p className="mt-6 text-ink-soft">
          O {MARCA.nome} é uma plataforma de agendamento e gestão para barbearias, desenvolvida
          por {MARCA.autor}. Esta política explica quais dados pessoais tratamos, por quê, com
          quem eles são compartilhados e o que você pode exigir da gente a qualquer momento.
          Ela vale para o site, para o aplicativo do cliente e para o painel usado pelas
          barbearias.
        </p>

        <Secao titulo="1. Quem trata os seus dados">
          <P>
            Há duas responsabilidades diferentes, e é importante separá-las:
          </P>
          <Lista>
            <li>
              <strong className="text-ink">O {MARCA.nome}</strong> ({MARCA.autor}) opera a
              plataforma: a sua conta, a busca por barbearias, o agendamento, as notificações e
              a segurança de tudo isso.
            </li>
            <li>
              <strong className="text-ink">A barbearia que você escolhe</strong> trata a ficha
              que ela mantém sobre você dentro do sistema — seus atendimentos, suas
              preferências de corte, o que você deve ou pagou. Ela decide o que anota ali.
            </li>
          </Lista>
          <P>
            Ou seja: quando você agenda numa barbearia, os seus dados de contato passam a ser
            visíveis para a equipe dela. É o mesmo que aconteceria se você deixasse o seu nome
            e telefone no balcão — só que organizado.
          </P>
        </Secao>

        <Secao titulo="2. Quais dados coletamos">
          <P>
            <strong className="text-ink">Quando você cria uma conta:</strong> nome, e-mail,
            telefone e senha. Opcionalmente, data de nascimento, gênero e foto de perfil. Se
            você entra com o Google, recebemos dele o seu nome, e-mail e foto.
          </P>
          <P>
            <strong className="text-ink">Quando você agenda:</strong> a barbearia, o
            profissional, os serviços, o horário e as observações que você escrever. Se o
            atendimento for para outra pessoa (um filho, por exemplo), o nome e a data de
            nascimento que você cadastrar para ela.
          </P>
          <P>
            <strong className="text-ink">Quando você agenda sem criar conta:</strong> apenas
            nome e telefone. Guardamos também uma versão embaralhada (hash) do endereço de
            origem da requisição, que serve só para conter spam e não permite identificar você.
          </P>
          <P>
            <strong className="text-ink">Se você preencher endereço:</strong> CEP, rua, número,
            complemento, bairro, cidade e estado.
          </P>
          <P>
            <strong className="text-ink">Sua localização:</strong> só quando você toca no
            filtro &ldquo;Próximas&rdquo; e o navegador pede a sua autorização. Ela é usada
            naquele instante para ordenar as barbearias por distância e{" "}
            <strong className="text-ink">não é gravada</strong> no nosso banco.
          </P>
          <P>
            <strong className="text-ink">Uso da plataforma:</strong> barbearias favoritas,
            perfis que você visitou, entradas em lista de espera e avaliações que você escreveu.
          </P>
          <P>
            <strong className="text-ink">A ficha na barbearia:</strong> além do seu contato, a
            barbearia registra o histórico de atendimentos, valores, eventuais faltas, dívidas
            em aberto (fiado) e observações internas dela sobre o seu atendimento.
          </P>
          <P>
            Não coletamos documentos, não pedimos CPF e não processamos dados de cartão — o
            pagamento do atendimento acontece fora da plataforma, direto com a barbearia.
          </P>
        </Secao>

        <Secao titulo="3. Por que usamos esses dados">
          <Lista>
            <li>
              <strong className="text-ink">Para executar o serviço</strong> que você pediu:
              criar e manter sua conta, marcar, alterar e cancelar horários, mostrar seu
              histórico e permitir que a barbearia organize a agenda dela.
            </li>
            <li>
              <strong className="text-ink">Para avisar você</strong> sobre os seus horários:
              confirmação, lembrete e cancelamento, pelo aplicativo e pelo WhatsApp (item 5).
            </li>
            <li>
              <strong className="text-ink">Para proteger a plataforma</strong>: conter robôs e
              agendamentos falsos, que prejudicam as barbearias com horários vazios.
            </li>
            <li>
              <strong className="text-ink">Para cumprir obrigações legais</strong> quando
              formos obrigados a guardar ou apresentar registros.
            </li>
          </Lista>
          <P>
            As bases legais são, conforme o caso, a execução do contrato entre você e o
            {" "}{MARCA.nome}, o cumprimento de obrigação legal, o legítimo interesse (segurança
            e prevenção a fraude) e o seu consentimento — este último para a localização e para
            as mensagens de WhatsApp, que você pode retirar quando quiser.
          </P>
        </Secao>

        <Secao titulo="4. Com quem compartilhamos">
          <P>
            <strong className="text-ink">Nós não vendemos os seus dados</strong>, e não os
            entregamos para publicidade de terceiros.
          </P>
          <Lista>
            <li>
              <strong className="text-ink">Com a barbearia que você escolheu</strong> — nome,
              telefone e os dados do seu agendamento. Sem isso, não há como te atender.
            </li>
            <li>
              <strong className="text-ink">Supabase</strong> — banco de dados, autenticação e
              armazenamento das imagens.
            </li>
            <li>
              <strong className="text-ink">Vercel</strong> — hospedagem do site e do
              aplicativo.
            </li>
            <li>
              <strong className="text-ink">Google</strong> — apenas se você optar por entrar
              com a conta Google, e para converter o endereço das barbearias em coordenadas no
              mapa.
            </li>
            <li>
              <strong className="text-ink">Meta (WhatsApp)</strong> — o seu telefone e o
              conteúdo da mensagem, quando enviamos um aviso de agendamento. Ver o item 5.
            </li>
            <li>
              <strong className="text-ink">Autoridades</strong>, quando houver ordem legal.
            </li>
          </Lista>
          <P>
            Esses serviços podem processar dados fora do Brasil. Nesses casos, a transferência
            é feita com as garantias exigidas pela LGPD.
          </P>
        </Secao>

        <Secao titulo="5. As mensagens de WhatsApp">
          <P>
            O {MARCA.nome} envia mensagens pelo WhatsApp usando a API oficial da Meta. Elas
            partem do <strong className="text-ink">número da plataforma</strong>, não do número
            da barbearia, e são sempre sobre um horário seu:
          </P>
          <Lista>
            <li><strong className="text-ink">Confirmação</strong>, quando você agenda;</li>
            <li><strong className="text-ink">Lembrete</strong>, na véspera do atendimento;</li>
            <li><strong className="text-ink">Cancelamento</strong>, se o horário for cancelado.</li>
          </Lista>
          <P>
            Não enviamos propaganda por WhatsApp, e a barbearia não escreve o texto dessas
            mensagens — ele é fixo, igual para todas.
          </P>
          <P>
            <strong className="text-ink">Para parar de receber</strong>, responda{" "}
            <strong className="text-ink">PARAR</strong> na própria conversa. A saída vale para
            todas as barbearias e é imediata: o que já estava na fila para você é descartado.
            Guardamos o seu número numa lista de dispensa justamente para conseguir respeitar
            esse pedido — ela existe só para isso.
          </P>
          <P>
            Registramos se a mensagem foi entregue e lida, para saber se o aviso chegou. Não
            lemos e não guardamos o conteúdo de outras mensagens que você mandar para esse
            número.
          </P>
        </Secao>

        <Secao titulo="6. Cookies">
          <P>
            Usamos o mínimo: um cookie de sessão, que mantém você conectado, e uma preferência
            de tema (claro ou escuro) guardada no seu próprio navegador.
          </P>
          <P>
            <strong className="text-ink">Não usamos cookies de publicidade</strong> nem
            rastreadores de terceiros para perfilar você.
          </P>
        </Secao>

        <Secao titulo="7. Por quanto tempo guardamos">
          <P>
            Os dados da sua conta ficam enquanto ela existir. Apagando a conta, removemos o seu
            perfil.
          </P>
          <P>
            O histórico de atendimentos permanece com a barbearia, porque é o registro
            comercial dela — assim como a anotação num caderno de balcão. Registros
            financeiros podem ser mantidos pelos prazos legais.
          </P>
          <P>
            O pedido de não receber mensagens é mantido por tempo indeterminado, de propósito:
            apagá-lo faria você voltar a receber.
          </P>
        </Secao>

        <Secao titulo="8. Como apagar seus dados" id="exclusao-de-dados">
          <P>
            <strong className="text-ink">Pelo aplicativo, na hora:</strong> entre na sua conta
            e vá em <strong className="text-ink">Perfil → Meus dados</strong>. Ali você corrige
            o que quiser e encontra a opção de encerrar a conta. Encerrando, o seu perfil, os
            seus favoritos e o seu histórico de navegação na plataforma são removidos.
          </P>
          <P>
            <strong className="text-ink">Por e-mail:</strong> se preferir, ou se não conseguir
            entrar na conta, escreva para{" "}
            <a className="text-brass hover:underline" href={`mailto:${EMAIL_COMERCIAL}`}>
              {EMAIL_COMERCIAL}
            </a>{" "}
            pedindo a exclusão. Respondemos em até 15 dias.
          </P>
          <P>
            <strong className="text-ink">O que não some junto, e por quê:</strong> o registro
            dos atendimentos que você fez continua com a barbearia — é o documento comercial
            dela, como a anotação num caderno de balcão, e pode ser exigido por obrigação
            fiscal. Da mesma forma, se você pediu para não receber mensagens, guardamos o seu
            número numa lista de dispensa: é justamente ela que impede você de voltar a receber.
          </P>
          <P>
            Para entrar no WhatsApp: responda <strong className="text-ink">PARAR</strong> na
            conversa e as mensagens cessam na hora.
          </P>
        </Secao>

        <Secao titulo="9. Os seus direitos">
          <P>A LGPD garante que você pode, a qualquer momento:</P>
          <Lista>
            <li>saber se tratamos dados seus e pedir acesso a eles;</li>
            <li>corrigir dados incompletos ou errados;</li>
            <li>pedir anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>pedir a portabilidade a outro fornecedor;</li>
            <li>saber com quem compartilhamos os seus dados;</li>
            <li>revogar o consentimento — inclusive das mensagens de WhatsApp.</li>
          </Lista>
          <P>
            Boa parte disso você resolve sozinho, na hora, pelo aplicativo: os dados do perfil
            ficam em <strong className="text-ink">Perfil → Meus dados</strong>. Para o resto,
            fale com a gente pelos canais do item 12 — respondemos em até 15 dias.
          </P>
        </Secao>

        <Secao titulo="10. Segurança">
          <P>
            O acesso aos dados é controlado no próprio banco: cada pessoa só enxerga o que lhe
            pertence, e cada barbearia só enxerga os clientes dela. O tráfego é criptografado e
            as senhas nunca são armazenadas em texto claro.
          </P>
          <P>
            Nenhum sistema é infalível. Se acontecer um incidente que possa trazer risco a
            você, avisaremos você e a Autoridade Nacional de Proteção de Dados, como manda a
            lei.
          </P>
        </Secao>

        <Secao titulo="11. Crianças e adolescentes">
          <P>
            A conta é para maiores de 18 anos. Um responsável pode cadastrar um dependente
            (um filho, por exemplo) para agendar o atendimento dele — e nesse caso só pedimos o
            nome e, se quiser, a data de nascimento.
          </P>
        </Secao>

        <Secao titulo="12. Como falar com a gente">
          <P>
            Para qualquer dúvida sobre esta política ou para exercer os seus direitos:
          </P>
          <ul className="mt-2 flex flex-col gap-1 text-ink-soft">
            <li>
              E-mail:{" "}
              <a className="text-brass hover:underline" href={`mailto:${EMAIL_COMERCIAL}`}>
                {EMAIL_COMERCIAL}
              </a>
            </li>
            {suporte.email ? (
              <li>
                Suporte:{" "}
                <a className="text-brass hover:underline" href={suporte.emailLink ?? undefined}>
                  {suporte.email}
                </a>
              </li>
            ) : null}
            <li>
              WhatsApp:{" "}
              <a
                className="text-brass hover:underline"
                href={suporte.whatsappLink ?? LINK_WHATSAPP_COMERCIAL}
                target="_blank"
                rel="noopener noreferrer"
              >
                falar com o {MARCA.nome}
              </a>
            </li>
          </ul>
        </Secao>

        <Secao titulo="13. Mudanças nesta política">
          <P>
            Se algo mudar no que coletamos ou em como usamos, atualizamos esta página e a data
            do topo. Mudança relevante é avisada pelo aplicativo.
          </P>
        </Secao>

        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-faint">
          © {new Date().getFullYear()} {MARCA.autor}. {MARCA.nome} — {MARCA.descricao}.
        </p>
      </main>
    </div>
  );
}

/* ==========================================================================
   Pedaços da página
   ========================================================================== */

function Secao({
  titulo,
  id,
  children,
}: {
  titulo: string;
  /** Vira âncora (`/privacidade#id`). A Meta aponta o campo de exclusão de
      dados para a seção 8 — se o id mudar, o link do painel quebra. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8" id={id}>
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
