"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireOwnerContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { erroDeCoordenada } from "@/lib/geocoding";
import { TAG_SLUGS, tagBarbearia } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";

/**
 * O SETUP GUIADO de /configurar — uma action por etapa.
 *
 * Cada etapa grava na hora em que o dono toca em "Continuar". Se ele fechar o
 * navegador no meio, volta na etapa em que parou: a página deduz onde ele
 * está pelo que já existe no banco, sem coluna de "etapa atual".
 *
 * O horário não tem action aqui: é o `salvarHorarios` de shop.ts, igual ao da
 * tela de configurações.
 *
 * Tudo exige `requireOwnerContext()`. Assistente não configura a loja.
 */

/* ==========================================================================
   Etapa 1 — Sua barbearia
   ========================================================================== */

export type DadosSetupBarbearia = {
  nome: string;
  slug: string;
  descricao?: string;
  telefone?: string;
  whatsapp?: string;
  logoUrl?: string;
};

export async function salvarSetupBarbearia(dados: DadosSetupBarbearia): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    const nome = dados.nome.trim();
    const slug = dados.slug.trim().toLowerCase();

    if (nome.length < 2) return falha("Escreva o nome da barbearia.", "nome");
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) {
      return falha("O link só aceita letras minúsculas, números e hífen — de 3 a 60.", "slug");
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("barbershops")
      .update({
        name: nome,
        slug,
        description: dados.descricao?.trim() || null,
        phone: dados.telefone?.replace(/\D/g, "") || null,
        whatsapp: dados.whatsapp?.replace(/\D/g, "") || null,
        logo_url: dados.logoUrl?.trim() || null,
      })
      .eq("id", shopId);

    if (error) {
      if (error.code === "23505")
        return falha("Esse link já é de outra barbearia. Escolha outro.", "slug");
      return falha(traduzirErroBanco(error, "[setup] salvar barbearia"));
    }

    revalidatePath("/painel", "layout");
    revalidateTag(tagBarbearia(shopId));
    revalidateTag(TAG_SLUGS);
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[setup] salvarSetupBarbearia"));
  }
}

/* ==========================================================================
   Etapa 2 — Onde fica
   ========================================================================== */

export type DadosSetupEndereco = {
  cep?: string;
  rua: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  estado: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Aqui o endereço é OBRIGATÓRIO, ao contrário da tela de configurações: a
 * coordenada é o que põe a loja no filtro "Próximas" do app, e o setup é o
 * único momento em que dá para garantir que ela exista.
 */
export async function salvarSetupEndereco(dados: DadosSetupEndereco): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    if (!dados.rua.trim()) return falha("Informe a rua.", "rua");
    if (!dados.cidade.trim()) return falha("Informe a cidade.", "cidade");
    if (!dados.estado.trim()) return falha("Escolha o estado.", "estado");
    if (dados.latitude == null || dados.longitude == null) {
      return falha(
        "Localize a barbearia no mapa — é assim que os clientes por perto te encontram.",
        "mapa",
      );
    }

    const erroCoordenada = erroDeCoordenada(dados.latitude, dados.longitude);
    if (erroCoordenada) return falha(erroCoordenada, "mapa");

    const supabase = await createClient();

    const { error } = await supabase
      .from("barbershops")
      .update({
        zip_code: dados.cep?.replace(/\D/g, "") || null,
        street: dados.rua.trim(),
        number: dados.numero?.trim() || null,
        complement: dados.complemento?.trim() || null,
        neighborhood: dados.bairro?.trim() || null,
        city: dados.cidade.trim(),
        state: dados.estado.trim().toUpperCase().slice(0, 2),
        latitude: dados.latitude,
        longitude: dados.longitude,
      })
      .eq("id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[setup] salvar endereço"));

    revalidateTag(tagBarbearia(shopId));
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[setup] salvarSetupEndereco"));
  }
}

/* ==========================================================================
   Etapa 4 — Serviços
   ========================================================================== */

export type ServicoDoSetup = {
  /** Presente quando o serviço já existe (o dono voltou a esta etapa). */
  id?: string;
  nome: string;
  /** Em reais. */
  preco: number;
  duracaoMinutos: number;
  /** Desmarcado no setup. Um serviço que já existia é desativado, não apagado. */
  ativo: boolean;
};

/**
 * Grava a lista INTEIRA da etapa de uma vez: atualiza os que já existem e
 * insere os novos. É a etapa em que o dono marca e desmarca sugestões — mandar
 * o estado final evita um serviço criado por um clique e esquecido por outro.
 */
