import "server-only";

import type { Database, Json } from "@/lib/database.types";
import {
  montarEmail,
  ehTipoEmail,
  TIPOS_MARKETING,
  type ParametrosEmail,
  type TipoEmail,
} from "@/lib/email/modelos";
import { enviarEmail, FalhaResend, mascararEmail, type ErroEmail } from "@/lib/email/resend";
import { absoluta, envEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { brl, dataBR, diaBR, FUSO, horaBR, paraDataISO, somarDias, timestampSP } from "@/lib/utils";

/**
 * A FILA DE E-MAIL — o mesmo desenho da de WhatsApp (src/lib/whatsapp/fila.ts):
 *
 *   ação / cron ──► enfileirarEmail() ──► email_messages (pending)
 *                                              │
 *          after() / cron ──► despacharEmails() ─┤  email_reivindicar (skip locked)
 *                                              ▼
 *                                  Resend ──► sent + id
 *
 * A idempotência é a `dedupe_key` única: enfileirar duas vezes a mesma coisa
 * devolve `duplicada`, não manda duas vezes. Tudo com `createAdminClient()`:
 * a fila não tem policy para ninguém, e o cron não tem sessão.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Mensagem = Database["public"]["Tables"]["email_messages"]["Row"];
export type DadosAgendamentoEmail =
  Database["public"]["Functions"]["email_dados_agendamentos"]["Returns"][number];

const MAX_TENTATIVAS = 5;

/* ==========================================================================
   Enfileirar
   ========================================================================== */

export type ResultadoEnfileirarEmail =
  | { tipo: "enfileirada"; id: string }
  | { tipo: "duplicada" }
  | { tipo: "pulada"; motivo: "DESLIGADO" | "SEM_EMAIL" };

export async function enfileirarEmail(entrada: {
  tipo: TipoEmail;
  para: string | null | undefined;
  chave: string;
  params: ParametrosEmail;
  barbershopId?: string | null;
  appointmentId?: string | null;
  agendarPara?: string;
}): Promise<ResultadoEnfileirarEmail> {
  if (!envEmail()) return { tipo: "pulada", motivo: "DESLIGADO" };

  const para = entrada.para?.trim().toLowerCase();
  if (!para || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
    return { tipo: "pulada", motivo: "SEM_EMAIL" };
  }

  const { data, error } = await createAdminClient()
    .from("email_messages")
    .insert({
      kind: entrada.tipo,
      recipient: para,
      dedupe_key: entrada.chave,
      params: entrada.params as Json,
      barbershop_id: entrada.barbershopId ?? null,
      appointment_id: entrada.appointmentId ?? null,
      scheduled_for: entrada.agendarPara ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // A chave repetida é a idempotência funcionando.
    if (error.code === "23505") return { tipo: "duplicada" };
    throw new Error(`[email] enfileirar: ${error.message}`);
  }
  return { tipo: "enfileirada", id: data.id };
}

/* ==========================================================================
   Parâmetros de um agendamento
   ========================================================================== */

/** "sexta, 18/09" — no fuso de São Paulo. */
export function diaDoEmail(iso: string): string {
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: FUSO })
    .format(new Date(iso))
    .replace("-feira", "");
  return `${semana}, ${dataBR(iso).slice(0, 5)}`;
}

/** O link do CLIENTE: sem login quando agendou pelo link público. */
function linkDoCliente(linha: DadosAgendamentoEmail): string {
  if (linha.public_token) return absoluta(`/a/${linha.public_token}`);
  if (linha.tem_conta) return absoluta("/app/agendamentos");
  return absoluta(`/b/${linha.barbearia_slug}`);
}

export function paramsDoAgendamento(
  linha: DadosAgendamentoEmail,
  para: "dono" | "cliente",
): ParametrosEmail {
  const dia = paraDataISO(linha.starts_at);
  return {
    nome: linha.cliente_nome.split(" ")[0],
    cliente: linha.cliente_nome,
    telefone: linha.cliente_telefone,
    barbearia: linha.barbearia,
    endereco: linha.barbearia_endereco,
    profissional: linha.profissional,
    servicos: linha.servicos,
    total: Number(linha.total) > 0 ? brl(linha.total) : null,
    data: diaDoEmail(linha.starts_at),
    hora: horaBR(linha.starts_at),
    link:
      para === "dono"
        ? absoluta(`/painel/agenda?dia=${dia}`)
        : linha.status === "cancelled"
          ? absoluta(`/b/${linha.barbearia_slug}`)
          : linkDoCliente(linha),
  };
}

export async function dadosDosAgendamentosEmail(
  admin: Admin,
  ids: string[],
): Promise<DadosAgendamentoEmail[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.rpc("email_dados_agendamentos", { p_ids: ids });
  if (error) throw new Error(`[email] email_dados_agendamentos: ${error.message}`);
  return data ?? [];
}

/* ==========================================================================
   Despachar
   ========================================================================== */

export type ResumoDespachoEmail = {
  pegos: number;
  enviados: number;
  falhos: number;
  reagendados: number;
};

