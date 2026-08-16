# Prompts para gerar o PiBarber

**Desenvolvido por PiSystem.**

> **Como usar.** Cada bloco `PROMPT N` é uma mensagem para colar no Opus 5, **uma de cada
> vez, na ordem**. Não cole tudo junto — pedido gigante gera código incompleto que parece
> pronto e quebra na hora de usar.
>
> **Antes do PROMPT 0:** crie a pasta do projeto e coloque o `ESPECIFICACAO.md` dentro. Todo
> prompt manda a IA ler esse arquivo — ele é a fonte da verdade, o prompt é só a ordem de
> serviço.
>
> **Depois de cada etapa:** rode `npx tsc --noEmit`, abra o navegador e confira o que a
> etapa prometia. Só avance com a anterior funcionando.

---

## PROMPT 0 — Fundação, design system e landing

```
Você vai construir o PiBarber, uma plataforma de agendamento e gestão para barbearias,
desenvolvida pela PiSystem.

Leia o arquivo ESPECIFICACAO.md por inteiro antes de escrever qualquer código. Ele é a
fonte da verdade sobre escopo, banco, telas e visual. Se algo neste prompt conflitar com
ele, a especificação vence.

Nesta primeira etapa entregue APENAS a fundação:

1. Projeto Next.js 15 com App Router, React 19, TypeScript estrito e Tailwind CSS v4.
   Sem tailwind.config.js — os tokens vão no @theme dentro de globals.css.

2. O design system completo em src/app/globals.css seguindo a seção 9 da especificação:
   todos os tokens de cor, as sombras, os raios, e o tema escuro cobrindo os TRÊS estados
   (:root, @media prefers-color-scheme com a guarda :root:not([data-theme="light"]), e
   :root[data-theme="dark"]), porque vai existir um botão manual de tema.

3. Fontes Fraunces (só marca e h1) e Inter (todo o resto) via next/font/google.

4. As primitives em src/components/ui/: Button, Card, Field, Input, Select, Modal, Sheet,
   Chip, EmptyState, StatCard, Avatar, Rating, PageHeader. Siga a seção 9.3 — campo com
   fundo suave sem borda e 48px de altura, botão primário em latão de largura total no
   celular, ação destrutiva como texto vermelho sem caixa.

5. src/lib/utils.ts com: brl() para dinheiro, formatação de data e hora em pt-BR, máscara
   de telefone e de CEP, e o helper one<T>() descrito na especificação.

6. O alternador de tema claro/escuro, persistindo a escolha e sem piscar na primeira
   renderização.

7. A landing em src/app/page.tsx, vendendo o PiBarber para o dono de barbearia. Seções:
   chamada principal, o problema do caderno, o que o sistema faz, como funciona, preço, e
   contato por WhatsApp. Rodapé com "Desenvolvido por PiSystem". Português do Brasil, tom
   direto, falando a língua do barbeiro.

Regras válidas para TODAS as etapas:
- Server Components por padrão; "use client" só com estado, evento ou hook de navegador.
- Português do Brasil na interface, rotas e comentários. Inglês em tabela, coluna e função.
- npx tsc --noEmit tem que passar limpo.
- Nunca use cor crua do Tailwind (text-red-500, bg-gray-100). Só token.
- Alvo de toque mínimo de 44px.

NÃO crie ainda: banco, autenticação, app do cliente ou painel. Só a fundação e a landing.

Ao terminar, rode npx tsc --noEmit e me diga o que ficou pronto.
```

---

## PROMPT 1 — O banco

