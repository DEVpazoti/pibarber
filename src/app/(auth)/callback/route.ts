import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { ROTA_EMAIL_CONFIRMADO, ROTA_REDEFINIR_SENHA } from "@/lib/auth";
import { casaDoLado, COOKIE_LADO, OPCOES_COOKIE_LADO, type Lado } from "@/lib/lado";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback do OAuth (Google) e da confirmação de e-mail.
 *
 * O Supabase devolve um `code` aqui; trocamos por sessão e mandamos cada papel
 * para a casa dele.
 *
 * Também aceita `token_hash` + `type`, que é o que os modelos de e-mail do
 * Supabase mandam quando personalizados (supabase/emails/*.html). A diferença
 * importa: o `code` do PKCE só vale no MESMO navegador que pediu; o
 * `token_hash` vale em qualquer um — o link aberto no app do Gmail funciona.
 *
 * Esta URL precisa estar cadastrada nos DOIS lados:
 *   Supabase  → Authentication → URL Configuration → Redirect URLs
 *   Google    → Credenciais OAuth → URIs de redirecionamento autorizados
 */
/** Manda de volta para o login com a mensagem já em português. */
function recusar(origin: string, mensagem: string): NextResponse {
  return NextResponse.redirect(`${origin}/entrar?erro=${encodeURIComponent(mensagem)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const proximo = searchParams.get("proximo");
  // A porta de onde a pessoa veio (login com Google ou link de confirmação):
  // ver src/lib/lado.ts.
  const porta: Lado = searchParams.get("lado") === "barbearia" ? "barbearia" : "cliente";
  const erro = searchParams.get("error");
  const erroDescricao = searchParams.get("error_description");

  // Quem chegou pelo link do e-mail de confirmação vem com este destino, posto
  // por `criarConta()`. Saber disso muda as mensagens de erro daqui: neste
  // caminho não existe janela do Google para ninguém ter fechado.
  const confirmandoEmail = proximo === ROTA_EMAIL_CONFIRMADO;
  const redefinindoSenha = proximo === ROTA_REDEFINIR_SENHA;
  const tokenHash = searchParams.get("token_hash");
  const tipoOtp = searchParams.get("type") as EmailOtpType | null;

  if (erro || erroDescricao) {
    console.error("[callback] o provedor recusou:", erro, erroDescricao);

    // O link do e-mail tem validade (Supabase → Auth → Email OTP Expiration) e
    // vale uma vez só. Estourado qualquer um dos dois, o Supabase devolve o
    // mesmo `access_denied` do Google — e a mensagem de Google, aqui, seria
    // mentira.
    if (confirmandoEmail) {
      return recusar(
        origin,
        "O link de confirmação expirou ou já tinha sido usado. Tente entrar; se o e-mail ainda não estiver confirmado, refaça o cadastro para receber outro link.",
      );
    }
    if (redefinindoSenha) return NextResponse.redirect(`${origin}${ROTA_REDEFINIR_SENHA}`);

    // Fechar a janela do Google e negar a permissão caem os dois em
    // `access_denied`. Não é falha nossa e não adianta pedir "tente de novo" —
    // a pessoa desistiu de propósito, e a mensagem tem que reconhecer isso.
    if (erro === "access_denied") {
      return recusar(
        origin,
        "Você cancelou a entrada com o Google. Pode tentar de novo quando quiser.",
      );
    }

    // `server_error` e `temporarily_unavailable` são do lado deles.
    if (erro === "server_error" || erro === "temporarily_unavailable") {
      return recusar(origin, "O Google não respondeu agora. Tente de novo em instantes.");
    }

    return recusar(origin, "Não consegui entrar com o Google. Tente de novo.");
  }

  if (!code && !(tokenHash && tipoOtp)) {
    // Sem `code` e sem `error`: ou o link de confirmação de e-mail já foi
    // usado, ou o provedor devolveu o erro no FRAGMENTO da URL (#error=...),
    // que o servidor não enxerga — o navegador não o envia.
    return recusar(origin, "Link de acesso inválido ou já usado. Peça um novo ou entre de novo.");
  }

  const supabase = await createClient();
  const { data, error } =
    tokenHash && tipoOtp
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipoOtp })
      : await supabase.auth.exchangeCodeForSession(code ?? "");
  const usuario: User | null = data.user;

  if (error || !usuario) {
    console.error("[callback] falha ao trocar o código por sessão:", error);

    // Ter um `code` na mão prova que o Supabase ACEITOU o token do e-mail —
    // ou seja, o endereço já foi confirmado lá antes de a pessoa chegar aqui.
    // O que falta é só a sessão: o verificador do PKCE ficou no navegador do
    // cadastro, e o link foi aberto no app do Gmail ou no outro aparelho.
    // Mandar essa pessoa para o login dizendo "link expirado" seria mentira
    // duas vezes — o e-mail está confirmado, e ela só precisa entrar.
    if (confirmandoEmail) {
      return NextResponse.redirect(`${origin}${ROTA_EMAIL_CONFIRMADO}`);
    }
    // Sem sessão, /redefinir-senha mostra "link expirado" e o botão de pedir outro.
    if (redefinindoSenha) return NextResponse.redirect(`${origin}${ROTA_REDEFINIR_SENHA}`);

    // O código do PKCE vale uma vez só e expira rápido. Voltar ao /callback
    // pelo histórico do navegador cai sempre aqui, e "tente de novo" sozinho
    // não diz o que fazer.
    return recusar(
      origin,
      "Esse link de acesso expirou ou já tinha sido usado. Comece a entrada de novo.",
    );
  }

  const { data: perfil, error: erroPerfil } = await supabase
    .from("profiles")
    .select("role, is_platform_admin")
    .eq("id", usuario.id)
    .maybeSingle();

  if (erroPerfil) console.error("[callback] falha ao ler o perfil:", erroPerfil);

  const temBarbearia = perfil?.role === "owner" || perfil?.role === "assistant";
  const lado: Lado = porta === "barbearia" && temBarbearia ? "barbearia" : "cliente";

  // Destino interno vindo do ?proximo= — nunca um domínio de fora.
  const destinoSeguro =
    proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : null;
  const destino =
    destinoSeguro ?? (perfil?.is_platform_admin ? "/admin" : casaDoLado(porta, temBarbearia));

  const resposta = NextResponse.redirect(`${origin}${destino}`);
  resposta.cookies.set(COOKIE_LADO, lado, OPCOES_COOKIE_LADO);
  return resposta;
}
