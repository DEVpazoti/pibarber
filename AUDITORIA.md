# PiBarber — auditoria de bugs e segurança (T-8)

> 15/08/2026. Portão obrigatório antes da Vercel.
> Método: **RLS testada pela API REST com o token de cada papel**, PoC executado
> contra o banco de verdade, e conferência na tela por CDP com login real.
> Ler policy não conta como evidência aqui — nenhum achado abaixo veio de leitura
> de código sozinha.

**2 críticos, corrigidos nesta sessão** (migration `11`). Os outros **13**
estão relatados e **aguardam sua decisão** — nada além dos críticos foi tocado.

**O isolamento entre barbearias foi a primeira coisa testada, e ele está
íntegro.** Nenhum dono alcança dado de outro. Mas apareceu uma falha de
isolamento de **dado de cliente** (C-2), e ela furou a fila do mesmo jeito.

| | Achado | Situação |
|---|---|---|
| **C-1** | `book_appointment`: `p_source => 'manual'` pulava todas as regras da loja — **inclusive para `anon`** | ✅ **corrigido** |
| **C-2** | `book_appointment`: `p_profile` permitia adotar a ficha de um cliente alheio e ler o histórico dele | ✅ **corrigido** |
| **A-1** | Fiado paga **em dobro** com duplo clique, e não existe estorno | ⬜ decidir |
| **A-2** | Agendamento público sem limite de taxa e sem verificação de telefone | ⬜ decidir |
| **M-1** | O nome de quem avaliou não aparece em `/painel/avaliacoes` | ⬜ decidir |
| **M-2** | A data do fiado aparece **um dia adiantada** | ⬜ decidir |
| **M-3** | `next.config.ts` aceita imagem de **qualquer host** — proxy aberto | ⬜ decidir |
| **M-4** | **Nenhum** cabeçalho de segurança (CSP, X-Frame-Options, …) | ⬜ decidir |
| **M-5** | Desativar barbearia não derruba o cache do perfil público | ⬜ decidir |
| **B-1** | O assistente responde avaliação pela REST, embora a tela seja só do dono | ⬜ decidir |
| **B-2** | Os 5 helpers de permissão expostos como RPC | ⬜ decidir |
| **B-3** | Proteção contra senha vazada desligada no Supabase | ⬜ decidir |
| **B-4** | Nome de 1 letra aceito pelo caminho RPC direto | ⬜ decidir |
| **B-5** | `p_dependent` não era conferido | ✅ corrigido junto do C-2 |
| **B-6** | Sem backup do banco antes de publicar | ⬜ decidir |

> **Decisão D-3, tomada em 15/08/2026:** entram na próxima sessão (T-9)
> **A-1, M-2, A-2 (item 1) e M-1** — o núcleo de dinheiro e dado errado na tela.
> **M-5, M-4, M-3 e os `B` ficam para depois de publicar**, menos o **B-3**, que
> é um botão. As três decisões estão no fim deste documento, respondidas.

---

## Os dois críticos — corrigidos

Os dois moravam na **mesma função**, `book_appointment`, e pela mesma causa de
fundo: ela é `security definer`, está concedida a `anon` — **e tem que estar**,
é o que faz o agendamento público de `/b/[slug]/agendar` funcionar sem conta —
mas **não conferia quem estava chamando**. Ela validava loja ativa, profissional
da loja e serviço da loja, e depois confiava em dois argumentos que o chamador
escolhe: `p_source` e `p_profile`.

Correção em `supabase/11_book_appointment_autorizacao.sql`, com plano de
rollback escrito dentro. **Nenhuma tabela, coluna, índice ou grant mudou** — só
o corpo da função.

### C-1 — uma palavra desligava as três regras da loja

`p_source = 'manual'` existe para o balcão: quem está atrás dele encaixa o
cliente que acabou de chegar. O problema é que as três checagens de regra
(antecedência mínima, janela máxima e `accepts_online_booking`) **só rodavam no
ramo `'online'`**, e `p_source` vem de fora.

A evidência é a mesma chamada duas vezes, trocando uma palavra. Com a **chave
anônima**, sem conta nenhuma:

```
400 | anon · online · daqui a 5 min     | "Este horário exige pelo menos 60 minutos de antecedência."
400 | anon · online · daqui a 400 dias  | "Só dá para agendar com até 60 dias de antecedência."

200 | anon · MANUAL · daqui a 5 min     | agendado
200 | anon · MANUAL · daqui a 400 dias  | agendado
200 | anon · MANUAL · ONTEM             | agendado
```

E em rajada: **10 de 10 agendamentos criados por `anon`**, fora de qualquer
regra, sem limite nenhum.

**A correção:** `'manual'` agora exige `has_shop_access(p_shop)`. Quem não tem é
**rebaixado para `'online'`** em silêncio, e passa a responder pelas regras da
loja. Rebaixar em vez de levantar exceção é de propósito — o caminho legítimo
não muda de comportamento, o ataque simplesmente deixa de existir.

### C-2 — dava para adotar a ficha de um cliente alheio pelo telefone

Este é o que **furou a fila**. `p_profile` nunca era conferido contra
`auth.uid()`, e esta linha carimbava o chamador como titular de qualquer ficha
com `profile_id` nulo:

```sql
update customers set profile_id = coalesce(profile_id, p_profile)
```

Como `owns_customer()` é o que abre `appointments` e `debts` na RLS, adotar a
ficha **é ler o histórico da pessoa**. Basta saber o telefone dela — e telefone
não é verificado neste sistema, não há SMS.

**PoC, com o token de um cliente sem relação nenhuma com a Barbearia do Tião:**

```
vítima: Eduardo Vasques · 11910002192 · profile_id = null
        notes do barbeiro: "Máquina 2 nas laterais, tesoura em cima."

ANTES  → appointments do atacante: 8 linhas
ATAQUE → book_appointment(p_profile: <o próprio>, p_telefone: <o da vítima>) → 200
         ficha da vítima: profile_id = f1fe785e… (o atacante)
DEPOIS → appointments do atacante: 12 linhas
```

**24 das 31 fichas do banco estão com `profile_id` nulo** — a superfície é quase
toda a base de clientes.

**A correção, em duas camadas:**

1. `p_profile` diferente de `auth.uid()` é recusado, salvo para quem tem
   `has_shop_access` (o painel, que hoje nem passa o argumento).
2. A adoção só acontece em ficha **sem histórico**. Ficha com atendimento ou
   fiado nunca troca de titular por telefone.

> ⚠️ **Consequência de produto da camada 2, dita por inteiro:** o cliente que já
> foi atendido no balcão (ficha criada pelo barbeiro, com histórico) e só depois
> cria conta no app **agenda normalmente**, mas o agendamento novo **não aparece
> em `/app/agendamentos`**, porque a ficha não passa a ser dele. Vincular ficha
> antiga a conta nova é fluxo de confirmação de identidade e não existe hoje.
> **É a decisão D-1 lá embaixo.**

### O que foi exercitado depois de corrigir

O teste que importa não é "o ataque parou" — é "o ataque parou **e o caminho
legítimo continua vivo**".

| Verificação | Resultado |
|---|---|
| `anon` agenda online, dados novos, data válida | **200** — o fluxo público vive |
| Cliente logado agenda para si | **200** |
| **Dono** agenda manual **no passado** (encaixe de balcão) | **200** — o balcão vive |
| **Dono** agenda manual daqui a 200 dias (fora da janela pública) | **200** |
| `cliente6` · manual · ontem | **400** "exige pelo menos 60 minutos" |
| `anon` · manual · ontem | **400** |
| `cliente6` · manual · data válida | 200, mas gravado como **`source = 'online'`** — rebaixado |
| `cliente6` passando o `p_profile` de outra pessoa | **400** "Você não pode agendar em nome de outra pessoa." |
| `anon` passando `p_profile` de alguém | **400** |
| Atacante agenda com o telefone da vítima, data válida | 200, mas ficha **NÃO adotada**; ele continua enxergando **8** |
| Ficha nova **sem histórico**, mesmo fluxo | **adotada** — o caminho legítimo preservado |
| Dependente alheio pendurado no agendamento | **400** "Essa pessoa não está no seu cadastro." (B-5) |
| **O fluxo de 5 passos clicado de verdade, deslogado, a 390×844** | **"Agendado! Corte social · Segunda, 17 ago 2026 às 09:30"** |
| `npx tsc --noEmit`, `npx eslint src` | limpos |