```
Continuando o PiBarber. Releia a ESPECIFICACAO.md, principalmente a seção 5 (O banco).

Escreva os scripts SQL na pasta supabase/. Eles vão rodar no SQL Editor do Supabase na
ordem numérica. Cada arquivo precisa executar de ponta a ponta sem erro, e ser idempotente
onde der (if not exists, create or replace).

01_schema.sql
  - extensões pgcrypto e btree_gist
  - os 9 enums
  - as 21 tabelas com as colunas exatas da seção 5
  - as foreign keys, com on delete restrict onde a especificação manda
  - a constraint appointments_no_overlap (EXCLUDE USING gist) — obrigatória
  - os índices da seção 5.10

02_functions.sql
  - triggers handle_new_user(), barbershop_after_insert() e review_after_insert()
  - os helpers SECURITY DEFINER da seção 5.12
  - as funções de negócio da seção 5.11

  Atenção especial em três delas:

  complete_appointment — faz tudo numa transação só: conclui, lança cada forma de pagamento
  no caixa, cria a dívida se houver fiado, gera a comissão, atualiza total_visits /
  total_spent / last_visit_at do cliente, e cria a notificação pedindo avaliação. Se a soma
  dos pagamentos não bater com total_price - desconto, levante exceção em português.

  get_available_slots — respeita horário da loja, jornada individual do profissional (que é
  OPCIONAL: sem linha em professional_schedules vale o horário da loja), intervalo de
  almoço, folgas em time_off, antecedência mínima e máxima, e os agendamentos existentes.

  search_barbershops — cobre os três filtros da busca do app: por nome, por cidade, e por
  proximidade usando Haversine (sem PostGIS). Devolve nota média e a distância em km.

  Comente cada função explicando a regra de negócio em português.

03_rls.sql
  - habilite RLS nas 21 tabelas
  - policies usando os helpers: dado financeiro com can_manage_money, dado operacional com
    has_shop_access
  - leitura pública por anon, SÓ de loja ativa: barbershops, services, professionals,
    business_hours e reviews. Todo o resto exige autenticação.
  - o cliente só enxerga os próprios dados: appointments, favorites, shop_visits,
    notifications, dependents, user_addresses, waitlist_entries e reviews dele
  - grants para authenticated e anon

  Atenção: o assistente NÃO pode ler transactions nem commissions. É isso que faz a regra
  "assistente não vê faturamento" valer de verdade, mesmo chamando a API REST direto com a
  chave anônima.

04_seed.sql
  - 4 barbearias de exemplo em cidades diferentes, com latitude e longitude reais, para a
    busca por proximidade ter o que devolver
  - cada uma com 2 a 4 profissionais, 8 serviços realistas com preço e duração, e horário
    de segunda a sábado
  - uns 30 clientes e 80 agendamentos espalhados nas últimas semanas em vários status
  - algumas avaliações, para a nota média aparecer nos cartões

05_criar_admin.sql   — marca uma conta como is_platform_admin, por e-mail
06_apagar_dados.sql  — apaga uma barbearia de teste na ordem certa das FKs

Ao terminar, me diga em que ordem rodar e o que conferir em cada script.
```

**Depois deste prompt:** rode os 4 primeiros no SQL Editor do Supabase, na ordem. Se der
`42601: unterminated dollar-quoted string`, você copiou um bloco `do $$` pela metade —
falta o `end; $$;`.

---

## PROMPT 2 — Autenticação e as duas cascas

```
Continuando o PiBarber. Releia as seções 3 (papéis), 6.1 (a casca do app) e 11
(convenções) da ESPECIFICACAO.md.

1. src/lib/supabase/ com três clientes: client.ts (navegador), server.ts (Server Components
   e actions, com cookies) e admin.ts (service role — só em action que já confirmou o papel
   de quem chamou).

2. src/lib/auth.ts com getProfile() cacheado por request, requireProfile(), requireRole() e
   requireShopContext(). Todo catch nesses arquivos chama unstable_rethrow(error) na
   PRIMEIRA linha, antes do console.error — redirect() e notFound() do Next viajam como
   exceção e um catch genérico as engole silenciosamente.

3. src/middleware.ts — refresh de sessão e redirecionamento por prefixo:
   /app exige client, /painel exige owner ou assistant, /admin exige is_platform_admin.
   Depois do login, mande cada papel para a casa dele: client → /app, owner e assistant →
   /painel.

4. Telas /entrar e /criar-conta, com e-mail e senha E login com Google, mais a rota de
   callback do OAuth. As actions em src/app/actions/auth.ts.
   Lembre: o cadastro público SEMPRE cria um client. O papel nunca vem do formulário.

5. A casca do APP DO CLIENTE em src/app/app/layout.tsx:
   - barra inferior fixa com 4 abas: Início, Buscar, Agendamentos, Perfil
   - aba ativa em latão com ícone preenchido; inativas em cinza com ícone de traço
   - respeite env(safe-area-inset-bottom) para o iPhone
   - cabeçalho com a logo, o sino de notificações (com ponto em latão quando há não lidas)
     e o alternador de tema
   - no desktop, centralize com largura máxima de 480px — não invente um layout diferente

6. A casca do PAINEL em src/app/painel/layout.tsx: barra lateral no desktop e menu inferior
   no celular, montada a partir do papel:
   - owner: Hoje, Agenda, Clientes, Serviços, Equipe, Lista de espera, Avaliações, Caixa,
     Comissões, Fiado, Relatórios, Configurações
   - assistant: Hoje, Agenda, Clientes, Serviços, Lista de espera, Fiado
   Nunca renderize o item de menu que o papel não pode acessar.

7. src/lib/types.ts com os tipos do domínio espelhando o schema, e
   ActionResult<T> = { ok: boolean; message?: string; data?: T }.

8. Páginas placeholder em cada rota das duas áreas, para a navegação já funcionar de ponta
   a ponta.

Toda página chama requireRole() no topo. Não confie só no middleware.

Ao terminar, rode npx tsc --noEmit e me diga como testar cada papel.
```

