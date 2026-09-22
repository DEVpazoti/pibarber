# WhatsApp oficial: configurar do zero

Este documento leva você de "não existe nada" a "o cliente agenda e a
confirmação chega no celular em segundos". Siga na ordem: cada passo depende do
anterior.

O que o PiBarber manda, e quando:

| Mensagem | Quando sai | Template na Meta |
|---|---|---|
| Confirmação | Assim que o cliente agenda (app ou link público) | `pibarber_confirmacao_v1` |
| Lembrete | Às 18h da véspera, só para quem agendou antes disso | `pibarber_lembrete_v2` |
| Cancelamento | Quando o horário é cancelado (painel, app ou link) | `pibarber_cancelamento_v1` |

As três vão do **número da plataforma**, não da barbearia. Os textos estão em
`src/lib/whatsapp/catalogo.ts` e não são editáveis pela loja. O motivo está em
`pibarber-CONTEXT.md` §9.

> **Sem as variáveis de ambiente, nada quebra e nada sai.** O site sobe, o
> cliente agenda, e nenhuma mensagem é enviada, sem erro na tela. Se "não está
> chegando mensagem", comece conferindo o §1.

---

## 0. Antes de começar: o que você precisa ter

- Uma conta no **Meta Business Suite** (business.facebook.com) em nome de quem
  opera o PiBarber.
- Um **número brasileiro (+55)** que possa receber SMS ou ligação, e que **não
  esteja em uso no WhatsApp**. Veja o §4 antes de escolher o número.
- Um **cartão de crédito** para cadastrar como forma de pagamento na conta do
  WhatsApp Business. Mensagem de template iniciada pela empresa é cobrada, e
  sem forma de pagamento a Meta recusa o envio (erro `131042`).
- Acesso ao painel da Vercel (variáveis de ambiente) e ao SQL Editor do Supabase.

---

## 1. As sete variáveis

Todas são **segredo** e ficam só no servidor. Nenhuma pode ganhar o prefixo
`NEXT_PUBLIC_`. Na Vercel: Project → Settings → Environment Variables →
ambiente **Production**. No local: `.env.local`.

| Variável | De onde vem |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | App da Meta → WhatsApp → Configuração da API → **Phone number ID**. Não é o telefone: é um número longo que identifica o telefone. |
| `WHATSAPP_WABA_ID` | Mesma tela → **WhatsApp Business Account ID**. |
| `WHATSAPP_ACCESS_TOKEN` | Token de **Usuário do Sistema**. Veja o §3. |
| `WHATSAPP_APP_SECRET` | App da Meta → Configurações do app → Básico → **Chave secreta do aplicativo** → Mostrar. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Você inventa**. Veja abaixo. |
| `WHATSAPP_GRAPH_VERSION` | Opcional. Padrão `v25.0`. |
| `CRON_SECRET` | **Você inventa**. Veja abaixo. |

As duas que você inventa são strings longas e aleatórias. Gere cada uma com:

```bash
openssl rand -base64 32
```

Use um valor diferente para cada. O `WHATSAPP_WEBHOOK_VERIFY_TOKEN` vai também
no painel da Meta (§2), e o `CRON_SECRET` vai também no Supabase (§6).

**Como a integração liga:** o interruptor é `WHATSAPP_PHONE_NUMBER_ID`.
- Vazio: tudo desligado, em silêncio.
- Preenchido: as outras passam a ser obrigatórias, e a falta de qualquer uma aparece no log do servidor com o nome da variável.

Depois de salvar as variáveis na Vercel, **faça um redeploy**. A variável nova
não vale para o deploy que já está no ar.

Confira também `NEXT_PUBLIC_SITE_URL=https://pibarber.vercel.app`. É dela que
sai o link dentro de cada mensagem. Sem ela, o cliente recebe um link para
`localhost`.

---

## 2. O webhook

O webhook é por onde a Meta avisa três coisas:
- que a mensagem foi **entregue** e **lida**;
- que um template foi **aprovado ou reprovado**;
- que o cliente respondeu **PARAR**.

1. developers.facebook.com → **Meus apps** → o app do PiBarber.
2. Menu **WhatsApp → Configuração**. No "Início rápido", é a **Etapa 2 → Configurar webhooks**.
3. Em **Webhook**, clique em **Editar** e preencha:
   - **URL de retorno de chamada:** `https://pibarber.vercel.app/api/webhooks/whatsapp`
   - **Verificar token:** o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Clique em **Verificar e salvar**. A Meta faz um `GET` na URL, e o PiBarber
   devolve o desafio.
   - Se falhar, confira três coisas:
     - o deploy com as variáveis já está no ar;
     - o token é idêntico dos dois lados, sem espaço sobrando;
     - `WHATSAPP_PHONE_NUMBER_ID` está preenchido. Sem ele, a rota responde 403.
