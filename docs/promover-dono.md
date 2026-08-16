# Como promover um cliente a dono de barbearia

Todo cadastro feito pelo site nasce **cliente**. Não existe, e não deve existir,
um caminho na interface para alguém criar a própria barbearia — a aquisição é
por conversa no WhatsApp, e a conta é criada por você.

Este documento é o passo a passo do que fazer quando alguém fecha.

---

## O jeito certo: a tela `/admin`

**Use esta.** O caminho manual da seção seguinte existe para consertar
situação torta, não para o dia a dia.

1. Entre com sua conta de administrador da plataforma (a que tem
   `profiles.is_platform_admin = true`).
2. Vá em `/admin`.
3. Preencha nome do dono, e-mail, senha, nome da barbearia e o link público.
4. Copie o e-mail e a senha gerados e entregue ao dono.

O que acontece por baixo (`src/app/actions/admin.ts`):

- a conta de login é criada já com o e-mail confirmado;
- ela nasce com `role = 'client'`, porque o trigger `handle_new_user()` **força**
  isso e ignora qualquer papel vindo do formulário;
- a barbearia é inserida com `owner_id` apontando para essa conta;
- o trigger `barbershop_after_insert()` promove o perfil para `owner`
  automaticamente, no mesmo instante.

Repare na ordem: **não existe um momento em que a pessoa seja "dono sem
barbearia"**. Se a inserção da loja falhar, a conta recém-criada é apagada.

---

## O jeito manual: promover uma conta que já existe

É o caso do sujeito que já usava o app como cliente e agora comprou o sistema.
A conta dele **não deve** ser recriada — ele perderia o histórico.

São **dois** passos, e o segundo é o que todo mundo esquece.

### Passo 1 — criar a barbearia apontando para a conta dele

Descubra o `id` do perfil pelo e-mail:

```sql
select id, full_name, email, role
  from profiles
 where email = 'pessoa@exemplo.com';
```

Crie a barbearia com esse `id` no `owner_id`:

```sql
insert into barbershops (owner_id, name, slug, city, state, is_active)
values (
  'COLE-AQUI-O-ID-DO-PERFIL',
  'Barbearia do Zé',
  'barbearia-do-ze',   -- vira /b/barbearia-do-ze, precisa ser único
  'Campinas',
  'SP',
  true
);
```

O trigger `barbershop_after_insert()` já muda o `role` para `owner` sozinho.

### Passo 2 — conferir se o papel pegou

```sql
select p.role, b.name
  from profiles p
  join barbershops b on b.owner_id = p.id
 where p.email = 'pessoa@exemplo.com';
```

Se por algum motivo o `role` continuar `client` (trigger desabilitado, por
exemplo), force na mão:

```sql
update profiles set role = 'owner' where email = 'pessoa@exemplo.com';
```

> ⚠️ **Mudar só o `role` não resolve nada.** A barbearia do dono é encontrada
> por `barbershops.owner_id`, não por uma coluna em `profiles`. Um perfil
> `owner` sem barbearia nenhuma cai direto em `/sem-barbearia` e não consegue
> fazer absolutamente nada. O passo 1 é obrigatório; o passo 2 sozinho, não
> serve.

---

## O caso do assistente (é diferente, não confunda)

O assistente **usa** a coluna que o dono não usa:

| Papel | Como o sistema acha a barbearia dele |
|---|---|
| `owner` | `barbershops.owner_id = perfil.id` |
| `assistant` | `profiles.barbershop_id` |

Ou seja, para criar um assistente:

```sql
update profiles
   set role = 'assistant',
       barbershop_id = 'ID-DA-BARBEARIA'
 where email = 'assistente@exemplo.com';
```

Mas o normal é fazer isso pela tela: **Painel → Equipe → Acessos**, que é o
caminho que o dono usa sozinho, sem precisar de você.

---

## Quando a mudança aparece para a pessoa

O papel é lido do banco a cada requisição (`getProfile()` em `src/lib/auth.ts`,
com cache de um request só). Então:

- **não precisa** deslogar e logar de novo;
- **não precisa** limpar cookie nem invalidar sessão;
- basta atualizar a página. No próximo carregamento ela já cai em `/painel`.

O `middleware` e a função `rotaInicial()` mandam cada papel para a casa dele:
`is_platform_admin` → `/admin`, `owner`/`assistant` → `/painel`, `client` →
`/app`.

---

## Por que o cliente não consegue se promover sozinho

Não é uma checagem de tela — é o banco recusando. São três camadas:

1. **O trigger.** `handle_new_user()` insere o perfil com `'client'` escrito
   literalmente, ignorando o `raw_user_meta_data`. Mandar `{"role":"owner"}` no
   cadastro não muda nada.

2. **O grant por coluna** (`supabase/03_rls.sql`). A RLS deixa a pessoa
   atualizar a própria linha em `profiles`, o que sozinho permitiria:

   ```
   PATCH /rest/v1/profiles?id=eq.<meu-id>   {"role":"owner"}
   ```

   Por isso o `update` é revogado e devolvido **coluna a coluna**:

   ```sql
   revoke update on profiles from authenticated;
   grant update (full_name, email, phone, birth_date, gender, avatar_url)
     on profiles to authenticated;
   ```

   `role`, `barbershop_id` e `is_platform_admin` ficam de fora. Um PATCH nessas
   colunas é recusado pelo Postgres, com a chave anônima ou sem ela.

3. **Criar barbearia é privilégio de admin.** A policy `barbershops_insert`
   exige `is_platform_admin()`. Mesmo que alguém virasse `owner` por mágica,
   não conseguiria inserir a loja que faz o papel valer alguma coisa.

Se um dia você mexer no `03_rls.sql`, **a linha do `grant update (...)` em
`profiles` é a que não pode ser perdida.**
