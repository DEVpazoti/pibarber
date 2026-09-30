import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui";
import { descadastrar, origemDoDescadastro } from "@/lib/email/descadastro";

export const metadata: Metadata = {
  title: "Parar de receber e-mails",
  robots: { index: false, follow: false },
};

/**
 * A página do link "Não quero mais receber" do e-mail de volta.
 *
 * Abrir NÃO descadastra: antivírus e leitores de e-mail abrem os links sozinhos
 * para conferir, e a pessoa sairia da lista sem ter clicado. Quem sai é o
 * botão (POST). Sem login, de propósito — ver src/lib/email/descadastro.ts.
 */
export default async function SairPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feito?: string }>;
}) {
  const { id } = await params;
  const { feito } = await searchParams;
  const origem = await origemDoDescadastro(id).catch((e: unknown) => {
    console.error("[sair] falha ao ler:", e instanceof Error ? e.message : e);
    return null;
  });

  async function sair(formData: FormData) {
    "use server";
    const todas = formData.get("todas") === "1";
    await descadastrar(id, todas);
    redirect(`/sair/${id}?feito=${todas ? "todas" : "loja"}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        {!origem ? (
          <>
            <h1 className="text-2xl text-ink">Link inválido</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Não encontrei este e-mail. Se o link veio cortado, abra de novo pelo botão do e-mail.
            </p>
          </>
        ) : feito ? (
          <>
            <h1 className="text-2xl text-ink">Pronto</h1>
            <p className="mt-2 text-sm text-ink-soft">
              {feito === "todas"
                ? "Você não vai mais receber e-mails de lembrete de volta de nenhuma barbearia do PiBarber."
                : `Você não vai mais receber e-mails de lembrete de volta da ${origem.barbearia ?? "barbearia"}.`}{" "}
              Confirmações e lembretes dos horários que você marcar continuam chegando.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl text-ink">Parar de receber</h1>
            <p className="mt-2 text-sm text-ink-soft">
              O e-mail <strong className="text-ink">{origem.email}</strong> vai deixar de receber o
              lembrete de voltar à {origem.barbearia ?? "barbearia"}.
            </p>
            <form action={sair} className="mt-5 flex flex-col gap-2">
              <Button type="submit" name="todas" value="0">
                Parar de receber desta barbearia
              </Button>
              <Button type="submit" name="todas" value="1" variante="secondary">
                Parar de receber de todas
              </Button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-brass hover:text-brass-deep">
            Ir para o PiBarber
          </Link>
        </p>
      </div>
    </main>
  );
}
