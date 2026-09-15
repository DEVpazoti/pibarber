import "server-only";

import { unstable_rethrow } from "next/navigation";

import { absoluta, envWhatsapp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Barbershop, PainelWhatsapp, WhatsappEvent } from "@/lib/types";
import { hojeISO, one, somarDias, timestampSP } from "@/lib/utils";
import { EVENTOS, montarParametros, previa } from "@/lib/whatsapp/catalogo";
import { diaParaMensagem } from "@/lib/whatsapp/fila";
import { explicarFalha } from "@/lib/whatsapp/rotulos";

/**
 * Monta o bloco de WhatsApp de /painel/configuracoes.
 *
 * ⚠️ QUEM CHAMA JÁ PASSOU POR `requireOwnerContext()`. É isso que autoriza o
 * `createAdminClient()` aqui dentro: `whatsapp_messages` não tem policy para
 * ninguém (24_whatsapp.sql, PARTE 3), e a leitura é recortada à mão pela loja
 * do dono — `.eq("barbershop_id", loja.id)` — selecionando só as colunas que
 * a tela mostra. `recipient` e `params` não saem do banco.
 *
 * NUNCA DERRUBA A PÁGINA. Sem service role local, ou num banco em que a 24
 * ainda não rodou, os interruptores continuam aparecendo com as prévias, e só
 * o histórico fica vazio. Configurações é a tela onde o dono arruma a loja;
 * ela não pode sumir por causa de um recurso acessório.
 */
export async function carregarPainelWhatsapp(loja: Barbershop): Promise<PainelWhatsapp> {
  let integracaoAtiva = false;
  try {
    integracaoAtiva = envWhatsapp() !== null;
  } catch (e) {
    unstable_rethrow(e);
    console.error("[configurações] WhatsApp configurado pela metade:", e instanceof Error ? e.message : e);
  }

  const ligados: Record<WhatsappEvent, boolean> = {
    confirmation: loja.whatsapp_confirmation_enabled ?? true,
    reminder: loja.whatsapp_reminder_enabled ?? true,
    cancellation: loja.whatsapp_cancellation_enabled ?? true,
  };

  let templates: { event: WhatsappEvent; status: PainelWhatsapp["eventos"][number]["templateStatus"]; reject_reason: string | null }[] = [];
  let envios: PainelWhatsapp["envios"] = [];
  let profissional = "Carlos";

  try {
    const admin = createAdminClient();

    const [resTemplates, resEnvios, resProfissional] = await Promise.all([
      admin.from("whatsapp_templates").select("event, status, reject_reason"),
      admin
        .from("whatsapp_messages")
        .select("id, event, status, created_at, failure_code, appointments(customers(full_name))")
        .eq("barbershop_id", loja.id)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("professionals")
        .select("name, nickname")
        .eq("barbershop_id", loja.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (resTemplates.error) {
      console.error("[configurações] falha ao ler templates de WhatsApp:", resTemplates.error);
    } else {
      templates = resTemplates.data ?? [];
    }

    if (resEnvios.error) {
      console.error("[configurações] falha ao ler envios de WhatsApp:", resEnvios.error);
    } else {
      envios = (resEnvios.data ?? []).map((m) => ({
        id: m.id,
        criadoEm: m.created_at,
        cliente: one(one(m.appointments)?.customers)?.full_name ?? null,
        evento: m.event,
        status: m.status,
        falha: m.status === "failed" ? explicarFalha(m.failure_code) : null,
      }));
    }

    if (resProfissional.error) {
      console.error("[configurações] falha ao ler profissional para a prévia:", resProfissional.error);
    } else if (resProfissional.data) {
      profissional = resProfissional.data.nickname?.trim() || resProfissional.data.name;
    }
  } catch (e) {
    unstable_rethrow(e);
    console.error("[configurações] histórico de WhatsApp indisponível:", e instanceof Error ? e.message : e);
  }

  // A prévia usa a loja DE VERDADE — nome, profissional, link — e um cliente
  // de exemplo amanhã às 14:30. É o que o dono precisa conferir: como o nome
  // da barbearia dele fica dentro da frase.
  const amanha = timestampSP(somarDias(hojeISO(), 1), "14:30");
  const exemplo = {
    nome: "João",
    barbearia: loja.name,
    data: diaParaMensagem(amanha),
    hora: "14:30",
    profissional,
  };

  return {
    integracaoAtiva,
    eventos: EVENTOS.map((evento) => {
      const template = templates.find((t) => t.event === evento);
      const link = evento === "cancellation" ? absoluta(`/b/${loja.slug}`) : absoluta("/app/agendamentos");
      return {
        evento,
        ligado: ligados[evento],
        templateStatus: template?.status ?? null,
        motivoReprovacao: template?.reject_reason ?? null,
        previa: previa(evento, montarParametros(evento, { ...exemplo, link })),
      };
    }),
    envios,
  };
}
