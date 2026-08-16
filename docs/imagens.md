# Imagens: URL externa ou upload?

Este documento responde três coisas: **como era**, **por que era assim**, e
**o que mudou**.

Vale para as quatro imagens do sistema — logo e capa da barbearia, foto do
profissional e foto do cliente.

---

## Como era: um campo de texto pedindo endereço

Até o ajuste nº 9, as três telas mostravam a mesma coisa:

```
Logo (URL)
[ https://…                                    ]
Por enquanto é um endereço de imagem.
```

O valor ia direto para uma coluna de texto (`barbershops.logo_url`,
`barbershops.cover_url`, `professionals.avatar_url`, `profiles.avatar_url`) e
era usado como `src` de um `next/image`. Por isso o `next.config.ts` liberava
`hostname: "**"`: como a imagem podia estar em qualquer lugar da internet,
qualquer host precisava ser aceito.

A foto do cliente nem isso tinha — o ícone de câmera sobre o avatar era
decorativo, com um comentário no código dizendo que a troca entraria "quando o
upload para o Storage for construído".

### Por que essa escolha, e por que ela foi boa

Não foi preguiça: foi ordem de prioridade. Upload de verdade não é "aceitar um
arquivo". É **bucket, policy de escrita por dono, limite de tamanho, validação
de tipo, redimensionamento, prévia, remoção do arquivo antigo, e host liberado
no `next.config`**. Nada disso desenha uma tela a mais para o barbeiro.

Enquanto a v1 precisava provar que agenda, caixa e comissão funcionavam, um
campo de texto entregava 90% do resultado visual por 1% do trabalho — e não
criava nenhuma dívida difícil de pagar depois, porque a coluna continua sendo a
mesma `text` nos dois modelos.

O que ela cobrava: **o dono precisava hospedar a imagem em outro lugar antes.**
E ninguém faz upload no Imgur pelo celular no meio do expediente. Na prática, a
maioria ficava sem logo.

---

## Prós e contras, lado a lado

| | **URL externa** | **Upload para o Storage** |
|---|---|---|
| Trabalho para implementar | Um `<input type="text">` | Bucket, policies, compressão, prévia, faxina |
| Trabalho **para o dono** | Hospedar em outro lugar primeiro | Escolher do rolo da câmera |
| Funciona pelo celular | Na prática, não | Sim — é o caso principal |
| Custo de armazenamento | Zero (é de outro) | Paga-se pelo que sobe |
| A imagem some sozinha? | **Sim.** O host de terceiro sai do ar, o link expira, alguém apaga a foto do Instagram | Não. É nossa |
| Velocidade de entrega | A do host alheio, que pode ser péssima | CDN do Supabase |
| Tamanho do arquivo | O que o outro serviu — pode ser 8 MB | Reduzido antes de subir |
| Controle de formato | Nenhum | JPG, PNG e WebP, conferidos duas vezes |
| Risco de conteúdo impróprio | O link pode passar a apontar para outra coisa depois | O arquivo é o que subiu |
| Privacidade | O host alheio vê o IP de cada cliente que abre a página | Fica em casa |
| `next.config` | Obriga a liberar host curinga | Um host declarado |

O ponto que decide não é nenhum dos custos: é a linha **"a imagem some
sozinha"**. Uma barbearia cuja logo desaparece porque um serviço de terceiro
mudou de política é um problema que o dono não tem como diagnosticar e a gente
não tem como prevenir.

---

## O que ficou valendo

**Os dois.** O upload é o caminho normal; a URL continua ali, atrás de um botão
"Usar um endereço".

Por que não remover a URL:

1. **Todo registro criado antes disso tem URL externa.** Tirar o campo tornaria
   essas imagens inexplicáveis: apareceriam na tela sem lugar para editar.
2. **Tem quem já tenha a imagem publicada** — a logo que o designer subiu no
   Drive da rede, a foto do perfil do Instagram. Obrigar a baixar e resubir é
   atrito sem ganho.
3. **Custa uma variante de estado**, não uma arquitetura. O campo grava texto
   nos dois casos.

### Como funciona agora

```
[foto]  ( Escolher imagem )        ← ou "Usar um endereço"
        ( Remover )
```

1. A tela confere **tipo** (JPG/PNG/WebP) e **tamanho** (5 MB) antes de tocar
   na rede, e mostra o erro em português.
