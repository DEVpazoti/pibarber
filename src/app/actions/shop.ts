"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireOwnerContext, requireShopContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { erroDeCoordenada, geocodificar, linhaDeEndereco } from "@/lib/geocoding";
import { TAG_SLUGS, tagBarbearia } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult, type EnderecoLocalizado } from "@/lib/types";

/**
 * A barbearia vista de dentro: lista de espera e avaliações.
 *
 * Espera é operacional — o assistente encaixa e remove. Responder avaliação é
 * do dono: a resposta aparece publicamente em `/b/[slug]` com o nome da loja.
 */

/* ==========================================================================
   Configurações da barbearia
   ========================================================================== */

export type DadosBarbearia = {
  nome: string;
  descricao?: string;
  telefone?: string;
  whatsapp?: string;
  slug: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  /** A busca "Próximas" depende deles. Sem coordenada, a loja some do filtro. */
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string;
  capaUrl?: string;
  aceitaOnline: boolean;
  /**
   * Deixa agendar sem criar conta, só com nome e telefone.
   *
   * Nasce DESLIGADO em toda barbearia: ligar isto abre um endereço público que
   * escreve no banco, e quem liga precisa estar ligando de propósito. Os
   * limites contra abuso ficam todos no servidor
   * (`book_appointment_publico`, em 17_agendamento_publico.sql).
   */
  permiteSemCadastro: boolean;
  antecedenciaMinima: number;
  antecedenciaMaximaDias: number;
  prazoCancelamentoHoras: number;
};

export async function salvarBarbearia(dados: DadosBarbearia): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    const nome = dados.nome.trim();
    const slug = dados.slug.trim().toLowerCase();

    if (nome.length < 2) return falha("Escreva o nome da barbearia.");
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) {
      return falha("O link só aceita letras minúsculas, números e hífen — de 3 a 60.");
    }
    if (dados.antecedenciaMinima < 0) return falha("A antecedência mínima não pode ser negativa.");
    if (dados.antecedenciaMaximaDias < 1) return falha("A antecedência máxima precisa ser de pelo menos 1 dia.");
    if (dados.prazoCancelamentoHoras < 0) return falha("O prazo de cancelamento não pode ser negativo.");

    // A coordenada não é mais digitada (T-4): ela vem do geocoding, do GPS ou do
    // pin do mapa. Mesmo assim é validada aqui, porque a RLS deixa o dono dar
    // PATCH direto em `barbershops` pela REST API — e uma coordenada fora de
    // faixa põe a loja no meio do oceano no filtro "Próximas", em silêncio.
    const erroCoordenada = erroDeCoordenada(dados.latitude, dados.longitude);
    if (erroCoordenada) return falha(erroCoordenada);

    const supabase = await createClient();

    const { error } = await supabase
      .from("barbershops")
      .update({
        name: nome,
        slug,
        description: dados.descricao?.trim() || null,
        phone: dados.telefone?.replace(/\D/g, "") || null,
        whatsapp: dados.whatsapp?.replace(/\D/g, "") || null,
        zip_code: dados.cep?.replace(/\D/g, "") || null,
        street: dados.rua?.trim() || null,
        number: dados.numero?.trim() || null,
        complement: dados.complemento?.trim() || null,
        neighborhood: dados.bairro?.trim() || null,
        city: dados.cidade?.trim() || null,
        state: dados.estado?.trim().toUpperCase().slice(0, 2) || null,
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        logo_url: dados.logoUrl?.trim() || null,
        cover_url: dados.capaUrl?.trim() || null,
        accepts_online_booking: dados.aceitaOnline,
        // Sem agendamento online não existe "sem cadastro": a página nem
        // carrega. Desligar o primeiro desliga o segundo junto, senão a opção
        // ficaria marcada sem efeito e voltaria a valer sozinha depois.
        allow_public_booking: dados.aceitaOnline && dados.permiteSemCadastro,
        min_advance_minutes: Math.round(dados.antecedenciaMinima),
        max_advance_days: Math.round(dados.antecedenciaMaximaDias),
        cancel_deadline_hours: Math.round(dados.prazoCancelamentoHoras),
      })
      .eq("id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[configurações] salvar barbearia"));

    revalidatePath("/painel/configuracoes");
    revalidatePath("/painel", "layout");
    revalidatePath(`/b/${slug}`);

    // O perfil público passou a ser cacheado no T-7 (G3). Sem estas duas linhas
    // o dono salvaria o nome novo e continuaria vendo o antigo em /b/[slug] por
    // até 5 minutos — e é justamente aqui que o slug pode ter MUDADO, daí a
    // TAG_SLUGS junto.
    revalidateTag(tagBarbearia(shopId));
    revalidateTag(TAG_SLUGS);
    return sucesso(undefined, "Configurações salvas.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[configurações] salvarBarbearia"));
  }
}