export async function salvarSetupServicos(itens: ServicoDoSetup[]): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    const validos = itens.map((i) => ({ ...i, nome: i.nome.trim() }));
    for (const i of validos) {
      if (!i.ativo && !i.id) continue; // sugestão desmarcada: nem entra
      if (i.nome.length < 2) return falha("Todo serviço precisa de um nome.");
      if (!(i.preco >= 0)) return falha(`Informe um preço válido para "${i.nome}".`);
      if (!(i.duracaoMinutos >= 5)) {
        return falha(`A duração de "${i.nome}" precisa ter pelo menos 5 minutos.`);
      }
    }
    if (!validos.some((i) => i.ativo)) {
      return falha("Marque pelo menos um serviço. Sem serviço, não há o que agendar.");
    }

    const supabase = await createClient();

    for (const i of validos.filter((x) => x.id)) {
      const { error } = await supabase
        .from("services")
        .update({
          name: i.nome,
          price: Math.round(i.preco * 100) / 100,
          duration_minutes: Math.round(i.duracaoMinutos),
          is_active: i.ativo,
        })
        .eq("id", i.id!)
        .eq("barbershop_id", shopId);

      if (error) return falha(traduzirErroBanco(error, "[setup] atualizar serviço"));
    }

    const novos = validos.filter((x) => !x.id && x.ativo);
    if (novos.length > 0) {
      const { data: ultimo } = await supabase
        .from("services")
        .select("sort_order")
        .eq("barbershop_id", shopId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const base = ultimo?.sort_order ?? 0;

      const { error } = await supabase.from("services").insert(
        novos.map((i, n) => ({
          barbershop_id: shopId,
          name: i.nome,
          price: Math.round(i.preco * 100) / 100,
          duration_minutes: Math.round(i.duracaoMinutos),
          is_active: true,
          sort_order: base + n + 1,
        })),
      );

      if (error) return falha(traduzirErroBanco(error, "[setup] criar serviços"));
    }

    revalidatePath("/painel/servicos");
    revalidateTag(tagBarbearia(shopId));
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[setup] salvarSetupServicos"));
  }
}

/* ==========================================================================
   Etapa 5 — Quem atende
   ========================================================================== */

export type ProfissionalDoSetup = {
  id?: string;
  nome: string;
  comissaoPercent: number;
  /**
   * O próprio dono, que também corta. Liga o profissional ao login dele
   * (`profile_id`), para a aba Hoje mostrar a comissão certa — o trigger
   * `professionals_guard_profile` aceita o dono da loja.
   */
  souEu: boolean;
  ativo: boolean;
};

