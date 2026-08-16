"use client";

import { Check, Lock, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarObservacoes } from "@/app/actions/customers";
import { ClienteDialog } from "@/components/painel/ClienteDialog";
import { Button, Textarea } from "@/components/ui";
import type { DadosCliente } from "@/app/actions/customers";

/**
 * As observações do barbeiro — "máquina 2 nas laterais".
 *
 * É o campo mais usado da ficha, então ele fica editável ali mesmo, sem abrir
 * diálogo nenhum: clicou, escreveu, salvou. O cadeado ao lado do título é
 * literal — este texto não sai desta barbearia.
 */

export function ObservacoesCliente({
  customerId,
  inicial,
}: {
  customerId: string;
  inicial: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const mudou = texto !== (inicial ?? "");

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarObservacoes(customerId, texto);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setSalvo(true);
      router.refresh();
      setTimeout(() => setSalvo(false), 2500);
    });
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lock className="h-4 w-4 text-ink-faint" aria-hidden />
        <h2 className="text-base font-semibold text-ink">Observações</h2>
        <span className="text-xs text-ink-faint">— só a sua equipe lê</span>
      </div>

      <Textarea
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex: máquina 2 nas laterais, tesoura em cima, não gosta de conversa"
        aria-label="Observações sobre o cliente"
      />

      {erro ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <Button tamanho="sm" disabled={!mudou} carregando={salvando} onClick={salvar}>
          Salvar observações
        </Button>
        {salvo ? (
          <span className="inline-flex items-center gap-1 text-sm text-money">
            <Check className="h-4 w-4" aria-hidden />
            Salvo
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** O botão de editar a ficha inteira, no cabeçalho. */
export function BotaoEditarCliente({ cliente }: { cliente: DadosCliente & { id: string } }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        variante="secondary"
        tamanho="sm"
        onClick={() => setAberto(true)}
        iconeEsquerda={<Pencil className="h-4 w-4" aria-hidden />}
      >
        Editar
      </Button>

      <ClienteDialog aberto={aberto} aoFechar={() => setAberto(false)} inicial={cliente} />
    </>
  );
}
