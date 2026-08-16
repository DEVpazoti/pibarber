# As capturas da landing

São as imagens do visualizador **"Veja o programa por dentro"**, na página
inicial. Não são mockup: saem do sistema rodando de verdade, com os dados
fictícios do seed.

Todas as 15 são capturas reais, geradas em **16/08/2026** com o dia de
demonstração no ar.

> **Quando refizer, gere o dia primeiro.** As telas **Hoje** e **Agenda**
> dependem da data de hoje, e o seed espalha os atendimentos por uma janela que
> termina no passado — sem o dia de demonstração as duas saem VAZIAS, que é o
> oposto do que a seção da landing precisa provar. Ver "Como gerar" abaixo.

---

## Contrato de nomes

O nome do arquivo é contrato com `src/lib/landing.ts`. Renomeou aqui, renomeie
lá — e vice-versa. As **dimensões também são contrato**: `next/image` usa os
números declarados em `landing.ts` para reservar o espaço antes de a imagem
chegar. Se o arquivo tiver outra proporção, a imagem entra deformada.

### Painel do dono — **2880 × 1800** (1440×900 em tela de 2×)

| Arquivo | Tela | Rota |
|---|---|---|
| `painel-hoje.png` | Hoje | `/painel` |
| `painel-agenda.png` | Agenda | `/painel/agenda` |
| `painel-caixa.png` | Caixa | `/painel/caixa?p=semana` |
| `painel-comissoes.png` | Comissões | `/painel/comissoes` |
| `painel-relatorios.png` | Relatórios | `/painel/relatorios?p=semana` |
| `painel-clientes.png` | Clientes | `/painel/clientes` |
| `painel-fiado.png` | Fiado | `/painel/fiado` |
| `painel-equipe.png` | Equipe | `/painel/equipe` |
| `painel-servicos.png` | Serviços | `/painel/servicos` |

### App do cliente — **780 × 1688** (390×844 em tela de 2×, iPhone 14/15)

| Arquivo | Tela | Rota |
|---|---|---|
| `app-inicio.png` | Início | `/app` |
| `app-buscar.png` | Buscar | `/app/buscar` |
| `app-agendamentos.png` | Agendamentos | `/app/agendamentos` |
| `app-perfil.png` | Perfil | `/app/perfil` |
| `app-barbearia.png` | Sua página | `/b/navalha-e-cia` |
| `app-agendar.png` | Agendando | `/b/navalha-e-cia/agendar` |

---

## Como gerar

O script abre o Chrome de verdade, loga com as contas de teste e fotografa.

```bash
# 1. o banco precisa estar com o seed (04_seed.sql) aplicado
# 2. o dev server no ar na 3001:
npm run dev -- --port 3001 > dev.log 2>&1

# 3. em outro terminal:
node scripts/capturar-telas.mjs            # tudo
node scripts/capturar-telas.mjs painel     # só as telas do dono
node scripts/capturar-telas.mjs cliente    # só as do app
```

**Antes de capturar o painel**, encha o dia de hoje — senão Hoje e Agenda saem
vazias:

```bash
node scripts/dia-de-demonstracao.mjs --criar      # 23 atendimentos de hoje
node scripts/capturar-telas.mjs painel
node scripts/dia-de-demonstracao.mjs --desfazer   # devolve o banco ao normal
```

Se o `--criar` reclamar que "já existe um dia de demonstração", é um registro
antigo que ficou para trás: rode o `--desfazer` primeiro. Foi o que aconteceu
em 16/08 — havia um dia de 15/08 pendente, e por isso hoje aparecia vazio.

O `--desfazer` devolve agendamentos, caixa, comissão e fiado. O que ele **não**
reverte é `customers.total_visits` / `total_spent` / `last_visit_at` — são
contadores de vitrine e ficam altos de propósito.

## Se preferir subir à mão

Vale, desde que o arquivo tenha **exatamente** as dimensões da tabela acima e o
mesmo nome. PNG, sem transparência. E confira o que aparece na imagem: estas
telas mostram nome de cliente, telefone e valor — **use a barbearia de
demonstração, nunca dados de um cliente real**.

## Ao acrescentar uma tela nova

São três lugares, sempre os três:

1. `scripts/capturar-telas.mjs` — a rota
2. `src/lib/landing.ts` — o rótulo, a legenda e as dimensões
3. este README — a linha da tabela
