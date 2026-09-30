# E-mails do PiBarber (Resend)

Dois caminhos saem pelo Resend:

| Caminho | O quê | Quem manda |
|---|---|---|
| **Auth** | Confirmação de cadastro, "Esqueci minha senha" | O Supabase, usando o Resend como **SMTP** |
| **Avisos** | Dono: agendamento novo, cancelamento, teste acabando, agenda pausada, fatura vencida, pagamento, renovação. Cliente: confirmação, lembrete, cancelamento pela loja, vaga na fila, avaliação, lembrete de voltar | O PiBarber, pela **API** do Resend, via fila `email_messages` (`supabase/31_emails.sql`) |

O remetente é sempre o PiBarber; o nome da barbearia vai no texto (CONTEXT §1).

## 1. Domínio no Resend

1. resend.com → **Domains → Add domain** → o domínio (ou um subdomínio, ex.: `mail.pibarber.app`, que isola a reputação do domínio principal).
2. Copie para o DNS os registros que o Resend mostrar (**SPF** e **DKIM**) e acrescente um **DMARC** (`_dmarc` TXT `v=DMARC1; p=none;`). Espere o status **Verified**.
3. **API Keys → Create** com permissão *Sending access*, restrita ao domínio. É o `RESEND_API_KEY`.

Plano grátis: 3.000 e-mails/mês e 100/dia. Com o lembrete de voltar ligado em várias lojas, o Pro (US$ 20, 50 mil/mês) vira necessário.

## 2. Variáveis (Vercel e `.env.local`)

```
RESEND_API_KEY=re_...
EMAIL_REMETENTE="PiBarber <avisos@mail.pibarber.app>"
EMAIL_RESPONDER_PARA=contato@pibarber.app   # opcional
```

`NEXT_PUBLIC_SITE_URL` precisa estar certo: todo link de e-mail sai dele.

## 3. Supabase → SMTP (cadastro e nova senha)

**Authentication → Emails → SMTP Settings → Enable custom SMTP**

| Campo | Valor |
|---|---|
| Sender email | `avisos@mail.pibarber.app` |
| Sender name | `PiBarber` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a mesma `RESEND_API_KEY` (ou outra chave só para isso) |

Sem SMTP próprio o Supabase manda poucos e-mails por hora e só para a equipe
do projeto — **em produção isso trava cadastros**. Depois de ligar, suba o
limite em **Authentication → Rate Limits → emails por hora** (ex.: 100).

## 4. Supabase → modelos de e-mail

**Authentication → Emails → Templates.** Cole o HTML dos arquivos:

| Modelo | Assunto | Arquivo |
|---|---|---|
| Confirm signup | `Confirme seu e-mail no PiBarber` | `supabase/emails/confirmar-cadastro.html` |
| Reset password | `Crie uma nova senha no PiBarber` | `supabase/emails/redefinir-senha.html` |

Os links usam `{{ .RedirectTo }}&token_hash=…`: caem direto no `/callback`,
que troca o token por sessão (`verifyOtp`). Funciona mesmo abrindo o e-mail em
outro aparelho — o modelo padrão (`{{ .ConfirmationURL }}`) usa o código do
PKCE, que só vale no navegador que pediu.

Confira em **URL Configuration → Redirect URLs** que `https://pibarber.app/callback**`
está na lista.

## 5. O cron dos e-mails (lembretes, cobrança, volta)

Os avisos de agendar/cancelar saem na hora. Os demais dependem do cron, igual
ao WhatsApp (`docs/whatsapp.md` §6.1). No SQL Editor, uma vez:

```sql
-- se o segredo ainda não estiver no Vault (é o mesmo CRON_SECRET da Vercel):
-- select vault.create_secret('COLE_O_CRON_SECRET_AQUI', 'whatsapp_cron_secret');

select cron.schedule(
  'emails-despacho',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url     := 'https://pibarber.app/api/cron/emails',
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

Teste manual: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://pibarber.app/api/cron/emails`.

## 6. Lembrete de voltar (marketing)

- Vem **ligado** em toda loja; ela desliga em **Configurações → E-mails**.
- O intervalo é da plataforma: **/admin → E-mails** (padrão 21 dias).
- Sai uma vez por visita, só para quem não tem horário marcado, até 30 dias
  depois do prazo, entre 9h e 20h.
- Todo e-mail leva "Não quero mais receber" (`/sair/<id>`) e o cabeçalho de
  descadastro de um clique (`/api/emails/sair/<id>`) que o Gmail exige.

## 7. Quando algo não chega

| Sintoma | Onde olhar |
|---|---|
| Nada entra na fila | `RESEND_API_KEY` definido? /admin → E-mails avisa quando está desligado |
| Fila com falha `validation_error` | Domínio do `EMAIL_REMETENTE` não verificado no Resend |
| Lembrete/cobrança nunca saem | O `cron.schedule` do item 5 foi rodado? `select * from cron.job_run_details order by start_time desc limit 10;` |
| Cadastro sem e-mail | SMTP do item 3; Supabase → Logs → Auth |
| Link de nova senha "expirado" | Modelo do item 4 não colado (o padrão exige o mesmo navegador) |