O banco voltou ao estado exato de antes: 296 agendamentos, 31 clientes, 185
lançamentos, 14 dívidas, e a invariante do T-3 fechando em **1.610,80 =
1.610,80**.

---

## Alto — decisão sua

### A-1 · O fiado paga em dobro, e não dá para desfazer

É a armadilha nº19 na metade que o T-3 não pôde tocar. `FiadoPainel.tsx` usa
`useTransition` e **não tem** nem a trava síncrona de `useRef` nem chave de
idempotência; `pay_debt` tem `for update`, que **serializa mas não deduplica** —
os dois pagamentos são válidos isoladamente, então nenhuma validação os separa.

**PoC:** dois `POST` simultâneos de R$ 1,25 sobre um saldo de R$ 2,50.

```
ANTES  → pago 2,50 · status partial · 1 pagamento · 1 entrada de caixa
DEPOIS → pago 5,00 · status paid    · 3 pagamentos · 3 entradas de caixa
>>> 2 pagamentos gravados por UM clique. HTTP 200 nas duas, nada em vermelho.
```

Compare com a comissão, que o T-3 blindou: `useRef` + `idempotency_key` com
índice único. O fiado tem exatamente a exposição que ela tinha.

**E é pior que na comissão**, porque a comissão ganhou `revert_commission_payment`
e o fiado **não tem estorno nenhum**. Um recebimento lançado por engano só sai
com `UPDATE` na mão no banco — foi o que eu tive de fazer para desfazer o PoC.

**Correção proposta**, espelhando o que já existe e funciona:

1. Migration: `debt_payments.idempotency_key uuid` com índice único parcial.
2. `pay_debt` ganha `p_idem uuid default null`; chave repetida devolve o
   pagamento existente em vez de gravar outro.
3. `FiadoPainel.tsx`: `useRef` como trava síncrona + `crypto.randomUUID()` uma
   vez por abertura do modal.
4. **`revert_debt_payment`**, espelhando `revert_commission_payment` — desfaz o
   pagamento mais recente e apaga a entrada de caixa junto.

Custo: uma migration e um componente. É o mesmo trabalho do T-3, com o desenho
já validado. **Recomendo fazer antes de publicar** — é dinheiro de cliente, e o
erro é silencioso.

### A-2 · Agendamento público sem limite de taxa nem verificação

`/b/[slug]/agendar` é o ponto mais exposto do sistema, e continua sem freio
mesmo depois do C-1. Três coisas, todas provadas:

- **Sem limite de taxa.** Dentro da janela válida, `anon` cria agendamento
  atrás de agendamento. Uma agenda pode ser entupida em segundos.
- **Sem validação real de telefone e nome no servidor.** A Server Action
  `agendar()` exige 10 dígitos e nome de 2 letras — mas a RPC está concedida a
  `anon`, então **a validação da action é contornável**:
  `anon · tel="7" nome="X"` → **200, agendado**. (`tel="abc"` é recusado, porque
  vira string vazia após limpar os não-dígitos.)
- **Dá para injetar agendamento na ficha de outra pessoa** sabendo o telefone
  dela. Depois do C-2 o atacante não *lê* nada, mas o agendamento entra na ficha
  da vítima e na agenda da loja.

**Correção proposta**, do mais barato ao mais completo:

1. Validar dentro de `book_appointment` (telefone com 10–11 dígitos, nome com
   ≥ 2 palavras/caracteres). Fecha o desvio pela RPC. **Barato, faça já.**
2. Limite por telefone/loja: recusar mais de N agendamentos futuros em aberto
   para o mesmo telefone. Uma linha de `count` na função.
3. Limite por IP no middleware, ou o rate limiting da Vercel/Upstash.
4. Confirmação por SMS/WhatsApp — resolve a raiz (telefone não verificado), e é
   o que também destravaria a decisão D-1. Custo operacional real.

