/**
 * Tipos do domínio.
 *
 * A fonte da verdade é `database.types.ts`, gerado a partir do schema real.
 * Aqui só damos nomes curtos e adicionamos os tipos que a aplicação usa e o
 * banco não conhece (ActionResult, os itens de menu, etc.).
 */

import type { Enums, Tables } from "./database.types";

/* ==========================================================================
   Enums do banco
   ========================================================================== */

export type UserRole = Enums<"user_role">;
export type AppointmentStatus = Enums<"appointment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type TransactionType = Enums<"transaction_type">;
export type CommissionStatus = Enums<"commission_status">;
export type DebtStatus = Enums<"debt_status">;
export type AppointmentSource = Enums<"appointment_source">;
export type WaitlistStatus = Enums<"waitlist_status">;
export type NotificationType = Enums<"notification_type">;

/* ==========================================================================
   Tabelas
   ========================================================================== */

export type Profile = Tables<"profiles">;
export type UserAddress = Tables<"user_addresses">;
export type Dependent = Tables<"dependents">;
export type Barbershop = Tables<"barbershops">;
export type BusinessHour = Tables<"business_hours">;
export type Professional = Tables<"professionals">;
export type ProfessionalSchedule = Tables<"professional_schedules">;
export type TimeOff = Tables<"time_off">;
export type Service = Tables<"services">;
/** Uma comodidade do catálogo fechado: wi-fi, estacionamento, ambiente kids. */
export type Amenity = Tables<"amenities">;
export type Customer = Tables<"customers">;
export type Favorite = Tables<"favorites">;
export type ShopVisit = Tables<"shop_visits">;
export type Appointment = Tables<"appointments">;
export type AppointmentService = Tables<"appointment_services">;
export type WaitlistEntry = Tables<"waitlist_entries">;
export type Review = Tables<"reviews">;
export type Transaction = Tables<"transactions">;
export type Commission = Tables<"commissions">;
export type Debt = Tables<"debts">;
export type DebtPayment = Tables<"debt_payments">;
export type AppNotification = Tables<"notifications">;

/* ==========================================================================
   Retorno de Server Action
   ========================================================================== */

/**
 * Toda action devolve isto. `message` já vem em português, pronto para a tela —
 * o usuário nunca lê "duplicate key value violates unique constraint".
 *
 * `campo` é opcional e diz A QUAL campo a mensagem pertence, para o formulário
 * exibir o erro embaixo do campo certo em vez de num alerta genérico no topo.
 * Quem não usa simplesmente ignora — nenhuma action antiga precisou mudar.
 */
export type ActionResult<T = undefined> = {
  ok: boolean;
  message?: string;
  data?: T;
  /** O `name` do campo que causou o erro: "email", "senha", "confirmacao"… */
  campo?: string;
};

export function sucesso<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function falha<T = undefined>(message: string, campo?: string): ActionResult<T> {
  return { ok: false, message, campo };
}

/* ==========================================================================
   Contexto de quem está usando o sistema
   ========================================================================== */

/** O perfil junto com a barbearia que ele opera. */
export type ShopContext = {
  profile: Profile;
  shopId: string;
  /**
   * O nome da barbearia, já trazido na mesma consulta do `shopId` (G4 do
   * PERFORMANCE.md). Nulo só se a linha não vier — quem exibe decide o texto
   * de reserva, porque isso é escolha de tela, não de autenticação.
   */
  shopName: string | null;
  /** Só o dono e o admin. Comanda caixa, comissão e relatório. */
  podeVerDinheiro: boolean;
};

/* ==========================================================================
   Formatos de tela — o que a consulta entrega pronto para renderizar
   ==========================================================================

   Ficam aqui, e não junto da consulta, porque componente de cliente também
   precisa deles. O arquivo de consulta é "server-only": importar dele de um
   "use client" quebraria o build, mesmo só por tipo.
*/

/** Uma linha da agenda: o bloco da grade e a linha da tela Hoje. */
export type AgendamentoNaAgenda = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  total_price: number;
  discount: number;
  notes: string | null;
  /** `phone` é nulo no cliente avulso — quem entrou pela porta e sentou. */
  cliente: { id: string; full_name: string; phone: string | null } | null;
  profissional: { id: string; name: string; nickname: string | null } | null;
  /** Quando o atendimento é para o filho do titular. */
  dependente: { full_name: string } | null;
  /** Os nomes dos serviços, já congelados na marcação. */
  servicos: string[];
};

/** O profissional como a agenda precisa dele: uma coluna da grade. */
export type ProfissionalNaAgenda = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
};

/** O serviço no seletor do novo agendamento. */
export type ServicoNaAgenda = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

/** Um cartão da busca — o que `search_barbershops` devolve, mais o coração. */
export type BarbeariaEncontrada = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  cover_url: string | null;
  rating_avg: number;
  rating_count: number;
  /** Só na busca por proximidade. Null nas outras. */
  dist_km: number | null;
  favorita?: boolean;
};

/**
 * O que o geocoding devolveu para um endereço.
 *
 * Mora aqui, e não em `geocoding.ts`, porque a tela de configurações é
 * `"use client"` e o `geocoding.ts` é `server-only` — importar dele, mesmo só
 * por tipo, quebraria o build (mesmo motivo do bloco acima).
 */