/* ==========================================================================
   Localização — endereço escrito vira coordenada
   ========================================================================== */

export type EnderecoParaLocalizar = {
  cep?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

/**
 * Resolve a coordenada do endereço que está na tela.
 *
 * Não grava nada: devolve o ponto para o dono conferir e, se quiser, arrastar
 * no mapa antes de salvar. Quem grava é `salvarBarbearia`.
 *
 * `requireOwnerContext()` no topo não é formalidade — é o que impede a action
 * de virar um proxy aberto para a API paga do Google. Sem isso, qualquer um com
 * a URL do site gasta a cota da chave.
 */
export async function geocodificarEndereco(
  partes: EnderecoParaLocalizar,
): Promise<ActionResult<EnderecoLocalizado>> {
  try {
    await requireOwnerContext();

    const linha = linhaDeEndereco(partes);

    // Sem cidade não adianta consultar: "Rua das Flores, 100" existe em mil
    // lugares e o Google devolveria a primeira delas com toda a confiança.
    if (!partes.cidade?.trim() || !linha) {
      return falha("Preencha ao menos a rua e a cidade — ou o CEP, que preenche os dois.");
    }

    const resultado = await geocodificar(linha);

    if (!resultado.ok) {
      if (resultado.motivo === "sem_chave") {
        return falha(
          "A busca por endereço não está configurada neste ambiente. " +
            "Use “Usar minha localização atual” ou marque o ponto no mapa.",
        );
      }
      if (resultado.motivo === "nao_encontrado") {
        return falha(
          "Não achei esse endereço. Confira a rua e o número, ou marque o ponto no mapa.",
        );
      }
      return falha("Não consegui consultar o endereço agora. Tente de novo em instantes.");
    }

    return sucesso(
      resultado.endereco,
      resultado.endereco.precisao === "exata"
        ? "Encontrei o endereço."
        : "Achei por aproximação. Confira no mapa antes de salvar.",
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[configurações] geocodificarEndereco"));
  }
}

/* ==========================================================================
   Benefícios — as comodidades que a barbearia anuncia (T-5)
   ========================================================================== */

/**
 * Grava a seleção de benefícios da loja.
 *
 * Recebe a lista INTEIRA do que ficou marcado, não "adicione X" / "remova Y":
 * é uma tela de caixinhas onde o dono mexe em várias antes de salvar, e mandar
 * o estado final evita que dois cliques rápidos deixem o banco num meio-termo
 * que a tela nunca mostrou.
 *
 * Grava por diferença em vez de apagar-tudo-e-reinserir. Não é preciosismo:
 * são duas chamadas sem transação entre elas, e um `delete` que roda seguido de
 * um `insert` que falha deixaria a loja sem nenhum benefício — pior que o
 * estado anterior. A diferença só toca o que mudou; no caso comum (nada mudou)
 * não escreve nada.
 */
export async function salvarBeneficios(ids: string[]): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    const supabase = await createClient();

    // O catálogo é a autoridade sobre o que pode ser marcado. Sem esta
    // conferência, a FK ainda barraria um id inventado, mas um benefício
    // APOSENTADO (is_active = false) passaria — ele existe na tabela.
    const { data: catalogo, error: erroCatalogo } = await supabase
      .from("amenities")
      .select("id")
      .eq("is_active", true);

    if (erroCatalogo) return falha(traduzirErroBanco(erroCatalogo, "[benefícios] catálogo"));

    const validos = new Set((catalogo ?? []).map((a) => a.id));
    const desejados = new Set(ids.filter((id) => validos.has(id)));

    const { data: atuais, error: erroAtuais } = await supabase
      .from("barbershop_amenities")
      .select("amenity_id")
      .eq("barbershop_id", shopId);

    if (erroAtuais) return falha(traduzirErroBanco(erroAtuais, "[benefícios] ler seleção"));

    const marcados = new Set((atuais ?? []).map((l) => l.amenity_id));
    const remover = [...marcados].filter((id) => !desejados.has(id));
    const inserir = [...desejados].filter((id) => !marcados.has(id));

    if (remover.length > 0) {
      const { error } = await supabase
        .from("barbershop_amenities")
        .delete()
        .eq("barbershop_id", shopId)
        .in("amenity_id", remover);

      if (error) return falha(traduzirErroBanco(error, "[benefícios] remover"));
    }

    if (inserir.length > 0) {
      const { error } = await supabase
        .from("barbershop_amenities")
        .insert(inserir.map((amenity_id) => ({ barbershop_id: shopId, amenity_id })));

      if (error) return falha(traduzirErroBanco(error, "[benefícios] adicionar"));
    }

    revalidatePath("/painel/configuracoes");

    // Antes do T-7 esta action consultava `barbershops` só para descobrir o
    // slug e poder chamar revalidatePath(`/b/${slug}`) — uma ida e volta ao
    // us-east-2 a cada salvamento, para invalidar uma rota que é dinâmica e
    // portanto não guardava nada. O que precisa cair é o cache de DADOS do
    // G3, e ele é marcado por id, que esta action já tem na mão.
    revalidateTag(tagBarbearia(shopId));

    return sucesso(
      undefined,
      desejados.size === 0
        ? "Benefícios salvos. Sem nenhum marcado, a aba não aparece no seu perfil."
        : "Benefícios salvos.",
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[configurações] salvarBeneficios"));
  }
}

export type LinhaHorario = {
  weekday: number;
  fechado: boolean;
  abre: string;
  fecha: string;
  almocoInicio: string;
  almocoFim: string;
};

/**
 * O horário de funcionamento, os 7 dias de uma vez.
 *
 * `upsert` com `onConflict` na chave (barbershop_id, weekday): editar o
 * horário não pode criar linha duplicada, e apagar tudo para reinserir deixaria
 * a loja "sem horário" por um instante — o suficiente para um agendamento
 * simultâneo cair no vazio.
 */
export async function salvarHorarios(linhas: LinhaHorario[]): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    for (const l of linhas) {
      if (l.fechado) continue;
      if (!l.abre || !l.fecha) return falha("Preencha abertura e fechamento dos dias abertos.");
      if (l.fecha <= l.abre) return falha("O fechamento precisa ser depois da abertura.");
      if (l.almocoInicio && l.almocoFim && l.almocoFim <= l.almocoInicio) {
        return falha("O fim do almoço precisa ser depois do início.");
      }
    }

    const supabase = await createClient();

    const { error } = await supabase.from("business_hours").upsert(
      linhas.map((l) => ({
        barbershop_id: shopId,
        weekday: l.weekday,
        is_closed: l.fechado,
        opens_at: l.fechado ? null : l.abre,
        closes_at: l.fechado ? null : l.fecha,
        break_start: l.fechado || !l.almocoInicio ? null : l.almocoInicio,
        break_end: l.fechado || !l.almocoFim ? null : l.almocoFim,
      })),
      { onConflict: "barbershop_id,weekday" },
    );

    if (error) return falha(traduzirErroBanco(error, "[configurações] salvar horários"));

    revalidatePath("/painel/configuracoes");
    revalidatePath("/painel/agenda");
    // O horário é a aba que sempre existe no perfil público, e alimenta o chip
    // "Aberto agora". Sem isto o cliente veria o horário velho (G3).
    revalidateTag(tagBarbearia(shopId));
    return sucesso(undefined, "Horário salvo.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[configurações] salvarHorarios"));
  }
}