---

## Médio — decisão sua

### M-1 · O nome de quem avaliou não aparece em `/painel/avaliacoes`

É a armadilha nº21 na metade que **não dá erro**. A tela embute
`autor:profiles!reviews_profile_id_fkey(full_name)`; logado o `grant` existe,
então não há `42501` — o `autor` simplesmente vem **nulo**.

**Confirmado na REST com o token do próprio dono:** `HTTP 200`, `"autor": null`
nas três avaliações lidas. **E confirmado na tela:** `/painel/avaliacoes` da
Navalha & Cia mostra **31 assinaturas "Cliente" e zero nomes de verdade**.

O absurdo é a comparação: `public_reviews` devolve `"autor": "Diego R."` para o
**visitante anônimo**. O dono vê menos que quem chega pelo Instagram.

**Correção proposta:** trocar o embed por `public_reviews`. O empecilho é que
aquela tela tem filtros próprios (respondidas / sem resposta) que a função não
cobre — então ou a RPC ganha os filtros, ou a tela filtra em memória (são no
máximo 200 linhas, e filtrar em memória é o mais barato). **Recomendo filtrar na
tela**: não mexe numa função que já está em produção no perfil público.

Uma decisão de produto no meio: `public_reviews` devolve **"Diego R."**, o
recorte que protege o cliente numa página indexada pelo Google. **No painel, o
dono deveria ver o nome completo** — ele já tem a ficha da pessoa. Isso pede uma
segunda função, ou um parâmetro. **É a decisão D-2.**

### M-2 · A data do fiado aparece um dia adiantada

Armadilhas nº15 e nº24. `FiadoPainel.tsx:74` usa `dataBR(d.due_date)`, e
`due_date` é coluna `date` — tem que ser `diaBR`.

**Confirmado comparando tela e banco:**

```
o BANCO diz:  due_date = 2026-09-13
a TELA  diz:  vence em 12/09/2026
```

**Todo vencimento de fiado aparece um dia antes do que é** — inclusive o chip
"Vencido", que acende um dia cedo. É a última das quatro ocorrências que o T-6
achou; as outras três já foram corrigidas.

**Correção:** uma palavra. `dataBR` → `diaBR`, e o `import` acompanha.

### M-3 · Qualquer host pode servir imagem pelo otimizador

```ts
// next.config.ts
remotePatterns: [{ protocol: "https", hostname: "**" }]
```

`hostname: "**"` aceita **todo host HTTPS da internet**. `/_next/image` vira um
proxy de imagem aberto: qualquer visitante pode pedir
`/_next/image?url=https://qualquer-coisa&w=3840&q=100` à vontade.

**Evidência:** a resposta do servidor com um host de terceiro foi
`"url" parameter is valid but upstream response is invalid` — ou seja, **o
allowlist aceitou o host**; o que falhou foi o `fetch`, porque esta máquina está
sem rede de saída. A porta está aberta.

Na Vercel isso é **conta**: otimização de imagem é cobrada por transformação.
Também é um fetch server-side para uma URL escolhida por quem chama.

**Correção proposta:** enquanto logo e capa forem campo de URL de texto (decisão
da v1), restringir ao que o produto usa de fato — o host do Supabase Storage e,
se necessário, uma lista curta. Quando existir upload, `hostname: "**"` sai de
vez.

### M-4 · Nenhum cabeçalho de segurança

`curl -D -` na landing não devolve **nenhum** destes: `Content-Security-Policy`,
`X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`,
`Permissions-Policy`. Não há bloco `headers()` no `next.config.ts`.

Sem `X-Frame-Options`/`frame-ancestors`, o painel pode ser posto num `<iframe>`
por um site qualquer (clickjacking). Sem `Referrer-Policy`, a URL sai inteira no
`Referer` para terceiros. A Vercel entrega HSTS sozinha; o resto não.

**Correção proposta:** um bloco `headers()` no `next.config.ts`. CSP com
`script-src` merece cuidado — o Next injeta script inline e o tema é um
`dangerouslySetInnerHTML` no `<head>` —, então **CSP entra por último e com
`Report-Only` antes**. Os outros quatro são de baixo risco e entram já.

