"use client";

import {
  AlertCircle,
  Ban,
  Check,
  MessageCircle,
  Scissors,
  User,
  UserX,
} from "lucide-react";
import { useState, useTransition } from "react";

import { cancelarAgendamento, marcarFalta } from "@/app/actions/appointments";
import { Button, Chip, Sheet } from "@/components/ui";
import { emAberto, STATUS_AGENDAMENTO, type AgendamentoNaAgenda } from "@/lib/types";
import { brl, horaBR, linkWhatsApp, mascaraTelefone } from "@/lib/utils";

/**
 * O detalhe de um agendamento, com tudo que dá para fazer com ele.
 *
 * Abre como gaveta: no celular sobe de baixo e o polegar alcança os botões
 * sem esticar. É a tela que o barbeiro usa de pé, com o cliente na cadeira.
 */

export function AppointmentSheet({
  agendamento,
  aoFechar,
  aoConcluirPedido,
  aoMudar,
}: {
  agendamento: AgendamentoNaAgenda | null;
  aoFechar: () => void;
  /** Passa a bola para o CompleteDialog, que é quem mexe em dinheiro. */
  aoConcluirPedido: (agendamento: AgendamentoNaAgenda) => void;
  aoMudar?: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (!agendamento) return null;

  const status = STATUS_AGENDAMENTO[agendamento.status];
  const aberto = emAberto(agendamento.status);
  const nomeNaCadeira = agendamento.dependente?.full_name ?? agendamento.cliente?.full_name;
  const telefone = agendamento.cliente?.phone ?? "";

  function executar(acao: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui completar.");
        return;
      }
      aoMudar?.();
      aoFechar();
    });
  }

  return (
    <Sheet
      aberto
      aoFechar={aoFechar}
      titulo={`${horaBR(agendamento.starts_at)} — ${horaBR(agendamento.ends_at)}`}
      descricao={agendamento.profissional?.nickname || agendamento.profissional?.name}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Chip tom={status.tom}>{status.rotulo}</Chip>
          <span className="tnum text-lg font-semibold text-ink">
            {brl(agendamento.total_price - agendamento.discount)}
          </span>
        </div>

        {/* --- Quem e o quê -------------------------------------------------- */}
        <ul className="flex flex-col gap-3 rounded-card bg-surface-2 p-4">
          <li className="flex items-start gap-3">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{nomeNaCadeira ?? "Cliente"}</p>
              {agendamento.dependente ? (
                <p className="text-xs text-ink-soft">
                  Responsável: {agendamento.cliente?.full_name}
                </p>
              ) : null}
              {telefone ? (
                <p className="tnum text-xs text-ink-soft">{mascaraTelefone(telefone)}</p>
              ) : null}
            </div>
          </li>

          <li className="flex items-start gap-3">
            <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <p className="text-sm text-ink">
              {agendamento.servicos.join(" + ") || "Sem serviço registrado"}
            </p>
          </li>
        </ul>

        {agendamento.notes ? (
          <p className="rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
            {agendamento.notes}
          </p>
        ) : null}

        {erro ? (
          <p className="flex items-start gap-2 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {erro}
          </p>
        ) : null}

        {/* --- Ações --------------------------------------------------------- */}
        {aberto ? (
          <div className="flex flex-col gap-2">
            <Button
              tamanho="lg"
              larguraTotal
              disabled={ocupado}
              onClick={() => aoConcluirPedido(agendamento)}
              iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
            >
              Concluir atendimento
            </Button>

            {/* "Marcar como confirmado" saiu daqui: escrevia um status que o
                sistema tratava exatamente como "Agendado". Quem quer avisar o
                cliente usa o botão do WhatsApp logo abaixo, que é o que o
                barbeiro já fazia de qualquer forma. */}
            {telefone ? (
              <a
                href={linkWhatsApp(
                  telefone,
                  `Olá, ${nomeNaCadeira ?? ""}! Confirmando seu horário das ${horaBR(agendamento.starts_at)}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-field bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-line"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Chamar no WhatsApp
              </a>
            ) : null}

            <Button
              variante="secondary"
              larguraTotal
              carregando={ocupado}
              onClick={() => executar(() => marcarFalta(agendamento.id))}
              iconeEsquerda={<UserX className="h-4 w-4" aria-hidden />}
            >
              Marcar falta
            </Button>

            {confirmandoCancelamento ? (
              <div className="flex flex-col gap-2 rounded-card border border-danger/30 bg-danger-soft p-3">
                <p className="text-sm text-ink">
                  Cancelar este agendamento? Quem estiver na lista de espera do dia é avisado.
                </p>
                <div className="flex gap-2">
                  <Button
                    variante="dangerSolid"
                    larguraTotal
                    carregando={ocupado}
                    onClick={() => executar(() => cancelarAgendamento(agendamento.id))}
                    iconeEsquerda={<Ban className="h-4 w-4" aria-hidden />}
                  >
                    Sim, cancelar
                  </Button>
                  <Button
                    variante="secondary"
                    larguraTotal
                    onClick={() => setConfirmandoCancelamento(false)}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variante="danger"
                larguraTotal
                onClick={() => setConfirmandoCancelamento(true)}
              >
                Cancelar agendamento
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-soft">
            Este atendimento está {status.rotulo.toLowerCase()} e não tem mais ações.
          </p>
        )}
      </div>
    </Sheet>
  );
}