/* ==========================================================================
   Lista de espera
   ========================================================================== */

/** Tira alguém da fila — encaixado por telefone, desistiu, ou o dia passou. */
export async function removerDaEspera(id: string): Promise<ActionResult> {
  try {
    const { shopId } = await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", id)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[espera] remover"));

    revalidatePath("/painel/espera");
    return sucesso(undefined, "Removido da fila.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[espera] removerDaEspera"));
  }
}

/**
 * Marca a entrada como convertida — a pessoa foi encaixada na agenda.
 *
 * Separado de `removerDaEspera` de propósito: o histórico de quem entrou na
 * fila e virou atendimento é o que diz se a lista de espera vale a pena.
 */
export async function marcarEsperaConvertida(id: string): Promise<ActionResult> {
  try {
    const { shopId } = await requireShopContext();
    const supabase = await createClient();

    const { error } = await supabase
      .from("waitlist_entries")
      .update({ status: "converted" })
      .eq("id", id)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[espera] converter"));

    revalidatePath("/painel/espera");
    return sucesso(undefined, "Encaixado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[espera] marcarEsperaConvertida"));
  }
}

/* ==========================================================================
   Avaliações
   ========================================================================== */

/**
 * A resposta do dono a uma avaliação.
 *
 * Ela é PÚBLICA: aparece em `/b/[slug]` embaixo do comentário. Uma resposta
 * bem escrita a uma crítica costuma valer mais que a crítica custou.
 */
export async function responderAvaliacao(
  reviewId: string,
  resposta: string,
): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    const texto = resposta.trim();
    if (texto.length < 2) return falha("Escreva a resposta.");
    if (texto.length > 1000) return falha("A resposta ficou longa demais.");

    const supabase = await createClient();

    const { error } = await supabase
      .from("reviews")
      .update({ reply: texto, replied_at: new Date().toISOString() })
      .eq("id", reviewId)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[avaliações] responder"));

    revalidatePath("/painel/avaliacoes");
    // A resposta da barbearia aparece embaixo da avaliação no perfil público.
    revalidateTag(tagBarbearia(shopId));
    return sucesso(undefined, "Resposta publicada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[avaliações] responderAvaliacao"));
  }
}
