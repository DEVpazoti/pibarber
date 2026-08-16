"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { getProfile, requireProfile } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { tagBarbearia } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type BarbeariaEncontrada } from "@/lib/types";
import { timestampSP } from "@/lib/utils";

/**
 * Busca, agendamento, lista de espera e avaliação — o lado do CLIENTE.
 *
 * A busca é pública: funciona sem login, porque `search_barbershops` é
 * SECURITY DEFINER e só devolve loja ativa. É o que permite compartilhar o
 * link de uma barbearia no Instagram e a pessoa ver antes de criar conta.
 */

/* ==========================================================================
   Busca
   ========================================================================== */

export type FiltroBusca = {
  /** "nome" | "cidade" | "proximas" — o chip ativo da tela. */
  modo: "nome" | "cidade" | "proximas";
  termo?: string;
  lat?: number;
  lng?: number;
};

export async function buscarBarbearias(
  filtro: FiltroBusca,
): Promise<ActionResult<BarbeariaEncontrada[]>> {
  try {
    const supabase = await createClient();

    const termo = filtro.termo?.trim() || undefined;

    const { data, error } = await supabase.rpc("search_barbershops", {
      termo: filtro.modo === "nome" ? termo : undefined,
      cidade: filtro.modo === "cidade" ? termo : undefined,
      lat: filtro.modo === "proximas" ? filtro.lat : undefined,
      lng: filtro.modo === "proximas" ? filtro.lng : undefined,
      raio_km: filtro.modo === "proximas" ? 25 : undefined,
      limite: 50,
    });

    if (error) return falha(traduzirErroBanco(error, "[busca] search_barbershops"));

    const lista = (data ?? []).map((b) => ({
      ...b,
      rating_avg: Number(b.rating_avg),
      dist_km: b.dist_km == null ? null : Number(b.dist_km),
    }));

    // Marca as favoritas para o coração já nascer preenchido. Só faz sentido
    // com sessão — visitante nenhum tem favorito.
    const perfil = await getProfile();
    if (!perfil || lista.length === 0) {
      return sucesso(lista.map((b) => ({ ...b, favorita: false })));
    }

    const { data: favoritas, error: erroFav } = await supabase
      .from("favorites")
      .select("barbershop_id")
      .eq("profile_id", perfil.id)
      .in(
        "barbershop_id",
        lista.map((b) => b.id),
      );

    if (erroFav) console.error("[busca] falha ao ler favoritos:", erroFav);

    const marcadas = new Set((favoritas ?? []).map((f) => f.barbershop_id));

    return sucesso(lista.map((b) => ({ ...b, favorita: marcadas.has(b.id) })));
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[busca] buscarBarbearias"));
  }
}

/* ==========================================================================
   Horários livres
   ========================================================================== */

/**
 * Os horários livres de um profissional num dia.
 *
 * Quem sabe as regras é `get_available_slots`, no banco: horário da loja,
 * jornada individual (opcional), almoço, folga, antecedência mínima e máxima,
 * e os agendamentos que já existem. A tela só desenha o que voltar.
 *
 * Com "Tanto faz", consulta cada profissional e junta os horários — assim o
 * cliente vê a união das agendas, que é o que aumenta a conversão.
 */
export async function horariosDisponiveis(entrada: {
  professionalIds: string[];
  /** "2026-08-14" */
  dia: string;
  duracaoMinutos: number;
}): Promise<ActionResult<{ hora: string; professionalId: string }[]>> {
  try {
    const supabase = await createClient();

    const respostas = await Promise.all(
      entrada.professionalIds.map(async (id) => {
        const { data, error } = await supabase.rpc("get_available_slots", {
          p_professional: id,
          p_dia: entrada.dia,
          p_duracao: Math.max(5, Math.round(entrada.duracaoMinutos)),
        });

        if (error) {
          console.error("[agendar] falha ao ler horários livres:", error);
          return [];
        }

        return (data ?? []).map((linha) => ({
          professionalId: id,
          // O slot vem como timestamptz; a hora é lida no fuso de São Paulo,
          // nunca no do celular de quem está olhando.
          hora: new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "America/Sao_Paulo",
          }).format(new Date(linha.slot)),
        }));
      }),
    );

    // Junta e tira duplicado: com "Tanto faz", dois profissionais livres às
    // 10:00 são UM horário de 10:00 na tela. Fica o primeiro da lista.
    const porHora = new Map<string, string>();
    for (const lista of respostas) {
      for (const item of lista) {
        if (!porHora.has(item.hora)) porHora.set(item.hora, item.professionalId);
      }
    }

    const horarios = [...porHora.entries()]
      .map(([hora, professionalId]) => ({ hora, professionalId }))
      .sort((a, b) => a.hora.localeCompare(b.hora));

    return sucesso(horarios);
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agendar] horariosDisponiveis"));
  }
}

