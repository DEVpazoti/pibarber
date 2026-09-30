# Testes E2E (Playwright)

Testes de ponta a ponta: um navegador de verdade clica no app, contra um
**Supabase local** (Docker) recriado do zero a cada rodada. Nada toca o banco
de dev nem o de produção, e nenhum e-mail, WhatsApp ou cobrança sai de verdade.

## Rodar

```bash
npx supabase start       # uma vez por sessão; sobe o Supabase no Docker (~2–3 GB de RAM)
npm run e2e              # recria o banco local e roda tudo (~2,5 min)
npm run e2e:ui           # interface para assistir e depurar teste a teste
npm run e2e:relatorio    # abre o relatório da última rodada (prints, vídeos, trace)
npx supabase stop        # ao terminar, libera a memória
```

Um arquivo ou um teste só, sem recriar o banco (rápido para escrever teste):

```bash
E2E_SEM_RESET=1 npx playwright test e2e/cliente.spec.ts
E2E_SEM_RESET=1 npx playwright test e2e/cliente.spec.ts:46 --project=computador
```

Pode rodar com o `npm run dev` ligado: o servidor de teste usa a porta **3100**
e a pasta `.next-e2e` (`NEXT_DIST_DIR`), sem atropelar o `.next` do dev.

## Como é montado

| Peça | Onde | O quê |
|---|---|---|
| Supabase local | `supabase/config.toml` | Portas 54321–54324; app em `localhost:3100`; os modelos de e-mail de `supabase/emails/`; limites de login altos; sem confirmação de e-mail |
| Banco | `e2e/preparar.ts` | `supabase db reset` + `supabase/[0-9]*.sql` na ordem (menos 05 e 06), com o seed 04 |
| Ambiente do app | `e2e/ambiente.ts` | Toda variável sensível definida (mesmo vazia), para o `.env.local` não vazar para o teste |
| Ajudantes | `e2e/apoio.ts` | `criarBarbeariaPronta`, `criarCliente`, `entrar`, `simularPagamento`, `sql`, `ultimoEmailDoAuth` |

O que vem de fora é simulado:

- **E-mail do app** (Resend): `EMAIL_SIMULAR=1` — a fila anda até `sent`, mas
  nada sai. O teste confere `email_messages` (tipo e destinatário).
- **E-mail do Auth** (cadastro, nova senha): o Supabase local entrega no
  **Mailpit** (`http://127.0.0.1:54324`), e o teste abre o link de verdade.
- **Asaas**: o teste faz o POST do webhook com o token de teste.
- **Localização do setup**: GPS simulado do navegador.
- **WhatsApp e Google Maps**: desligados.

## O que está coberto (fases 1 e 2 — 33 testes, ~3,5 min)

| Arquivo | Fluxos |
|---|---|
| `login.spec.ts` | as duas portas; senha errada; painel sem login; "Esqueci minha senha" com o e-mail e o link reais |
| `cliente.spec.ts` | busca; agendar logado (+ e-mails ao cliente e ao dono); cancelar (+ aviso ao dono); avaliar; agendar sem conta e o link `/a/<token>`; loja que exige conta. Roda também no **celular** (Pixel 7) |
| `setup.spec.ts` | cadastro do dono → 6 etapas → loja no ar; celular repetido recusado |
| `assinatura.spec.ts` | teste vencido pausa painel e página pública; pagamento pelo webhook libera; aviso de teste acabando (uma vez só); webhook e cron sem segredo recusados |
| `painel.spec.ts` (fase 2) | encaixe pelo balcão; concluir no Pix (caixa + comissão) e pagar a comissão; falta; cancelar pelo painel (+ e-mail ao cliente); fiado concluído e recebido; pendências concluídas em lote; limite do plano Solo na equipe; lista de espera (com nome e contato) |

Próximas fases (ainda não feitas): segurança (assistente sem dinheiro, "ver
como o dono" só leitura, dono pelo lado cliente), /admin e o lembrete de voltar.

## Escrevendo um teste novo

- **Cada teste cria o que usa**, com nome único (`unico()`, `celularUnico()`).
  Nada de depender de outro teste — eles rodam em paralelo e em qualquer ordem.
  As contas do seed (`dono.saopaulo@`, `cliente1@`) só para LER.
- **Seletores**: papel e nome (`getByRole("button", { name: "Continuar" })`);
  para campo, o `id` (`#email`) — o rótulo com asterisco de obrigatório não
  bate com nome exato.
- **Datas**: agende para amanhã (a 2ª data da tira), nunca "hoje", que depende
  da hora em que o teste roda.
- **Agendamento sem conta**: passe um `x-forwarded-for` próprio — o app aceita
  um por IP a cada 30 s, e todos os testes saem do mesmo computador.
- **Janelas**: ache pelo título — `getByRole("dialog", { name: "Concluir atendimento" })`.
  O Modal e o Sheet ligam o título via `aria-labelledby`.
- **Não sabe o nome de um botão?** `console.log(await page.locator("main").ariaSnapshot())`
  mostra a tela como o Playwright a enxerga.
- **Cache da página pública**: mude o banco ANTES da primeira visita, ou passe
  por algo que revalide (o webhook, as actions).

## Quando falha

`npm run e2e:relatorio` mostra print, vídeo e o *trace* (passo a passo, com a
rede e o DOM) de cada teste que falhou. "O Supabase local não está rodando" →
`npx supabase start`. Memória no limite → `workers` em `playwright.config.ts`.
