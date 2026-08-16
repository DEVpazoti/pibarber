"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { requireProfile, requireRole } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";
import { soDigitos, telefoneValido } from "@/lib/utils";

/**
 * As ações do APP DO CLIENTE.
 *
 * Tudo aqui mexe nos dados da própria pessoa. A RLS já limita cada tabela ao
 * `auth.uid()`, mas o filtro também é escrito à mão em cada consulta: duas
 * travas custam uma linha e evitam a categoria inteira de bug em que uma
 * policy mal escrita vira vazamento.
 */

/* ==========================================================================
   Meus Dados
   ========================================================================== */

export async function salvarMeusDados(entrada: {
  nome: string;
  nascimento?: string;
  telefone: string;
  genero?: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();

    const nome = entrada.nome.trim();
    if (nome.length < 3) return falha("Escreva seu nome completo.");
    if (!telefoneValido(entrada.telefone)) {
      return falha("Informe um celular válido, com DDD.");
    }

    const genero = ["male", "female", "other"].includes(entrada.genero ?? "")
      ? entrada.genero
      : null;

    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: nome,
        phone: soDigitos(entrada.telefone),
        birth_date: entrada.nascimento || null,
        gender: genero,
      })
      .eq("id", perfil.id);

    if (error) return falha(traduzirErroBanco(error, "[cliente] salvar dados"));

    revalidatePath("/app", "layout");
    return sucesso(undefined, "Dados salvos.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] salvarMeusDados"));
  }
}

/**
 * Guarda a foto de perfil.
 *
 * O ARQUIVO NÃO PASSA POR AQUI. Ele foi direto do navegador para o Storage
 * (ver `src/lib/imagens.ts`); esta ação só grava a URL resultante. É por isso
 * que ela não tem nada a ver com tamanho, formato ou compressão.
 *
 * String vazia = tirar a foto. O `null` é o que faz o `Avatar` voltar para as
 * iniciais em vez de tentar carregar um endereço vazio.
 */
export async function salvarMinhaFoto(url: string): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const limpo = url.trim();

    // Só endereço http(s), e não `javascript:` ou `data:`. Este valor vai
    // parar num `src` de imagem — e um `src` é lugar por onde já saiu coisa
    // pior do que uma foto.
    if (limpo !== "" && !/^https?:\/\//i.test(limpo)) {
      return falha("Endereço de imagem inválido.");
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: limpo || null })
      .eq("id", perfil.id);

    if (error) return falha(traduzirErroBanco(error, "[cliente] salvar foto"));

    revalidatePath("/app", "layout");
    return sucesso(undefined, limpo ? "Foto atualizada." : "Foto removida.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] salvarMinhaFoto"));
  }
}

/**
 * Exclui a conta.
 *
 * >>> SERVICE ROLE. Confirmada a identidade ANTES: só o próprio dono da conta
 * chega aqui, e o id vem de `requireProfile()`, nunca do formulário. <<<
 *
 * O que some: perfil, endereços, dependentes, favoritos, últimos acessos,
 * notificações, lista de espera e avaliações — tudo por cascade a partir de
 * `profiles`. O que FICA: o histórico de atendimento dentro de cada barbearia
 * (`customers.profile_id` vira nulo), porque é o registro contábil dela.
 */
export async function excluirMinhaConta(): Promise<ActionResult> {
  try {
    const perfil = await requireRole(["client"]);

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(perfil.id);

    if (error) {
      console.error("[cliente] falha ao excluir a conta:", error);
      return falha("Não consegui excluir a conta. Tente de novo em instantes.");
    }

    const supabase = await createClient();
    const { error: erroSair } = await supabase.auth.signOut();
    if (erroSair) console.error("[cliente] falha ao encerrar a sessão:", erroSair);

    revalidatePath("/", "layout");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] excluirMinhaConta"));
  }

  // Fora do try: redirect() funciona levantando exceção.
  redirect("/");
}

/* ==========================================================================
   Endereço
   ========================================================================== */

