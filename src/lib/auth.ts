import "server-only";

import { unstable_rethrow } from "next/navigation";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Profile, ShopContext, SubscriptionStatus, UserRole } from "@/lib/types";

/**
 * ARMADILHA QUE CUSTA CARO — leia antes de mexer em qualquer catch daqui.
 *
 * `redirect()` e `notFound()` do Next viajam como EXCEÇÃO. Um catch genérico
 * as engole e quebra o roteamento em silêncio: a página simplesmente não
 * redireciona e ninguém entende por quê.
 *
 * Por isso todo catch deste arquivo chama `unstable_rethrow(error)` na
 * PRIMEIRA linha, antes de qualquer console.error.
 */

/* ==========================================================================
   Perfil
   ========================================================================== */

/**
 * O perfil de quem está logado, ou null.
 *
 * Envolvido em `cache()` do React: várias chamadas no mesmo request batem no
 * banco uma vez só. Layout, página e componente podem chamar à vontade.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  try {
    const supabase = await createClient();

    // getUser() valida o token no servidor do Supabase. getSession() só lê o
    // cookie, que o usuário controla — nunca decida permissão com ele.
    const {
      data: { user },
      error: erroUsuario,
    } = await supabase.auth.getUser();

    if (erroUsuario || !user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[auth] falha ao carregar o perfil:", error);
      return null;
    }

    return data;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em getProfile:", error);
    return null;
  }
});

/** Exige alguém logado. Sem sessão, manda para o login. */
export async function requireProfile(): Promise<Profile> {
  const perfil = await getProfile();
  if (!perfil) redirect("/entrar");
  return perfil;
}

/**
 * Exige um dos papéis. Quem não tem vai para a casa DELE, não para uma tela
 * de erro — assim o assistente que digitar /painel/caixa na mão volta para
 * /painel em vez de encarar um 403.
 */
export async function requireRole(papeis: UserRole[]): Promise<Profile> {
  const perfil = await requireProfile();
  if (!papeis.includes(perfil.role)) redirect(rotaInicial(perfil));
  return perfil;
}

/** Exige a permissão extra de admin da plataforma. */
export async function requireAdmin(): Promise<Profile> {
  const perfil = await requireProfile();
  if (!perfil.is_platform_admin) redirect(rotaInicial(perfil));
  return perfil;
}

/* ==========================================================================
   Contexto da barbearia
   ========================================================================== */

/**
 * Quem opera o painel e QUAL barbearia ele opera.
 *
 * O dono tem a barbearia dele; o assistente tem a que está gravada em
 * profiles.barbershop_id. Se não houver nenhuma, não há painel para mostrar.
 */
