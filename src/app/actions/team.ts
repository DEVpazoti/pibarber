"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireOwnerContext } from "@/lib/auth";
import { traduzirErroBanco, traduzirErroDesconhecido } from "@/lib/erros";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagBarbearia } from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import { falha, sucesso, type ActionResult } from "@/lib/types";
import { timestampSP } from "@/lib/utils";

/**
 * A equipe: os PROFISSIONAIS (quem corta) e os ACESSOS (quem faz login).
 *
 * São coisas diferentes, de propósito. O profissional é um registro — nome,
 * foto, comissão, jornada — e NÃO faz login. Isso elimina convite, código de
 * resgate e um bloco inteiro de RLS. Quem precisa de acesso vira assistente.
 *
 * Tudo aqui é só do dono: `requireOwnerContext()` no topo de cada action, e a
 * RLS exigindo `can_manage_money` no banco.
 */

/* ==========================================================================
   Profissionais
   ========================================================================== */

export type DadosProfissional = {
  id?: string;
  nome: string;
  apelido?: string;
  bio?: string;
  fotoUrl?: string;
  /** 0 a 100. É o percentual que vira comissão a cada atendimento concluído. */
  comissaoPercent: number;
  ativo: boolean;
  /**
   * O acesso ao painel desta pessoa, quando ela tem um. Vazio = profissional
   * sem login, que continua sendo o caso normal.
   *
   * É esta ligação que permite ao barbeiro ver a PRÓPRIA comissão na aba HOJE
   * sem ver a dos colegas. Sem ela, o sistema sabe que o assistente tem acesso
   * à loja, mas não sabe qual dos profissionais ele é.
   */
  profileId?: string | null;
};

export async function salvarProfissional(
  dados: DadosProfissional,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { shopId } = await requireOwnerContext();

    const nome = dados.nome.trim();
    if (nome.length < 2) return falha("Escreva o nome do profissional.");
    if (dados.comissaoPercent < 0 || dados.comissaoPercent > 100) {
      return falha("A comissão precisa ficar entre 0 e 100%.");
    }

    const supabase = await createClient();

    const campos = {
      name: nome,
      nickname: dados.apelido?.trim() || null,
      bio: dados.bio?.trim() || null,
      avatar_url: dados.fotoUrl?.trim() || null,
      commission_percent: Math.round(dados.comissaoPercent * 100) / 100,
      is_active: dados.ativo,
      // Quem confere se este acesso é MESMO desta barbearia é o trigger
      // `professionals_guard_profile` (15_comissao_do_dia.sql). Aqui não dá
      // para confiar: `requireOwnerContext` prova que quem chama é dono, não
      // que o uuid enviado pertence à loja dele.
      profile_id: dados.profileId?.trim() || null,
    };

    if (dados.id) {
      const { data, error } = await supabase
        .from("professionals")
        .update(campos)
        .eq("id", dados.id)
        .eq("barbershop_id", shopId)
        .select("id")
        .maybeSingle();

      if (error) return falha(traduzirErroBanco(error, "[equipe] atualizar profissional"));
      if (!data) return falha("Não encontrei esse profissional.");

      revalidatePath("/painel/equipe");
      revalidatePath("/painel/agenda");
      // A aba Hoje mostra a comissão por profissional: mudar o percentual ou o
      // acesso ligado muda o que ela desenha.
      revalidatePath("/painel");
      revalidateTag(tagBarbearia(shopId));
      return sucesso({ id: data.id }, "Profissional atualizado.");
    }

    const { data: ultimo, error: erroOrdem } = await supabase
      .from("professionals")
      .select("sort_order")
      .eq("barbershop_id", shopId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroOrdem) console.error("[equipe] falha ao ler a ordem:", erroOrdem);

    const { data, error } = await supabase
      .from("professionals")
      .insert({ barbershop_id: shopId, ...campos, sort_order: (ultimo?.sort_order ?? 0) + 1 })
      .select("id")
      .maybeSingle();

    if (error) return falha(traduzirErroBanco(error, "[equipe] criar profissional"));
    if (!data) return falha("Não consegui cadastrar o profissional.");

    revalidatePath("/painel/equipe");
    revalidatePath("/painel/agenda");
    revalidatePath("/painel");
    revalidateTag(tagBarbearia(shopId));
    return sucesso({ id: data.id }, "Profissional cadastrado.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] salvarProfissional"));
  }
}

/* ==========================================================================
   Jornada individual — OPCIONAL
   ========================================================================== */