### M-5 · Desativar barbearia não derruba o cache do perfil público

`alternarBarbearia()` (em `admin.ts`) faz `revalidatePath("/admin")` e **nada
mais**. O perfil público é cacheado desde o T-7 por `unstable_cache`, com
`revalidate: 300`.

Consequência: o admin desativa uma loja e `/b/[slug]` **continua no ar por até 5
minutos**, servindo o perfil de uma barbearia que já saiu. Agendar de lá falha
(`book_appointment` confere `is_active` no banco), então o visitante vê um
perfil normal e um erro no fim do funil. Falha silenciosa, do tipo que este
projeto já catalogou.

**Correção:** duas linhas — `revalidateTag(tagBarbearia(id))` e
`revalidateTag(TAG_SLUGS)` em `alternarBarbearia`. `criarBarbearia` também
merece o `TAG_SLUGS`, porque a camada slug→id **guarda o `null`** de propósito:
um slug consultado antes de a loja existir fica negativo em cache por 5 min.

---

## Baixo — decisão sua

**B-1 · O assistente responde avaliação pela REST.** A tela é só do dono
(`responderAvaliacao` chama `requireOwnerContext`), mas a policy `reviews_update`
e o trigger `reviews_guard_reply` usam `has_shop_access`, e
`has_shop_access(Tião) = true` para o assistente (confirmado por RPC). Ele pode
publicar uma resposta em nome da barbearia pela API. Assistente é pessoal de
confiança e a resposta é auditável — daí o "baixo" — mas a fala é **pública**.
Correção: trocar por `can_manage_money` na policy e no trigger.

**B-2 · Os 5 helpers expostos como RPC.** `is_platform_admin`, `my_shop_id`,
`has_shop_access`, `can_manage_money` e `owns_customer` são chamáveis via
`/rest/v1/rpc/`. Testados com token de cliente: devolvem `false`, `null`,
`false`, `false`, `false` — **eles só respondem sobre quem chama**, então não
vazam nada. É superfície à toa, e são 5 dos 23 avisos do lint. Correção:
`revoke execute` — eles são usados **dentro** das policies, onde o grant do
usuário não é consultado. Precisa de teste depois, porque é fácil quebrar a RLS
sem perceber.

**B-3 · Proteção contra senha vazada desligada.** Um botão em Authentication no
painel do Supabase, consultando o HaveIBeenPwned. **Ganho real, custo zero.** O
`traduzirErroAuth` já tem a frase pronta para o caso (`"pwned"`).

**B-4 · Nome de 1 letra passa pelo caminho RPC.** `anon` com `p_nome: "Z"` →
200. Mesma causa do A-2: a validação está na Server Action, não na função.
Entra junto do item 1 do A-2.

**B-5 · `p_dependent` não era conferido** — dava para pendurar o dependente de
outra pessoa num agendamento seu, e o nome dele apareceria na agenda de uma
barbearia que aquela família não escolheu. **Corrigido junto do C-2**, porque a
checagem depende do `p_profile` já validado.

**B-6 · Sem backup antes de publicar.** O Supabase free não tem
point-in-time recovery, e este banco **não tem cópia**. Já é a recomendação nº3
do `ESTADO.md`; vira bloqueio na hora em que houver cliente de verdade.

---

## O que foi testado e está CORRETO

Vale tanto quanto os achados: é o que a próxima sessão não precisa refazer.

### Isolamento entre barbearias — íntegro

Dono da Navalha & Cia (São Paulo) contra a Barbearia do Tião, token real:

| Tentativa | Resultado |
|---|---|
| Ler `transactions`, `commissions`, `customers`, `appointments`, `debts`, `waitlist_entries`, `time_off`, `commission_payments` do Tião | **0 linhas** em todas |
| `PATCH barbershops` (renomear o Tião) | **0 linhas** |
| `PATCH services` (zerar preço) | **0 linhas** |
| `INSERT appointment` no Tião | **403** RLS |
| `DELETE customers` do Tião | **0 linhas** |
| `PATCH reviews` (forjar resposta da loja alheia) | **0 linhas** |
| `dashboard_summary(Tião)` | **400** "Você não tem acesso a esta barbearia." |

