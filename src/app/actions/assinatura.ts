"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  AsaasErro,
  cobrancasDaAssinatura,
  criarAssinatura,
  criarCliente,
  criarCobrancaParcelada,
  removerAssinatura,
  removerParcelamento,
  type AsaasCobranca,
} from "@/lib/asaas";
import { DIAS_PARA_RENOVAR, diasAte, rotuloDoCiclo, type FormaDePagamento } from "@/lib/assinatura";
import { temPagamentoConfirmado } from "@/lib/assinatura-servidor";
import { requireOwnerContext } from "@/lib/auth";
import { erroDeCpfCnpj, soDigitosDoc } from "@/lib/documento";
import { envAsaas } from "@/lib/env";
import { traduzirErroDesconhecido } from "@/lib/erros";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type SubscriptionCycle } from "@/lib/types";
import { diaBR, hojeISO, paraDataISO } from "@/lib/utils";

/**
 * ASSINAR um plano: cria a assinatura no Asaas e devolve o link de pagamento.
 *
 * O pagamento acontece na página do PRÓPRIO Asaas (cartão ou Pix). Nenhum dado
 * de cartão passa pelo PiBarber — é o que dispensa a certificação PCI.
 *
 * Esta action NÃO libera nada. Ela deixa a assinatura `pending`; quem libera é
 * o webhook, quando o Asaas confirma o dinheiro (`/api/webhooks/asaas`). Voltar
 * da página de pagamento sem pagar não dá acesso.
 *
 * O valor sai da view `plan_prices`, nunca do navegador: a tela só diz QUAL
 * plano e QUAL período.
 *
 * O 1º vencimento é o fim do teste (ou hoje, se ele já acabou). Pagar antes
 * não encurta o teste: o período pago começa no vencimento — ver
 * `assinatura_pagamento_confirmado()` em 26_assinaturas.sql.
 *
 * DOIS JEITOS de cobrar:
 *   à vista     → ASSINATURA no Asaas, que renova sozinha a cada período.
 *   parcelado   → COBRANÇA PARCELADA (semestral 6x, anual 12x, cartão, sem
 *                 juros — a taxa é absorvida). Não renova sozinha: nos últimos
 *                 DIAS_PARA_RENOVAR dias do período o dono gera a próxima por
 *                 aqui, e o Asaas manda o link por e-mail.
 *
 * Escreve em `subscriptions` pela service role: o dono não tem permissão de
 * escrita lá (é o que o impede de se dar um período pago pela REST).
 */