export type LinhaJornada = {
  weekday: number;
  /** "09:00". Vazio com `folga` desligado significa "segue a loja". */
  inicio: string;
  fim: string;
  folga: boolean;
};

/**
 * Grava a jornada do profissional.
 *
 * ATENÇÃO AO MODELO: jornada é opcional. SEM linha em `professional_schedules`
 * para um dia, vale o horário da loja. Por isso salvar uma jornada vazia
 * APAGA as linhas em vez de gravar zeros — é assim que o profissional "volta"
 * a seguir a loja.
 */
export async function salvarJornada(
  professionalId: string,
  linhas: LinhaJornada[],
): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
    const supabase = await createClient();

    // O profissional é mesmo desta barbearia? A RLS já barraria, mas a
    // mensagem sairia pior do que esta.
    const { data: prof, error: erroProf } = await supabase
      .from("professionals")
      .select("id")
      .eq("id", professionalId)
      .eq("barbershop_id", shopId)
      .maybeSingle();

    if (erroProf) return falha(traduzirErroBanco(erroProf, "[equipe] conferir profissional"));
    if (!prof) return falha("Não encontrei esse profissional.");

    const { error: erroApagar } = await supabase
      .from("professional_schedules")
      .delete()
      .eq("professional_id", professionalId);

    if (erroApagar) return falha(traduzirErroBanco(erroApagar, "[equipe] limpar jornada"));

    const aGravar = linhas
      .filter((l) => l.folga || (l.inicio !== "" && l.fim !== ""))
      .map((l) => ({
        professional_id: professionalId,
        weekday: l.weekday,
        starts_at: l.folga ? "00:00" : l.inicio,
        ends_at: l.folga ? "00:00" : l.fim,
        is_off: l.folga,
      }));

    if (aGravar.length > 0) {
      const { error } = await supabase.from("professional_schedules").insert(aGravar);
      if (error) return falha(traduzirErroBanco(error, "[equipe] gravar jornada"));
    }

    revalidatePath("/painel/equipe");
    return sucesso(
      undefined,
      aGravar.length === 0 ? "Jornada limpa — segue o horário da loja." : "Jornada salva.",
    );
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] salvarJornada"));
  }
}

/* ==========================================================================
   Folga e férias
   ========================================================================== */

export async function registrarFolga(entrada: {
  /** Null = a loja inteira fecha (feriado). */
  professionalId: string | null;
  primeiroDia: string;
  ultimoDia: string;
  motivo?: string;
}): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();

    if (!entrada.primeiroDia || !entrada.ultimoDia) return falha("Informe o período da folga.");
    if (entrada.ultimoDia < entrada.primeiroDia) {
      return falha("O último dia não pode ser antes do primeiro.");
    }

    const supabase = await createClient();

    const { error } = await supabase.from("time_off").insert({
      barbershop_id: shopId,
      professional_id: entrada.professionalId,
      // O dia inteiro: da meia-noite à meia-noite do dia seguinte, no fuso
      // de São Paulo. Sem isso, uma folga "de 10 a 12" liberaria o dia 12.
      starts_at: timestampSP(entrada.primeiroDia, "00:00"),
      ends_at: timestampSP(entrada.ultimoDia, "23:59"),
      reason: entrada.motivo?.trim() || null,
    });

    if (error) return falha(traduzirErroBanco(error, "[equipe] registrar folga"));

    revalidatePath("/painel/equipe");
    revalidatePath("/painel/agenda");
    return sucesso(undefined, "Folga registrada.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] registrarFolga"));
  }
}

export async function removerFolga(id: string): Promise<ActionResult> {
  try {
    const { shopId } = await requireOwnerContext();
    const supabase = await createClient();

    const { error } = await supabase
      .from("time_off")
      .delete()
      .eq("id", id)
      .eq("barbershop_id", shopId);

    if (error) return falha(traduzirErroBanco(error, "[equipe] remover folga"));

    revalidatePath("/painel/equipe");
    revalidatePath("/painel/agenda");
    return sucesso(undefined, "Folga removida.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] removerFolga"));
  }
}

/* ==========================================================================
   Acessos — os assistentes
   ========================================================================== */

