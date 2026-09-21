# Ativação do WhatsApp — meu roteiro

**Atualizado em:** 19/09/2026

Checklist da configuração: o que já foi feito nos painéis e o que falta clicar.
O passo a passo detalhado de cada item está em [docs/whatsapp.md](docs/whatsapp.md).

> ⚠️ **Sem segredos aqui.** Os valores ficam no `.env.local` (só nesta máquina,
> ignorado pelo Git) e no painel da Vercel.

---

## ✅ Já feito

### Número de produção — WhatsApp Manager
- [x] Conta **Pi Barber** criada
- [x] Número **+55 16 99305-5888** adicionado e verificado
- [x] PIN de duas etapas definido (**guarde**: é pedido se registrar de novo)
- [x] Registrado na Cloud API pela chamada `/register`
      (o painel não faz isso; deu "A conta não existe" até rodar)

**Estado hoje:** `VERIFIED` · plataforma `CLOUD_API`
**Phone Number ID:** `1288033061065766`
⚠️ Não confundir com `1294244557111053` — esse é o número de teste americano,
que não entrega para o Brasil (erro `130497`).

### Credenciais coletadas
- [x] `WHATSAPP_PHONE_NUMBER_ID` — Etapa 1 do painel do app
- [x] `WHATSAPP_WABA_ID` — WhatsApp Manager, seletor da conta Pi Barber
- [x] `WHATSAPP_ACCESS_TOKEN` — Usuário do Sistema
- [x] `WHATSAPP_APP_SECRET` — Configurações do app → Básico
- [x] `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — inventado por mim
- [x] `CRON_SECRET` — gerado, está na última linha do `.env.local`

### Templates submetidos à Meta — 19/09
- [x] `pibarber_confirmacao_v1`
- [x] `pibarber_lembrete_v1`
- [x] `pibarber_cancelamento_v1`

Os três estão **em análise (PENDING)**. Conferir quando quiser:
```bash
node --no-warnings scripts/whatsapp-templates.mjs --listar
```

---

## ⏳ Falta fazer

### 1. Colocar as 6 variáveis na Vercel
**Onde:** `vercel.com` → projeto PiBarber → **Settings** → **Environment Variables**
(o projeto é da conta do Guilherme — preciso de acesso, ou ele faz)

- [ ] `WHATSAPP_PHONE_NUMBER_ID` = `1288033061065766`
- [ ] `WHATSAPP_WABA_ID`
- [ ] `WHATSAPP_ACCESS_TOKEN`
- [ ] `WHATSAPP_APP_SECRET`
- [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- [ ] `CRON_SECRET`
- [ ] Conferir `NEXT_PUBLIC_SITE_URL` = `https://pibarber.vercel.app`

Marcar **Production**. Nenhuma com prefixo `NEXT_PUBLIC_`.

### 2. Subir o código e fazer o deploy
**Repositório:** `github.com/DEVpazoti/pibarber` (branch padrão `main`)

- [x] Branch enviado, PR #1 mergeado no `main`
- [x] Deploy no ar — `/privacidade` responde 200 e `/api/webhooks/whatsapp`
      responde 403 (rota existe e recusa token errado)

⚠️ **"Redeploy" na Vercel reconstrói o MESMO commit** — não busca o que há de
novo no GitHub. Foi o que confundiu aqui.

⚠️ **Não confundir com `RafaelVetrano/BARBER-VP`**: apesar do nome, é outro
projeto (monorepo com apps/, packages/, Docker, pnpm). O PiBarber é este aqui.

Hoje a rota do webhook responde **404** no ar. Enquanto isso não subir, os
passos 3 e 6 não têm como funcionar.

### 3. ✅ Salvar o webhook na Meta — FEITO (19/09)
**Onde:** painel do app → WhatsApp → Configuração → **Etapa 2** → Configurar webhooks
**Depende de:** passos 1 e 2 prontos