5. Em **Campos do webhook**, clique em **Gerenciar** e **assine** estes dois:
   - `messages`
   - `message_template_status_update`

⚠️ **Não pule o passo 5.** Sem `messages`, as mensagens ficam em "Enviado" para
sempre e o PARAR não funciona. Sem `message_template_status_update`, o
PiBarber só descobre que um template foi aprovado pela conferência que o cron
faz a cada 5 minutos.

Toda requisição que chega é conferida pela assinatura `X-Hub-Signature-256`
com o `WHATSAPP_APP_SECRET`. Requisição sem assinatura válida recebe 401 e não
é processada.

---

## 3. O token permanente

⚠️ **O token do botão "Gerar token" da Configuração da API dura 24 horas.** Ele
serve para testar no painel e mais nada. Em produção, a integração para no dia
seguinte com o erro `190`: o log grita e a tela do dono mostra "Integração
desconectada".

O token de produção é de **Usuário do Sistema**:

1. business.facebook.com → **Configurações do negócio** (engrenagem).
2. **Usuários → Usuários do sistema → Adicionar**. Nome: `pibarber-api`. Função: **Admin**.
3. Com o usuário selecionado: **Atribuir ativos**.
   - **Apps:** o app do PiBarber, com **controle total**.
   - **Contas do WhatsApp:** a conta do PiBarber, com **controle total**.
4. **Gerar novo token**:
   - **App:** o app do PiBarber.
   - **Expiração:** **Nunca**.
   - **Permissões:** marque `whatsapp_business_management` e `whatsapp_business_messaging`.
5. Copie o token **agora**, porque ele não aparece de novo, e cole em `WHATSAPP_ACCESS_TOKEN`.

Se o token vazar, volte a esse usuário e **revogue**. Depois gere outro.

---

## 4. O número precisa ser +55

Duas regras da Meta que já custaram tempo neste projeto:

**O número de teste da Meta não serve.** Ele é americano (`+1 555…`), e a Meta
bloqueia envio entre países para o Brasil. Toda mensagem volta com o erro
`130497`, sem contorno. O número registrado precisa ser brasileiro.

**O número registrado deixa de funcionar no WhatsApp comum.** É migração, não
cópia. Se ele estiver hoje num celular com WhatsApp ou WhatsApp Business:
- apague a conta no aplicativo antes (Configurações → Conta → Apagar conta);
- use um número dedicado à plataforma, e não o seu pessoal.

Para registrar:

1. WhatsApp Manager (business.facebook.com/wa/manage) → **Números de telefone → Adicionar número**.
2. Nome de exibição: **PiBarber**. Categoria: serviços pessoais / beleza.
3. Verifique o número por SMS ou ligação.
4. Em **Configurações da conta → Forma de pagamento**, cadastre o cartão.
5. Copie o **Phone number ID** do número novo para `WHATSAPP_PHONE_NUMBER_ID`.

Se o número aparecer como "não registrado" ou "pendente" na Configuração da
API, registre pela API. O PIN é uma senha de 6 dígitos que você escolhe e
guarda: é a confirmação em duas etapas do número.

```bash
# Lê o token do .env.local em vez de digitá-lo, para ele não ficar no histórico.
set -a; . ./.env.local; set +a
curl -X POST "https://graph.facebook.com/v25.0/$WHATSAPP_PHONE_NUMBER_ID/register" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```

---

## 5. Submeter os três templates

Os templates são da **categoria UTILITY**, no **idioma `pt_BR`**. Os textos saem
de `src/lib/whatsapp/catalogo.ts`. A Meta exige um **exemplo** de cada parâmetro
(`example.body_text`) e recusa o template sem ele.

### Pelo script (recomendado)

Com `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_WABA_ID` no `.env.local`, e Node 22.18
ou mais novo:

```bash
node --no-warnings scripts/whatsapp-templates.mjs --ver      # mostra o que vai ser enviado
node --no-warnings scripts/whatsapp-templates.mjs --enviar   # submete os três
node --no-warnings scripts/whatsapp-templates.mjs --listar   # confere o status
```

O script lê o **mesmo** catálogo que o código usa para enviar. Assim, o texto
aprovado é exatamente o que o PiBarber manda.

### À mão (se preferir)

WhatsApp Manager → **Modelos de mensagem → Criar modelo** → categoria
**Utilidade** → nome e idioma **Português (BR)**. Cole o corpo **exatamente**
como abaixo; um espaço diferente já é outro template. Depois preencha os
exemplos.

