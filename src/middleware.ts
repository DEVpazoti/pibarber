import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";

/**
 * Middleware — a SEGUNDA das três camadas de permissão.
 *
 *   1. RLS no Postgres   → a única que vale de verdade
 *   2. este arquivo      → redireciona por prefixo antes de renderizar
 *   3. requireRole()     → no topo de cada página
 *
 * Ele existe pela experiência, não pela segurança: manda a pessoa para o lugar
 * certo antes de gastar uma renderização. TODA página continua chamando
 * requireRole(). Nunca confie só nisto aqui.
 */

const PREFIXOS_APP = ["/app"];
const PREFIXOS_PAINEL = ["/painel"];
const PREFIXOS_ADMIN = ["/admin"];
const ROTAS_AUTENTICACAO = ["/entrar", "/criar-conta"];

function comecaCom(caminho: string, prefixos: string[]): boolean {
  return prefixos.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  // Este objeto é reatribuído dentro de setAll — é assim que o @supabase/ssr
  // devolve o cookie renovado junto da resposta.
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem configuração não dá para decidir nada: deixa passar e a página mostra
  // o erro de ambiente, que é bem mais claro do que um redirect misterioso.
  if (!url || !anonKey) return resposta;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar) {
        for (const { name, value } of paraGravar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() renova a sessão e valida o token no servidor do Supabase.
  // Não troque por getSession(): aquele só lê o cookie, que o usuário controla.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const protegida =
    comecaCom(caminho, PREFIXOS_APP) ||
    comecaCom(caminho, PREFIXOS_PAINEL) ||
    comecaCom(caminho, PREFIXOS_ADMIN);

  // --- Sem sessão ----------------------------------------------------------
  if (!user) {
    if (protegida) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/entrar";
      // Guarda para onde a pessoa queria ir, e devolve para lá depois do login.
      destino.searchParams.set("proximo", caminho);
      return NextResponse.redirect(destino);
    }
    return resposta;
  }

  // --- Com sessão: precisa saber o papel -----------------------------------
  if (!protegida && !ROTAS_AUTENTICACAO.includes(caminho)) {
    return resposta; // landing, /b/[slug] e afins: segue sem consultar o banco
  }

  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("role, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[middleware] falha ao ler o perfil:", error);
    return resposta; // requireRole() na página resolve
  }

  const papel = perfil?.role ?? "client";
  const ehAdmin = perfil?.is_platform_admin ?? false;

  const casa = ehAdmin
    ? "/admin"
    : papel === "owner" || papel === "assistant"
      ? "/painel"
      : "/app";

  // Quem já está logado não fica olhando tela de login.
  if (ROTAS_AUTENTICACAO.includes(caminho)) {
    const destino = request.nextUrl.clone();
    destino.pathname = casa;
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  // --- Cada prefixo com o seu papel ----------------------------------------
  const podeApp = papel === "client";
  const podePainel = papel === "owner" || papel === "assistant";

  const negado =
    (comecaCom(caminho, PREFIXOS_APP) && !podeApp) ||
    (comecaCom(caminho, PREFIXOS_PAINEL) && !podePainel) ||
    (comecaCom(caminho, PREFIXOS_ADMIN) && !ehAdmin);

  if (negado) {
    const destino = request.nextUrl.clone();
    destino.pathname = casa;
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, MENOS:
     *   _next/static, _next/image  → build
     *   favicon, manifest, ícones  → estáticos
     *   arquivos com extensão      → imagens e afins
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