export async function assinarPlano(entrada: {
  planoId: string;
  ciclo: SubscriptionCycle;
  forma: FormaDePagamento;
  /** Semestral em 6x ou anual em 12x no cartão, sem juros. */
  parcelado?: boolean;
  cpfCnpj: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const { shopId, shopName, profile } = await requireOwnerContext();

    if (!envAsaas()) {
      return falha("O pagamento ainda não está disponível. Fale com a gente pelo WhatsApp.");
    }

    const erroDoc = erroDeCpfCnpj(entrada.cpfCnpj);
    if (erroDoc) return falha(erroDoc, "cpfCnpj");
    const documento = soDigitosDoc(entrada.cpfCnpj);

    if (entrada.forma !== "PIX" && entrada.forma !== "CREDIT_CARD") {
      return falha("Escolha cartão de crédito ou Pix.", "forma");
    }
    const parcelado = Boolean(entrada.parcelado);
    if (parcelado && (entrada.forma !== "CREDIT_CARD" || entrada.ciclo === "monthly")) {
      return falha("O parcelamento é só no cartão, para o semestral e o anual.");
    }

    const supabase = await createClient();

    const [{ data: preco, error: erroPreco }, { data: plano }, { count: ativos }] =
      await Promise.all([
        supabase
          .from("plan_prices")
          .select("total, months")
          .eq("plan_id", entrada.planoId)
          .eq("cycle", entrada.ciclo)
          .maybeSingle(),
        supabase
          .from("plans")
          .select("name, max_professionals")
          .eq("id", entrada.planoId)
          .maybeSingle(),
        supabase
          .from("professionals")
          .select("id", { count: "exact", head: true })
          .eq("barbershop_id", shopId)
          .eq("is_active", true),
      ]);

    if (erroPreco) console.error("[assinatura] falha ao ler o preço:", erroPreco);
    if (!preco?.total || !preco.months || !plano) {
      return falha("Esse plano não existe mais. Recarregue a página.");
    }

    if ((ativos ?? 0) > plano.max_professionals) {
      return falha(
        `Você tem ${ativos} profissionais ativos, e o plano ${plano.name} é para até ${plano.max_professionals}. Escolha um plano maior ou desative alguém em Equipe.`,
      );
    }

    // Só depois de provar que é o dono desta loja (requireOwnerContext acima).
    const admin = createAdminClient();

    const { data: atual, error: erroAtual } = await admin
      .from("subscriptions")
      .select("*")
      .eq("barbershop_id", shopId)
      .maybeSingle();

    if (erroAtual || !atual) {
      console.error("[assinatura] assinatura da loja não encontrada:", erroAtual);
      return falha("Não encontrei a assinatura da sua barbearia. Fale com a gente.");
    }

    const pagoEmVigor =
      atual.paid_until != null && new Date(atual.paid_until).getTime() > Date.now();
    // Parcelado não renova sozinho (a assinatura do Asaas não parcela). Nos
    // últimos dias do período, o dono gera a cobrança do próximo por aqui.
    const modoParcelado = Boolean(atual.asaas_installment_id && !atual.asaas_subscription_id);
    const renovando =
      pagoEmVigor &&
      atual.status === "active" &&
      modoParcelado &&
      diasAte(atual.paid_until!) <= DIAS_PARA_RENOVAR;

    // Plano pago em vigor: trocar de plano é outro fluxo (diferença
    // proporcional, mudança na renovação) — ainda não existe.
    // Escolha feita com período pago sobrando e AINDA NÃO PAGA (reativação
    // depois de cancelar, ou renovação do parcelado): o dono pode trocar a
    // forma de pagamento ou o plano até pagar.
    const escolhaNaoPaga =
      pagoEmVigor &&
      atual.status === "active" &&
      Boolean(atual.asaas_subscription_id || atual.asaas_installment_id) &&
      !(await temPagamentoConfirmado({
        assinatura: atual.asaas_subscription_id,
        parcelamento: atual.asaas_installment_id,
      }));

    if (pagoEmVigor && atual.status === "active" && !renovando && !escolhaNaoPaga) {
      return falha(
        modoParcelado
          ? `Seu plano está pago até ${diaBR(paraDataISO(atual.paid_until!))}. A renovação abre ${DIAS_PARA_RENOVAR} dias antes disso.`
          : "Você já tem um plano ativo. A troca de plano pelo painel chega em breve — por enquanto, fale com a gente.",
      );
    }

    // --- Cliente no Asaas: um por barbearia, reaproveitado -----------------
    let clienteId = atual.asaas_customer_id;
    if (!clienteId) {
      const cliente = await criarCliente({
        nome: shopName ?? profile.full_name ?? "Barbearia",
        cpfCnpj: documento,
        email: profile.email,
        celular: profile.phone,
        referencia: shopId,
      });
      clienteId = cliente.id;
    }

    // --- O que ficou para trás sem pagar sai, e entra o novo --------------
    // O dono escolheu, não pagou, e voltou para escolher outro. Sem isto
    // ficariam duas cobranças abertas para a mesma loja. O que já foi PAGO
    // (a assinatura ativa, o parcelamento do período em vigor) não é tocado.
    if (atual.asaas_subscription_id && (atual.status !== "active" || escolhaNaoPaga)) {
      await removerAssinatura(atual.asaas_subscription_id).catch((e) =>
        // 404 = já não existia. Outro erro também não impede o novo — mas fica
        // no log, porque pode sobrar cobrança lá.
        console.error("[assinatura] falha ao remover a assinatura anterior:", e),
      );
    }
    if (
      atual.asaas_installment_id &&
      !(await temPagamentoConfirmado({ parcelamento: atual.asaas_installment_id }))
    ) {
      await removerParcelamento(atual.asaas_installment_id).catch((e) =>
        console.error("[assinatura] falha ao remover o parcelamento anterior:", e),
      );
    }
    // E o espelho local para de oferecer "Pagar agora" para o que saiu.
    const { error: erroLimpar } = await admin
      .from("subscription_payments")
      .update({ status: "DELETED", updated_at: new Date().toISOString() })
      .eq("barbershop_id", shopId)
      .in("status", ["PENDING", "OVERDUE"]);
    if (erroLimpar) console.error("[assinatura] falha ao limpar faturas antigas:", erroLimpar);

    // --- Quando vence a 1ª cobrança ----------------------------------------
    // Ainda há período pago (renovação do parcelado, ou quem cancelou e voltou
    // antes do fim): no dia em que ele acaba — contínuo, sem pagar duas vezes
    // pelo mesmo tempo. Senão: no fim do teste, ou hoje se ele já acabou.
    const hoje = hojeISO();
    const fimDoTeste = paraDataISO(atual.trial_ends_at);
    const primeiroVencimento = pagoEmVigor
      ? paraDataISO(atual.paid_until!)
      : fimDoTeste > hoje
        ? fimDoTeste
        : hoje;
    const descricao = `PiBarber — Plano ${plano.name} (${rotuloDoCiclo(entrada.ciclo)}${parcelado ? `, ${preco.months}x` : ""})`;

    // --- Cria no Asaas ------------------------------------------------------
    let primeira: AsaasCobranca | undefined;
    let desfazer: () => Promise<void>;
    let vinculo: {
      asaas_subscription_id: string | null;
      asaas_installment_id: string | null;
      installment_first_due: string | null;
    };

    if (parcelado) {
      primeira = await criarCobrancaParcelada({
        cliente: clienteId,
        valorTotal: Number(preco.total),
        parcelas: preco.months!,
        primeiroVencimento,
        descricao,
        referencia: shopId,
      });
      if (!primeira.installment) {
        console.error("[assinatura] cobrança parcelada sem parcelamento:", primeira.id);
        return falha("Não consegui gerar o parcelamento. Tente de novo em instantes.");
      }
      const parcelamento = primeira.installment;
      desfazer = () => removerParcelamento(parcelamento);
      vinculo = {
        asaas_subscription_id: null,
        asaas_installment_id: parcelamento,
        installment_first_due: primeiroVencimento,
      };
    } else {
      const nova = await criarAssinatura({
        cliente: clienteId,
        forma: entrada.forma,
        valor: Number(preco.total),
        primeiroVencimento,
        ciclo: entrada.ciclo,
        descricao,
        referencia: shopId,
      });
      desfazer = () => removerAssinatura(nova.id);
      vinculo = {
        asaas_subscription_id: nova.id,
        asaas_installment_id: null,
        installment_first_due: null,
      };
      // A 1ª cobrança nasce junto com a assinatura.
      [primeira] = await cobrancasDaAssinatura(nova.id);
    }

    const { error: erroGravar } = await admin
      .from("subscriptions")
      .update({
        plan_id: entrada.planoId,
        cycle: entrada.ciclo,
        // Com período pago em vigor (renovando, ou voltando depois de
        // cancelar), a loja continua em dia até ele acabar: segue `active`.
        status: pagoEmVigor ? "active" : "pending",
        asaas_customer_id: clienteId,
        ...vinculo,
        updated_at: new Date().toISOString(),
      })
      .eq("barbershop_id", shopId);

    if (erroGravar) {
      // Existe no Asaas mas não aqui: o webhook não acharia a loja ao
      // confirmar o pagamento. Melhor desfazer do que cobrar sem dar acesso.
      console.error("[assinatura] falha ao gravar a assinatura:", erroGravar);
      await desfazer().catch((e) => console.error("[assinatura] e falha ao desfazer no Asaas:", e));
      return falha("Não consegui registrar sua assinatura. Tente de novo em instantes.");
    }

    if (!primeira?.invoiceUrl) {
      console.error("[assinatura] sem cobrança com link no Asaas:", vinculo);
      return falha(
        "Sua assinatura foi criada, mas a fatura ainda não saiu. Recarregue em instantes.",
      );
    }

    // Grava já — o webhook PAYMENT_CREATED faria o mesmo, mas não dá para
    // contar com ele para a tela mostrar a fatura em aberto ao voltar.
    const { error: erroFatura } = await admin.from("subscription_payments").upsert(
      {
        barbershop_id: shopId,
        asaas_payment_id: primeira.id,
        plan_id: entrada.planoId,
        cycle: entrada.ciclo,
        value: primeira.value,
        billing_type: primeira.billingType,
        status: primeira.status,
        due_date: primeira.dueDate,
        invoice_url: primeira.invoiceUrl,
        installment_number: primeira.installmentNumber ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asaas_payment_id" },
    );
    if (erroFatura) console.error("[assinatura] falha ao gravar a fatura:", erroFatura);

    revalidatePath("/assinatura");
    return sucesso({ url: primeira.invoiceUrl });
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof AsaasErro) {
      console.error("[assinatura] o Asaas recusou:", error.status, error.codigo, error.descricao);
      if ((error.codigo ?? "").toLowerCase().includes("cpfcnpj")) {
        return falha("O CPF ou CNPJ foi recusado. Confira os números.", "cpfCnpj");
      }
      return falha("O sistema de pagamento recusou o pedido. Tente de novo em instantes.");
    }

    return falha(traduzirErroDesconhecido(error, "[assinatura] assinarPlano"));
  }
}

