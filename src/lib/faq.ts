/**
 * A Central de ajuda.
 *
 * Conteúdo estático, em TypeScript, sem tabela no banco: são seis seções que
 * mudam duas vezes por ano. Uma tabela só acrescentaria uma tela de
 * administração que ninguém ia usar.
 */

export type PerguntaFAQ = { pergunta: string; resposta: string };
export type SecaoFAQ = { numero: number; titulo: string; perguntas: PerguntaFAQ[] };

export const FAQ: SecaoFAQ[] = [
  {
    numero: 1,
    titulo: "Sobre o PiBarber",
    perguntas: [
      {
        pergunta: "O que é o PiBarber?",
        resposta:
          "É um app para você encontrar barbearias, agendar horário e acompanhar seus atendimentos. Uma conta só serve para todas as barbearias da plataforma.",
      },
      {
        pergunta: "Preciso pagar para usar?",
        resposta:
          "Não. Para o cliente é de graça. Quem paga pelo sistema é a barbearia. Você paga só o serviço, direto no balcão.",
      },
      {
        pergunta: "Preciso instalar pela loja de aplicativos?",
        resposta:
          "Não. Abra o PiBarber no navegador do celular e use a opção “Adicionar à tela de início”. Ele passa a abrir como um aplicativo normal.",
      },
    ],
  },
  {
    numero: 2,
    titulo: "Agendamentos e uso do app",
    perguntas: [
      {
        pergunta: "Como agendo um horário?",
        resposta:
          "Busque a barbearia em Buscar, abra o perfil dela e toque em Agendar. Você escolhe o serviço, o profissional, o dia e a hora — e pronto.",
      },
      {
        pergunta: "Posso escolher qualquer profissional?",
        resposta:
          "Pode. E se tanto faz, escolha a opção “Tanto faz”: o sistema encaixa você com quem tiver horário livre, o que costuma abrir mais opções.",
      },
      {
        pergunta: "Posso agendar para outra pessoa?",
        resposta:
          "Sim. Cadastre a pessoa em Perfil → Quem eu agendo, e ela aparece como opção na hora de marcar. É o caso de levar o filho junto.",
      },
      {
        pergunta: "O horário que eu queria não aparece. E agora?",
        resposta:
          "Significa que já foi preenchido ou está fora do expediente. Quando o dia está cheio, o app oferece a lista de espera: se alguém desmarcar, você é avisado.",
      },
    ],
  },
  {
    numero: 3,
    titulo: "Cancelamento e falta",
    perguntas: [
      {
        pergunta: "Como cancelo um agendamento?",
        resposta:
          "Em Agendamentos, toque no horário e escolha Cancelar. Cada barbearia define um prazo mínimo — passado ele, fale direto com a barbearia.",
      },
      {
        pergunta: "E se eu não puder ir e não avisar?",
        resposta:
          "A barbearia registra como falta. Faltar muito atrapalha o barbeiro, que segurou o horário para você. Avise sempre que puder, mesmo em cima da hora.",
      },
      {
        pergunta: "Posso remarcar?",
        resposta:
          "Cancele o horário atual e marque outro. É o caminho mais rápido, e libera o horário para outra pessoa na hora.",
      },
    ],
  },
  {
    numero: 4,
    titulo: "Pagamento na barbearia",
    perguntas: [
      {
        pergunta: "Pago pelo app?",
        resposta:
          "Não. O pagamento é sempre na barbearia, do jeito que vocês combinarem: dinheiro, pix ou cartão.",
      },
      {
        pergunta: "O preço pode mudar depois que eu agendo?",
        resposta:
          "O valor mostrado no agendamento fica registrado. Se você pedir algo a mais na cadeira, o barbeiro acerta a diferença na hora de fechar.",
      },
    ],
  },
  {
    numero: 5,
    titulo: "Conta e segurança",
    perguntas: [
      {
        pergunta: "Como troco minha senha?",
        resposta: "Em Perfil → Segurança. Você informa a senha atual e escolhe uma nova.",
      },
      {
        pergunta: "Entro com Google e com senha. Posso remover um dos dois?",
        resposta:
          "Pode, desde que sobre pelo menos um. Em Perfil → Acessos você vê os métodos vinculados. O último nunca pode ser removido — você ficaria sem entrar.",
      },
      {
        pergunta: "A barbearia vê meus dados?",
        resposta:
          "A barbearia onde você agendou vê seu nome, telefone e o histórico de atendimentos ali. Ela não vê seus agendamentos em outras barbearias.",
      },
      {
        pergunta: "Como excluo minha conta?",
        resposta:
          "Em Perfil → Meus Dados, no fim da tela. A exclusão apaga seus dados pessoais, favoritos e preferências. O histórico de atendimento fica com a barbearia, porque é o registro contábil dela.",
      },
    ],
  },
  {
    numero: 6,
    titulo: "Suporte",
    perguntas: [
      {
        pergunta: "Tenho um problema com um atendimento. Com quem falo?",
        resposta:
          "Fale direto com a barbearia — o telefone e o WhatsApp estão no perfil dela. Quem conduz o atendimento é ela; o PiBarber é a ferramenta de agenda.",
      },
      {
        pergunta: "Encontrei um erro no app.",
        resposta:
          "Escreva para o suporte da PiSystem contando o que você estava fazendo quando o erro apareceu. Quanto mais concreto, mais rápido a gente corrige.",
      },
    ],
  },
];
