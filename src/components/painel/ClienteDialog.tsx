"use client";

import { AlertCircle, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { salvarCliente, type DadosCliente } from "@/app/actions/customers";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { mascaraTelefone } from "@/lib/utils";

/**
 * Cadastrar e editar a ficha do cliente DENTRO desta barbearia.
 *
 * O campo "Observações" é o do barbeiro — "máquina 2 nas laterais". Ele nunca
 * aparece para o cliente: a RLS não deixa o cliente sequer ler a tabela
 * `customers`, então não existe caminho para vazar.
 */

export function ClienteDialog({
  aberto,
  aoFechar,
  inicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Preenchido = edição. Vazio = cadastro novo. */
  inicial?: DadosCliente & { id: string };
}) {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.nome ?? "");
    setTelefone(mascaraTelefone(inicial?.telefone ?? ""));
    setEmail(inicial?.email ?? "");
    setNascimento(inicial?.nascimento ?? "");
    setObservacoes(inicial?.observacoes ?? "");
    setErro(null);
  }, [aberto, inicial]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarCliente({
        id: inicial?.id,
        nome,
        telefone,
        email,
        nascimento,
        observacoes,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }

      router.refresh();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? "Editar cliente" : "Novo cliente"}
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button
            tamanho="lg"
            larguraTotal
            carregando={enviando}
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="cliente-nome" obrigatorio>
          <Input
            id="cliente-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
          />
        </Field>

        <Field
          label="Celular"
          htmlFor="cliente-telefone"
          obrigatorio
          dica="É a chave da ficha nesta barbearia — não repete."
        >
          <Input
            id="cliente-telefone"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            placeholder="(11) 98765-4321"
          />
        </Field>

        <Field label="E-mail" htmlFor="cliente-email">
          <Input
            id="cliente-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
          />
        </Field>

        <Field label="Nascimento" htmlFor="cliente-nascimento" dica="Serve para lembrar do aniversário.">
          <Input
            id="cliente-nascimento"
            type="date"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
          />
        </Field>

        <Field
          label="Observações"
          htmlFor="cliente-obs"
          dica="Só você e sua equipe leem. O cliente nunca vê."
        >
          <Textarea
            id="cliente-obs"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: máquina 2 nas laterais, não gosta de conversa"
          />
        </Field>
      </div>
    </Modal>
  );
}