/**
 * Cria a conta de um assistente.
 *
 * >>> AQUI A SERVICE ROLE ENTRA EM CENA. Ela IGNORA A RLS por completo. <<<
 *
 * A ordem importa e não pode ser trocada:
 *   1. `requireOwnerContext()` confirma que quem chamou é o DONO
 *   2. confirmamos que a barbearia é mesmo dele
 *   3. só então `createAdminClient()`
 *
 * O papel nunca vem do formulário. O trigger `handle_new_user()` cria o perfil
 * como `client`; a promoção para `assistant` acontece logo abaixo, com o
 * `barbershop_id` gravado — é ele que amarra o assistente a esta loja.
 */
export async function criarAssistente(entrada: {
  nome: string;
  email: string;
  senha: string;
}): Promise<ActionResult<{ email: string; senha: string }>> {
  try {
    const { profile, shopId } = await requireOwnerContext();

    const nome = entrada.nome.trim();
    const email = entrada.email.trim().toLowerCase();
    const senha = entrada.senha;

    if (nome.length < 3) return falha("Escreva o nome completo do assistente.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falha("E-mail inválido.");
    if (senha.length < 6) return falha("A senha provisória precisa ter pelo menos 6 caracteres.");

    // Passo 2: a barbearia é mesmo deste dono? Sem esta linha, um dono
    // poderia criar assistente na loja de outro.
    const supabase = await createClient();
    const { data: loja, error: erroLoja } = await supabase
      .from("barbershops")
      .select("id")
      .eq("id", shopId)
      .eq("owner_id", profile.id)
      .maybeSingle();

    if (erroLoja) return falha(traduzirErroBanco(erroLoja, "[equipe] conferir barbearia"));
    if (!loja) return falha("Você não é o dono desta barbearia.");

    // Passo 3: agora sim.
    const admin = createAdminClient();

    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Sem e-mail de confirmação: o dono entrega a senha na mão, ali mesmo.
      email_confirm: true,
      user_metadata: { full_name: nome },
    });

    if (erroCriar) {
      const m = erroCriar.message.toLowerCase();
      if (m.includes("already") || m.includes("registered")) {
        return falha("Já existe uma conta com este e-mail.");
      }
      console.error("[equipe] falha ao criar o usuário do assistente:", erroCriar);
      return falha("Não consegui criar a conta. Tente outro e-mail.");
    }

    const novoId = criado.user?.id;
    if (!novoId) return falha("Não consegui criar a conta.");

    const { error: erroPerfil } = await admin
      .from("profiles")
      .update({ role: "assistant", barbershop_id: shopId, full_name: nome })
      .eq("id", novoId);

    if (erroPerfil) {
      // O usuário nasceu mas não virou assistente: desfaz, senão fica uma
      // conta órfã que loga no app do cliente sem ninguém entender por quê.
      await admin.auth.admin.deleteUser(novoId);
      return falha(traduzirErroBanco(erroPerfil, "[equipe] promover assistente"));
    }

    revalidatePath("/painel/equipe");
    return sucesso({ email, senha }, "Acesso criado. Copie a senha e entregue ao assistente.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] criarAssistente"));
  }
}

/**
 * Tira o acesso do assistente.
 *
 * A conta continua existindo, mas volta a ser `client` e perde o vínculo com a
 * barbearia. Apagar o usuário quebraria `appointments.created_by` — e o
 * histórico perderia quem marcou o quê.
 */
export async function removerAssistente(profileId: string): Promise<ActionResult> {
  try {
    const { profile, shopId } = await requireOwnerContext();

    if (profileId === profile.id) return falha("Você não pode remover o próprio acesso.");

    const supabase = await createClient();
    const { data: loja, error: erroLoja } = await supabase
      .from("barbershops")
      .select("id")
      .eq("id", shopId)
      .eq("owner_id", profile.id)
      .maybeSingle();

    if (erroLoja) return falha(traduzirErroBanco(erroLoja, "[equipe] conferir barbearia"));
    if (!loja) return falha("Você não é o dono desta barbearia.");

    const admin = createAdminClient();

    // O `.eq("barbershop_id", shopId)` é a trava: a service role ignora RLS,
    // então o filtro precisa estar aqui, escrito à mão.
    const { error } = await admin
      .from("profiles")
      .update({ role: "client", barbershop_id: null })
      .eq("id", profileId)
      .eq("barbershop_id", shopId)
      .eq("role", "assistant");

    if (error) return falha(traduzirErroBanco(error, "[equipe] remover assistente"));

    revalidatePath("/painel/equipe");
    return sucesso(undefined, "Acesso removido.");
  } catch (error) {
    unstable_rethrow(error);
    return falha(traduzirErroDesconhecido(error, "[equipe] removerAssistente"));
  }
}
