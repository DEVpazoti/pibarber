# PiBarber — Ajustes (rodada 2)

Projeto: **PiBarber** — SaaS de barbearia em **Next.js + Supabase**, com landing page pública, painel do dono/assistente, painel do barbeiro e área do cliente.

Segunda rodada de melhorias, levantada após uso real do sistema. Cada item traz **contexto**, **o que fazer** e **critério de aceite**.

> **Regras gerais:**
> - Leia o código existente antes de alterar. Mantenha o padrão visual, de componentes e de organização já usado no projeto.
> - Toda mudança de banco (colunas, constraints, índices, policies de RLS, funções) deve ser entregue como **SQL separado no final**, para eu rodar manualmente no Supabase. Não assuma que já rodei.
> - Datas e horas sempre no fuso **America/Sao_Paulo**. Vários itens aqui dependem de "que dia é hoje" — cuidado para não comparar data local com UTC.
> - Não quebrar o que já funciona. Ao terminar cada item, confirmar que o projeto ainda compila.

---

## 1. Erro de senha no cadastro limpa o formulário inteiro

**Contexto:** no formulário de criação de conta, quando a senha e a confirmação não coincidem, o sistema mostra corretamente o erro "as senhas não são iguais" — **mas apaga todos os campos já preenchidos** (nome, e-mail, telefone etc.). O usuário precisa digitar tudo de novo, o que é uma péssima experiência e provável ponto de desistência.

**Causa provável a investigar:** o formulário está sendo resetado no submit (reset explícito, remount do componente, `key` mudando, ou um `<form>` recarregando a página por falta de `preventDefault`) em vez de apenas exibir o erro.

**O que fazer:**
- Manter **todos** os valores preenchidos quando ocorrer erro de validação. Só limpar o formulário em caso de sucesso.
- Idealmente, limpar apenas os dois campos de senha (ou nem isso) e manter o foco no campo de confirmação de senha.
- Validar as senhas **em tempo real** (ao digitar/ao sair do campo), e não só no submit — assim o usuário vê o problema antes de tentar enviar.
- Exibir o erro **junto ao campo** correspondente, não só como alerta genérico no topo.
- Aplicar a mesma revisão às **demais validações** do cadastro (e-mail inválido, telefone inválido, senha curta, e-mail já cadastrado): nenhuma delas pode limpar o formulário.
- Revisar também os outros formulários do sistema (login, recuperação de senha, cadastro de barbeiro, cadastro de cliente pelo painel) e corrigir o mesmo comportamento onde existir.
- Garantir que o botão de submit tenha estado de carregamento e não permita duplo envio.

**Critério de aceite:** ao errar a confirmação de senha, aparece a mensagem de erro e **nenhum outro campo é perdido**.

---

## 2. Agendamentos passados que ficaram sem conclusão

**Contexto:** se o barbeiro esquecer de concluir os agendamentos de um dia, todos ficam com status "agendado" para sempre. Consequência: **o faturamento daquele dia não é contabilizado** e o barbeiro nem percebe que ficou pendente. Hoje não existe nenhum lugar que mostre isso de forma clara.

**Definição da regra:** um agendamento entra nessa lista quando **a data do agendamento já passou** (ou seja, é anterior ao dia atual) **e** o status ainda é "agendado" (não concluído, não cancelado). Exemplo: agendamento em 17/08/2026 aparece como pendente a partir de 18/08/2026.

**O que fazer:**
- Criar uma forma clara e visível de o barbeiro resolver essas pendências. Avalie e me proponha a melhor abordagem antes de implementar — as opções são:
  - **(a)** uma aba/seção nova, ex.: "Pendências";
  - **(b)** um bloco fixo no topo da aba Agenda, tipo "Você tem 6 atendimentos de dias anteriores sem conclusão";
  - **(c)** as duas coisas: um alerta na Agenda que leva para a tela dedicada.
  - Minha preferência inicial é a **(c)**, mas quero sua recomendação com justificativa.
