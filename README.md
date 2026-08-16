# PiBarber

Plataforma de agendamento e gestão para barbearias.
**Desenvolvido por PiSystem.**

Três produtos dentro do mesmo sistema:

- **App do cliente** (`/app`) — encontra barbearias, agenda, acompanha e avalia. Instala no
  celular como PWA, sem loja de aplicativos.
- **Painel do dono** (`/painel`) — agenda, clientes, equipe, caixa, comissão, fiado e relatório.
- **Painel do assistente** (`/painel`, menu reduzido) — o mesmo painel sem nenhum dado
  financeiro.

É um **marketplace**: o cliente tem uma conta só e agenda em qualquer barbearia da
plataforma. A `ESPECIFICACAO.md` é a fonte da verdade sobre escopo, banco e telas; a
`ESTADO.md` conta o que já está pronto e quais armadilhas já custaram tempo.

---

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components) |
| Linguagem | TypeScript estrito |
| Estilo | Tailwind CSS v4 — tokens no `@theme` do `globals.css`, sem `tailwind.config.js` |
| Banco / Auth | Supabase (Postgres 15+), com RLS de verdade |
| Gráfico | Recharts |
| Ícones | lucide-react |
| Fontes | `next/font` — Fraunces (marca e h1) + Inter (o resto) |
| Hospedagem | Vercel |

---

## Rodar local

```bash
npm install
cp .env.example .env.local     # e preencha as quatro variáveis
npm run dev -- --port 3001
```

Abra `http://localhost:3001`.

> A porta 3001 não é capricho: a 3000 costuma estar ocupada por outro projeto Next na
> máquina de desenvolvimento, e `NEXT_PUBLIC_SITE_URL` precisa refletir a porta real,
> senão o callback do Google volta para o lugar errado.

### As quatro variáveis

| Variável | O que é |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima. Vai para o navegador — quem protege o banco é a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **SEGREDO.** Ignora a RLS por completo. Só servidor |
| `NEXT_PUBLIC_SITE_URL` | A URL onde o site roda |

Todas em **Project Settings → API** no painel do Supabase.

### Geocoding — `GOOGLE_MAPS_API_KEY`

É o que transforma o endereço da barbearia em latitude e longitude, e a coordenada é o
que faz a loja aparecer no filtro **“Próximas”** do app. Sem ela a loja continua achável
por nome e por cidade, mas some da busca por proximidade.

1. `console.cloud.google.com` → **APIs e serviços → Biblioteca** → habilite a
   **Geocoding API**.
2. **Credenciais → Criar credenciais → Chave de API.**
3. **Restrinja a chave à Geocoding API** (Restrições de API). Chave irrestrita com
   billing ligado é conta que outra pessoa gasta.
4. Cole no `.env.local` como `GOOGLE_MAPS_API_KEY=` — **sem `NEXT_PUBLIC_`**, de
   propósito: quem lê é só o servidor, dentro de `src/lib/geocoding.ts`.

Exige billing ativo no projeto do Google Cloud. O volume aqui é baixo — uma consulta por
barbearia, e só quando o dono mexe no endereço.

> **Não bloqueia nada.** Sem a variável, o botão “Localizar pelo endereço” explica que a
> busca não está configurada e o dono ainda marca o ponto pelo GPS do aparelho ou
> arrastando o pin no mapa. O mapa não usa o Google: são tiles do OpenStreetMap via
> Leaflet, que não custam nem pedem chave.

### Comandos

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

---

## As capturas da landing

O bloco "veja por dentro" da landing mostra **telas reais do sistema**, não
mockup. Os arquivos ficam em `public/capturas/` e são gerados por script — não
os edite à mão, e não os substitua por imagem desenhada.

```bash
npm run dev -- --port 3001 > dev.log 2>&1   # o script precisa do servidor no ar
node scripts/capturar-telas.mjs             # todas
node scripts/capturar-telas.mjs painel      # só as 5 telas do dono
node scripts/capturar-telas.mjs cliente     # só as 4 telas do app
```

O script abre o Chrome, loga com as contas de teste, emula o aparelho certo para
cada área (computador para o painel, celular para o app do cliente), fixa o tema
claro e fotografa. Os **nomes de arquivo são contrato** com `src/lib/landing.ts`:
renomear um exige mudar os dois lados, e as dimensões declaradas lá precisam
bater com o arquivo — é o que evita deslocamento de layout.

**As capturas não podem ter dado real de cliente.** Hoje isso é automático,
porque tudo que aparece nelas vem do seed, onde nome, telefone e valor são
inventados. Se um dia o script rodar contra um banco com cliente de verdade,
isso deixa de valer.

### O dia de demonstração

O seed espalha os atendimentos por uma janela que termina antes de hoje, então a
agenda e a tela Hoje saem vazias na captura. Para encher um sábado na
Navalha & Cia:

