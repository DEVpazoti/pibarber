import "server-only";

import type { FormaDePagamento } from "@/lib/assinatura";
import { envAsaas, type EnvAsaas } from "@/lib/env";
import type { SubscriptionCycle } from "@/lib/types";

/**
 * O cliente da API do Asaas (v3). Só o que o PiBarber usa: cliente,
 * assinatura e as cobranças de uma assinatura.
 *
 * SÓ NO SERVIDOR: a chave dá acesso à conta de recebimento da PiSystem.
 *
 * Os erros do Asaas chegam em inglês ou com códigos ("invalid_cpfCnpj"). Esta
 * camada não traduz — devolve `AsaasErro` com a descrição original, e quem
 * chama decide o que dizer ao dono. O log leva a descrição inteira.
 */

export class AsaasErro extends Error {
  constructor(
    public readonly status: number,
    public readonly descricao: string,
    public readonly codigo?: string,
  ) {
    super(`Asaas ${status}: ${descricao}`);
  }
}

/** Sem chave configurada: a cobrança está desligada neste ambiente. */
export class AsaasDesligado extends Error {
  constructor() {
    super("ASAAS_API_KEY não configurada");
  }
}

function env(): EnvAsaas {
  const e = envAsaas();
  if (!e) throw new AsaasDesligado();
  return e;
}

async function chamar<T>(
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const { apiKey, baseUrl } = env();

  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      // O Asaas exige User-Agent nas contas criadas a partir de 2024.
      "User-Agent": "PiBarber",
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });

  const texto = await resposta.text();
  const json = texto ? JSON.parse(texto) : {};

  if (!resposta.ok) {
    const primeiro = json?.errors?.[0];
    throw new AsaasErro(
      resposta.status,
      primeiro?.description ?? texto.slice(0, 300),
      primeiro?.code,
    );
  }
  return json as T;
}

/* ==========================================================================
   Tipos — só os campos que o PiBarber lê
   ========================================================================== */

export type AsaasCobranca = {
  id: string;
  subscription?: string | null;
  customer: string;
  value: number;
  billingType: string;
  status: string;
  dueDate: string;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  /** Id do parcelamento, quando a cobrança é uma parcela. */
  installment?: string | null;
  /** 1 a N, quando a cobrança é uma parcela. */
  installmentNumber?: number | null;
};

type Lista<T> = { data: T[]; totalCount: number; hasMore: boolean };

/** O ciclo do PiBarber no vocabulário do Asaas. */
export const CICLO_ASAAS: Record<SubscriptionCycle, "MONTHLY" | "SEMIANNUALLY" | "YEARLY"> = {
  monthly: "MONTHLY",
  semiannual: "SEMIANNUALLY",
  annual: "YEARLY",
};

/* ==========================================================================
   Chamadas
   ========================================================================== */

export async function criarCliente(dados: {
  nome: string;
  cpfCnpj: string;
  email?: string | null;
  celular?: string | null;
  /** O id da barbearia — é assim que o painel do Asaas liga o cliente à loja. */
  referencia: string;
}): Promise<{ id: string }> {
  return chamar("POST", "/customers", {
    name: dados.nome,
    cpfCnpj: dados.cpfCnpj,
    email: dados.email ?? undefined,
    mobilePhone: dados.celular ?? undefined,
    externalReference: dados.referencia,
  });
}

/**
 * ⚠️ PIX EM ASSINATURA VIRA BOLETO HÍBRIDO. Com `billingType: "PIX"`, o Asaas
 * gera as cobranças da assinatura como BOLETO com QR Code Pix junto (visto no
 * Sandbox em 2026-09; cobrança AVULSA em Pix continua Pix). O dono consegue
 * pagar por Pix, mas a página também oferece o boleto. Decisão do negócio:
 * aceitar assim e avisar na tela (DialogAssinar) que o Pix confirma na hora e
 * o boleto leva até 3 dias úteis.
 */
export async function criarAssinatura(dados: {
  cliente: string;
  forma: FormaDePagamento;
  valor: number;
  /** "AAAA-MM-DD". O vencimento da 1ª cobrança; as seguintes andam o ciclo. */
  primeiroVencimento: string;
  ciclo: SubscriptionCycle;
  descricao: string;
  referencia: string;
}): Promise<{ id: string }> {
  return chamar("POST", "/subscriptions", {
    customer: dados.cliente,
    billingType: dados.forma,
    value: dados.valor,
    nextDueDate: dados.primeiroVencimento,
    cycle: CICLO_ASAAS[dados.ciclo],
    description: dados.descricao,
    externalReference: dados.referencia,
  });
}

/** Remove a assinatura e as cobranças ainda não pagas dela. */
export async function removerAssinatura(id: string): Promise<void> {
  await chamar("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function cobrancasDaAssinatura(id: string): Promise<AsaasCobranca[]> {
  const lista = await chamar<Lista<AsaasCobranca>>(
    "GET",
    `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`,
  );
  return lista.data;
}

/**
 * Cobrança PARCELADA no cartão (semestral 6x, anual 12x — sem juros para o
 * dono: a taxa do parcelado é absorvida pela PiSystem).
 *
 * Existe porque a assinatura do Asaas não parcela. A 1ª parcela vence em
 * `primeiroVencimento`; as seguintes, um mês depois da outra. O Asaas divide
 * o total e joga o resto de centavos na última parcela.
 *
 * Devolve a 1ª parcela — é o link dela que leva à página de pagamento, onde o
 * cartão é passado uma vez só para as N parcelas.
 */
export async function criarCobrancaParcelada(dados: {
  cliente: string;
  valorTotal: number;
  parcelas: number;
  primeiroVencimento: string;
  descricao: string;
  referencia: string;
}): Promise<AsaasCobranca> {
  return chamar("POST", "/payments", {
    customer: dados.cliente,
    billingType: "CREDIT_CARD",
    totalValue: dados.valorTotal,
    installmentCount: dados.parcelas,
    dueDate: dados.primeiroVencimento,
    description: dados.descricao,
    externalReference: dados.referencia,
  });
}

export async function parcelasDoParcelamento(id: string): Promise<AsaasCobranca[]> {
  const lista = await chamar<Lista<AsaasCobranca>>(
    "GET",
    `/installments/${encodeURIComponent(id)}/payments?limit=24`,
  );
  return lista.data;
}

/** Remove o parcelamento e as parcelas ainda não pagas. */
export async function removerParcelamento(id: string): Promise<void> {
  await chamar("DELETE", `/installments/${encodeURIComponent(id)}`);
}

export async function buscarCobranca(id: string): Promise<AsaasCobranca> {
  return chamar("GET", `/payments/${encodeURIComponent(id)}`);
}

/**
 * Estorna uma cobrança paga, pelo valor INTEIRO. Pix volta na hora; cartão
 * volta na fatura do cartão (pode levar um ou dois ciclos). Boleto o Asaas não
 * estorna pela API — precisa de dado bancário, e é feito à mão no painel.
 */
export async function estornarCobranca(id: string, descricao: string): Promise<AsaasCobranca> {
  return chamar("POST", `/payments/${encodeURIComponent(id)}/refund`, { description: descricao });
}

/** Estorna TODAS as parcelas pagas de um parcelamento no cartão. */
export async function estornarParcelamento(id: string): Promise<void> {
  await chamar("POST", `/installments/${encodeURIComponent(id)}/refund`);
}