- **Badge de contador** visível na navegação sempre que houver pendências (ex.: "Pendências ③"), para o barbeiro não precisar procurar.
- Na tela de pendências, listar os agendamentos agrupados por data (mais antigo primeiro), mostrando: data, horário, cliente, barbeiro, serviço e valor.
- **Ações rápidas por item:** "Concluir", "Não compareceu" e "Cancelar" — resolvíveis com um toque, sem abrir outra tela.
- **Ação em lote:** poder marcar vários (ou "selecionar todos de um dia") e concluir de uma vez. Esse é o caso de uso mais comum: o barbeiro atendeu todo mundo e só esqueceu de registrar.
- Ao concluir, o agendamento deve entrar normalmente no faturamento **da data original do agendamento**, não da data em que foi marcado como concluído. Isso é essencial para o relatório financeiro ficar correto.
- Considerar adicionar o status **"não compareceu"** (no-show) se ainda não existir — é diferente de "cancelado" e ajuda a manter o histórico honesto. Se adicionar, garantir que ele **não** conte no faturamento.
- Confirmação leve nas ações em lote (evitar concluir 20 atendimentos por engano), com possibilidade de desfazer ou reverter o status.
- Estado vazio bem tratado e positivo (ex.: "Tudo em dia — nenhum atendimento pendente").
- Considerar exibir para o **dono da barbearia** uma visão consolidada das pendências de todos os barbeiros.
- Tudo isso precisa funcionar bem **no celular**, que é onde o barbeiro usa.

**Critério de aceite:** o barbeiro percebe sozinho que há pendências, resolve várias de uma vez em poucos toques, e o faturamento dos dias anteriores fica correto.

---

## 3. Comissão do dia na aba "HOJE"

**Contexto:** a aba "HOJE" do painel do barbeiro mostra o movimento do dia, mas não mostra quanto cada barbeiro ganhou de comissão.

**O que fazer:**
- Adicionar, **no final da aba HOJE**, um bloco com a **comissão de cada barbeiro no dia atual**.
- Para cada barbeiro, mostrar: nome, quantidade de atendimentos concluídos, valor total gerado e **valor da comissão**.
- Incluir um total geral do dia ao final do bloco.
- Usar o percentual/regra de comissão já cadastrado no sistema. **Se ainda não existir um campo de comissão por barbeiro, me avise** — nesse caso, proponha o schema (ex.: percentual por barbeiro, com possibilidade de percentual por serviço no futuro) e entregue o SQL.
- Considerar apenas atendimentos **concluídos** no dia. Deixar claro na UI que valores de atendimentos ainda não concluídos não estão contabilizados (conecta com o item 2).
- **Permissão:** o dono/assistente vê a comissão de todos os barbeiros; um barbeiro comum deve ver **apenas a própria comissão**. Garantir isso também na consulta/RLS, não só escondendo na interface.
- Formatação em Real (R$), com separador correto, e layout que não estoure no mobile.

**Critério de aceite:** ao abrir HOJE, o barbeiro vê imediatamente quanto já fez de comissão no dia; o dono vê o de todos; a soma bate com os atendimentos concluídos.

---

## 4. Agendamento sem login (opcional, ativado pelo barbeiro)

**Contexto:** muitos clientes desistem de agendar quando são obrigados a criar uma conta — chegam a desinstalar/abandonar no meio do processo. A ideia é permitir que **cada barbearia decida** se exige cadastro ou não.

**Como deve funcionar:**
- Nas configurações da barbearia, uma opção do tipo: **"Permitir agendamento sem cadastro"** (liga/desliga, padrão a definir — sugiro **desligado** por segurança, mas me diga sua recomendação).
- Com a opção **ligada**, o cliente escolhe serviço, barbeiro, data e horário normalmente, e **ao final** preenche apenas:
  - **Nome completo**
  - **Telefone (WhatsApp)**
- O agendamento é criado sem usuário vinculado, exatamente como um agendamento normal, e aparece na Agenda e na aba Clientes do barbeiro (marcado como "sem cadastro" / origem "site — sem login").
- O cliente deve receber alguma forma de acompanhar/cancelar o agendamento sem conta — ex.: uma página de confirmação com link único (token), que ele pode salvar. Avalie e proponha a solução mais simples que resolva.
- Se o telefone informado **já existir** em um cliente cadastrado daquela barbearia, vincular ao mesmo registro em vez de duplicar.