- [x] URL de callback e token salvos — o app "Barber VP" está inscrito na WABA
- [x] Conferido: o desafio responde certo com o token real, ou seja, o valor
      na Vercel bate com o do painel
- [ ] **Confirmar no painel** que os campos **`messages`** e
      **`message_template_status_update`** estão assinados

Sem assinar os campos, a mensagem fica em "Enviado" para sempre e o PARAR não
funciona.

### 4. ✅ Rodar a migração no Supabase — FEITA (19/09)

- [x] `supabase/24_whatsapp.sql` aplicada no projeto `ovhzyyhopvrcowwvbqdk`
- [x] `database.types.ts` regerado a partir do banco

Conferido depois de aplicar: **3** templates, **0** na fila, **0** policies nas
tabelas de WhatsApp (elas são só da service role), **4** funções criadas e as
**6** barbearias com as três mensagens ligadas.

Segurança conferida em produção: a chave anônima recebe `permission denied` nas
três tabelas — ninguém de fora lê a fila nem os telefones.

Bônus: **`pg_cron` e `pg_net` já estavam instalados** no projeto, então o passo
8 não precisa ligar extensão nenhuma.

### 5. Publicar o app na Meta
**Onde:** painel do app → seletor do topo, **Desenvolvimento → Ao vivo**

- [x] Página de política de privacidade criada — fica em `/privacidade`
      (entra no ar junto com o deploy do passo 2)
- [ ] Preencher a URL em Configurações do app → Básico:
      `https://pibarber.vercel.app/privacidade`
- [ ] Virar para **Ao vivo**

Em modo de desenvolvimento só chegam webhooks de teste — é o aviso amarelo do
painel.

### 6. ✅ Cadastrar forma de pagamento — FEITO (19/09)
**Onde:** WhatsApp Manager → Configurações da conta → Forma de pagamento

- [x] Cartão cadastrado

Era o que evitava o erro `131042` em todo envio.

### 7. ✅ Templates aprovados — FEITO (19/09)
- [x] Os três em **APPROVED** na Meta e já sincronizados no banco

De minutos a 2 dias. **Enquanto estiverem PENDING, nenhuma mensagem sai** — e
a tela do dono mostra "Em análise pela Meta", não erro.

### 8. ✅ Cron agendado — FEITO (19/09)
- [x] `pg_cron` e `pg_net` já estavam instalados
- [x] `CRON_SECRET` guardado no Vault como `whatsapp_cron_secret`
- [x] Job `whatsapp-despacho` ativo, a cada 5 minutos

Testado à mão antes de agendar: o endpoint respondeu
`{"ok":true,"templates":{"atualizados":3}}` — autenticou e sincronizou.

Para parar: `select cron.unschedule('whatsapp-despacho');`

Sem isso: confirmação e cancelamento saem na hora, mas **lembrete nenhum sai**.

### 9. Testar de ponta a ponta
- [ ] Agendar pelo site com o meu celular → confirmação chega em segundos
- [ ] Cancelar pelo painel → chega o aviso
- [ ] Agendar para amanhã → lembrete marcado para as 18h de hoje
- [ ] Responder **PARAR** → para de receber

---

## O que dá para fazer em paralelo

O passo **7** é só esperar a Meta. O **5** depende do deploy para a URL
responder. Todo o resto agora depende dos passos 1 e 2.
Os passos **3, 8 e 9** só depois de 1 e 2.

---

## Se uma mensagem não chegar

Olhar o `failure_code` da linha em `whatsapp_messages`. Tabela completa em
`docs/whatsapp.md` §7. Os mais comuns:

| Código | O que é |
|---|---|
| `190` | Token expirado — usei o de 24h no lugar do permanente |
| `130497` | Número de teste americano, ou destinatário fora do Brasil |
| `131042` | Falta forma de pagamento (passo 6) |
| `131026` | O número do cliente não tem WhatsApp |
| `132000`–`132015` | Template não aprovado, ou texto diferente do que o código envia |