export async function salvarSetupEquipe(itens: ProfissionalDoSetup[]): Promise<ActionResult> {
  try {
    const { shopId, profile } = await requireOwnerContext();

    const validos = itens.map((i) => ({ ...i, nome: i.nome.trim() }));
    for (const i of validos) {
      if (!i.ativo && !i.id) continue;
      if (i.nome.length < 2) return falha("Todo profissional precisa de um nome.");
      if (i.comissaoPercent < 0 || i.comissaoPercent > 100) {
        return falha(`A comissão de ${i.nome} precisa ficar entre 0 e 100%.`);
      }
    }
    if (!validos.some((i) => i.ativo)) {
      return falha("Cadastre pelo menos uma pessoa que atende. Sem ela, não há agenda.");
    }
    if (validos.filter((i) => i.souEu && i.ativo).length > 1) {
      return falha("Só um profissional pode ser você.");
    }

    const supabase = await createClient();

    const campos = (i: (typeof validos)[number]) => ({
      name: i.nome,
      commission_percent: Math.round(i.comissaoPercent * 100) / 100,
      is_active: i.ativo,
      profile_id: i.souEu && i.ativo ? profile.id : null,
    });

    // Primeiro os que DESLIGAM o vínculo com o dono, depois os que ligam: o
    // índice `professionals_profile_unico` recusaria dois apontando para ele,
    // mesmo que por um instante.
    const existentes = validos
      .filter((x) => x.id)
      .sort((a, b) => Number(a.souEu && a.ativo) - Number(b.souEu && b.ativo));

    for (const i of existentes) {
      const { error } = await supabase
        .from("professionals")
        .update(campos(i))
        .eq("id", i.id!)
        .eq("barbershop_id", shopId);

      if (error) return falha(traduzirErroBanco(error, "[setup] atualizar profissional"));
    }

    const novos = validos.filter((x) => !x.id && x.ativo);
    if (novos.length > 0) {
      const { data: ultimo } = await supabase
        .from("professionals")
        .select("sort_order")
        .eq("barbershop_id", shopId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const base = ultimo?.sort_order ?? 0;

      const { error } = await supabase.from("professionals").insert(
        novos.map((i, n) => ({
          barbershop_id: shopId,
          ...campos(i),
          sort_order: base + n + 1,
        })),
      );

      if (error) return falha(traduzirErroBanco(error, "[setup] criar profissionais"));
    }

    revalidatePath("/painel/equipe");
    revalidateTag(tagBarbearia(shopId));
    return sucesso();
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[setup] salvarSetupEquipe"));
  }
}

/* ==========================================================================
   Etapa 6 — Regras de agendamento, e o fim do setup
   ========================================================================== */

export type RegrasDoSetup = {
  antecedenciaMinima: number;
  antecedenciaMaximaDias: number;
  prazoCancelamentoHoras: number;
};

/**
 * Grava as regras (ou mantém os padrões, se o dono pulou) e CONCLUI o setup.
 *
 * Antes de concluir, confere no banco o mínimo para a loja agendar: endereço
 * no mapa, um dia aberto, um serviço e um profissional. O cliente do setup já
 * não deixa avançar sem isso, mas a action não confia na tela.
 *
 * Concluir abre a loja ao público (`is_active = true`) — MENOS quando a
 * plataforma a bloqueou (`blocked_at`). Aí o setup termina do mesmo jeito (o
 * dono entra no painel), mas a loja fica fora do ar e a tela diz por quê.
 * Quem decide é `concluir_setup_barbearia()` no banco: o dono não tem grant
 * para escrever `is_active` nem `setup_completed_at` diretamente.
 */
export async function concluirSetup(
  regras: RegrasDoSetup | null,
): Promise<ActionResult<{ noAr: boolean }>> {
  try {
    const { shopId } = await requireOwnerContext();

    if (regras) {
      if (regras.antecedenciaMinima < 0)
        return falha("A antecedência mínima não pode ser negativa.");
      if (regras.antecedenciaMaximaDias < 1) {
        return falha("A antecedência máxima precisa ser de pelo menos 1 dia.");
      }
      if (regras.prazoCancelamentoHoras < 0) {
        return falha("O prazo de cancelamento não pode ser negativo.");
      }
    }

    const supabase = await createClient();

    const [loja, horarios, servicos, profissionais] = await Promise.all([
      supabase
        .from("barbershops")
        .select("latitude, longitude")
        .eq("id", shopId)
        .maybeSingle(),
      supabase
        .from("business_hours")
        .select("id", { count: "exact", head: true })
        .eq("barbershop_id", shopId)
        .eq("is_closed", false),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("barbershop_id", shopId)
        .eq("is_active", true),
      supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("barbershop_id", shopId)
        .eq("is_active", true),
    ]);

    const erroLeitura = loja.error ?? horarios.error ?? servicos.error ?? profissionais.error;
    if (erroLeitura) return falha(traduzirErroBanco(erroLeitura, "[setup] conferir etapas"));

    if (loja.data?.latitude == null) return falha("Falta localizar a barbearia no mapa.");
    if (!horarios.count) return falha("Falta abrir pelo menos um dia no horário de funcionamento.");
    if (!servicos.count) return falha("Falta cadastrar pelo menos um serviço.");
    if (!profissionais.count) return falha("Falta cadastrar quem atende.");

    // As regras vão pelo cliente do usuário: são colunas que o dono pode
    // atualizar. Abrir a loja NÃO é — vai pela função, que confere tudo de
    // novo no banco (25_setup_barbearia.sql).
    if (regras) {
      const { error } = await supabase
        .from("barbershops")
        .update({
          min_advance_minutes: Math.round(regras.antecedenciaMinima),
          max_advance_days: Math.round(regras.antecedenciaMaximaDias),
          cancel_deadline_hours: Math.round(regras.prazoCancelamentoHoras),
        })
        .eq("id", shopId);

      if (error) return falha(traduzirErroBanco(error, "[setup] salvar regras"));
    }

    const { data: noAr, error } = await supabase.rpc("concluir_setup_barbearia", {
      shop: shopId,
    });

    if (error) return falha(traduzirErroBanco(error, "[setup] concluir"));

    revalidatePath("/painel", "layout");
    revalidateTag(tagBarbearia(shopId));
    revalidateTag(TAG_SLUGS);
    return sucesso({ noAr: Boolean(noAr) });
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[setup] concluirSetup"));
  }
}
