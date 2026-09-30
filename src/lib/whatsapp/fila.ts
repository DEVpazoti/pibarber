import "server-only";

import type { Database } from "@/lib/database.types";
import { absoluta, envWhatsapp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataBR, FUSO, horaBR, paraDataISO, somarDias, timestampSP } from "@/lib/utils";
import {
  CATALOGO,
  montarParametros,
  type DadosMensagem,
  type EventoWhatsapp,
} from "@/lib/whatsapp/catalogo";
import { enviarTemplate, FalhaMeta, type ErroMeta } from "@/lib/whatsapp/graph";
import { mascararTelefone, telefoneMeta } from "@/lib/whatsapp/telefone";

/**
 * A FILA DE WHATSAPP — enfileirar, despachar e varrer lembretes.
 *
 * O projeto não tem fila, worker nem Redis. `whatsapp_messages` é a fila, e o
 * "worker" é `/api/cron/whatsapp` chamado de 5 em 5 minutos pelo pg_cron —
 * mais o envio imediato que as Server Actions disparam com `after()` logo
 * depois de agendar.
 *
 * O desenho é LINHA PRIMEIRO, ENTREGA DEPOIS:
 *
 *   ação do usuário ──► enfileirar() ──► whatsapp_messages (pending)
 *                                              │
 *            after() / cron ──► despachar() ───┤  reivindica (SQL, skip locked)
 *                                              ▼
 *                                  Graph API ──► sent + wamid
 *                                              │
 *                   webhook da Meta ──────────►┘  delivered / read / failed
 *
 * Tudo aqui usa `createAdminClient()`: as tabelas da fila não têm policy para
 * ninguém, e cron e webhook não têm sessão.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Mensagem = Database["public"]["Tables"]["whatsapp_messages"]["Row"];
export type DadosDoAgendamento =
  Database["public"]["Functions"]["whatsapp_dados_agendamentos"]["Returns"][number];

/** Depois disto a mensagem morre como `failed`, mesmo com erro transitório. */
const MAX_TENTATIVAS = 5;

/* ==========================================================================
   Montar a mensagem
   ========================================================================== */

/** "sexta, 18/09" — no fuso de São Paulo, nunca no do servidor. */
export function diaParaMensagem(iso: string): string {
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: FUSO })
    .format(new Date(iso))
    .replace("-feira", "");
  return `${semana}, ${dataBR(iso).slice(0, 5)}`;
}

/**
 * O link que vai dentro da mensagem. Sempre por `absoluta()`, que respeita
 * `NEXT_PUBLIC_SITE_URL` — sem ela em produção, o cliente receberia um link
 * para `localhost`.
 *
 *   · Cancelamento → a página da barbearia. O texto diz "marque outro em", e
 *     o link do agendamento cancelado não serve para marcar nada.
 *   · Agendou pelo link público → `/a/<token>`, que abre SEM login. Vem antes
 *     da conta de propósito: quem agendou sem entrar pode ter conta antiga com
 *     o mesmo telefone e não lembrar a senha.
 *   · Tem conta → `/app/agendamentos`.
 *   · Nenhum dos dois (marcado pelo balcão, sem conta) → a página da loja.
 */
function linkDaMensagem(evento: EventoWhatsapp, linha: DadosDoAgendamento): string {
  if (evento === "cancellation") return absoluta(`/b/${linha.barbearia_slug}`);
  if (linha.public_token) return absoluta(`/a/${linha.public_token}`);
  if (linha.tem_conta) return absoluta("/app/agendamentos");
  return absoluta(`/b/${linha.barbearia_slug}`);
}

/**
 * "hoje", "amanhã" ou "sexta, 26/09" — o {{2}} do lembrete.
 *
 * ⚠️ NÃO volte a escrever "amanhã" dentro do texto do template. Em 22/09/2026
 * o lembrete saiu dizendo "amanhã" para um atendimento do MESMO dia, quatro
 * minutos depois da confirmação. O dia é calculado no envio justamente porque
 * o lembrete pode sair atrasado — cron fora do ar, por exemplo.
 */
export function palavraDoDia(iso: string, agora = new Date()): string {
  const dia = paraDataISO(iso);
  const hoje = paraDataISO(agora);
  if (dia === hoje) return "hoje";
  if (dia === somarDias(hoje, 1)) return "amanhã";
  return diaParaMensagem(iso);
}