/* ==========================================================================
   Agendar
   ========================================================================== */

/**
 * O agendamento feito pelo cliente (`source = 'online'`).
 *
 * Dá para agendar SEM CONTA: basta nome e telefone. A função do banco casa a
 * ficha pelo telefone dentro daquela barbearia, reaproveita se achar e cria se
 * não achar.
 *
 * NÃO tentamos checar colisão antes: dois clientes podem tocar no mesmo
 * horário no mesmo segundo, e quem resolve isso é a constraint
 * `appointments_no_overlap`. O nosso trabalho é traduzir o erro dela para
 * "Esse horário acabou de ser preenchido".
 */
export async function agendar(entrada: {
  shopId: string;
  professionalId: string;
  dia: string;
  hora: string;
  serviceIds: string[];
  dependentId?: string | null;
  nome?: string;
  telefone?: string;
  observacao?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const perfil = await getProfile();

    if (entrada.serviceIds.length === 0) return falha("Escolha pelo menos um serviço.");
    if (!entrada.professionalId) return falha("Escolha o profissional.");
    if (!entrada.dia || !entrada.hora) return falha("Escolha o dia e o horário.");

    const nome = entrada.nome?.trim() || perfil?.full_name || "";
    const telefone = (entrada.telefone || perfil?.phone || "").replace(/\D/g, "");

    if (!perfil) {
      if (nome.length < 2) return falha("Informe seu nome.");
      if (telefone.length < 10) return falha("Informe seu celular com DDD.");
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("book_appointment", {
      p_shop: entrada.shopId,
      p_professional: entrada.professionalId,
      p_quando: timestampSP(entrada.dia, entrada.hora),
      p_service_ids: entrada.serviceIds,
      p_profile: perfil?.id,
      p_dependent: entrada.dependentId || undefined,
      p_nome: nome || undefined,
      p_telefone: telefone || undefined,
      p_obs: entrada.observacao?.trim() || undefined,
      p_source: "online",
    });

    if (error) return falha(traduzirErroBanco(error, "[agendar] book_appointment"));
    if (!data) return falha("Não consegui concluir o agendamento.");

    revalidatePath("/app");
    revalidatePath("/app/agendamentos");
    return sucesso({ id: data }, "Agendamento confirmado!");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[agendar] agendar"));
  }
}

/* ==========================================================================
   Lista de espera
   ========================================================================== */

/**
 * Entra na fila daquele dia e período.
 *
 * É a saída para o dia lotado: em vez de um vazio inútil, o cliente deixa o
 * nome. Quando alguém cancela, `cancel_appointment` cria a notificação para
 * quem estava esperando naquele dia e período.
 */
export async function entrarNaEspera(entrada: {
  shopId: string;
  professionalId?: string | null;
  serviceId?: string | null;
  dia: string;
  periodo: string;
}): Promise<ActionResult> {
  try {
    await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase.rpc("join_waitlist", {
      p_shop: entrada.shopId,
      p_professional: entrada.professionalId || undefined,
      p_service: entrada.serviceId || undefined,
      p_dia: entrada.dia,
      p_periodo: entrada.periodo,
    });

    if (error) return falha(traduzirErroBanco(error, "[espera] join_waitlist"));

    revalidatePath("/app/perfil/espera");
    return sucesso(undefined, "Você entrou na lista de espera. A gente avisa se vagar.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[espera] entrarNaEspera"));
  }
}