**`pibarber_confirmacao_v1`**
```
Olá {{1}}! Seu horário na {{2}} está confirmado para {{3}} às {{4}} com {{5}}. Acompanhe ou cancele em {{6}} quando precisar.
```
Exemplos: `João` · `Barbearia do Zé` · `sexta, 18/09` · `14:30` · `Carlos` · `https://pibarber.vercel.app/app/agendamentos`

**`pibarber_lembrete_v2`**
```
Olá {{1}}! Lembrete: você tem horário {{2}} na {{3}}, às {{4}}, com {{5}}. Se não puder vir, cancele em {{6}} para liberar o horário.
```
Exemplos: `João` · `amanhã` · `Barbearia do Zé` · `14:30` · `Carlos` · `https://pibarber.vercel.app/app/agendamentos`

**`pibarber_cancelamento_v1`**
```
Olá {{1}}! Seu horário na {{2}} em {{3}} às {{4}} foi cancelado. Marque outro em {{5}} quando quiser.
```
Exemplos: `João` · `Barbearia do Zé` · `sexta, 18/09` · `14:30` · `https://pibarber.vercel.app/b/barbearia-do-ze`

### Depois de submeter

A análise leva de minutos a dois dias. **Enquanto um template não estiver
aprovado, o PiBarber não enfileira aquela mensagem.**
- Na tela do dono aparece "Em análise pela Meta".
- Aprovado, o status chega pelo webhook (§2) ou pela conferência do cron em até 5 minutos. A partir daí a mensagem passa a sair.

**Reprovado?** O motivo aparece em `whatsapp_templates.reject_reason` e na tela
do dono. Para corrigir:
1. Ajuste o texto no catálogo **e** na PARTE 4 do `supabase/24_whatsapp.sql`.
2. Troque o nome para `_v2`.
3. Submeta de novo.

A Meta não deixa reeditar um template com o mesmo nome.

---

## 6. Ligar o gatilho: pg_cron (ativo) ou Vercel Cron

**Mecanismo escolhido: `pg_cron` + `pg_net` no Supabase, a cada 5 minutos.**
Ele chama `POST /api/cron/whatsapp`, que:
1. confere os templates;
2. enfileira os lembretes;
3. envia o que venceu.

**Sem esse gatilho os lembretes nunca saem.** A confirmação e o cancelamento
ainda saem, porque são enviados na hora pela própria ação. Mas uma mensagem
que falhou por instabilidade da Meta só é retentada pelo cron.

> **Estado em 2026-09-15:** a migração liga as extensões, mas **o agendamento
> precisa ser feito à mão**, porque leva a URL e o segredo, e o arquivo vai
> para o Git. Quando fizer, anote aqui a data.

### 6.1 pg_cron (o que vale)

1. Rode `supabase/24_whatsapp.sql` no SQL Editor, se ainda não rodou. A mensagem final é `24 aplicada — …`.
2. Supabase → **Database → Extensions** e confirme que `pg_cron` e `pg_net` estão ligadas.
3. No SQL Editor, guarde o segredo no Vault. Assim ele não fica no texto do job:
   ```sql
   select vault.create_secret('COLE_O_CRON_SECRET_AQUI', 'whatsapp_cron_secret');
   ```
4. Agende:
   ```sql
   select cron.schedule(
     'whatsapp-despacho',
     '*/5 * * * *',
     $job$
       select net.http_post(
         url     := 'https://pibarber.vercel.app/api/cron/whatsapp',
         headers := jsonb_build_object(
           'Content-Type',  'application/json',
           'Authorization', 'Bearer ' || (
             select decrypted_secret from vault.decrypted_secrets
              where name = 'whatsapp_cron_secret'
           )
         ),
         timeout_milliseconds := 60000
       );
     $job$
   );
   ```
5. Espere 5 minutos e confira:
   ```sql
   select * from cron.job_run_details order by start_time desc limit 5;
   select status_code, content from net._http_response order by created desc limit 5;
   ```
   O esperado é `status_code = 200` e um JSON com `"ok":true`.

| Resposta | Significa |
|---|---|
| `401` | O segredo do Vault não bate com o `CRON_SECRET` da Vercel. |
| `200` com `"desligado":true` | Falta `WHATSAPP_PHONE_NUMBER_ID` na Vercel. |

Para parar: `select cron.unschedule('whatsapp-despacho');`

### 6.2 Vercel Cron (alternativa)

Só use se o `pg_cron` não estiver disponível. O endpoint aceita `GET`, que é o
que a Vercel manda, com o mesmo `Authorization: Bearer <CRON_SECRET>`: a Vercel
envia sozinha o `CRON_SECRET` que estiver nas variáveis.

