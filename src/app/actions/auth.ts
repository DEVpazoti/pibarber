"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { ROTA_EMAIL_CONFIRMADO } from "@/lib/auth";
import { urlDoSite } from "@/lib/env";
import { criarBarbeariaDoDono, telefoneDeOutroDono } from "@/lib/nova-barbearia";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { erroDeTelefone, normalizarTelefone } from "@/lib/telefone";
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
 * O cadastro de CLIENTE. Sempre cria um `client`.
 *
 * O papel não é enviado e não seria aceito: o trigger handle_new_user() força
 * role='client' ignorando qualquer coisa vinda do metadata. Dono nasce em
 * `criarContaBarbearia` (ou no /admin); assistente nasce em /painel/equipe.
 */
export async function criarConta(entrada: {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
  confirmacao: string;
}): Promise<ActionResult> {
  const nome = entrada.nome.trim();
  const email = entrada.email.trim().toLowerCase();
  const telefone = normalizarTelefone(entrada.telefone);
  const senha = entrada.senha;
  const confirmacao = entrada.confirmacao;

  // Cada validação diz A QUEM pertence. A tela usa isso para acender o campo
  // certo e levar o foco até ele, em vez de um alerta genérico no topo.
  if (!nome) return falha("Informe seu nome.", "nome");
  if (nome.length < 3) return falha("Escreva seu nome completo.", "nome");
  if (!email) return falha("Informe o e-mail.", "email");
  if (!emailValido(email)) return falha("Esse e-mail não parece válido.", "email");
  // Cliente pode repetir telefone (mãe e filho com o mesmo celular é o caso
  // normal) — ao contrário do dono. Aqui só precisa ser um celular de verdade.
  const erroTelefone = erroDeTelefone(telefone);
  if (erroTelefone) return falha(erroTelefone, "telefone");
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
        // Vai para o /callback, que é quem troca o código por sessão, e de lá
        // para a tela de boas-vindas. O link do e-mail é o único que a pessoa
        // clica horas depois, em outro aparelho — cair direto na home logada,
        // sem uma linha dizendo "deu certo", parece que o clique não fez nada.
        emailRedirectTo: `${urlDoSite()}/callback?proximo=${encodeURIComponent(ROTA_EMAIL_CONFIRMADO)}`,
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

    // O telefone vai direto para o perfil, pela service role: o trigger
    // handle_new_user() só copia nome, e-mail e foto do metadata, e sem sessão
    // (confirmação de e-mail ligada) o próprio usuário ainda não pode gravar.
    // Só depois da checagem acima — aqui `data.user` é a conta que ACABOU de
    // nascer, nunca uma que já existia.
    if (data.user) {
      const { error: erroTelefone } = await createAdminClient()
        .from("profiles")
        .update({ phone: telefone })
        .eq("id", data.user.id);

      // Não desfaz a conta por isso: ela existe e funciona, e o app já pede o
      // telefone de quem está sem ele (AvisoTelefone e o agendamento).
      if (erroTelefone) console.error("[auth] falha ao gravar o telefone do cliente:", erroTelefone);
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
   Criar conta de barbearia — o dono se cadastra sozinho
   ========================================================================== */

/**
 * Cria a conta do dono JUNTO com a barbearia dele.
 *
 * Mesma ordem do /admin (`criarBarbearia`): a conta nasce `client`, a loja é
 * inserida com `owner_id` apontando para ela e o trigger
 * `barbershop_after_insert()` promove o perfil a `owner`. Não existe momento
 * em que a pessoa seja "dono sem barbearia" — se a loja não entra, a conta
 * recém-criada é apagada.
 *
 * A loja nasce com `is_active = false`: fora da busca e da página pública até
 * o setup de /configurar terminar. Sem isso ela apareceria para os clientes
 * sem horário, sem serviço e sem ninguém para atender.
 *
 * A REGRA DE UNICIDADE: dois barbeiros não dividem e-mail nem telefone.
 *   e-mail   → único em auth.users; o Supabase recusa (ou disfarça, ver abaixo).
 *   telefone → src/lib/nova-barbearia.ts, o mesmo caminho do cliente que abre
 *              a barbearia pelo Perfil.
 *
 * Usa a service role, e antes de haver sessão — é um dos usos legítimos
 * listados em src/lib/supabase/admin.ts. Ela só LÊ telefones para a checagem
 * e só ESCREVE no usuário que o próprio `signUp` acabou de criar.
 */
export async function criarContaBarbearia(entrada: {
  nome: string;
  nomeBarbearia: string;
  email: string;
  telefone: string;
  senha: string;
  confirmacao: string;
}): Promise<ActionResult> {
  const nome = entrada.nome.trim();
  const nomeBarbearia = entrada.nomeBarbearia.trim();
  const email = entrada.email.trim().toLowerCase();
  const telefone = normalizarTelefone(entrada.telefone);
  const senha = entrada.senha;

  if (nome.length < 3) return falha("Escreva seu nome completo.", "nome");
  if (nomeBarbearia.length < 2) return falha("Escreva o nome da barbearia.", "nomeBarbearia");
  if (!email) return falha("Informe o e-mail.", "email");
  if (!emailValido(email)) return falha("Esse e-mail não parece válido.", "email");
  const erroTelefone = erroDeTelefone(telefone);
  if (erroTelefone) return falha(erroTelefone, "telefone");
  if (!senha) return falha("Crie uma senha.", "senha");
  if (senha.length < 6) return falha("A senha precisa ter pelo menos 6 caracteres.", "senha");
  if (senha !== entrada.confirmacao) return falha("As senhas não são iguais.", "confirmacao");

  try {
    const admin = createAdminClient();

    const telefoneEmUso = await telefoneDeOutroDono(admin, telefone);
    if (telefoneEmUso === null) {
      return falha("Não consegui criar a conta. Tente de novo em instantes.");
    }
    if (telefoneEmUso) {
      return falha("Este telefone já está cadastrado em outra barbearia.", "telefone");
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { full_name: nome },
        emailRedirectTo: `${urlDoSite()}/callback?proximo=${encodeURIComponent(ROTA_EMAIL_CONFIRMADO)}`,
      },
    });

    if (error) {
      const { texto, campo } = traduzirErroAuth(error.message);
      if (campo === "email" && texto.startsWith("Já existe")) {
        return falha(MENSAGEM_EMAIL_DE_CLIENTE, "email");
      }
      return falha(texto, campo);
    }

    // Mesmo disfarce do `criarConta`: e-mail já cadastrado volta como usuário
    // de mentira, sem identidades. O caso típico aqui é o CLIENTE do app que
    // quer abrir a barbearia dele — e para ele existe caminho próprio, sem
    // perder a conta: `abrirMinhaBarbearia`, pelo Perfil.
    if (!data.user || (data.user.identities?.length ?? 0) === 0) {
      return falha(MENSAGEM_EMAIL_DE_CLIENTE, "email");
    }

    const userId = data.user.id;

    const criada = await criarBarbeariaDoDono(admin, { userId, nomeBarbearia, telefone });

    if (!criada.ok) {
      // Sem a loja, a conta ficaria órfã: um cadastro de barbeiro que entra
      // como cliente e não entende por quê. Desfaz.
      await admin.auth.admin.deleteUser(userId);
      return criada.motivo === "telefone_em_uso"
        ? falha("Este telefone já está cadastrado em outra barbearia.", "telefone")
        : falha("Não consegui criar a barbearia. Tente de novo em instantes.");
    }

    if (!data.session) {
      return sucesso(
        undefined,
        "Barbearia criada! Confirme o e-mail que enviamos e entre para terminar a configuração.",
      );
    }

    revalidatePath("/", "layout");
    redirect("/configurar");
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em criarContaBarbearia:", error);
    return falha("Não consegui criar a conta. Tente de novo em instantes.");
  }
}

/**
 * Não diz "é conta de cliente" — o Supabase não revela de quem é o e-mail, e
 * esta tela também não deveria. Diz o que fazer nos dois casos possíveis.
 */
const MENSAGEM_EMAIL_DE_CLIENTE =
  "Já existe uma conta com este e-mail. Se ela é sua, entre e toque em “Abrir minha barbearia” no Perfil.";

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