export const requireShopContext = cache(async (): Promise<ShopContext> => {
  const perfil = await requireRole(["owner", "assistant"]);

  try {
    const supabase = await createClient();
    let shopId: string | null = null;

    let shopName: string | null = null;
    // Só o dono passa pelo setup. Para o assistente vale sempre "concluído":
    // ele não configura a loja, e travá-lo fora do painel por causa do dono
    // não ajudaria ninguém.
    let setupConcluido = true;
    // Vem na MESMA consulta, pela coluna calculada `assinatura_em_dia`
    // (26_assinaturas.sql). Nulo (consulta falhou) conta como liberada: travar
    // o painel por falha de leitura seria pior do que deixá-lo abrir.
    let assinaturaLiberada = true;
    let assinatura: ShopContext["assinatura"] = null;

    if (perfil.role === "owner") {
      // `name` vem JUNTO do `id` de propósito (G4 do PERFORMANCE.md): o layout
      // do painel consultava `barbershops` de novo, pela MESMA linha, só para
      // ler esta coluna. Duas idas e voltas ao us-east-2 pelo mesmo registro.
      // Trazer a coluna a mais aqui não custa nada — a consulta já ia acontecer.
      const { data, error } = await supabase
        .from("barbershops")
        .select(
          "id, name, setup_completed_at, assinatura_em_dia, subscriptions(status, trial_ends_at, paid_until, asaas_subscription_id, asaas_installment_id)",
        )
        .eq("owner_id", perfil.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        // Coluna calculada: o parser de tipos do supabase-js não a enxerga.
        .overrideTypes<
          {
            id: string;
            name: string;
            setup_completed_at: string | null;
            assinatura_em_dia: boolean | null;
            subscriptions: {
              status: SubscriptionStatus;
              trial_ends_at: string;
              paid_until: string | null;
              asaas_subscription_id: string | null;
              asaas_installment_id: string | null;
            } | null;
          },
          { merge: false }
        >();

      if (error) console.error("[auth] falha ao achar a barbearia do dono:", error);
      shopId = data?.id ?? null;
      shopName = data?.name ?? null;
      setupConcluido = Boolean(data?.setup_completed_at);
      assinaturaLiberada = data?.assinatura_em_dia !== false;
      // Para a faixa de aviso do painel ("faltam 3 dias"). Só o dono vê.
      assinatura = data?.subscriptions
        ? {
            status: data.subscriptions.status,
            trialEndsAt: data.subscriptions.trial_ends_at,
            paidUntil: data.subscriptions.paid_until,
            // Parcelado no cartão é cobrança avulsa: não renova sozinho.
            renovaSozinho: !(
              data.subscriptions.asaas_installment_id && !data.subscriptions.asaas_subscription_id
            ),
          }
        : null;
    } else {
      // O assistente NÃO ganha consulta nova aqui, e o `shopId` continua vindo
      // do perfil, não do resultado. Derivá-lo da linha devolvida mudaria o
      // comportamento: uma barbearia escondida pela RLS passaria a mandar o
      // assistente para /sem-barbearia, que não é o que acontece hoje. O G4 é
      // para tirar uma chamada do caminho, não para mexer em quem entra.
      shopId = perfil.barbershop_id;

      if (shopId) {
        const { data, error } = await supabase
          .from("barbershops")
          .select("name, assinatura_em_dia")
          .eq("id", shopId)
          .maybeSingle()
          .overrideTypes<{ name: string; assinatura_em_dia: boolean | null }, { merge: false }>();

        if (error) console.error("[auth] falha ao ler o nome da barbearia:", error);
        shopName = data?.name ?? null;
        assinaturaLiberada = data?.assinatura_em_dia !== false;
      }
    }

    if (!shopId) redirect("/sem-barbearia");

    return {
      profile: perfil,
      shopId,
      shopName,
      setupConcluido,
      assinaturaLiberada,
      assinatura,
      // Dinheiro é só do dono. A RLS impõe o mesmo no banco — isto aqui só
      // evita renderizar (e buscar) o que o assistente não pode ver.
      podeVerDinheiro: perfil.role === "owner" || perfil.is_platform_admin,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] erro inesperado em requireShopContext:", error);
    redirect("/entrar");
  }
});

/** Só o dono passa. Use no topo de caixa, comissões, relatórios e equipe. */
export async function requireOwnerContext(): Promise<ShopContext> {
  const ctx = await requireShopContext();
  if (!ctx.podeVerDinheiro) redirect("/painel");
  return ctx;
}

/* ==========================================================================
   Rotas
   ========================================================================== */

/**
 * Onde termina a confirmação de e-mail.
 *
 * Mora aqui, e não escrito à mão em cada ponto, porque o caminho aparece em
 * três: o `emailRedirectTo` do cadastro, o `?proximo=` que o /callback devolve
 * e a pasta da própria página. Errar a letra em um deles não quebra tela
 * nenhuma — só larga o recém-cadastrado num lugar que não é o de chegada.
 */
export const ROTA_EMAIL_CONFIRMADO = "/email-confirmado";

/** A casa de cada papel, usada depois do login e em todo redirect de acesso. */
export function rotaInicial(perfil: Pick<Profile, "role" | "is_platform_admin">): string {
  if (perfil.is_platform_admin) return "/admin";
  if (perfil.role === "owner" || perfil.role === "assistant") return "/painel";
  return "/app";
}
