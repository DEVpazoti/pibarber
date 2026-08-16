/**
 * Tradução de erro do Postgres para português.
 *
 * O usuário nunca lê "duplicate key value violates unique constraint". E o
 * usuário aqui é o BARBEIRO — quem paga a conta. Toda action passa o erro do
 * Supabase por aqui antes de devolver `message`.
 *
 * As funções do banco levantam exceção já em português (código P0001). Nesse
 * caso a mensagem passa direto: ela foi escrita para ser lida.
 */

export type ErroBanco = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** Mensagem genérica de último recurso. */
const GENERICA = "Não consegui completar. Tente de novo em instantes.";

/**
 * Chaves únicas que o usuário pode esbarrar, com o texto que faz sentido para
 * ele. A chave é um pedaço do nome da constraint que veio do banco.
 */
const UNICOS: Array<[string, string]> = [
  ["customers_barbershop_id_phone", "Já existe um cliente com esse telefone nesta barbearia."],
  ["barbershops_slug", "Esse link já está em uso. Escolha outro."],
  ["reviews_appointment_id", "Este atendimento já foi avaliado."],
  ["commissions_appointment_id", "A comissão deste atendimento já foi gerada."],
  ["favorites_profile_id_barbershop_id", "Esta barbearia já está nos seus favoritos."],
  ["shop_visits_profile_id_barbershop_id", "Esta visita já estava registrada."],
  ["business_hours_barbershop_id_weekday", "Já existe um horário cadastrado para esse dia."],
  ["professional_schedules_professional_id_weekday", "Já existe uma jornada para esse dia."],
  ["profiles_email", "Já existe uma conta com este e-mail."],
];

/**
 * Traduz o erro. `contexto` só entra no console — nunca na tela.
 *
 * ```ts
 * const { data, error } = await supabase.rpc("book_appointment", { ... });
 * if (error) return falha(traduzirErroBanco(error, "[agenda] book_appointment"));
 * ```
 */
export function traduzirErroBanco(erro: ErroBanco | null | undefined, contexto?: string): string {
  if (!erro) return GENERICA;

  if (contexto) console.error(`${contexto}:`, erro);

  const codigo = erro.code ?? "";
  const mensagem = erro.message ?? "";
  const detalhe = `${mensagem} ${erro.details ?? ""}`.toLowerCase();

  // --- A constraint que vale ouro -------------------------------------------
  // Dois clientes tocando o mesmo horário no mesmo segundo. O banco recusa e a
  // tela explica em uma frase.
  if (codigo === "23P01" || detalhe.includes("appointments_no_overlap")) {
    return "Esse profissional já tem atendimento nesse horário.";
  }

  // --- Exceção levantada pelas nossas funções -------------------------------
  // Já vem em português, escrita para ser lida. Repassa sem mexer.
  if (codigo === "P0001" && mensagem.trim() !== "") {
    return mensagem.trim();
  }

  switch (codigo) {
    case "23505": {
      for (const [pedaco, texto] of UNICOS) {
        if (detalhe.includes(pedaco)) return texto;
      }
      return "Esse registro já existe.";
    }

    case "23503":
      // O banco recusa apagar a saída de caixa de um pagamento de comissão: sem
      // ela, a comissão ficaria paga sem contrapartida e o lucro do mês
      // mentiria. O caminho certo é estornar o pagamento, que desfaz os dois.
      if (detalhe.includes("commission_payments_transaction_id")) {
        return "Esta saída veio de um pagamento de comissão. Para desfazer, use “Estornar” na tela de Comissões — assim o caixa e a comissão voltam juntos.";
      }
      return "Este registro está sendo usado em outro lugar e não pode ser removido.";

    case "23514":
      return "Algum valor informado está fora do permitido. Confira os campos.";

    case "23502":
      return "Faltou preencher um campo obrigatório.";

    case "22P02":
      return "Algum valor está em formato inválido.";

    case "42501":
      return "Você não tem permissão para fazer isso.";

    case "PGRST301":
    case "401":
      return "Sua sessão expirou. Entre de novo.";

    case "PGRST116":
      return "Não encontrei este registro.";

    default:
      break;
  }

  // A RLS recusando um insert/update aparece como "violates row-level security".
  if (detalhe.includes("row-level security") || detalhe.includes("permission denied")) {
    return "Você não tem permissão para fazer isso.";
  }

  if (detalhe.includes("jwt") || detalhe.includes("expired")) {
    return "Sua sessão expirou. Entre de novo.";
  }

  if (detalhe.includes("fetch failed") || detalhe.includes("network")) {
    return "Sem conexão com o servidor. Tente de novo.";
  }

  // Uma exceção nossa pode chegar sem o código, dependendo do caminho.
  // Se o texto tem acento, é português — veio das nossas funções.
  if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(mensagem)) return mensagem.trim();

  console.error(`${contexto ?? "[banco]"} mensagem não traduzida:`, erro);
  return GENERICA;
}

/** Erro solto de um try/catch, que pode ser qualquer coisa. */
export function traduzirErroDesconhecido(erro: unknown, contexto?: string): string {
  if (erro && typeof erro === "object" && "message" in erro) {
    return traduzirErroBanco(erro as ErroBanco, contexto);
  }
  if (contexto) console.error(`${contexto}:`, erro);
  return GENERICA;
}