**As tabelas sem `barbershop_id`** dependem de um join na policy, então foram
conferidas contando as lojas distintas do que voltou:

- `appointment_services`: 92 visíveis de 300 no banco — **uma única loja, a dele**
- `debt_payments`: 0 · `professional_schedules`: 0 · `commission_payments`: 16, só a dele

### Escalada de privilégio — fechada pelo grant de coluna

| Tentativa | Resultado |
|---|---|
| Cliente `PATCH profiles {role: "owner"}` | **403** permission denied |
| Cliente `PATCH profiles {is_platform_admin: true}` | **403** |
| Cliente `PATCH profiles {barbershop_id: …}` | **403** |
| Cliente `INSERT barbershops` | **403** RLS |
| Dono `PATCH barbershops {owner_id: …}` (transferir posse) | **403** |

O `revoke update … grant update (colunas)` do `03_rls.sql` é o que fecha isso, e
funciona.

### Assistente e dinheiro — a separação vale no banco

`transactions`, `commissions` e `commission_payments` → **0 linhas**.
`INSERT transaction` → **403**. `PATCH barbershops` → **0 linhas**.
`pay_commissions` → recusada. `has_shop_access = true`, `can_manage_money = false`.

### Chave anônima — 24 tabelas varridas

**401** em 17: `profiles`, `user_addresses`, `dependents`,
`professional_schedules`, `time_off`, `customers`, `favorites`, `shop_visits`,
`appointments`, `appointment_services`, `waitlist_entries`, `transactions`,
`commissions`, `debts`, `debt_payments`, `notifications`, `commission_payments`.

**200** em 6, todas de leitura pública por desenho: `barbershops`,
`business_hours`, `professionals`, `services`, `reviews`, `amenities` +
`barbershop_amenities`. A armadilha nº17 (tabela nova nasce aberta a `anon`) não
se repetiu no T-5.

### Chaves

`SUPABASE_SERVICE_ROLE_KEY` aparece em **um** lugar: `src/lib/env.ts`, lido só
por `src/lib/supabase/admin.ts`, que tem `import "server-only"` no topo — o build
quebra se alguém importar de componente de cliente. As variáveis `NEXT_PUBLIC_`
são cinco, todas públicas por natureza (URL e chave anônima do Supabase, URL do
site, e-mail e telefone do suporte). `.env.local` está no `.gitignore`. **Não há
repositório git neste projeto**, então não há histórico onde uma chave pudesse
ter sido commitada.

`createAdminClient()` aparece em três lugares, todos **depois** de confirmar o
papel: `admin.ts` (após `requireAdmin`), `team.ts` (após `requireOwnerContext`
**e** conferir que a loja é do dono) e `client.ts` (id vindo de
`requireProfile`).

### XSS, IDOR, redirect aberto, vazamento de erro

- **`dangerouslySetInnerHTML`: dois**, ambos com conteúdo estático nosso — o
  script de tema em `layout.tsx` e o JSON-LD da landing. **Nenhum dado de
  usuário entra em nenhum dos dois.** Nome de barbearia, descrição de serviço e
  texto de avaliação passam por JSX normal, que escapa.
- **IDOR em `/painel/clientes/[id]`**: a consulta tem `.eq("barbershop_id", shopId)`
  e cai em `notFound()`. O mesmo padrão de par `id + shopId` se repete em
  `salvarCliente`, `salvarObservacoes`, `salvarProfissional`, `salvarJornada`,
  `removerFolga`, `removerDaEspera`, `marcarEsperaConvertida`,
  `responderAvaliacao`, `confirmarAgendamento` e `apagarLancamento`.
- **Redirect aberto**: `destinoSeguro()` em `auth.ts` e a checagem equivalente
  em `/callback` exigem `startsWith("/")` e recusam `//`. Fechado nos dois.
- **Erro vazando**: `traduzirErroBanco` devolve frase em português e manda o
  objeto do Postgres só para o `console`. O `contexto` nunca vai para a tela.

### Lint de segurança do Supabase — 24 avisos, e por que ficam