---

## PROMPT 3 — A agenda do painel (o coração)

```
Continuando o PiBarber. Esta é a etapa mais importante do painel — é a tela que o barbeiro
abre 50 vezes por dia. Capriche na ergonomia de celular.

1. /painel — a tela "Hoje":
   - dono: cards com quanto entrou hoje, atendimentos do dia, quantos faltam atender, e o
     total em aberto no fiado
   - assistente: os MESMOS cards menos os que têm valor em dinheiro. Não renderize E não
     busque o dado — esconder com CSS não é esconder
   - abaixo, a agenda de hoje em ordem de horário, cada linha com cliente, serviço,
     profissional e botão de concluir

2. /painel/agenda — a grade:
   - alternância entre dia e semana
   - no dia: uma coluna por profissional, blocos posicionados pelo horário
   - navegação entre datas e botão "hoje"
   - cor do bloco pelo status
   - clicar num vazio abre o novo agendamento naquele horário
   - clicar num bloco abre o detalhe com as ações
   - no celular vira lista vertical agrupada por horário. Não tente espremer a grade.

3. NewAppointmentDialog — escolhe cliente (busca por nome ou telefone, ou cadastra na hora),
   profissional, um ou mais serviços, e o horário. Total e duração se recalculam conforme os
   serviços. Chama book_appointment.

4. CompleteDialog — o mais delicado do sistema. Mostra o total, permite desconto, e permite
   dividir o pagamento em várias formas (ex: 40 no pix + 20 fiado). Se houver fiado, pede a
   data de vencimento. Mostra o quanto ainda falta somar e só habilita o botão quando bate
   com o total menos o desconto. Chama complete_appointment.
   Um erro aqui vira dinheiro errado no caixa — capriche na clareza.

5. src/app/actions/appointments.ts — criar, concluir, cancelar, marcar falta. Toda action
   devolve ActionResult e traduz o erro do Postgres para português. Em especial: a violação
   da constraint appointments_no_overlap vira "Esse profissional já tem atendimento nesse
   horário."

Nunca descarte o error do Supabase. Sempre desestruture { data, error } e logue com um
prefixo de contexto.

Ao terminar, rode npx tsc --noEmit e me diga o que testar.
```

---

## PROMPT 4 — Clientes, serviços e equipe

```
Continuando o PiBarber.

1. /painel/clientes
   - lista com busca por nome e telefone, mostrando última visita e total gasto
   - ficha: dados, o campo de observações (é onde vai "máquina 2 nas laterais" — deixe
     visível e fácil de editar, e lembre que ele NUNCA aparece para o cliente), histórico de
     atendimentos, total gasto, faltas, e o que está devendo
   - criar e editar cliente
   - botão de WhatsApp que abre wa.me com o telefone preenchido

   Atenção ao modelo: profiles é o perfil global da pessoa na plataforma; customers é a
   ficha dela DENTRO desta barbearia. Uma pessoa tem 1 perfil e N fichas. Reveja a seção 5.6
   da especificação antes de escrever esta tela.

2. /painel/servicos — nome, descrição, preço, duração, ativo. Criar, editar, ativar,
   desativar, ordenar. O assistente vê mas não edita.

3. /painel/equipe — só o dono. Duas seções:
   - Profissionais: nome, apelido, bio, foto, percentual de comissão, ativo, e a jornada
     semanal. A jornada é OPCIONAL — vazio significa "segue o horário da loja". Deixe isso
     explícito na interface, senão confunde. Também registre folga e férias em time_off.
   - Acessos: os assistentes. O dono cria informando nome, e-mail e senha provisória; a
     senha aparece na tela para ele copiar. A action usa createAdminClient(), define
     role='assistant' e grava profiles.barbershop_id. Confirme que quem chamou é o dono
     daquela barbearia ANTES de tocar na service role.

4. As actions em customers.ts, services.ts e team.ts.

Todo estado vazio ensina o próximo passo, com um botão que leva à ação.

Ao terminar, rode npx tsc --noEmit.
```