```bash
node scripts/dia-de-demonstracao.mjs --criar
node scripts/dia-de-demonstracao.mjs --desfazer
```

Ele escreve **pelas funções de verdade** (`book_appointment` e
`complete_appointment`, chamadas com o token do próprio dono), então caixa,
comissão e fiado ficam consistentes. ⚠️ Escreve no banco de produção — não há
ambiente separado.

---

## O banco — em que ordem rodar os SQL

Os scripts estão em `supabase/` e rodam no **SQL Editor** do Supabase, na ordem numérica.
Cada arquivo executa de ponta a ponta e é idempotente onde dá.

| Ordem | Arquivo | O que faz | O que conferir depois |
|---|---|---|---|
| 1 | `01_schema.sql` | Extensões, 9 enums, 21 tabelas, FKs, índices e a constraint `appointments_no_overlap` | `select count(*) from information_schema.tables where table_schema='public'` → **21** |
| 2 | `02_functions.sql` | Triggers, helpers `SECURITY DEFINER` e as funções de negócio | `select proname from pg_proc where pronamespace='public'::regnamespace` → ~20 funções |
| 3 | `03_rls.sql` | RLS nas 21 tabelas, policies e grants | `select count(*) from pg_policies where schemaname='public'` → ~49 |
| 4 | `04_seed.sql` | 4 barbearias, equipe, serviços, ~30 clientes e ~80 agendamentos | As 4 barbearias aparecem em `/app/buscar` |

Depois vêm as **migrações**, na ordem, cada uma com o motivo escrito no próprio cabeçalho:

| Arquivo | O que muda |
|---|---|
| `07_comissao_parcial_enum.sql` · `08_comissao_parcial.sql` | Pagamento parcial de comissão |
| `09_beneficios.sql` | Catálogo de comodidades da barbearia |
| `10_avaliacoes_publicas.sql` | Avaliações visíveis no perfil público |
| `11_book_appointment_autorizacao.sql` | **Segurança**: `book_appointment` passa a conferir quem chama |
| `12_status_agendado.sql` | Unifica `confirmed` em `scheduled` |
| `13_agendamento_avulso.sql` | Atendimento por ordem de chegada: telefone opcional, ficha avulsa, contador "Cliente N" |
| `14_storage_imagens.sql` | Bucket `imagens` e policies do Storage (ver [docs/imagens.md](docs/imagens.md)) |

> ⚠️ **O 13 é obrigatório para o painel funcionar.** A aba Clientes e o formulário
> de novo agendamento leem `customers.is_walk_in`, que só existe depois dele —
> sem o script, a lista de clientes aparece vazia. Rode o SQL **antes** de subir
> o código. O 14 é opcional: sem ele o envio de imagem falha com aviso na tela e
> o campo de URL continua funcionando.

E os de **operação**, para rodar quando precisar:

| Arquivo | Quando |
|---|---|
| `05_criar_admin.sql` | Marcar uma conta como `is_platform_admin` (dá acesso a `/admin`) |
| `06_apagar_dados.sql` | Apagar uma barbearia de teste na ordem certa das FKs |

> ⚠️ A versão vigente de `book_appointment` é a do **`11`**, não a do `02_functions.sql`.
> Se for mexer nessa função, parta do arquivo 11 — ele contém as correções de
> autorização, e reescrever a partir do 02 as desfaz em silêncio.

### Cadastrar uma barbearia nova

Todo cadastro pelo site nasce **cliente**; dono é criado por você.
O passo a passo está em **[docs/promover-dono.md](docs/promover-dono.md)**.

> **Erro `42601: unterminated dollar-quoted string`** significa só uma coisa: você copiou
> um bloco `do $$` pela metade e faltou o `end; $$;`. E antes de colar num editor já usado,
> `Ctrl+A` + `Delete` — a aba do SQL Editor guarda o conteúdo anterior e o erro aparece
> citando outro arquivo.

### Contas de exemplo do seed

Senha de todas: `pibarber123`.

```
dono.saopaulo@pibarber.dev     dono da Navalha & Cia       (São Paulo)
dono.campinas@pibarber.dev     dono da Barbearia do Tião   (Campinas)
dono.rio@pibarber.dev          dono da Corte Carioca       (Rio de Janeiro)
dono.bh@pibarber.dev           dono da Machado Barbearia   (Belo Horizonte)
cliente1@pibarber.dev … cliente6@pibarber.dev
```

---

## Login com Google

O login por e-mail e senha funciona sem configurar nada. O Google precisa ser habilitado
**nos dois lados**:

**1. No Google Cloud Console**

1. Crie um projeto e vá em *APIs e serviços → Credenciais*.
2. *Criar credenciais → ID do cliente OAuth → Aplicativo da Web*.
3. Em **URIs de redirecionamento autorizados**, cadastre:
   ```
   https://<SEU-PROJETO>.supabase.co/auth/v1/callback
   ```
