"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { urlDoSite } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * Traduz o erro do Supabase Auth para português E diz a que campo ele pertence.
 *
 * O usuário nunca deve ler "Invalid login credentials" — e muito menos o
 * usuário BARBEIRO, que é quem paga a conta.
 *
 * O `campo` é o que permite ao formulário destacar o campo errado em vez de
 * jogar tudo num alerta no topo. Nulo quer dizer "não é de nenhum campo em
 * particular" — aí a tela mostra no topo mesmo.
 */
function traduzirErroAuth(mensagem: string): { texto: string; campo?: string } {
  const m = mensagem.toLowerCase();

  // A dica do Google é deliberada. Uma conta nascida pelo OAuth não tem senha,
  // e tentar entrar com uma devolve exatamente este erro — sem a frase, a
  // pessoa fica tentando adivinhar uma senha que nunca existiu. A dica não
  // revela se a conta existe: aparece para qualquer credencial recusada.
  if (m.includes("invalid login credentials")) {
    return {
      texto: "E-mail ou senha incorretos. Se você criou a conta com o Google, entre por ali.",
      campo: "senha",
    };
  }
  if (m.includes("email not confirmed")) {
    return { texto: "Confirme seu e-mail antes de entrar.", campo: "email" };
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return { texto: "Já existe uma conta com este e-mail. Tente entrar.", campo: "email" };
  }
  if (m.includes("password should be at least")) {
    return { texto: "A senha precisa ter pelo menos 6 caracteres.", campo: "senha" };
  }
  if (m.includes("weak password") || m.includes("pwned")) {
    return {
      texto: "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.",
      campo: "senha",
    };
  }
  if (m.includes("unable to validate email") || m.includes("invalid email")) {
    return { texto: "E-mail inválido.", campo: "email" };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return { texto: "Muitas tentativas seguidas. Espere um minuto e tente de novo." };
  }
  if (m.includes("same password")) {
    return { texto: "A nova senha precisa ser diferente da atual.", campo: "senha" };
  }

  console.error("[auth] mensagem não traduzida:", mensagem);
  return { texto: "Não consegui completar. Tente de novo em instantes." };
}

/** E-mail com cara de e-mail. O julgamento final é do Supabase. */
function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Só aceita destino interno — bloqueia open redirect via ?proximo=. */
function destinoSeguro(proximo: FormDataEntryValue | string | null | undefined): string | null {
  const valor = typeof proximo === "string" ? proximo.trim() : "";
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  return valor;
}

/* ==========================================================================
   Entrar
   ==========================================================================

   ⚠️ Recebe um OBJETO, não FormData, e isso não é estilo — é correção de bug.

   Com `<form action={acao}>` o React 19 RESETA sozinho todo campo não
   controlado assim que a action termina, inclusive quando ela devolve erro.
   O usuário errava a senha e perdia o e-mail junto. Devolver os valores no
   ActionResult não resolveria: o nó do DOM não remonta, então `defaultValue`
   já não é lido. A saída é o formulário guardar os próprios valores em estado
   e chamar a action direto — que é, aliás, o padrão do resto do projeto
   (`criarAgendamento`, `salvarBarbearia`, `pagarComissao`…).
*/

export async function entrar(entrada: {
  email: string;
  senha: string;
  proximo?: string;
}): Promise<ActionResult> {
  const email = entrada.email.trim().toLowerCase();
  const senha = entrada.senha;
  const proximo = destinoSeguro(entrada.proximo);

  if (!email) return falha("Informe o e-mail.", "email");
  if (!senha) return falha("Informe a senha.", "senha");

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      const { texto, campo } = traduzirErroAuth(error.message);
      return falha(texto, campo);
    }
    if (!data.user) return falha("Não consegui entrar. Tente de novo.");

    // Onde cada papel mora. Lido aqui porque a sessão acabou de nascer.
    const { data: perfil, error: erroPerfil } = await supabase
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("id", data.user.id)
      .maybeSingle();

    if (erroPerfil) console.error("[auth] falha ao ler o perfil no login:", erroPerfil);

    const casa = perfil?.is_platform_admin
      ? "/admin"
      : perfil?.role === "owner" || perfil?.role === "assistant"
        ? "/painel"
        : "/app";

    revalidatePath("/", "layout");
    redirect(proximo ?? casa);
  } catch (error) {
    unstable_rethrow(error); // deixa o redirect() acima passar
    console.error("[auth] erro inesperado em entrar:", error);
    return falha("Não consegui entrar. Tente de novo em instantes.");
  }
}

