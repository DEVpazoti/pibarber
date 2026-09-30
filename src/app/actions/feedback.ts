"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireAdmin, requireShopContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * RELATOS DO PAINEL — o barbeiro reporta problema, sugestão ou elogio.
 *
 * Grava com o cliente do PRÓPRIO usuário, não com a service role: a RLS de
 * `feedbacks` (28_feedbacks.sql) exige que ele opere a loja e escreva em nome
 * de si mesmo. O limite de 10 por hora também é do banco.
 *
 * O contexto (papel, plano, navegador) é juntado aqui e na tela, para o relato
 * chegar ao /admin sem precisar perguntar "em qual tela você estava?".
 */

export type TipoDeRelato = "problema" | "sugestao" | "elogio";
const TIPOS: TipoDeRelato[] = ["problema", "sugestao", "elogio"];

export async function enviarFeedback(entrada: {
  tipo: TipoDeRelato;
  mensagem: string;
  pagina?: string;
  navegador?: string;
  tela?: string;
  /** Caminho do print no bucket `feedbacks`, já enviado pela tela. */
  anexo?: string | null;
}): Promise<ActionResult> {
  try {
    const { shopId, profile, assinatura, podeVerDinheiro } = await requireShopContext();

    if (!TIPOS.includes(entrada.tipo)) return falha("Escolha o tipo do relato.", "tipo");
    const mensagem = entrada.mensagem.trim();
    if (mensagem.length < 5)
      return falha("Conte um pouco mais — pelo menos uma frase.", "mensagem");
    if (mensagem.length > 2000) return falha("Use no máximo 2.000 caracteres.", "mensagem");

    // O print só pode ser da pasta desta loja: é o que a policy do bucket
    // permitiu enviar, e um caminho de outra loja aqui seria forjado.
    const anexo = entrada.anexo?.trim() || null;
    if (anexo && !anexo.startsWith(`${shopId}/`)) return falha("Anexo inválido.");

    const supabase = await createClient();
    const { error } = await supabase.from("feedbacks").insert({
      barbershop_id: shopId,
      author_id: profile.id,
      kind: entrada.tipo,
      message: mensagem,
      page: entrada.pagina?.slice(0, 300) || null,
      attachment_path: anexo,
      context: {
        papel: podeVerDinheiro ? "dono" : "assistente",
        assinatura: assinatura
          ? {
              status: assinatura.status,
              plano: assinatura.planoPago,
              teste_ate: assinatura.trialEndsAt,
              pago_ate: assinatura.paidUntil,
            }
          : null,
        navegador: entrada.navegador?.slice(0, 400) ?? null,
        tela: entrada.tela?.slice(0, 40) ?? null,
      },
    });

    if (error) return falha(traduzirErroBanco(error, "[feedback] enviar"));

    revalidatePath("/admin/feedbacks");
    return sucesso(
      undefined,
      entrada.tipo === "problema"
        ? "Recebemos! Vamos olhar e responder pelo seu WhatsApp em até 1 dia útil."
        : "Recebemos, obrigado! Cada relato é lido pela equipe do PiBarber.",
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[feedback] enviarFeedback"));
  }
}

/** O /admin muda a situação do relato: novo → em análise → resolvido. */
export async function mudarSituacaoFeedback(
  id: string,
  status: "novo" | "em_analise" | "resolvido",
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!["novo", "em_analise", "resolvido"].includes(status)) return falha("Situação inválida.");

    const supabase = await createClient();
    const { error } = await supabase
      .from("feedbacks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return falha(traduzirErroBanco(error, "[feedback] mudar situação"));

    revalidatePath("/admin/feedbacks");
    revalidatePath("/admin");
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[feedback] mudarSituacaoFeedback"));
  }
}