4. Guarde o **Client ID** e o **Client Secret**.

**2. No Supabase**

1. *Authentication → Providers → Google* → ligue.
2. Cole o Client ID e o Client Secret.
3. Em *Authentication → URL Configuration*:
   - **Site URL**: `http://localhost:3001` (e o domínio da Vercel em produção)
   - **Redirect URLs**: acrescente `http://localhost:3001/callback` e
     `https://<seu-dominio>/callback`

A rota `/callback` já existe no projeto e troca o código pela sessão.

---

## Publicar na Vercel

1. Suba o repositório para o GitHub.
2. Na Vercel: *Add New → Project* e importe o repositório. O Next.js é detectado sozinho —
   não mexa em build command nem em output directory.
3. Em *Settings → Environment Variables*, cadastre as **quatro** variáveis, em Production,
   Preview e Development:

   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY      ← marque como sensível
   NEXT_PUBLIC_SITE_URL           ← https://<seu-dominio>
   ```

   E mais três, que **não quebram o build mas somem em silêncio** se faltarem:

   ```
   NEXT_PUBLIC_SUPORTE_EMAIL      ← sem ela o bloco de suporte não renderiza
   NEXT_PUBLIC_SUPORTE_TELEFONE   ← idem
   GOOGLE_MAPS_API_KEY            ← marque como sensível. Sem ela, "Localizar pelo
                                     endereço" fica indisponível e o dono só marca o
                                     ponto pelo GPS ou pelo mapa
   ```

4. *Deploy*.
5. **Volte ao Supabase** e acrescente o domínio da Vercel em *Authentication → URL
   Configuration* (Site URL e Redirect URLs). Sem isso, o login com Google volta para
   `localhost` e falha em produção.
6. Se usar domínio próprio, atualize `NEXT_PUBLIC_SITE_URL` e refaça o deploy — a variável
   é lida no build.

---

## Como a permissão é imposta

Três camadas, e só a primeira vale de verdade:

1. **RLS no Postgres.** Mesmo chamando `https://xxx.supabase.co/rest/v1/transactions`
   direto com a chave anônima, não passa. Dado financeiro usa `can_manage_money`; dado
   operacional usa `has_shop_access`.
2. **`src/middleware.ts`** — redireciona por prefixo de rota antes de renderizar.
3. **`requireRole()` / `requireShopContext()` / `requireOwnerContext()`** no topo de cada
   página.

A `SUPABASE_SERVICE_ROLE_KEY` só aparece dentro de `createAdminClient()`, e só depois de
confirmar o papel de quem chamou. São três usos legítimos: criar a barbearia em `/admin`,
criar o assistente em `/painel/equipe`, e o cliente excluindo a própria conta.

---

## Estrutura

```
supabase/              6 scripts SQL
public/                ícone do PWA e service worker
src/
  middleware.ts        refresh de sessão + redirecionamento por papel
  app/
    globals.css        o design system inteiro (tokens, tema escuro, utilitários)
    page.tsx           landing
    manifest.ts        PWA
    (auth)/            entrar · criar-conta · callback do Google
    app/               APP DO CLIENTE — 4 abas + 9 páginas de perfil
    painel/            PAINEL — dono e assistente
    admin/             cadastro de barbearias
    b/[slug]/          perfil público + fluxo de agendamento
    actions/           auth · appointments · booking · client · customers
                       · services · team · money · shop · admin
  components/
    ui/                as primitives do design system
    client/ painel/ booking/ charts/ admin/
  lib/
    supabase/          client · server · admin
    queries/           consultas de servidor (agenda · cliente · barbearia)
    auth.ts  types.ts  utils.ts  erros.ts  periodo.ts  viacep.ts  faq.ts
```

---

## Convenções

- **Server Components por padrão.** `"use client"` só com estado, evento ou hook de navegador.
- **Mutação = Server Action**, em `src/app/actions/`. Toda action devolve `ActionResult` e
  traduz o erro do Postgres para português — o usuário nunca lê `duplicate key value`.
- **Nunca descarte o `error` do Supabase.** Sempre `{ data, error }`, sempre com log
  prefixado pelo contexto.
- **Todo `catch` de servidor chama `unstable_rethrow(error)` na primeira linha** —
  `redirect()` e `notFound()` viajam como exceção, e um catch genérico as engole em silêncio.
- **Cor só por token.** Nada de `text-red-500`.
- **Dinheiro sempre com `brl()` e a classe `.tnum`.**
- **44px de alvo de toque, mínimo.** E respeite `env(safe-area-inset-bottom)`.
- **Data e hora resolvidas no servidor**, no fuso `America/Sao_Paulo`. Nunca calcule "hoje"
  no navegador e mande para o servidor.