/* ==========================================================================
   Criar conta
   ========================================================================== */

/**
 * O cadastro público SEMPRE cria um `client`.
 *
 * O papel não é enviado e não seria aceito: o trigger handle_new_user() força
 * role='client' ignorando qualquer coisa vinda do metadata. Dono nasce em
 * /admin; assistente nasce em /painel/equipe.
 */
export async function criarConta(entrada: {
  nome: string;
  email: string;
  senha: string;
  confirmacao: string;
}): Promise<ActionResult> {
  const nome = entrada.nome.trim();
  const email = entrada.email.trim().toLowerCase();
  const senha = entrada.senha;
  const confirmacao = entrada.confirmacao;

  // Cada validação diz A QUEM pertence. A tela usa isso para acender o campo
  // certo e levar o foco até ele, em vez de um alerta genérico no topo.
  if (!nome) return falha("Informe seu nome.", "nome");
  if (nome.length < 3) return falha("Escreva seu nome completo.", "nome");
  if (!email) return falha("Informe o e-mail.", "email");
  if (!emailValido(email)) return falha("Esse e-mail não parece válido.", "email");
  if (!senha) return falha("Crie uma senha.", "senha");
  if (senha.length < 6) return falha("A senha precisa ter pelo menos 6 caracteres.", "senha");
  if (senha !== confirmacao) return falha("As senhas não são iguais.", "confirmacao");

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { full_name: nome }, // vira profiles.full_name pelo trigger
        emailRedirectTo: `${urlDoSite()}/callback`,
      },
    });

    if (error) {
      const { texto, campo } = traduzirErroAuth(error.message);
      return falha(texto, campo);
    }

    // E-MAIL JÁ CADASTRADO, disfarçado.
    //
    // Com "Confirm email" ligado, o Supabase NÃO devolve erro quando o e-mail
    // já existe — devolve um usuário de mentira, com `identities` vazio, para
    // não confirmar a terceiros quem tem conta no sistema. Sem esta checagem a
    // tela diria "confirme seu e-mail" e o e-mail nunca chegaria.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return falha("Já existe uma conta com este e-mail. Tente entrar.", "email");
    }

    // Sem sessão = o projeto exige confirmação por e-mail.
    if (!data.session) {
      return sucesso(
        undefined,
        "Conta criada! Confirme o e-mail que enviamos para poder entrar.",
      );
    }

    revalidatePath("/", "layout");
    redirect("/app"); // cadastro público sempre nasce cliente
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em criarConta:", error);
    return falha("Não consegui criar a conta. Tente de novo em instantes.");
  }
}

/* ==========================================================================
   Google
   ========================================================================== */

/**
 * Não devolve ActionResult: o caminho de sucesso SEMPRE sai da página (vai
 * para o Google), e um `<form action>` simples exige retorno void. O erro
 * viaja pela query string e a tela de login o exibe.
 */
export async function entrarComGoogle(formData: FormData): Promise<void> {
  const proximo = destinoSeguro(formData.get("proximo"));
  let destino: string;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${urlDoSite()}/callback${proximo ? `?proximo=${encodeURIComponent(proximo)}` : ""}`,
      },
    });

    if (error || !data.url) {
      console.error("[auth] falha ao abrir o OAuth do Google:", error);
      destino = `/entrar?erro=${encodeURIComponent(
        error ? traduzirErroAuth(error.message).texto : "Não consegui abrir o login do Google.",
      )}`;
    } else {
      destino = data.url;
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em entrarComGoogle:", error);
    destino = `/entrar?erro=${encodeURIComponent("Não consegui abrir o login do Google.")}`;
  }

  // redirect() fora do try: ele funciona levantando exceção, e um catch
  // no caminho engoliria o roteamento.
  redirect(destino);
}

/* ==========================================================================
   Sair
   ========================================================================== */

export async function sair(): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[auth] falha ao sair:", error);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em sair:", error);
  }

  revalidatePath("/", "layout");
  redirect("/entrar");
}