export async function salvarMeuEndereco(entrada: {
  cep: string;
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
  pais?: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();

    if (soDigitos(entrada.cep).length !== 8) return falha("Informe um CEP válido.");
    if (!entrada.rua.trim()) return falha("Informe o endereço.");
    if (!entrada.cidade.trim()) return falha("Informe a cidade.");
    if (!entrada.estado.trim()) return falha("Informe o estado.");

    const supabase = await createClient();

    const campos = {
      profile_id: perfil.id,
      country: entrada.pais?.trim() || "BR",
      zip_code: soDigitos(entrada.cep),
      street: entrada.rua.trim(),
      number: entrada.numero.trim() || null,
      complement: entrada.complemento?.trim() || null,
      neighborhood: entrada.bairro.trim() || null,
      city: entrada.cidade.trim(),
      state: entrada.estado.trim().toUpperCase().slice(0, 2),
      is_default: true,
    };

    // O cliente tem um endereço só na v1. Procura o dele e atualiza; não
    // achando, cria. Assim não sobra endereço órfão a cada salvamento.
    const { data: existente, error: erroLer } = await supabase
      .from("user_addresses")
      .select("id")
      .eq("profile_id", perfil.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroLer) return falha(traduzirErroBanco(erroLer, "[cliente] ler endereço"));

    const { error } = existente
      ? await supabase.from("user_addresses").update(campos).eq("id", existente.id)
      : await supabase.from("user_addresses").insert(campos);

    if (error) return falha(traduzirErroBanco(error, "[cliente] salvar endereço"));

    revalidatePath("/app/perfil/endereco");
    return sucesso(undefined, "Endereço salvo.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] salvarMeuEndereco"));
  }
}

/* ==========================================================================
   Segurança e acessos
   ========================================================================== */

export async function trocarSenha(entrada: {
  senhaAtual: string;
  novaSenha: string;
  confirmacao: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();

    if (entrada.novaSenha.length < 6) {
      return falha("A nova senha precisa ter pelo menos 6 caracteres.");
    }
    if (entrada.novaSenha !== entrada.confirmacao) {
      return falha("A confirmação não bate com a nova senha.");
    }
    if (entrada.novaSenha === entrada.senhaAtual) {
      return falha("A nova senha precisa ser diferente da atual.");
    }

    const supabase = await createClient();

    // Confere a senha atual fazendo login com ela. Sem esta conferência,
    // quem pegasse o celular destravado trocaria a senha do dono.
    if (perfil.email) {
      const { error: erroConferir } = await supabase.auth.signInWithPassword({
        email: perfil.email,
        password: entrada.senhaAtual,
      });

      if (erroConferir) return falha("A senha atual está incorreta.");
    }

    const { error } = await supabase.auth.updateUser({ password: entrada.novaSenha });

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("should be at least")) {
        return falha("A senha precisa ter pelo menos 6 caracteres.");
      }
      if (m.includes("same password")) {
        return falha("A nova senha precisa ser diferente da atual.");
      }
      console.error("[cliente] falha ao trocar a senha:", error);
      return falha("Não consegui trocar a senha. Tente de novo.");
    }

    return sucesso(undefined, "Senha alterada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] trocarSenha"));
  }
}

/**
 * Desvincula um método de login.
 *
 * NUNCA remove o último: quem ficasse sem nenhum método perderia a conta, e
 * não haveria como recuperar. A checagem é feita com a lista real de
 * identidades do Supabase, não com o que a tela achava que existia.
 */
export async function desvincularAcesso(provedor: string): Promise<ActionResult> {
  try {
    await requireProfile();
    const supabase = await createClient();

    const { data, error } = await supabase.auth.getUserIdentities();

    if (error || !data) {
      console.error("[cliente] falha ao listar identidades:", error);
      return falha("Não consegui ler seus métodos de login.");
    }

    if (data.identities.length <= 1) {
      return falha(
        "Este é o seu único jeito de entrar. Vincule outro método antes de remover este.",
      );
    }

    const identidade = data.identities.find((i) => i.provider === provedor);
    if (!identidade) return falha("Esse método não está vinculado à sua conta.");

    const { error: erroRemover } = await supabase.auth.unlinkIdentity(identidade);

    if (erroRemover) {
      console.error("[cliente] falha ao desvincular:", erroRemover);
      return falha("Não consegui desvincular. Tente de novo.");
    }

    revalidatePath("/app/perfil/acessos");
    return sucesso(undefined, "Método desvinculado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] desvincularAcesso"));
  }
}