export function dadosDaMensagem(evento: EventoWhatsapp, linha: DadosDoAgendamento): DadosMensagem {
  return {
    nome: linha.cliente_nome,
    barbearia: linha.barbearia,
    data: diaParaMensagem(linha.starts_at),
    quando: palavraDoDia(linha.starts_at),
    hora: horaBR(linha.starts_at),
    profissional: linha.profissional,
    link: linkDaMensagem(evento, linha),
  };
}

/** Os dados de um ou mais agendamentos, numa ida ao banco. */
export async function buscarDadosDosAgendamentos(
  admin: Admin,
  ids: string[],
): Promise<DadosDoAgendamento[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.rpc("whatsapp_dados_agendamentos", { p_ids: ids });
  if (error) throw new Error(`[whatsapp] whatsapp_dados_agendamentos: ${error.message}`);
  return data ?? [];
}

/* ==========================================================================
   Enfileirar
   ========================================================================== */

export type ResultadoEnfileirar =
  | { tipo: "enfileirada"; id: string }
  /** O índice único (appointment_id, event) recusou: já estava na fila. */
  | { tipo: "duplicada" }
  | {
      tipo: "pulada";
      motivo: "DESLIGADO" | "TELEFONE_INVALIDO" | "OPT_OUT" | "TEMPLATE_INDISPONIVEL";
    };

/**
 * Põe uma mensagem na fila. NÃO envia — quem envia é `despachar()`.
 *
 * Nunca lança por motivo de negócio: ambiente sem credencial, telefone que não
 * é brasileiro, opt-out e template não aprovado voltam como `pulada`. Lança só
 * se o banco falhar, e quem chama das Server Actions engole e loga
 * (ver `avisos.ts`) — agendamento nenhum cai por causa de WhatsApp.
 */
