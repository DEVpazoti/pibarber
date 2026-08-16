"use client";

import { AlertCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { removerDependente, salvarDependente } from "@/app/actions/client";
import { Button, EmptyState, Field, Input, Modal } from "@/components/ui";
import type { Dependent } from "@/lib/types";
import { diaBR } from "@/lib/utils";

/**
 * "Quem eu agendo" — os dependentes.
 *
 * Resolve o "vou levar meu filho" sem obrigar ninguém a criar uma segunda
 * conta. No agendamento, o passo "Para quem?" aparece com o titular em
 * primeiro e estes nomes abaixo — e some inteiro quando a lista está vazia.
 */
export function ListaDependentes({ dependentes }: { dependentes: Dependent[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Dependent | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <>
      {dependentes.length === 0 ? (
        <EmptyState
          icone={<Users aria-hidden />}
          titulo="Nenhuma pessoa cadastrada"
          descricao="Cadastre quem você costuma levar junto — o filho, o irmão — e escolha na hora de agendar."
          acao={<Button onClick={() => setCriando(true)}>Adicionar pessoa</Button>}
        />
      ) : (
        <>
          <ul className="mb-4 overflow-hidden rounded-card border border-line bg-surface">
            {dependentes.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {d.full_name}
                  </span>
                  {d.birth_date ? (
                    <span className="tnum block text-xs text-ink-faint">
                      {/* diaBR: coluna `date` (armadilha nº15). */}
                      Nasceu em {diaBR(d.birth_date)}
                    </span>
                  ) : null}
                </span>

                <button
                  type="button"
                  onClick={() => setEditando(d)}
                  aria-label={`Editar ${d.full_name}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>

                <BotaoRemover id={d.id} aoRemover={() => router.refresh()} />
              </li>
            ))}
          </ul>

          <Button
            variante="secondary"
            larguraTotal
            onClick={() => setCriando(true)}
            iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
          >
            Adicionar pessoa
          </Button>
        </>
      )}

      <DependenteDialog
        aberto={criando || editando !== null}
        inicial={editando ?? undefined}
        aoFechar={() => {
          setCriando(false);
          setEditando(null);
        }}
        aoSalvar={() => router.refresh()}
      />
    </>
  );
}

function BotaoRemover({ id, aoRemover }: { id: string; aoRemover: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (confirmando) {
    return (
      <Button
        variante="dangerSolid"
        tamanho="sm"
        carregando={ocupado}
        onClick={() =>
          iniciar(async () => {
            await removerDependente(id);
            aoRemover();
          })
        }
      >
        Remover
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Remover pessoa"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function DependenteDialog({
  aberto,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  inicial?: Dependent;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.full_name ?? "");
    setNascimento(inicial?.birth_date ?? "");
    setErro(null);
  }, [aberto, inicial]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarDependente({ id: inicial?.id, nome, nascimento });
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      aoSalvar();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? "Editar pessoa" : "Adicionar pessoa"}
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button tamanho="lg" larguraTotal carregando={enviando} onClick={enviar}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="dep-nome" obrigatorio>
          <Input
            id="dep-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Pedro (meu filho)"
          />
        </Field>

        <Field label="Data de nascimento" htmlFor="dep-nascimento">
          <Input
            id="dep-nascimento"
            type="date"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
