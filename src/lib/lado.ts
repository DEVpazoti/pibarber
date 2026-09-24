/**
 * AS DUAS PORTAS DE ENTRADA — uma conta pode ser de barbearia E de cliente,
 * e a porta por onde a pessoa entra decide de que lado ela está:
 *
 *   /entrar?tipo=barbearia  → lado "barbearia": painel (dono e assistente)
 *   /entrar                 → lado "cliente":   app de cliente
 *
 * O lado vale até SAIR. Não há botão de troca: para ir ao outro lado, a
 * pessoa sai e entra pela outra porta (decisão do produto).
 *
 * O cookie não dá permissão nenhuma — ele só ESCOLHE a área. Quem pode o quê
 * continua sendo o papel no perfil e a RLS: uma conta só de cliente com o
 * cookie "barbearia" não ganha painel. E o lado de cliente só mostra o que é
 * da pessoa como cliente (`meus_agendamentos_ids()`, 30_lado_cliente.sql),
 * nunca a agenda da barbearia onde ela trabalha.
 *
 * Mora fora de "server-only" porque o middleware (edge) também lê.
 */

export const COOKIE_LADO = "pibarber-lado";
export type Lado = "cliente" | "barbearia";

/** O lado do cookie; sem cookie, o natural do papel. */
export function ladoDaSessao(valor: string | undefined | null, temBarbearia: boolean): Lado {
  if (valor === "cliente" || valor === "barbearia") return valor;
  return temBarbearia ? "barbearia" : "cliente";
}

/** Converte `?tipo=` da URL no lado da porta. */
export function ladoDaPorta(tipo: string | undefined | null): Lado {
  return tipo === "barbearia" ? "barbearia" : "cliente";
}

export const OPCOES_COOKIE_LADO = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  // Dura o mesmo que a sessão costuma durar; "Sair" apaga antes.
  maxAge: 60 * 60 * 24 * 60,
};

/** Para onde cada lado leva depois do login. */
export function casaDoLado(lado: Lado, temBarbearia: boolean): string {
  if (lado === "barbearia") return temBarbearia ? "/painel" : ROTA_SEM_BARBEARIA;
  return "/app";
}

/**
 * Conta só de cliente que entrou pela porta da barbearia: em vez de erro,
 * oferece criar a barbearia com a mesma conta.
 */
export const ROTA_SEM_BARBEARIA = "/app/perfil/barbearia?pela=porta-da-barbearia";
