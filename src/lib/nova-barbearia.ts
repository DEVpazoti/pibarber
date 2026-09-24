import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { paraSlug } from "@/lib/utils";

/**
 * Nascer uma barbearia pelas mãos do próprio barbeiro.
 *
 * Dois caminhos chegam aqui, e os dois precisam da MESMA regra:
 *   - o cadastro novo (`criarContaBarbearia`, em actions/auth.ts);
 *   - o cliente que já tem conta e abre a barbearia dele
 *     (`abrirMinhaBarbearia`, em actions/client.ts).
 *
 * A REGRA: dois donos não dividem telefone. Aqui ela é conferida para dar a
 * mensagem certa; quem a garante é o índice `profiles_telefone_dono_unico`
 * (25_setup_barbearia.sql).
 *
 * Usa a service role: `barbershops` só aceita insert do admin pela RLS, e a
 * checagem do telefone precisa enxergar os perfis dos outros donos. Quem chama
 * é responsável por já ter provado de quem é o `userId`.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoNovaBarbearia =
  { ok: true; slug: string } | { ok: false; motivo: "telefone_em_uso" | "erro" };

/**
 * O telefone já é de outro dono, ou está no cadastro de outra loja?
 * `null` quando a consulta falhou — quem chama recusa, na dúvida.
 */
export async function telefoneDeOutroDono(admin: Admin, telefone: string): Promise<boolean | null> {
  const [{ data: dono, error: erroDono }, { data: loja, error: erroLoja }] = await Promise.all([
    admin
      .from("profiles")
      .select("id")
      .eq("role", "owner")
      .eq("phone", telefone)
      .limit(1)
      .maybeSingle(),
    // Pega as lojas criadas no /admin, cujo dono pode não ter telefone no perfil.
    admin
      .from("barbershops")
      .select("id")
      .or(`phone.eq.${telefone},whatsapp.eq.${telefone}`)
      .limit(1)
      .maybeSingle(),
  ]);

  if (erroDono || erroLoja) {
    console.error("[nova barbearia] falha ao conferir o telefone:", erroDono ?? erroLoja);
    return null;
  }
  return Boolean(dono || loja);
}

/**
 * Grava o telefone no perfil e cria a loja. O trigger
 * `barbershop_after_insert()` promove o perfil a `owner` no mesmo insert.
 *
 * A ORDEM IMPORTA: o telefone entra com o papel ainda `client`, fora do
 * índice parcial. É no insert da loja — quando o trigger vira o papel — que um
 * cadastro simultâneo com o mesmo número estoura, e o insert falha inteiro.
 *
 * A loja nasce com `is_active = false`: o fim do setup de /configurar é que a
 * abre ao público.
 */
export async function criarBarbeariaDoDono(
  admin: Admin,
  entrada: { userId: string; nomeBarbearia: string; telefone: string },
): Promise<ResultadoNovaBarbearia> {
  const { error: erroPerfil } = await admin
    .from("profiles")
    .update({ phone: entrada.telefone })
    .eq("id", entrada.userId);

  if (erroPerfil) {
    console.error("[nova barbearia] falha ao gravar o telefone:", erroPerfil);
    return { ok: false, motivo: "erro" };
  }

  const slug = await slugLivre(admin, entrada.nomeBarbearia);

  const { error } = await admin.from("barbershops").insert({
    owner_id: entrada.userId,
    name: entrada.nomeBarbearia,
    slug,
    phone: entrada.telefone,
    whatsapp: entrada.telefone,
    is_active: false,
  });

  if (error) {
    if (error.code === "23505" && error.message.includes("telefone")) {
      return { ok: false, motivo: "telefone_em_uso" };
    }
    console.error("[nova barbearia] falha ao criar a barbearia:", error);
    return { ok: false, motivo: "erro" };
  }

  return { ok: true, slug };
}

/**
 * O link público a partir do nome, sem colidir com outra loja.
 *
 * "Barbearia do Zé" → "barbearia-do-ze", ou "barbearia-do-ze-2" se já existir.
 * Uma consulta só, pelo prefixo. O dono pode trocar o link no setup; isto é só
 * para a loja nascer com um que funcione.
 */
async function slugLivre(admin: Admin, nomeBarbearia: string): Promise<string> {
  let base = paraSlug(nomeBarbearia).slice(0, 50);
  if (base.length < 3) base = `barbearia-${base}`.replace(/-$/, "");

  const { data, error } = await admin.from("barbershops").select("slug").like("slug", `${base}%`);

  if (error) console.error("[nova barbearia] falha ao conferir o link:", error);

  const usados = new Set((data ?? []).map((l) => l.slug));
  if (!usados.has(base)) return base;

  for (let n = 2; n < 1000; n++) {
    if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