**Proteção contra abuso (obrigatório, mas sem complicar):**
- Um endpoint público de criação de agendamento é alvo fácil de spam. Implementar proteções **simples e eficazes**:
  - **Limite por telefone:** máximo de agendamentos ativos por número (ex.: 2 ou 3) e limite de agendamentos por dia.
  - **Limite por IP:** máximo de agendamentos criados por IP por dia/hora (ex.: 5 por dia). Registrar o IP no servidor (nunca confiar em dado vindo do cliente) e considerar `x-forwarded-for` na Vercel.
  - **Rate limit no endpoint:** bloquear rajadas de requisições do mesmo IP em curto intervalo.
  - **Validação real do telefone:** formato brasileiro válido, DDD válido, e normalização antes de salvar (só dígitos) para o limite por telefone funcionar de fato.
  - **Honeypot** (campo escondido que bot preenche) — barato e resolve boa parte dos bots simples.
  - Bloquear horários no passado, fora do expediente e horários já ocupados **no servidor**, não só na interface.
- Se algum limite for atingido, mensagem clara e educada para o cliente (sem expor a regra exata).
- **Não** implementar nada complexo (fila, captcha pago, verificação por SMS) nesta etapa. Se você achar que o SMS/OTP é necessário no futuro, apenas me registre a sugestão no resumo final.
- Todas as validações e limites precisam estar no **servidor** (route handler / server action / RLS), porque o formulário é público.
- Registrar em log os bloqueios, para eu conseguir acompanhar se está sendo abusado.

**Banco:** o agendamento precisa aceitar `cliente_id` nulo com `nome` e `telefone` avulsos (isso pode já existir da rodada anterior — reaproveitar, não duplicar). Revisar RLS: a inserção pública só pode criar agendamento na barbearia correta, com a opção habilitada, e **nunca** ler dados de outros clientes.

**Critério de aceite:** com a opção ligada, um cliente novo agenda em poucos toques informando só nome e telefone; com ela desligada, o fluxo antigo continua igual; e o endpoint público tem limites funcionando e testáveis.

---

## 5. Verificar login/cadastro com Google (OAuth)

**Contexto:** o **Google OAuth já está configurado no Supabase** (credenciais e provider ativos). Falta validar se a integração está correta do lado da aplicação.

**O que fazer:**
- Verificar se os botões de **"Entrar com Google"** e **"Cadastrar com Google"** estão realmente disparando o fluxo OAuth do Supabase e não são placeholders.
- Conferir a configuração de **redirect**: `redirectTo` correto, rota de callback existente e funcionando, URLs de redirect cadastradas para **localhost** e para o **domínio de produção (Vercel)**. Me listar exatamente quais URLs preciso ter cadastradas no Supabase e no Google Cloud Console.
- Garantir que o usuário criado via Google receba o papel **cliente**, igual ao cadastro normal (regra da rodada anterior: dono só é promovido manualmente no Supabase).
- Garantir que o **perfil seja criado/preenchido** no primeiro login com Google (nome e foto vindos do Google), sem quebrar se algum campo obrigatório do perfil não vier — ex.: telefone. Se o telefone for necessário, criar uma etapa de complemento de cadastro após o primeiro login.
- Tratar o caso de **e-mail já cadastrado com senha** que depois entra pelo Google (e vice-versa): não pode criar conta duplicada nem dar erro sem explicação.
- Tratar erros e cancelamentos do fluxo OAuth com mensagem clara (usuário fecha a janela, nega permissão, sessão expira).
- Confirmar que após o login o usuário é redirecionado para a área correta conforme o papel (cliente → área do cliente; dono/barbeiro → painel).
- Se algo estiver faltando ou incorreto, corrigir; se depender de configuração fora do código, **me dizer exatamente o que preciso ajustar** no Supabase ou no Google Cloud Console.

**Critério de aceite:** consigo criar conta e entrar com Google, em dev e em produção, com perfil correto, papel cliente e redirecionamento certo — sem conta duplicada.

---

## Ordem sugerida de execução

1. **1** e **5** — rápidos e independentes.
2. **3** — depende de checar se existe campo de comissão.
3. **2** — muda status e relatório financeiro.
4. **4** — o mais sensível (endpoint público + segurança); fazer por último e testar bem.

Ao final, entregar um resumo em tópicos: o que foi feito, decisões de arquitetura tomadas, o SQL para eu rodar no Supabase, o que precisa ser configurado fora do código e o que ficou pendente.
