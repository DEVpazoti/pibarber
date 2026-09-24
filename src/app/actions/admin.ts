"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createAdminClient } from "@/lib/supabase/admin";
import { falha, sucesso, type ActionResult } from "@/lib/types";
import { paraSlug } from "@/lib/utils";

/**
 * O cadastro de barbearias — a tela do administrador da plataforma.
 *
 * >>> SERVICE ROLE. Ela IGNORA A RLS por completo. <<<
 *
 * `requireAdmin()` é a PRIMEIRA linha, antes de qualquer outra coisa: sem a
 * flag `is_platform_admin`, a função redireciona e nada abaixo roda. Só depois
 * disso `createAdminClient()` aparece.
 */

export type NovaBarbearia = {
  nomeDono: string;
  email: string;
  senha: string;
  nomeBarbearia: string;
  slug?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
};

/**
 * Cria a conta do dono E a barbearia numa tacada.
 *
 * A ordem importa: o trigger `barbershop_after_insert()` promove o
 * `owner_id` para `owner` assim que a barbearia entra. Por isso o usuário
 * nasce primeiro (como `client`, forçado por `handle_new_user`) e vira dono ao
 * inserir a loja — não há um momento em que ele seja "dono sem barbearia".
 */
export async function criarBarbearia(
  entrada: NovaBarbearia,
): Promise<ActionResult<{ email: string; senha: string; slug: string }>> {
  try {
    await requireAdmin();

    const nomeDono = entrada.nomeDono.trim();
    const email = entrada.email.trim().toLowerCase();
    const nomeBarbearia = entrada.nomeBarbearia.trim();
    const slug = paraSlug(entrada.slug?.trim() || nomeBarbearia);

    if (nomeDono.length < 3) return falha("Escreva o nome completo do dono.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falha("E-mail inválido.");
    if (entrada.senha.length < 6) return falha("A senha precisa ter pelo menos 6 caracteres.");
    if (nomeBarbearia.length < 2) return falha("Escreva o nome da barbearia.");
    if (slug.length < 3) return falha("O nome da barbearia não gerou um link válido.");

    const admin = createAdminClient();

    // O link precisa ser único: é a chave da URL pública.
    const { data: existente, error: erroSlug } = await admin
      .from("barbershops")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (erroSlug) return falha(traduzirErroBanco(erroSlug, "[admin] conferir slug"));
    if (existente) return falha(`O link "${slug}" já está em uso. Escolha outro nome.`);

    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: entrada.senha,
      email_confirm: true,
      user_metadata: { full_name: nomeDono },
    });

    if (erroCriar) {
      const m = erroCriar.message.toLowerCase();
      if (m.includes("already") || m.includes("registered")) {
        return falha("Já existe uma conta com este e-mail.");
      }
      console.error("[admin] falha ao criar o usuário do dono:", erroCriar);
      return falha("Não consegui criar a conta do dono.");
    }

    const ownerId = criado.user?.id;
    if (!ownerId) return falha("Não consegui criar a conta do dono.");

    const { error: erroLoja } = await admin.from("barbershops").insert({
      owner_id: ownerId,
      name: nomeBarbearia,
      slug,
      city: entrada.cidade?.trim() || null,
      state: entrada.estado?.trim().toUpperCase().slice(0, 2) || null,
      phone: entrada.telefone?.replace(/\D/g, "") || null,
      is_active: true,
    });

    if (erroLoja) {
      // Sem a barbearia, a conta ficaria órfã: um "dono" que cai em
      // /sem-barbearia e não entende por quê. Desfaz.
      await admin.auth.admin.deleteUser(ownerId);
      return falha(traduzirErroBanco(erroLoja, "[admin] criar barbearia"));
    }

    revalidatePath("/admin");
    return sucesso(
      { email, senha: entrada.senha, slug },
      "Barbearia criada. Copie os dados e entregue ao dono.",
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] criarBarbearia"));
  }
}

/**
 * Bloqueia e desbloqueia a barbearia. Bloqueada, ela some da busca e do perfil
 * público — e o dono não a reabre, nem terminando o setup (o trigger
 * `barbershops_guard_bloqueio`, em 25_setup_barbearia.sql, segura).
 *
 * Desbloquear só a põe de volta no ar se o setup já terminou. Loja ainda em
 * configuração continua escondida até o dono concluir — senão o desbloqueio
 * publicaria uma loja sem horário nem serviço.
 */
export async function alternarBarbearia(id: string, ativa: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    let setupConcluido = true;
    if (ativa) {
      const { data, error: erroLer } = await admin
        .from("barbershops")
        .select("setup_completed_at")
        .eq("id", id)
        .maybeSingle();
      if (erroLer) return falha(traduzirErroBanco(erroLer, "[admin] ler barbearia"));
      setupConcluido = Boolean(data?.setup_completed_at);
    }

    const { error } = await admin
      .from("barbershops")
      .update(
        ativa
          ? { blocked_at: null, is_active: setupConcluido }
          : { blocked_at: new Date().toISOString(), is_active: false },
      )
      .eq("id", id);

    if (error) return falha(traduzirErroBanco(error, "[admin] alternar barbearia"));

    revalidatePath("/admin");
    return sucesso(undefined, ativa ? "Barbearia ativada." : "Barbearia desativada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[admin] alternarBarbearia"));
  }
}