---

## PROMPT 5 — O dinheiro

```
Continuando o PiBarber. Estas telas são exclusivas do dono — requireRole(["owner"]) no topo
de cada uma, e a RLS já bloqueia o assistente no banco.

1. /painel/caixa
   - seletor de período (hoje, semana, mês, personalizado)
   - três cards: entrou, saiu, sobrou
   - extrato unificado, entradas em verde e saídas em vermelho
   - filtro por forma de pagamento e por categoria
   - lançar despesa manual (valor, categoria, descrição, data)

2. /painel/comissoes
   - por profissional: acumulado e pendente no período
   - o detalhe do que compõe o valor, atendimento por atendimento
   - "marcar como pago" fecha o lote, registra a data e lança a saída correspondente no
     caixa
   - histórico do que já foi pago

3. /painel/fiado
   - quem deve, ordenado pelo mais antigo, com há quantos dias
   - vencidos em destaque
   - receber com pagamento parcial e forma de pagamento; chama pay_debt, que lança no caixa
     e recalcula o status
   - botão de WhatsApp com cobrança pronta, educada e curta
   - total geral em aberto no topo

4. src/app/actions/money.ts.

Todo valor usa brl() e a classe .tnum. Sem isso as colunas desalinham e o financeiro parece
amador.

Ao terminar, rode npx tsc --noEmit.
```

---

## PROMPT 6 — O app do cliente

```
Continuando o PiBarber. Agora o app do cliente — a parte que mais gente vai usar. Releia a
seção 6 inteira da ESPECIFICACAO.md, ela descreve cada tela em detalhe.

Mobile em primeiro lugar, sem exceção. Teste tudo em 375px de largura.

1. /app — Início:
   - "Olá, {primeiro nome}" com o nome em latão, e a data por extenso abaixo em cinza
   - campo de busca que ao focar navega para /app/buscar
   - "Último agendamento": card em destaque com BORDA EM GRADIENTE (latão → âmbar), logo da
     barbearia, nome, serviço, data e hora, chevron. É o elemento mais chamativo da tela.
   - "Últimos acessos" com botão "Editar lista" que liga o modo de remoção. Cada item:
     avatar circular com anel em gradiente, badge de nota sobreposto no canto, nome,
     endereço truncado, chevron. Vem de shop_visits, os 5 mais recentes.
   - estado vazio para cliente novo, com botão "Encontrar uma barbearia"
   - use a função client_home() para montar tudo numa chamada só

2. /app/buscar:
   - campo de busca, com foco automático quando chega vindo da home
   - três chips, um ativo por vez: Nome, Cidade, Próximas
   - "Próximas" pede permissão de localização. Se o cliente negar, mostre um aviso educado
     com a opção de buscar por cidade. NUNCA deixe a tela travada num pedido negado.
   - cartão de resultado: capa, logo, nome, nota com estrela, nº de avaliações, bairro e
     cidade, distância em km quando houver, e coração de favoritar
   - estado vazio inicial com ilustração de lupa; e um estado diferente para "nada
     encontrado"

3. /app/agendamentos:
   - título grande "Meus Agendamentos"
   - dropdown "Filtrar por estabelecimento", trazendo só onde ele já agendou
   - seções "Em aberto" e "Anteriores"
   - card: logo e nome da barbearia, serviço, profissional, data e hora em destaque, chip de
     status
   - ações por status: cancelar (respeitando cancel_deadline_hours), como chegar, avaliar
     (quando concluído e sem avaliação), agendar de novo
   - vazio: "Nenhum agendamento em aberto" com botão "Agendar agora"

4. /app/perfil — o menu, exatamente com os 9 itens da seção 6.5, cada um com ícone, título,
   subtítulo em cinza e chevron, linha inteira clicável. Cabeçalho com avatar grande e botão
   de câmera em latão. "Sair" em vermelho, centralizado, sem caixa.

5. As 9 subpáginas:
   - /dados: nome, nascimento, celular com máscara, gênero opcional (Masculino/Feminino/
     Outros), botão Salvar de largura total, e "Excluir conta" em vermelho com confirmação
     que explica o que será apagado
   - /endereco: país, CEP, endereço, número, complemento, bairro, cidade, estado.
     PREENCHA AUTOMATICAMENTE PELO CEP consultando a ViaCEP — é grátis, sem chave, e poupa
     cinco campos de digitação no celular
   - /acessos: métodos vinculados (Google e/ou e-mail e senha) com botão de desvincular, e
     um cartão "Vincular acesso" com o que falta. NUNCA permita remover o último método —
     bloqueie e explique
   - /seguranca: senha atual, nova senha, confirmação, todas com botão de olho
   - /pessoas: dependentes (nome e data de nascimento) — resolve o "vou levar meu filho"
   - /favoritos: grade de cartões. Vazio: coração partido cinza + "Nenhuma barbearia
     favoritada ainda"
   - /historico: busca, faixa "Filtrando de: dd/mm/aaaa até dd/mm/aaaa" com botão Filtrar, e
     a lista. Vazio: "Nenhum agendamento encontrado no período."
   - /espera: o que ele aguarda, com barbearia, dia e período, e botão de sair da fila
   - /ajuda: FAQ em acordeão, agrupado em seções numeradas. Conteúdo estático em
     src/lib/faq.ts, sem tabela no banco.

6. /app/notificacoes — a lista do sino, com marcar como lida e link para o destino.

7. As actions em src/app/actions/client.ts.

Ao terminar, rode npx tsc --noEmit e me diga o que testar em 375px.
```