export async function despacharEmails(limite = 50): Promise<ResumoDespachoEmail> {
  return processar({ p_limite: limite });
}

export async function despacharEmail(id: string): Promise<ResumoDespachoEmail> {
  return processar({ p_limite: 1, p_id: id });
}

async function processar(args: { p_limite: number; p_id?: string }): Promise<ResumoDespachoEmail> {
  const resumo = { pegos: 0, enviados: 0, falhos: 0, reagendados: 0 };
  if (!envEmail()) return resumo;

  const admin = createAdminClient();
  const { data: mensagens, error } = await admin.rpc("email_reivindicar", args);
  if (error) throw new Error(`[email] email_reivindicar: ${error.message}`);

  for (const mensagem of mensagens ?? []) {
    resumo.pegos++;
    resumo[await enviarUma(admin, mensagem)]++;
  }
  return resumo;
}

async function enviarUma(
  admin: Admin,
  mensagem: Mensagem,
): Promise<"enviados" | "falhos" | "reagendados"> {
  if (!ehTipoEmail(mensagem.kind)) {
    return registrarFalha(admin, mensagem, {
      codigo: "TIPO_DESCONHECIDO",
      mensagem: `Tipo de e-mail desconhecido: ${mensagem.kind}`,
      transitorio: false,
    });
  }

  const params = (mensagem.params ?? {}) as ParametrosEmail;
  const marketing = TIPOS_MARKETING.includes(mensagem.kind);
  // O id da linha é o "token" do descadastro: é um uuid aleatório que só o
  // destinatário conhece. Ver /sair/[id].
  const descadastro = marketing ? absoluta(`/sair/${mensagem.id}`) : null;
  const email = montarEmail(mensagem.kind, params, descadastro);

  let externo: string;
  try {
    externo = await enviarEmail({
      para: mensagem.recipient,
      assunto: email.assunto,
      html: email.html,
      texto: email.texto,
      chaveIdempotencia: mensagem.id,
      // Descadastro de um clique (RFC 8058): o Gmail e o Yahoo exigem dos
      // remetentes em volume, e mostram o "Cancelar inscrição" no topo.
      cabecalhos: marketing
        ? {
            "List-Unsubscribe": `<${absoluta(`/api/emails/sair/${mensagem.id}`)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    });
  } catch (e) {
    const erro: ErroEmail =
      e instanceof FalhaResend
        ? e.erro
        : {
            codigo: "INESPERADO",
            mensagem: e instanceof Error ? e.message.slice(0, 300) : "erro inesperado",
            transitorio: true,
          };
    console.error("[email] envio falhou:", {
      id: mensagem.id,
      tipo: mensagem.kind,
      para: mascararEmail(mensagem.recipient),
      erro: erro.codigo,
    });
    return registrarFalha(admin, mensagem, erro);
  }

  const { error } = await admin
    .from("email_messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_id: externo,
      failure_reason: null,
    })
    .eq("id", mensagem.id)
    .eq("status", "pending");

  if (error) {
    // Saiu e não ficou registrado. Se voltar à fila, a Idempotency-Key do
    // Resend (o id da linha) segura a duplicata por 24h.
    console.error("[email] ENVIADO mas não registrado:", { id: mensagem.id, erro: error.message });
  }
  return "enviados";
}

async function registrarFalha(
  admin: Admin,
  mensagem: Mensagem,
  erro: ErroEmail,
): Promise<"falhos" | "reagendados"> {
  if (erro.transitorio && mensagem.attempts < MAX_TENTATIVAS) {
    const minutos = 2 ** Math.max(0, mensagem.attempts - 1);
    const { error } = await admin
      .from("email_messages")
      .update({
        status: "pending",
        scheduled_for: new Date(Date.now() + minutos * 60_000).toISOString(),
        failure_reason: `${erro.codigo}: ${erro.mensagem}`.slice(0, 500),
      })
      .eq("id", mensagem.id);
    if (error)
      console.error("[email] falha ao reagendar:", { id: mensagem.id, erro: error.message });
    return "reagendados";
  }

  const { error } = await admin
    .from("email_messages")
    .update({ status: "failed", failure_reason: `${erro.codigo}: ${erro.mensagem}`.slice(0, 500) })
    .eq("id", mensagem.id);
  if (error)
    console.error("[email] falha ao marcar falha:", { id: mensagem.id, erro: error.message });
  return "falhos";
}

/* ==========================================================================
   Varreduras do cron
   ========================================================================== */

type Resumo = { avaliados: number; enfileirados: number };

/** Conta o resultado e engole o erro de UMA linha: as outras seguem. */
async function cadaUm<T>(
  linhas: T[],
  rotulo: string,
  fazer: (l: T) => Promise<ResultadoEnfileirarEmail>,
) {
  const resumo: Resumo = { avaliados: 0, enfileirados: 0 };
  for (const linha of linhas) {
    resumo.avaliados++;
    try {
      if ((await fazer(linha)).tipo === "enfileirada") resumo.enfileirados++;
    } catch (e) {
      console.error(`[email] ${rotulo}:`, e instanceof Error ? e.message : e);
    }
  }
  return resumo;
}

/** Lembrete às 18h da véspera (ou já, se esse instante passou). */
export async function varrerLembretesEmail(): Promise<Resumo> {
  if (!envEmail()) return { avaliados: 0, enfileirados: 0 };
  const admin = createAdminClient();

  const { data: ids, error } = await admin.rpc("email_lembretes_pendentes", { p_limite: 200 });
  if (error) throw new Error(`[email] email_lembretes_pendentes: ${error.message}`);

  const agora = new Date();
  return cadaUm(await dadosDosAgendamentosEmail(admin, ids ?? []), "lembrete", (linha) => {
    const alvo = new Date(timestampSP(somarDias(paraDataISO(linha.starts_at), -1), "18:00"));
    return enfileirarEmail({
      tipo: "lembrete",
      para: linha.cliente_email,
      chave: `lembrete:${linha.appointment_id}`,
      params: paramsDoAgendamento(linha, "cliente"),
      barbershopId: linha.barbershop_id,
      appointmentId: linha.appointment_id,
      agendarPara: (alvo > agora ? alvo : agora).toISOString(),
    });
  });
}

/** Teste acabando, agenda pausada, fatura vencida, pagamento, renovação. */
export async function varrerCobranca(): Promise<Resumo> {
  if (!envEmail()) return { avaliados: 0, enfileirados: 0 };
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("email_cobranca_pendente");
  if (error) throw new Error(`[email] email_cobranca_pendente: ${error.message}`);

  return cadaUm(data ?? [], "cobrança", (l) => {
    if (!ehTipoEmail(l.tipo)) throw new Error(`tipo de cobrança desconhecido: ${l.tipo}`);
    return enfileirarEmail({
      tipo: l.tipo,
      para: l.dono_email,
      chave: l.chave,
      barbershopId: l.barbershop_id,
      params: {
        nome: l.dono_nome,
        barbearia: l.barbearia,
        // O vencimento é um DIA (date), não um instante: `diaBR`, sem fuso.
        data: l.tipo === "fatura_vencida" ? diaBR(String(l.quando).slice(0, 10)) : dataBR(l.quando),
        valor: l.valor != null ? brl(l.valor) : null,
        // A fatura vencida vai direto ao boleto/Pix do Asaas; o resto, à tela.
        link: l.link ?? absoluta("/assinatura"),
      },
    });
  });
}

/** Vaga na fila de espera e convite para avaliar: o sininho que vira e-mail. */
export async function varrerNotificacoes(): Promise<Resumo> {
  if (!envEmail()) return { avaliados: 0, enfileirados: 0 };
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("email_notificacoes_pendentes", { p_limite: 200 });
  if (error) throw new Error(`[email] email_notificacoes_pendentes: ${error.message}`);

  return cadaUm(data ?? [], "notificação", (n) =>
    enfileirarEmail({
      tipo: "aviso_app",
      para: n.email,
      chave: `notif:${n.notification_id}`,
      params: {
        nome: n.nome,
        titulo: n.titulo,
        corpo: n.corpo,
        botao: n.tipo === "review" ? "Avaliar agora" : "Ver o horário",
        link: n.link ? absoluta(n.link) : absoluta("/app"),
      },
    }),
  );
}

/**
 * O "bora voltar?". Só sai em horário comercial (9h–20h em São Paulo): fora
 * dele, a linha entra na fila para as 10h. O intervalo é da plataforma
 * (`platform_settings.recorrencia_dias`, editado no /admin).
 */
export async function varrerRecorrencia(): Promise<Resumo> {
  if (!envEmail()) return { avaliados: 0, enfileirados: 0 };
  const admin = createAdminClient();

  const { data: dias, error: erroDias } = await admin.rpc("recorrencia_dias");
  if (erroDias) throw new Error(`[email] recorrencia_dias: ${erroDias.message}`);

  const { data, error } = await admin.rpc("email_recorrencia_candidatos", {
    p_dias: dias ?? 21,
    p_limite: 200,
  });
  if (error) throw new Error(`[email] email_recorrencia_candidatos: ${error.message}`);

  const agendarPara = horarioComercial(new Date()).toISOString();
  return cadaUm(data ?? [], "recorrência", (c) =>
    enfileirarEmail({
      tipo: "recorrencia",
      para: c.email,
      chave: c.chave,
      barbershopId: c.barbershop_id,
      agendarPara,
      params: {
        nome: c.nome,
        barbearia: c.barbearia,
        dias: String(Math.floor((Date.now() - new Date(c.ultima_visita).getTime()) / 86_400_000)),
        ultima: dataBR(c.ultima_visita),
        link: absoluta(`/b/${c.slug}/agendar`),
      },
    }),
  );
}

/** Agora, se estiver entre 9h e 20h em São Paulo; senão, as próximas 10h. */
export function horarioComercial(agora: Date): Date {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hourCycle: "h23", timeZone: FUSO }).format(
      agora,
    ),
  );
  if (hora >= 9 && hora < 20) return agora;
  const hoje = paraDataISO(agora);
  return new Date(timestampSP(hora < 9 ? hoje : somarDias(hoje, 1), "10:00"));
}
