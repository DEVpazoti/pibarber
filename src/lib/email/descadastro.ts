import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DESCADASTRO DO E-MAIL DE VOLTA (marketing).
 *
 * O "token" é o id da linha em `email_messages`: um uuid aleatório que só
 * quem recebeu o e-mail conhece. Não precisa de login — o Gmail chama o
 * endpoint de um clique sem sessão, e exigir senha para sair de uma lista é
 * justamente o que a LGPD e as regras do Gmail proíbem.
 *
 * Só o e-mail de volta passa por aqui. Confirmação e lembrete são do horário
 * que a pessoa marcou, não marketing.
 */

export type OrigemDescadastro = {
  email: string;
  barbershopId: string | null;
  barbearia: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function origemDoDescadastro(id: string): Promise<OrigemDescadastro | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await createAdminClient()
    .from("email_messages")
    .select("recipient, barbershop_id, kind, loja:barbershops(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`[email] ler descadastro: ${error.message}`);
  if (!data || data.kind !== "recorrencia") return null;
  const loja = Array.isArray(data.loja) ? data.loja[0] : data.loja;
  return { email: data.recipient, barbershopId: data.barbershop_id, barbearia: loja?.name ?? null };
}

/** Registra a saída. `todas` = de todas as barbearias. Repetir não dá erro. */
export async function descadastrar(id: string, todas: boolean): Promise<OrigemDescadastro | null> {
  const origem = await origemDoDescadastro(id);
  if (!origem) return null;

  const { error } = await createAdminClient()
    .from("email_opt_outs")
    .insert({ email: origem.email, barbershop_id: todas ? null : origem.barbershopId });

  // 23505 = já tinha saído. É o resultado que a pessoa queria.
  if (error && error.code !== "23505") throw new Error(`[email] descadastrar: ${error.message}`);
  return origem;
}