23 são "SECURITY DEFINER pode ser executada por `anon`/`authenticated`". A
**maioria é por desenho** — `pay_debt`, `complete_appointment`,
`pay_commissions` e companhia fazem a própria checagem por dentro
(`has_shop_access`, `can_manage_money`), e isso foi reconferido nesta sessão. Os
5 helpers são o B-2. O 24º é o B-3.

**`book_appointment` era a exceção**: a única `security definer` concedida a
`anon` que **não** conferia nada sobre quem chama. É exatamente o C-1/C-2, e
agora ela confere.

---

## Decisões — RESPONDIDAS em 15/08/2026

As três foram levadas ao dono do produto ao fim do T-8 e respondidas na hora.
**Não reabra nenhuma delas**; estão aqui com o porquê para a próxima sessão não
precisar redescobrir.

**D-1 · Ficha antiga × conta nova → o BARBEIRO vincula pelo painel.**
A camada 2 do C-2 impede que uma ficha com histórico mude de titular só pelo
telefone. O preço é que o cliente atendido no balcão que depois cria conta não vê
os agendamentos antigos no app. As alternativas eram deixar como está, ou
confirmação por SMS/WhatsApp. **Escolhida a intermediária:** uma tela pequena na
ficha do cliente onde o barbeiro escolhe a conta e vincula. Ele conhece a
pessoa — é a confirmação de identidade mais barata que existe aqui, e usa a
confiança que já existe no balcão.
**Ainda não implementada** — não entrou no escopo do T-9 (ver D-3). É a
candidata natural ao T-10.

**D-2 · Nome no painel × nome público → nome COMPLETO no painel.**
`public_reviews` continua devolvendo "Diego R." no perfil público, que é o
recorte certo para uma página indexada pelo Google. No painel o dono passa a ver
o nome completo: ele já tem a ficha da pessoa, esconder o sobrenome não protege
ninguém e atrapalha quem quer responder a uma crítica.
**Implementação:** um parâmetro em `public_reviews` ou uma segunda função só do
painel — a escolha entre as duas é técnica, não de produto, e fica com quem
implementar. Se for parâmetro, ele precisa ser **barrado para `anon`**, senão o
recorte do perfil público cai junto.

**D-3 · O que entra antes da Vercel → A-1, M-2, A-2 (item 1) e M-1.**
É o núcleo de correção: tudo que é dinheiro errado ou dado errado na tela.
**M-5, M-4, M-3 e os `B` ficam para depois de publicar**, com a exceção do
**B-3**, que é um botão no painel do Supabase e pode ser ligado a qualquer
momento.

---

## Para publicar na Vercel

O checklist do `CONTEXTO_MELHORIAS_V1.md`, com o que esta auditoria fechou:

- [x] `AUDITORIA.md` sem item **crítico** em aberto
- [x] `service_role` fora do bundle do cliente
- [x] RLS habilitada e testada em todas as tabelas
- [x] Capturas da landing sem dado real de cliente (o seed é fictício)
- [x] `NEXT_PUBLIC_SUPORTE_EMAIL` e `NEXT_PUBLIC_SUPORTE_TELEFONE` preenchidos
      **no `.env.local`** — falta cadastrar na Vercel
- [ ] **`NEXT_PUBLIC_SITE_URL` com o domínio real** — sem ela o site sobe
      funcionando e anuncia `localhost:3001` para o Google. Falha em silêncio.
- [ ] `NEXT_PUBLIC_SUPORTE_EMAIL`, `NEXT_PUBLIC_SUPORTE_TELEFONE` e
      `GOOGLE_MAPS_API_KEY` cadastradas no painel da Vercel
- [ ] Google OAuth habilitado nos dois lados — **ou o botão removido**. Hoje ele
      está na tela e **dá erro** em `/entrar` e `/criar-conta`
- [ ] **Backup do banco** (B-6)
- [ ] Proteção contra senha vazada (B-3) — um botão

**O que bloqueia de verdade:** o botão do Google que erra na cara de quem tenta
criar conta, e o `NEXT_PUBLIC_SITE_URL`. O resto sobe.