⚠️ **Confira o limite do seu plano.** No Hobby, o Vercel Cron roda **no máximo
uma vez por dia**, e sem hora exata. Isso não serve para lembrete às 18h nem
para retentativa. Para `*/5 * * * *` é preciso o Pro.

Crie `vercel.json` na raiz:

```json
{
  "crons": [{ "path": "/api/cron/whatsapp", "schedule": "*/5 * * * *" }]
}
```

Se ativar esta alternativa, **troque o "Mecanismo escolhido" do topo desta
seção** e a §7 do `pibarber-CONTEXT.md`.

---

## 7. Como conferir que funciona

1. Numa barbearia com agendamento online ligado, agende pelo site
   (`/b/<slug>/agendar`) usando **o seu celular**.
2. No SQL Editor:
   ```sql
   select event, status, attempts, sent_at, delivered_at, read_at, failure_code, failure_reason
     from whatsapp_messages
    order by created_at desc
    limit 5;
   ```
   - Em segundos, a linha `confirmation` vai de `pending` a `sent`.
   - Quando o celular recebe, vira `delivered`. É o webhook funcionando.
   - Ao abrir a conversa, vira `read`.
3. A mesma lista, sem o telefone, aparece para o dono em **/painel/configuracoes → Mensagens de WhatsApp → Últimos envios**.
4. **Lembrete:** agende para amanhã, antes das 18h de hoje. Em até 5 minutos surge uma linha `reminder` com `scheduled_for` às 18h de hoje, e o agendamento ganha `reminder_sent_at`.
5. **Cancelamento:** cancele pelo painel. Surge uma linha `cancellation`, e um lembrete que ainda estava na fila vira `failed` / `OBSOLETA` sem ser enviado.
6. **Opt-out:** responda **PARAR** no WhatsApp. Surge uma linha em `whatsapp_opt_outs`, e o próximo agendamento desse telefone não enfileira nada.

### Se não chegou

A primeira coisa a olhar é o `failure_code` da linha.

| Sintoma | Causa provável |
|---|---|
| Nenhuma linha em `whatsapp_messages` | Variáveis ausentes ou sem redeploy (§1); template não aprovado (§5); interruptor desligado na loja; telefone em `whatsapp_opt_outs`. |
| Linha fica `pending` com `attempts = 0` | O envio imediato falhou e o cron não está rodando (§6). |
| `failed` / `190` | Token expirado: é o de 24h (§3). |
| `failed` / `130497` | Número de teste americano ou número de fora do Brasil (§4). |
| `failed` / `131042` | Sem forma de pagamento na conta do WhatsApp (§0). |
| `failed` / `131026` | O número do cliente não tem WhatsApp. |
| `failed` / `132000`–`132015` | Template com nome ou parâmetros diferentes do catálogo (§5). |
| Fica em `sent`, nunca `delivered` | O campo `messages` não foi assinado no webhook (§2). |

Os logs da Vercel mostram os erros com o prefixo `[whatsapp]`. Telefone aparece
sempre mascarado (`5516****2093`), e o token nunca aparece.

---

## 8. O teto de 250 por dia, e o que a verificação destrava

Enquanto a empresa **não é verificada** na Meta, a conta pode iniciar conversa
com no máximo **250 destinatários únicos a cada 24 horas** (janela móvel).
- É destinatário, não mensagem: o mesmo cliente recebendo confirmação e lembrete conta **uma** vez.
- Na prática, são 250 clientes diferentes agendando ou sendo lembrados por dia, somando **todas** as barbearias.

**Quando bate no teto:**
- A Meta recusa as mensagens para destinatários novos até a janela andar.
- No PiBarber essas linhas terminam `failed`, com o código da Meta em `failure_code`, e o dono vê "Não foi possível entregar".
- **O agendamento não é afetado.** Só a mensagem não sai.
- Não há retentativa automática para isso, de propósito: reenviar horas depois uma confirmação atrasada confunde mais do que ajuda.

**O que a verificação de empresa destrava:**
- **O teto sobe em degraus:** 1.000 → 10.000 → 100.000 → ilimitado. A Meta sobe de degrau sozinha conforme o volume e a qualidade das mensagens.
- **O nome "PiBarber" aparece para o cliente** na lista de conversas. Sem verificação, ele vê só o número.

**Onde verificar:** Configurações do negócio → Central de segurança → Verificação
da empresa. Pede CNPJ e documentos da empresa.

**A qualidade conta.** Denúncias e bloqueios derrubam a nota do número e podem
baixar o teto. É por isso que o PARAR é respeitado na hora, e o que estava na
fila para aquela pessoa é descartado.