export async function enfileirar(entrada: {
  barbershopId: string | null;
  appointmentId: string | null;
  evento: EventoWhatsapp;
  telefone: string | null;
  params: string[];
  /** Sem valor, agora. O lembrete passa as 18h da véspera. */
  agendarPara?: string;
}): Promise<ResultadoEnfileirar> {
  // 1. Ambiente sem credencial: silêncio, sem erro. É o dev local.
  if (!envWhatsapp()) return { tipo: "pulada", motivo: "DESLIGADO" };

  const destino = telefoneMeta(entrada.telefone);
  if (!destino) return { tipo: "pulada", motivo: "TELEFONE_INVALIDO" };

  const admin = createAdminClient();

  const [optOut, template] = await Promise.all([
    admin.from("whatsapp_opt_outs").select("phone").eq("phone", destino).maybeSingle(),
    admin.from("whatsapp_templates").select("status").eq("event", entrada.evento).maybeSingle(),
  ]);

  if (optOut.error) throw new Error(`[whatsapp] ler opt-out: ${optOut.error.message}`);
  if (template.error) throw new Error(`[whatsapp] ler template: ${template.error.message}`);

  // 2. Pediu para sair. Nem entra na fila — uma linha `pending` para quem
  //    pediu PARAR é uma mensagem esperando para ser um problema.
  if (optOut.data) return { tipo: "pulada", motivo: "OPT_OUT" };

  // Template ainda em análise, reprovado ou pausado: a Meta recusaria o envio
  // com erro permanente. Melhor não enfileirar do que encher a tela do dono de
  // "Falhou". O cron sincroniza o status (templates.ts) e o próximo evento sai.
  if (template.data?.status !== "approved") {
    return { tipo: "pulada", motivo: "TEMPLATE_INDISPONIVEL" };
  }

  // 3. A linha.
  const { data, error } = await admin
    .from("whatsapp_messages")
    .insert({
      barbershop_id: entrada.barbershopId,
      appointment_id: entrada.appointmentId,
      event: entrada.evento,
      recipient: destino,
      params: entrada.params,
      scheduled_for: entrada.agendarPara ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Duplicidade é a idempotência funcionando — o cron que rodou duas vezes,
    // o botão tocado duas vezes. Não é erro e não merece log de erro.
    if (error.code === "23505") return { tipo: "duplicada" };
    throw new Error(`[whatsapp] enfileirar: ${error.message}`);
  }

  return { tipo: "enfileirada", id: data.id };
}

/* ==========================================================================
   Despachar
   ========================================================================== */

export type ResumoDespacho = {
  pegos: number;
  enviados: number;
  falhos: number;
  /** Erro transitório: voltou para a fila com espera. */
  reagendados: number;
};

/** Varre a fila e envia o que venceu. É o que o cron chama. */
export async function despachar(limite = 50): Promise<ResumoDespacho> {
  return processar({ p_limite: limite });
}

/** Envia UMA mensagem já enfileirada — o envio imediato depois de agendar. */
export async function despacharUma(id: string): Promise<ResumoDespacho> {
  return processar({ p_limite: 1, p_id: id });
}

async function processar(args: { p_limite: number; p_id?: string }): Promise<ResumoDespacho> {
  const resumo: ResumoDespacho = { pegos: 0, enviados: 0, falhos: 0, reagendados: 0 };
  if (!envWhatsapp()) return resumo;

  const admin = createAdminClient();

  // A REIVINDICAÇÃO É NO BANCO, não aqui. Um `update ... set attempts =
  // attempts + 1 where status = 'pending'` feito por este código deixaria a
  // linha AINDA `pending` — e a segunda execução concorrente do cron também
  // "reivindicaria", também enviaria, e o cliente receberia duas vezes.
  // `whatsapp_reivindicar` usa `for update skip locked` e empurra
  // `scheduled_for` 10 minutos como prazo de posse. Ver 24_whatsapp.sql.
  const { data: mensagens, error } = await admin.rpc("whatsapp_reivindicar", args);
  if (error) throw new Error(`[whatsapp] whatsapp_reivindicar: ${error.message}`);

  // Em série, não em paralelo: o limite de taxa da Meta é por segundo, e 50
  // envios simultâneos são o jeito mais rápido de colecionar 130429.
  for (const mensagem of mensagens ?? []) {
    resumo.pegos++;
    const resultado = await enviarUma(admin, mensagem);
    resumo[resultado]++;
  }

  return resumo;
}

async function enviarUma(
  admin: Admin,
  mensagem: Mensagem,
): Promise<"enviados" | "falhos" | "reagendados"> {
  const template = CATALOGO[mensagem.event];
  const params = Array.isArray(mensagem.params)
    ? mensagem.params.map((v) => (typeof v === "string" ? v : String(v ?? "")))
    : [];

  let wamid: string;
  try {
    wamid = await enviarTemplate({
      to: mensagem.recipient,
      name: template.nomeMeta,
      language: template.idioma,
      params,
    });
  } catch (e) {
    const erro: ErroMeta =
      e instanceof FalhaMeta
        ? e.erro
        : {
            // Erro NOSSO (configuração, bug). Tenta de novo com espera: se for
            // variável faltando, alguém corrige e a mensagem ainda sai.
            codigo: "INESPERADO",
            mensagem: e instanceof Error ? e.message.slice(0, 300) : "erro inesperado",
            transitorio: true,
          };

    if (!(e instanceof FalhaMeta)) {
      console.error("[whatsapp] erro inesperado no envio:", {
        id: mensagem.id,
        para: mascararTelefone(mensagem.recipient),
        erro: erro.mensagem,
      });
    }

    return registrarFalha(admin, mensagem, erro);
  }

  const { error } = await admin
    .from("whatsapp_messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_id: wamid,
      failure_code: null,
      failure_reason: null,
    })
    .eq("id", mensagem.id)
    .eq("status", "pending");

  if (error) {
    // A mensagem SAIU e o banco não registrou. É o único caminho de mensagem
    // duplicada que sobra: quando o prazo de posse vencer, ela volta a ser
    // elegível. Log alto para dar para conferir.
    console.error("[whatsapp] ENVIADA mas não registrada — pode duplicar:", {
      id: mensagem.id,
      erro: error.message,
    });
  }

  return "enviados";
}