2. A imagem é **redimensionada e convertida para WebP no próprio navegador**,
   com `createImageBitmap` + `<canvas>` — sem biblioteca nova. Logo e foto vão
   para 512px; capa, para 1600px. Uma foto de 8 MB do celular vira uns 60 KB.
3. O arquivo sobe **direto do navegador para o Storage**, sem passar pelo nosso
   servidor.
4. A prévia aparece na hora, antes de o envio terminar.
5. Assim que a nova está no ar, a **anterior é apagada** do Storage. URL externa
   é ignorada nessa faxina — não é nossa para apagar.

### Por que o arquivo não passa pelo nosso servidor

Uma Server Action na Vercel tem limite de corpo em torno de **4,5 MB**. Se o
upload fosse por lá, o limite de 5 MB prometido na tela quebraria antes de
chegar ao nosso código, e o erro viria do runtime — sem mensagem que ajude
ninguém. Indo direto, quem autoriza é a policy do bucket, no mesmo modelo de
RLS que protege o resto do banco.

### Onde cada imagem fica

```
imagens/                          ← bucket público (leitura), escrita restrita
  barbearias/{barbershop_id}/logo-{carimbo}.webp
  barbearias/{barbershop_id}/capa-{carimbo}.webp
  barbeiros/{barbershop_id}/foto-{carimbo}.webp
  clientes/{profile_id}/foto-{carimbo}.webp
```

O **carimbo de tempo no nome não é enfeite**: sobrescrever `logo.webp` manteria
a mesma URL, e o navegador e a CDN continuariam servindo a imagem velha. Nome
novo é troca visível na hora.

`barbeiros/` é indexado pela **barbearia**, não pelo profissional, porque um
profissional novo ainda não tem id quando a foto é escolhida — e quem pode
mexer em profissional é o dono da loja de qualquer forma.

### Quem pode escrever

A regra mora numa função só, `pode_escrever_imagem()`, chamada pelas policies de
insert, update e delete:

| Pasta | Quem escreve |
|---|---|
| `barbearias/{id}/` | `can_manage_money(id)` — o dono da loja e o admin |
| `barbeiros/{id}/` | `can_manage_money(id)` — idem (é a mesma permissão de editar a equipe) |
| `clientes/{id}/` | só a própria pessoa (`id = auth.uid()`) |

É o mesmo helper que decide quem edita a barbearia em `03_rls.sql`. Ou seja:
**quem pode trocar o nome da loja pode trocar a logo dela, e mais ninguém.** O
assistente não mexe em imagem, pela mesma razão de não mexer em serviço.

### Leitura é pública, e isso é de propósito

As imagens aparecem na página pública da barbearia e na busca — telas que
funcionam **sem login**. Leitura restrita deixaria o perfil sem logo justamente
para quem ainda não tem conta.

> ⚠️ **Público quer dizer público.** Quem tiver o link vê o arquivo. Este bucket
> é para logo, capa e foto de perfil — nunca para documento, comprovante ou
> qualquer coisa que dependa de a URL ser secreta.

---

## Para rodar

O SQL está em **`supabase/14_storage_imagens.sql`** e precisa ser aplicado à
mão, no SQL Editor. Sem ele, o envio falha com "Não consegui enviar a imagem" e
o campo de URL continua funcionando normalmente — nada quebra, só não sobe.

O `next.config.ts` já libera o host do Storage, lido de
`NEXT_PUBLIC_SUPABASE_URL` (sem um segundo lugar dizendo qual é o projeto).

## Se um dia o campo de URL sair

São três passos, e o terceiro é o que se esquece:

1. tirar o botão "Usar um endereço" de `src/components/ui/CampoImagem.tsx`;
2. migrar as URLs externas ainda gravadas no banco;
3. **remover o `hostname: "**"` do `next.config.ts`** — ele só existe por causa
   do campo de URL.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `src/lib/imagens.ts` | Validação, redimensionamento, envio, faxina |
| `src/components/ui/CampoImagem.tsx` | O campo com prévia, envio e a opção de URL |
| `src/components/client/FotoDoPerfil.tsx` | A foto do cliente (grava sozinha, sem formulário) |
| `supabase/14_storage_imagens.sql` | Bucket e policies |
| `next.config.ts` | Host liberado para o `next/image` |