/**
 * O DONO cancela a renovação automática (Termos, item 5: "no mensal, cancele
 * quando quiser").
 *
 * Só existe para a assinatura que renova sozinha (à vista no cartão, ou Pix).
 * O parcelado não renova — não há o que cancelar, e as parcelas restantes
 * continuam, como dizem os termos.
 *
 * NÃO devolve dinheiro e NÃO corta o acesso: a barbearia segue até o fim do
 * período já pago. Devolução (os 7 dias de arrependimento) é pedida à
 * PiSystem e feita no /admin — dinheiro saindo passa por uma pessoa.
 */
export async function cancelarRenovacao(): Promise<ActionResult> {
  try {
    const { shopId, profile } = await requireOwnerContext();
    const admin = createAdminClient();

    const { data: atual, error } = await admin
      .from("subscriptions")
      .select("status, asaas_subscription_id, paid_until")
      .eq("barbershop_id", shopId)
      .maybeSingle();

    if (error || !atual) {
      console.error("[assinatura] cancelar: assinatura não encontrada:", error);
      return falha("Não encontrei a sua assinatura. Fale com a gente.");
    }
    if (atual.status !== "active" || !atual.asaas_subscription_id) {
      return falha("Não há renovação automática para cancelar.");
    }

    await removerAssinatura(atual.asaas_subscription_id);

    const { error: erroGravar } = await admin
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("barbershop_id", shopId);
    if (erroGravar) {
      // O Asaas já parou de cobrar; aqui só ficou o rótulo errado. Grave, mas
      // não é motivo para dizer ao dono que falhou.
      console.error("[assinatura] cancelou no Asaas mas não gravou:", erroGravar);
    }

    const { error: erroEvento } = await admin.from("subscription_events").insert({
      barbershop_id: shopId,
      actor_id: profile.id,
      action: "owner_cancel",
      details: { asaas_subscription_id: atual.asaas_subscription_id, paid_until: atual.paid_until },
    });
    if (erroEvento) console.error("[assinatura] falha ao registrar o cancelamento:", erroEvento);

    revalidatePath("/assinatura");
    revalidatePath("/painel", "layout");
    return sucesso(
      undefined,
      atual.paid_until
        ? `Renovação cancelada. Sua barbearia continua funcionando até ${diaBR(paraDataISO(atual.paid_until))}.`
        : "Renovação cancelada.",
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AsaasErro) {
      console.error("[assinatura] o Asaas recusou o cancelamento:", error.status, error.descricao);
      return falha("Não consegui cancelar agora. Tente de novo em instantes.");
    }
    return falha(traduzirErroDesconhecido(error, "[assinatura] cancelarRenovacao"));
  }
}