async function registrarFalha(
  admin: Admin,
  mensagem: Mensagem,
  erro: ErroMeta,
): Promise<"falhos" | "reagendados"> {
  const esgotou = mensagem.attempts >= MAX_TENTATIVAS;

  if (erro.transitorio && !esgotou) {
    // `attempts` já vem incrementado pela reivindicação: 1, 2, 3, 4 → espera
    // de 1, 2, 4, 8 minutos. A quinta falha não espera — morre.
    const minutos = 2 ** Math.max(0, mensagem.attempts - 1);
    const { error } = await admin
      .from("whatsapp_messages")
      .update({
        status: "pending",
        scheduled_for: new Date(Date.now() + minutos * 60_000).toISOString(),
        failure_code: erro.codigo,
        failure_reason: erro.mensagem.slice(0, 500),
      })
      .eq("id", mensagem.id);

    if (error) console.error("[whatsapp] falha ao reagendar:", { id: mensagem.id, erro: error.message });
    return "reagendados";
  }

  const { error } = await admin
    .from("whatsapp_messages")
    .update({
      status: "failed",
      failure_code: erro.codigo,
      failure_reason: erro.mensagem.slice(0, 500),
    })
    .eq("id", mensagem.id);

  if (error) console.error("[whatsapp] falha ao marcar falha:", { id: mensagem.id, erro: error.message });
  return "falhos";
}

/* ==========================================================================
   Lembretes
   ========================================================================== */

/**
 * Enfileira o lembrete de quem começa nas próximas 36 horas.
 *
 * 36h, e não 24h: o cron roda de 5 em 5 minutos e o lembrete sai às 18h da
 * VÉSPERA. Um atendimento às 9h de quarta precisa estar na fila antes das 18h
 * de terça — ou seja, 39h antes. A janela larga põe a linha na fila cedo, com
 * `scheduled_for` no futuro; quem segura até a hora certa é a própria fila.
 */
export async function varrerLembretes(): Promise<{ avaliados: number; enfileirados: number }> {
  const resumo = { avaliados: 0, enfileirados: 0 };
  if (!envWhatsapp()) return resumo;

  const admin = createAdminClient();

  const { data: ids, error } = await admin.rpc("whatsapp_lembretes_pendentes", {
    p_limite: 200,
  });
  if (error) throw new Error(`[whatsapp] whatsapp_lembretes_pendentes: ${error.message}`);

  const linhas = await buscarDadosDosAgendamentos(admin, ids ?? []);
  const agora = new Date();

  for (const linha of linhas) {
    resumo.avaliados++;

    try {
      // 18h da véspera, no fuso de São Paulo. Se esse instante já passou
      // (agendou hoje à noite para amanhã cedo), vai agora.
      const vespera = somarDias(paraDataISO(linha.starts_at), -1);
      const alvo = new Date(timestampSP(vespera, "18:00"));
      const agendarPara = (alvo > agora ? alvo : agora).toISOString();

      const resultado = await enfileirar({
        barbershopId: linha.barbershop_id,
        appointmentId: linha.appointment_id,
        evento: "reminder",
        telefone: linha.telefone,
        params: montarParametros("reminder", dadosDaMensagem("reminder", linha)),
        agendarPara,
      });

      // Pulada (opt-out, template em análise) NÃO marca: se o template for
      // aprovado daqui a uma hora, o lembrete ainda tem chance de sair.
      if (resultado.tipo === "pulada") continue;
      if (resultado.tipo === "enfileirada") resumo.enfileirados++;

      // ⚠️ `reminder_sent_at` significa "o lembrete FOI PARA A FILA", não
      // "foi enviado" nem "foi entregue". O nome engana, e fica assim para
      // não quebrar a coluna que já existia desde o 01_schema.sql. Entrega de
      // verdade é `whatsapp_messages.sent_at` / `delivered_at`.
      const { error: erroMarca } = await admin
        .from("appointments")
        .update({ reminder_sent_at: agora.toISOString() })
        .eq("id", linha.appointment_id)
        .is("reminder_sent_at", null);

      if (erroMarca) {
        console.error("[whatsapp] falha ao marcar reminder_sent_at:", {
          appointment: linha.appointment_id,
          erro: erroMarca.message,
        });
      }
    } catch (e) {
      console.error("[whatsapp] falha ao enfileirar lembrete:", {
        appointment: linha.appointment_id,
        erro: e instanceof Error ? e.message : e,
      });
    }
  }

  return resumo;
}