export type EnderecoLocalizado = {
  latitude: number;
  longitude: number;
  /** O endereço como o Google o entendeu. É o que o dono confere antes de salvar. */
  enderecoFormatado: string;
  /**
   * "exata" é porta da rua; "aproximada" é centro do CEP ou do bairro.
   * Governa se a tela sugere abrir o mapa para arrastar o pin.
   */
  precisao: "exata" | "aproximada";
};

/** O JSON que `client_home` devolve — a home do app em uma chamada. */
export type HomeDoCliente = {
  proximo: {
    id: string;
    starts_at: string;
    status: AppointmentStatus;
    shop_name: string;
    shop_slug: string;
    logo_url: string | null;
    professional_name: string;
    servicos: string | null;
  } | null;
  proximos: {
    id: string;
    starts_at: string;
    status: AppointmentStatus;
    shop_name: string;
    shop_slug: string;
    logo_url: string | null;
    professional_name: string;
  }[];
  ultimos_acessos: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    rating_avg: number;
    rating_count: number;
    neighborhood: string | null;
    city: string | null;
    last_viewed_at: string;
  }[];
  favoritos: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    rating_avg: number;
    rating_count: number;
    neighborhood: string | null;
    city: string | null;
    created_at: string;
  }[];
};

/** Um agendamento como o CLIENTE o vê — com a barbearia, não com a ficha. */
export type MeuAgendamento = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  total_price: number;
  discount: number;
  barbearia: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    cancel_deadline_hours: number;
  } | null;
  profissional: { name: string; nickname: string | null } | null;
  servicos: string[];
  /** Já avaliado? Alimenta o botão "Avaliar" do card. */
  avaliado: boolean;
};

/**
 * Uma linha do bloco "Comissão de hoje", no fim da aba HOJE.
 *
 * Vem de `comissoes_do_dia()`, que já aplica o recorte de permissão DENTRO do
 * banco: o dono recebe todos os profissionais, o assistente ligado a um
 * profissional recebe só a linha dele, e o assistente sem ligação recebe lista
 * vazia. A tela não filtra nada — se filtrasse, o dado teria vindo à toa.
 */
export type ComissaoDoDia = {
  professional_id: string;
  nome: string;
  atendimentos: number;
  /** Soma de `total_price - discount` dos atendimentos concluídos no dia. */
  total_gerado: number;
  /** O percentual ATUAL do profissional — só para exibir "× 40%". */
  percent: number;
  /** A soma das comissões já gravadas, com o percentual congelado na conclusão. */
  comissao: number;
};

/** O JSON que `dashboard_summary` devolve. Sem as chaves de dinheiro para o assistente. */
export type ResumoDoPainel = {
  de: string;
  ate: string;
  atendimentos: number;
  concluidos: number;
  faltas: number;
  a_atender: number;
  taxa_falta: number;
  pode_ver_dinheiro: boolean;
  receita?: number;
  despesa?: number;
  lucro?: number;
  ticket_medio?: number;
  fiado_aberto?: number;
};

/* ==========================================================================
   Apoio de interface
   ========================================================================== */

/**
 * Rótulo e tom de cada status de agendamento, para o chip da tela.
 *
 * ⚠️ `confirmed` E `scheduled` MOSTRAM A MESMA COISA, e isso é proposital.
 *
 * Os dois status nunca tiveram diferença funcional: a constraint de
 * sobreposição, o cálculo de horários livres, o resumo do painel e os filtros
 * do cliente sempre trataram `in ('scheduled','confirmed')` como um bloco só.
 * O único caminho que escrevia `confirmed` era um botão do painel que não
 * disparava nada — nem notificação, nem aprovação, nem regra de cancelamento.
 * Para o cliente, ver "Agendado" num horário e "Confirmado" em outro sugeria
 * uma diferença que não existia.
 *
 * `confirmed` deixou de ser escrito e os registros antigos foram migrados por
 * `supabase/12_status_agendado.sql`. A chave continua aqui porque o valor ainda
 * existe no enum do banco: se algum registro escapar da migração, ele aparece
 * como "Agendado" em vez de quebrar a tela com `undefined`.
 */
export const STATUS_AGENDAMENTO: Record<
  AppointmentStatus,
  { rotulo: string; tom: "neutro" | "brass" | "money" | "danger" | "info" }
> = {
  scheduled: { rotulo: "Agendado", tom: "info" },
  confirmed: { rotulo: "Agendado", tom: "info" },
  completed: { rotulo: "Concluído", tom: "money" },
  cancelled: { rotulo: "Cancelado", tom: "neutro" },
  no_show: { rotulo: "Faltou", tom: "danger" },
};

/**
 * O atendimento ainda vai acontecer? É o recorte que separa "em aberto" de
 * "já resolvido" — e o único lugar do código que precisa saber que `confirmed`
 * é sinônimo de `scheduled`.
 */
export function emAberto(status: AppointmentStatus): boolean {
  return status === "scheduled" || status === "confirmed";
}

export const FORMA_PAGAMENTO: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  fiado: "Fiado",
};

export const STATUS_FIADO: Record<DebtStatus, string> = {
  open: "Em aberto",
  partial: "Parcial",
  paid: "Quitado",
};

export const PERIODOS = [
  { valor: "morning", rotulo: "Manhã" },
  { valor: "afternoon", rotulo: "Tarde" },
  { valor: "evening", rotulo: "Noite" },
  { valor: "any", rotulo: "Qualquer horário" },
] as const;

export const GENEROS = [
  { valor: "male", rotulo: "Masculino" },
  { valor: "female", rotulo: "Feminino" },
  { valor: "other", rotulo: "Outros" },
] as const;
