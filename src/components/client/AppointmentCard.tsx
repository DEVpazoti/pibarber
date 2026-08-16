"use client";

import { AlertCircle, CalendarPlus, MapPin, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { avaliarAtendimento, cancelarMeuAgendamento } from "@/app/actions/booking";
import { Avatar, Button, Chip, Modal, RatingInput, Textarea } from "@/components/ui";
import { emAberto, STATUS_AGENDAMENTO, type MeuAgendamento } from "@/lib/types";
import { dataBR, horaBR } from "@/lib/utils";

/**
 * O cartão de agendamento do cliente.
 *
 * As ações mudam conforme o status — é o que evita a tela cheia de botão que
 * não faz nada:
 *   agendado → Cancelar · Como chegar
 *   concluído sem avaliação → Avaliar (chamada visível: alimenta a nota)
 *   concluído → Agendar de novo
 */
export function AppointmentCard({ agendamento }: { agendamento: MeuAgendamento }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avaliando, setAvaliando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const status = STATUS_AGENDAMENTO[agendamento.status];
  const loja = agendamento.barbearia;
  const aberto = emAberto(agendamento.status);
  const concluido = agendamento.status === "completed";

  const endereco = [loja?.street, loja?.number, loja?.neighborhood, loja?.city]
    .filter(Boolean)
    .join(", ");

  function cancelar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await cancelarMeuAgendamento(agendamento.id);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui cancelar.");
        setConfirmando(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar src={loja?.logo_url} nome={loja?.name} tamanho="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{loja?.name ?? "Barbearia"}</p>
          <p className="truncate text-xs text-ink-soft">
            {agendamento.servicos.join(", ") || "Atendimento"}
            {agendamento.profissional
              ? ` · ${agendamento.profissional.nickname || agendamento.profissional.name}`
              : ""}
          </p>
        </div>

        <Chip tom={status.tom}>{status.rotulo}</Chip>
      </div>

      <p className="tnum mt-3 text-lg font-semibold text-brass-deep">
        {dataBR(agendamento.starts_at)} às {horaBR(agendamento.starts_at)}
      </p>

      {erro ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {/* --- Ações -------------------------------------------------------- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {aberto ? (
          <>
            {confirmando ? (
              <div className="w-full rounded-card border border-danger/30 bg-danger-soft p-3">
                <p className="text-sm text-ink">
                  Cancelar este horário? A barbearia guarda um prazo mínimo
                  {loja ? ` de ${loja.cancel_deadline_hours}h` : ""} para cancelamento pelo app.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variante="dangerSolid"
                    larguraTotal
                    carregando={ocupado}
                    onClick={cancelar}
                  >
                    Sim, cancelar
                  </Button>
                  <Button
                    variante="secondary"
                    larguraTotal
                    onClick={() => setConfirmando(false)}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variante="secondary"
                tamanho="sm"
                onClick={() => setConfirmando(true)}
                iconeEsquerda={<X className="h-4 w-4" aria-hidden />}
              >
                Cancelar
              </Button>
            )}

            {endereco ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
              >
                <MapPin className="h-4 w-4" aria-hidden />
                Como chegar
              </a>
            ) : null}
          </>
        ) : null}

        {concluido && !agendamento.avaliado ? (
          <Button
            tamanho="sm"
            onClick={() => setAvaliando(true)}
            iconeEsquerda={<Star className="h-4 w-4" aria-hidden />}
          >
            Avaliar
          </Button>
        ) : null}

        {concluido && loja ? (
          <Link
            href={`/b/${loja.slug}/agendar`}
            className="inline-flex h-11 items-center gap-1.5 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Agendar de novo
          </Link>
        ) : null}
      </div>

      <AvaliarDialog
        aberto={avaliando}
        appointmentId={agendamento.id}
        nomeLoja={loja?.name ?? "a barbearia"}
        aoFechar={() => setAvaliando(false)}
        aoAvaliar={() => router.refresh()}
      />
    </article>
  );
}

/* ==========================================================================
   Avaliar
   ========================================================================== */

function AvaliarDialog({
  aberto,
  appointmentId,
  nomeLoja,
  aoFechar,
  aoAvaliar,
}: {
  aberto: boolean;
  appointmentId: string;
  nomeLoja: string;
  aoFechar: () => void;
  aoAvaliar: () => void;
}) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await avaliarAtendimento({ appointmentId, nota, comentario });
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui enviar.");
        return;
      }
      aoAvaliar();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Como foi o atendimento?"
      descricao={nomeLoja}
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
            disabled={nota === 0}
            carregando={enviando}
            onClick={enviar}
          >
            Enviar avaliação
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <RatingInput aoMudar={setNota} />

        <Textarea
          rows={3}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Quer contar mais alguma coisa? (opcional)"
          aria-label="Comentário"
        />
      </div>
    </Modal>
  );
}