---

## PROMPT 7 — Perfil da barbearia, agendamento, espera e avaliações

```
Continuando o PiBarber. Agora o que fecha o ciclo: o cliente encontra, agenda e avalia.

1. /b/[slug] — o perfil público da barbearia, aberto sem login:
   - capa e logo, nome, nota com estrela e nº de avaliações, coração de favoritar
   - descrição, endereço com botão "Como chegar", telefone e WhatsApp
   - horário da semana com o dia de hoje em destaque e um chip "Aberto agora" / "Fechado"
   - serviços com preço e duração
   - equipe com foto e bio curta
   - últimas avaliações, com a resposta do dono quando houver
   - botão "Agendar" FIXO na base ao rolar
   - se accepts_online_booking estiver desligado, troque o botão por telefone e WhatsApp
   - metadata do Next com openGraph, para o link ficar bonito quando compartilhado no
     WhatsApp
   - registre a visita em shop_visits (upsert) quando o cliente logado abrir a página

2. /b/[slug]/agendar — o fluxo, um passo por tela no celular, com barra de progresso e botão
   de voltar sempre visível:
   1. Serviço — pode escolher mais de um; total e duração se somam à vista
   2. Profissional — cartões com foto, e a opção "Tanto faz" EM PRIMEIRO (aumenta a
      conversão)
   3. Dia e hora — tira de datas horizontal e horários em grade, vindos de
      get_available_slots. Se o dia estiver lotado, ofereça "Entrar na lista de espera" em
      vez de um vazio inútil
   4. Para quem — titular ou dependente. PULE este passo se não houver dependentes
   5. Confirmação — resumo, observação, nome e telefone (preenchidos se logado). Dá para
      agendar SEM criar conta, informando nome e telefone.
   - sucesso: confirmação com os dados, botão "Adicionar ao calendário" (.ics) e "Ver meus
     agendamentos"

   Dois clientes podem tocar no mesmo horário ao mesmo tempo. Não tente resolver com
   verificação no código — a constraint appointments_no_overlap já resolve no banco. Sua
   parte é capturar o erro e mostrar "Esse horário acabou de ser preenchido, escolha outro",
   recarregando a grade.

3. Lista de espera:
   - o cliente entra pela tela de horários lotados (join_waitlist)
   - /painel/espera mostra ao dono quem está na fila por dia e período, com botão de
     encaixar direto na agenda
   - quando um agendamento é cancelado, cancel_appointment avisa quem está esperando naquele
     dia e período criando uma notificação

4. Avaliações:
   - o cliente avalia pelo card de agendamento concluído: nota de 1 a 5 em estrelas e
     comentário opcional
   - /painel/avaliacoes mostra ao dono a nota média, a lista, e o campo de responder
     publicamente
   - a resposta aparece em /b/[slug]

5. As actions em src/app/actions/booking.ts.

Ao terminar, rode npx tsc --noEmit e percorra o fluxo inteiro em 375px.
```

---

## PROMPT 8 — Relatórios, configurações, admin e PWA