/* ==========================================================================
   Dependentes — "vou levar meu filho"
   ========================================================================== */

export async function salvarDependente(entrada: {
  id?: string;
  nome: string;
  nascimento?: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();

    const nome = entrada.nome.trim();
    if (nome.length < 2) return falha("Escreva o nome da pessoa.");

    const supabase = await createClient();

    const campos = { full_name: nome, birth_date: entrada.nascimento || null };

    const { error } = entrada.id
      ? await supabase
          .from("dependents")
          .update(campos)
          .eq("id", entrada.id)
          .eq("profile_id", perfil.id)
      : await supabase.from("dependents").insert({ profile_id: perfil.id, ...campos });

    if (error) return falha(traduzirErroBanco(error, "[cliente] salvar dependente"));

    revalidatePath("/app/perfil/pessoas");
    return sucesso(undefined, "Salvo.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] salvarDependente"));
  }
}

export async function removerDependente(id: string): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("dependents")
      .delete()
      .eq("id", id)
      .eq("profile_id", perfil.id);

    if (error) return falha(traduzirErroBanco(error, "[cliente] remover dependente"));

    revalidatePath("/app/perfil/pessoas");
    return sucesso(undefined, "Removido.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] removerDependente"));
  }
}

/* ==========================================================================
   Favoritos e últimos acessos
   ========================================================================== */

export async function alternarFavorito(
  barbershopId: string,
): Promise<ActionResult<{ favoritada: boolean }>> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { data: existente, error: erroLer } = await supabase
      .from("favorites")
      .select("id")
      .eq("profile_id", perfil.id)
      .eq("barbershop_id", barbershopId)
      .maybeSingle();

    if (erroLer) return falha(traduzirErroBanco(erroLer, "[cliente] ler favorito"));

    if (existente) {
      const { error } = await supabase.from("favorites").delete().eq("id", existente.id);
      if (error) return falha(traduzirErroBanco(error, "[cliente] desfavoritar"));

      revalidatePath("/app/perfil/favoritos");
      return sucesso({ favoritada: false }, "Removida dos favoritos.");
    }

    const { error } = await supabase
      .from("favorites")
      .insert({ profile_id: perfil.id, barbershop_id: barbershopId });

    if (error) return falha(traduzirErroBanco(error, "[cliente] favoritar"));

    revalidatePath("/app/perfil/favoritos");
    return sucesso({ favoritada: true }, "Adicionada aos favoritos.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] alternarFavorito"));
  }
}

/** Tira uma barbearia dos "Últimos acessos" da home. */
export async function removerAcessoRecente(barbershopId: string): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("shop_visits")
      .delete()
      .eq("profile_id", perfil.id)
      .eq("barbershop_id", barbershopId);

    if (error) return falha(traduzirErroBanco(error, "[cliente] remover acesso recente"));

    revalidatePath("/app");
    return sucesso(undefined, "Removida da lista.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] removerAcessoRecente"));
  }
}

/* ==========================================================================
   Lista de espera e notificações
   ========================================================================== */

export async function sairDaEspera(id: string): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", id)
      .eq("profile_id", perfil.id);

    if (error) return falha(traduzirErroBanco(error, "[cliente] sair da espera"));

    revalidatePath("/app/perfil/espera");
    return sucesso(undefined, "Você saiu da lista.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] sairDaEspera"));
  }
}

export async function marcarNotificacaoLida(id: string): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", perfil.id)
      .is("read_at", null);

    if (error) return falha(traduzirErroBanco(error, "[cliente] marcar lida"));

    revalidatePath("/app", "layout");
    return sucesso(undefined);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] marcarNotificacaoLida"));
  }
}

export async function marcarTodasLidas(): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", perfil.id)
      .is("read_at", null);

    if (error) return falha(traduzirErroBanco(error, "[cliente] marcar todas lidas"));

    revalidatePath("/app", "layout");
    return sucesso(undefined, "Tudo lido.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] marcarTodasLidas"));
  }
}
