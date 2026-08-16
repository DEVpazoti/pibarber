"use client";

import { AlertCircle, CalendarCheck, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { cancelarPorToken, type AgendamentoPorToken } from "@/app/actions/publico";
import { Button, Chip, Modal } from "@/components/ui";
import { STATUS_AGENDAMENTO, type AppointmentStatus } from "@/lib/types";
import { brl, diaPorExtenso, horaBR, linkWhatsApp, mascaraTelefone } from "@/lib/utils";

/**
 * O agendamento de quem não tem conta.
 *
 * Mostra o essencial e oferece UMA ação: cancelar. Remarcar não está aqui de
 * propósito — remarcar é cancelar e agendar de novo, e fazer isso em dois
 * passos explícitos evita o caso de a pessoa perder o horário antigo sem
 * conseguir o novo.
 *
 * O prazo de cancelamento é o mesmo do cliente com conta, e quem decide é o
 * banco (`cancelar_por_token` compara com o `cancel_deadline_hours` da loja).
 * A tela esconde o botão quando o prazo já passou, mas isso é cortesia: se
 * alguém chamar assim mesmo, a função recusa.
 */
export function AcompanharAgendamento({
  agendamento: a,
  token,
}: {
  agendamento: AgendamentoPorToken;
  token: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, iniciar] = useTransition();

  /** Trava síncrona: `cancelando` só existe depois do re-render. */
  const emVoo = useRef(false);

  const status = STATUS_AGENDAMENTO[a.status as AppointmentStatus] ?? {
    rotulo: "Agendado",
    tom: "info" as const,
  };

  const emAberto = a.status === "scheduled" || a.status === "confirmed";

  // O limite calculado no navegador serve só para decidir se o botão aparece.
  // O relógio do aparelho pode estar errado; o do banco, não.
  const limite = new Date(a.starts_at).getTime() - a.cancel_deadline_hours * 3_600_000;
  const dentroDoPrazo = Date.now() < limite;

  function cancelar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setErro(null);

    iniciar(async () => {
      const resultado = await cancelarPorToken(token);
      emVoo.current = false;

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui cancelar.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <span
          className={`mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full ${
            emAberto ? "bg-money-soft text-money" : "bg-surface-2 text-ink-faint"
          }`}
        >
          <CalendarCheck className="h-8 w-8" aria-hidden />
        </span>

        <h1 className="text-2xl leading-tight text-ink">
          {a.cliente_nome ? `Tudo certo, ${a.cliente_nome}` : "Seu agendamento"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{a.shop_nome}</p>

        <div className="mt-2 flex justify-center">
          <Chip tom={status.tom}>{status.rotulo}</Chip>
        </div>
      </div>

      <dl className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Quando</dt>
          <dd className="tnum text-right font-semibold text-brass-deep">
            {diaPorExtenso(a.starts_at.slice(0, 10), true)} às {horaBR(a.starts_at)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Serviço</dt>
          <dd className="text-right font-medium text-ink">{a.servicos ?? "Atendimento"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Profissional</dt>
          <dd className="text-right font-medium text-ink">{a.profissional ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt className="text-ink-soft">Total</dt>
          <dd className="tnum text-right text-lg font-semibold text-ink">
            {brl(a.total_price)}
          </dd>
        </div>
      </dl>

      {/* Como chegar e como falar com a loja. Quem não tem conta não tem o app
          para consultar isso depois — se não estiver aqui, não está em lugar
          nenhum. */}
      {a.shop_endereco || a.shop_telefone || a.shop_whatsapp ? (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          {a.shop_endereco ? (
            <p className="flex items-start gap-2 text-sm text-ink-soft">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              {a.shop_endereco}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {a.shop_whatsapp ? (
              <a
                href={linkWhatsApp(a.shop_whatsapp, `Olá! Tenho horário na ${a.shop_nome}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink hover:bg-line"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            ) : null}

            {a.shop_telefone ? (
              <a
                href={`tel:${a.shop_telefone}`}
                className="inline-flex h-11 items-center gap-2 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink hover:bg-line"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {mascaraTelefone(a.shop_telefone)}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {erro ? (
        <p
          className="flex items-start gap-2 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {emAberto ? (
        dentroDoPrazo ? (
          <Button variante="danger" larguraTotal onClick={() => setConfirmando(true)}>
            Cancelar este horário
          </Button>
        ) : (
          <p className="rounded-card bg-surface-2 px-4 py-3 text-center text-sm text-ink-soft">
            O prazo para cancelar sozinho já passou ({a.cancel_deadline_hours}h antes). Fale
            com a barbearia.
          </p>
        )
      ) : null}

      <div className="rounded-card bg-surface-2 px-4 py-3 text-center">
        <p className="text-sm text-ink-soft">
          Quer parar de depender deste link?{" "}
          <Link href="/criar-conta" className="font-semibold text-brass hover:text-brass-deep">
            Crie sua conta
          </Link>{" "}
          — leva menos de um minuto.
        </p>
      </div>

      <Modal
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Cancelar este horário?"
        descricao={`${diaPorExtenso(a.starts_at.slice(0, 10), true)} às ${horaBR(a.starts_at)}`}
        rodape={
          <div className="flex flex-col gap-2">
            {erro ? (
              <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {erro}
              </p>
            ) : null}
            <Button
              variante="dangerSolid"
              tamanho="lg"
              larguraTotal
              carregando={cancelando}
              onClick={cancelar}
            >
              Sim, cancelar
            </Button>
            <Button variante="ghost" larguraTotal onClick={() => setConfirmando(false)}>
              Manter o horário
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          O horário volta a ficar livre para outra pessoa. Para remarcar, é só agendar de novo
          na página da barbearia — este link continua funcionando.
        </p>
      </Modal>
    </div>
  );
}
