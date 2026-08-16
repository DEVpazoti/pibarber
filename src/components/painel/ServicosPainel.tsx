"use client";

import { AlertCircle, ArrowDown, ArrowUp, Check, Pencil, Plus, Scissors } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  alternarServico,
  moverServico,
  salvarServico,
  type DadosServico,
} from "@/app/actions/services";
import { Button, Chip, EmptyState, Field, Input, Modal, Textarea } from "@/components/ui";
import { brl, cn, duracao, lerValor, numeroBR } from "@/lib/utils";

/**
 * O catálogo de serviços.
 *
 * O ASSISTENTE vê a lista e não vê botão nenhum — `podeEditar` chega falso do
 * servidor. E mesmo que ele forjasse a chamada, a RLS de `services` exige
 * `can_manage_money` na escrita: mexer em preço é mexer em dinheiro.
 */

export type ServicoDaLista = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
};

export function ServicosPainel({
  servicos,
  podeEditar,
}: {
  servicos: ServicoDaLista[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<ServicoDaLista | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  function executar(acao: () => Promise<{ ok: boolean }>) {
    iniciar(async () => {
      await acao();
      router.refresh();
    });
  }

  if (servicos.length === 0) {
    return (
      <>
        <EmptyState
          icone={<Scissors aria-hidden />}
          titulo="Nenhum serviço cadastrado"
          descricao={
            podeEditar
              ? "Sem serviço não dá para agendar. Comece pelo corte que você mais faz."
              : "Peça ao dono para cadastrar os serviços."
          }
          acao={
            podeEditar ? (
              <Button
                onClick={() => setCriando(true)}
                iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
              >
                Cadastrar serviço
              </Button>
            ) : null
          }
        />

        <ServicoDialog
          aberto={criando}
          aoFechar={() => setCriando(false)}
          aoSalvar={() => router.refresh()}
        />
      </>
    );
  }

  return (
    <>
      {podeEditar ? (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => setCriando(true)}
            iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
          >
            Novo serviço
          </Button>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {servicos.map((s, indice) => (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0",
              !s.is_active && "opacity-60",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                {!s.is_active ? <Chip tom="neutro">Desativado</Chip> : null}
              </span>
              <span className="block truncate text-xs text-ink-soft">
                {duracao(s.duration_minutes)}
                {s.description ? ` · ${s.description}` : ""}
              </span>
            </span>

            <span className="tnum shrink-0 text-sm font-semibold text-ink">{brl(s.price)}</span>

            {podeEditar ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={indice === 0 || ocupado}
                  onClick={() => executar(() => moverServico(s.id, "cima"))}
                  aria-label={`Subir ${s.name}`}
                  className="hidden h-11 w-9 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30 sm:grid"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={indice === servicos.length - 1 || ocupado}
                  onClick={() => executar(() => moverServico(s.id, "baixo"))}
                  aria-label={`Descer ${s.name}`}
                  className="hidden h-11 w-9 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30 sm:grid"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>

                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => executar(() => alternarServico(s.id, !s.is_active))}
                  className="h-11 rounded-field px-3 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {s.is_active ? "Desativar" : "Ativar"}
                </button>

                <button
                  type="button"
                  onClick={() => setEditando(s)}
                  aria-label={`Editar ${s.name}`}
                  className="grid h-11 w-11 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <ServicoDialog
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

/* ==========================================================================
   O formulário
   ========================================================================== */

function ServicoDialog({
  aberto,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  inicial?: ServicoDaLista;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("0,00");
  const [minutos, setMinutos] = useState("30");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.name ?? "");
    setDescricao(inicial?.description ?? "");
    setPreco(numeroBR(inicial?.price ?? 0));
    setMinutos(String(inicial?.duration_minutes ?? 30));
    setAtivo(inicial?.is_active ?? true);
    setErro(null);
  }, [aberto, inicial]);

  function enviar() {
    setErro(null);

    const dados: DadosServico = {
      id: inicial?.id,
      nome,
      descricao,
      preco: lerValor(preco) ?? 0,
      duracaoMinutos: Number(minutos),
      ativo,
    };

    iniciar(async () => {
      const resultado = await salvarServico(dados);
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
      titulo={inicial ? "Editar serviço" : "Novo serviço"}
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
        <Field label="Nome" htmlFor="servico-nome" obrigatorio>
          <Input
            id="servico-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Corte masculino"
          />
        </Field>

        <Field label="Descrição" htmlFor="servico-descricao">
          <Textarea
            id="servico-descricao"
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Opcional. Aparece no perfil público da barbearia."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço" htmlFor="servico-preco" obrigatorio>
            <Input
              id="servico-preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="tnum"
            />
          </Field>

          <Field
            label="Duração"
            htmlFor="servico-minutos"
            obrigatorio
            dica="Em minutos. É o que reserva a cadeira."
          >
            <Input
              id="servico-minutos"
              inputMode="numeric"
              value={minutos}
              onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ""))}
              className="tnum"
            />
          </Field>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-5 w-5 accent-brass"
          />
          <span className="text-sm text-ink">
            Ativo — aparece no agendamento e no perfil público
          </span>
        </label>
      </div>
    </Modal>
  );
}