/* ==========================================================================
   Registro de visita
   ========================================================================== */

/**
 * Marca que o cliente abriu o perfil desta barbearia.
 *
 * É o que alimenta "Últimos acessos" na home. Falha em silêncio de propósito:
 * é telemetria de conveniência, e não pode derrubar a página pública.
 */
export async function registrarVisita(barbershopId: string): Promise<void> {
  try {
    const perfil = await getProfile();
    if (!perfil || perfil.role !== "client") return;

    const supabase = await createClient();

    const { error } = await supabase
      .from("shop_visits")
      .upsert(
        {
          profile_id: perfil.id,
          barbershop_id: barbershopId,
          last_viewed_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,barbershop_id" },
      );

    if (error) console.error("[barbearia] falha ao registrar a visita:", error);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[barbearia] erro inesperado ao registrar a visita:", error);
  }
}

/* ==========================================================================
   Avaliar
   ========================================================================== */

/**
 * A avaliação do cliente depois do atendimento.
 *
 * `reviews.appointment_id` é único: um atendimento, uma avaliação. Um trigger
 * recalcula `rating_avg` e `rating_count` da barbearia a cada inserção — é
 * esse número que vira o ★ 4.9 do cartão da busca.
 */
export async function avaliarAtendimento(entrada: {
  appointmentId: string;
  nota: number;
  comentario?: string;
}): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();

    if (!Number.isInteger(entrada.nota) || entrada.nota < 1 || entrada.nota > 5) {
      return falha("Escolha de 1 a 5 estrelas.");
    }

    const supabase = await createClient();

    // Precisamos da loja e do profissional do atendimento. A RLS já garante
    // que este agendamento é do cliente logado — `owns_customer`.
    const { data: agendamento, error: erroLer } = await supabase
      .from("appointments")
      .select("id, barbershop_id, professional_id, status")
      .eq("id", entrada.appointmentId)
      .maybeSingle();

    if (erroLer) return falha(traduzirErroBanco(erroLer, "[avaliação] ler agendamento"));
    if (!agendamento) return falha("Não encontrei esse atendimento.");
    if (agendamento.status !== "completed") {
      return falha("Só dá para avaliar um atendimento concluído.");
    }

    const { error } = await supabase.from("reviews").insert({
      barbershop_id: agendamento.barbershop_id,
      appointment_id: agendamento.id,
      profile_id: perfil.id,
      professional_id: agendamento.professional_id,
      rating: entrada.nota,
      comment: entrada.comentario?.trim() || null,
    });

    if (error) return falha(traduzirErroBanco(error, "[avaliação] gravar"));

    revalidatePath("/app/agendamentos");
    // A avaliação nova entra na aba Avaliações do perfil público e mexe na
    // média do cabeçalho — as duas coisas estão no cache do G3.
    revalidateTag(tagBarbearia(agendamento.barbershop_id));
    return sucesso(undefined, "Obrigado pela avaliação!");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[avaliação] avaliarAtendimento"));
  }
}

/* ==========================================================================
   Cancelar o próprio agendamento
   ========================================================================== */

/**
 * O cliente cancelando o horário dele.
 *
 * Quem valida o prazo é `cancel_appointment`, no banco: ele compara com
 * `cancel_deadline_hours` da barbearia e recusa com uma mensagem em português
 * quando já passou. A mesma função avisa quem está na lista de espera do dia.
 */
export async function cancelarMeuAgendamento(
  appointmentId: string,
  motivo?: string,
): Promise<ActionResult> {
  try {
    const perfil = await requireProfile();
    const supabase = await createClient();

    const { error } = await supabase.rpc("cancel_appointment", {
      p_appointment: appointmentId,
      p_motivo: motivo?.trim() || undefined,
      p_por_quem: perfil.id,
    });

    if (error) return falha(traduzirErroBanco(error, "[cliente] cancelar agendamento"));

    revalidatePath("/app/agendamentos");
    revalidatePath("/app");
    return sucesso(undefined, "Agendamento cancelado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[cliente] cancelarMeuAgendamento"));
  }
}
