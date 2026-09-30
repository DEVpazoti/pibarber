import { descadastrar } from "@/lib/email/descadastro";

/**
 * Descadastro de UM CLIQUE (RFC 8058) — é o que o botão "Cancelar inscrição"
 * do Gmail chama, por POST, sem sessão. Sai só da barbearia daquele e-mail.
 * Responde 200 mesmo para id desconhecido: não há nada a revelar a quem testa.
 */
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await descadastrar(id, false);
  } catch (e) {
    console.error("[email] descadastro de um clique falhou:", e instanceof Error ? e.message : e);
    return new Response("Erro", { status: 500 });
  }
  return new Response("OK");
}