```
Continuando o PiBarber. Última etapa de funcionalidade.

1. /painel/relatorios — só o dono:
   - seletor de período
   - gráfico de faturamento por dia (Recharts, alimentado por revenue_series)
   - comparativo com o período anterior, com a variação em porcentagem
   - serviços mais vendidos, com a receita de cada um
   - desempenho por profissional: atendimentos, receita gerada, comissão
   - ticket médio e taxa de falta
   Mantenha o gráfico simples: uma série, eixo limpo, cor de latão, valores em tabular-nums.
   Nada de gradiente nem 3D.

2. /painel/configuracoes — só o dono:
   - dados da barbearia: nome, descrição, telefone, WhatsApp
   - endereço com preenchimento automático pelo CEP, e latitude/longitude (a busca por
     proximidade depende disso — explique isso na tela)
   - o slug, com o link público completo e botão de copiar
   - horário de funcionamento por dia da semana, com intervalo de almoço
   - agendamento online liga/desliga, antecedência mínima e máxima, prazo de cancelamento
   - URLs de logo e capa (campo de texto por enquanto; upload fica para depois)

3. /admin — protegida por is_platform_admin:
   - lista das barbearias com dono, cidade, nota e data de criação
   - formulário que cria a conta do dono e a barbearia numa tacada, com createAdminClient().
     Confirme is_platform_admin ANTES de tocar na service role.
   - mostre a senha provisória na tela depois de criar, para copiar e passar

4. PWA: src/app/manifest.ts com nome "PiBarber", ícones, cor de tema e display standalone.
   Service worker mínimo para o app abrir instalado da tela inicial. Não tente cache
   offline agora — só a instalação.

5. Revise todas as telas: todo estado vazio ensina o próximo passo, e todo erro de action
   aparece para o usuário em português claro.

Ao terminar, rode npx tsc --noEmit e npx next build.
```

---

## PROMPT 9 — Auditoria e produção

```
Continuando o PiBarber. Nada de funcionalidade nova — só revisão e deploy.

1. Auditoria de segurança, e seja rigoroso:
   - toda página do painel e do app chama requireRole() no topo?
   - a service role só aparece dentro de createAdminClient(), e sempre depois de confirmar o
     papel de quem chamou?
   - existe algum lugar onde o assistente consegue ler transactions, commissions ou o
     relatório? Teste de verdade: entre como assistente e tente abrir /painel/caixa e
     /painel/relatorios digitando a URL na mão.
   - a RLS bloqueia mesmo chamando a API REST direto? Teste com a chave anônima:
     GET /rest/v1/transactions?select=* não pode devolver nada.
   - um cliente consegue ler o customers.notes de outra pessoa? E os agendamentos de outro
     cliente? Teste os dois.
   - o campo notes da ficha (observação do barbeiro) NUNCA pode chegar ao app do cliente.

2. Auditoria de código:
   - todo catch chama unstable_rethrow(error) antes do console.error?
   - existe algum `const { data } = await` sem pegar o error? Corrija todos.
   - toda action traduz o erro do Postgres para português?
   - alguma data sendo calculada no cliente e mandada para o servidor? Resolva no servidor.

3. Revisão visual:
   - passe TODAS as telas em 375px
   - teste o tema escuro em todas, incluindo o botão manual de alternância
   - confira que nenhuma cor crua do Tailwind sobrou
   - confira a área segura do iPhone na barra de abas

4. Preparação para a Vercel:
   - .env.example com as quatro variáveis, sem valor
   - .gitignore cobrindo .env.local
   - README.md com: como rodar local, em que ordem rodar os SQL no Supabase, como configurar
     o login com Google, e como publicar na Vercel
   - npx next build tem que passar limpo

Me devolva um relatório do que encontrou e corrigiu, e o passo a passo do deploy.
```

---

## Depois de tudo

Guarde a `ESPECIFICACAO.md` na raiz do projeto e mantenha atualizada quando mudar algo
estrutural. É ela que permite abrir uma conversa nova com a IA sem reexplicar o sistema
inteiro.

**Três coisas antes de vender para o primeiro barbeiro:**

1. **Use o sistema por uma semana** fingindo ser uma barbearia real. Marque, conclua, cobre
   fiado, feche o mês. Os buracos aparecem sozinhos.
2. **Sente do lado de um barbeiro** enquanto ele usa, sem ajudar. Onde ele trava é onde está
   o problema — e nunca é onde você imagina.
3. **Faça backup do banco.** O Supabase free não tem point-in-time recovery. 

