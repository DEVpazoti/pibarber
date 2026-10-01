"use client";

import {
  AlertCircle,
  Ban,
  Check,
  ChevronRight,
  Copy,
  HandCoins,
  MessageCircle,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";

import { cancelarAgendamento, marcarFalta } from "@/app/actions/appointments";
import { Avatar, Button, Chip, Sheet } from "@/components/ui";
import {
  emAberto,
  STATUS_AGENDAMENTO,
  type AgendamentoNaAgenda,
  type ClienteNoDetalhe,
} from "@/lib/types";
import { brl, cn, dataBR, duracao, horaBR, linkWhatsApp, mascaraTelefone } from "@/lib/utils";

/**
 * O detalhe de um agendamento, com tudo que dá para fazer com ele.
 *
 * No celular sobe de baixo e o polegar alcança os botões sem esticar — é a
 * tela que o barbeiro usa de pé, com o cliente na cadeira. No PC abre como
 * painel lateral, com a agenda visível atrás: antes a gaveta de baixo ocupava
 * a largura inteira do monitor, com botões enormes e pouca informação.
 *
 * O bloco "Cliente" é a ficha DESTA loja (`customers`), carregada junto com a
 * página (`carregarClientesDoDetalhe`). O e-mail não aparece de propósito: a
 * conta é da plataforma, não da barbearia.
 */

export function AppointmentSheet({
  agendamento,
  cliente,
  aoFechar,
  aoConcluirPedido,
  aoMudar,
}: {
  agendamento: AgendamentoNaAgenda | null;
  /** A ficha de quem está na cadeira; nulo se não carregou. */
  cliente: ClienteNoDetalhe | null;
  aoFechar: () => void;
  /** Passa a bola para o CompleteDialog, que é quem mexe em dinheiro. */
  aoConcluirPedido: (agendamento: AgendamentoNaAgenda) => void;
  aoMudar?: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (!agendamento) return null;

  const status = STATUS_AGENDAMENTO[agendamento.status];
  const aberto = emAberto(agendamento.status);
  const titular = agendamento.cliente?.full_name ?? "Cliente";
  const nomeNaCadeira = agendamento.dependente?.full_name ?? titular;
  // Nulo no cliente avulso: sem copiar e sem WhatsApp, e nada quebra.
  const telefone = agendamento.cliente?.phone ?? "";
  const profissional = agendamento.profissional?.nickname || agendamento.profissional?.name;
  const total = agendamento.total_price - agendamento.discount;

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

  async function copiarTelefone() {
    try {
      await navigator.clipboard.writeText(mascaraTelefone(telefone));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o número está na
      // tela, dá para selecionar à mão. Não vale um erro.
    }
  }

  const acoes = aberto ? (
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
      <div className={cn("grid gap-2", telefone && "grid-cols-2")}>
        {telefone ? (
          <a
            href={linkWhatsApp(
              telefone,
              `Olá, ${nomeNaCadeira}! Confirmando seu horário das ${horaBR(agendamento.starts_at)}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-field bg-surface-2 px-3 text-sm font-medium text-ink transition-colors hover:bg-line"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
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
      </div>

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
        <Button variante="danger" larguraTotal onClick={() => setConfirmandoCancelamento(true)}>
          Cancelar agendamento
        </Button>
      )}
    </div>
  ) : (
    <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-soft">
      Este atendimento está {status.rotulo.toLowerCase()} e não tem mais ações.
    </p>
  );

  return (
    <Sheet
      aberto
      aoFechar={aoFechar}
      lado="responsivo"
      titulo={nomeNaCadeira}
      descricao={
        <span className="tnum">
          {dataBR(agendamento.starts_at)} · {horaBR(agendamento.starts_at)}–
          {horaBR(agendamento.ends_at)}
          {profissional ? ` · ${profissional}` : ""}
        </span>
      }
      rodape={acoes}
    >
      <div className="flex flex-col gap-5">
        {/* --- Quem ------------------------------------------------------------ */}
        <div className="flex items-center gap-3">
          <Avatar src={cliente?.fotoUrl} nome={nomeNaCadeira} tamanho="md" />
          <div className="min-w-0 flex-1">
            {telefone ? (
              <div className="flex items-center gap-1">
                <span className="tnum text-sm text-ink">{mascaraTelefone(telefone)}</span>
                <button
                  type="button"
                  onClick={copiarTelefone}
                  aria-label="Copiar telefone"
                  className="grid h-11 w-11 place-items-center rounded-chip text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {copiado ? (
                    <Check className="h-4 w-4 text-money" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                </button>
                <span className="sr-only" aria-live="polite">
                  {copiado ? "Telefone copiado" : ""}
                </span>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Sem celular na ficha</p>
            )}
          </div>
          <Chip tom={status.tom}>{status.rotulo}</Chip>
        </div>

        {/* --- Cliente --------------------------------------------------------- */}
        {cliente ? (
          <Bloco titulo="Cliente">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dado rotulo="Visitas" valor={cliente.visitas} />
              <Dado
                rotulo="Última visita"
                valor={cliente.ultimaVisita ? dataBR(cliente.ultimaVisita) : "Primeira vez"}
              />
              <Dado
                rotulo="Faltas"
                valor={cliente.faltas}
                destaque={cliente.faltas > 0 ? "danger" : undefined}
              />
              {/* Só o dono recebe este número — para o assistente ele nem
                  sai do banco (carregarClientesDoDetalhe). */}
              {cliente.totalGasto !== null ? (
                <>
                  <Dado rotulo="Total gasto" valor={brl(cliente.totalGasto)} />
                  <Dado
                    rotulo="Ticket médio"
                    valor={cliente.visitas > 0 ? brl(cliente.totalGasto / cliente.visitas) : "—"}
                  />
                </>
              ) : null}
            </dl>

            {cliente.fiadoAberto > 0 ? (
              <Link
                href="/painel/fiado"
                className="mt-3 flex min-h-11 items-center gap-2 rounded-field bg-danger-soft px-3 text-sm text-danger transition-opacity hover:opacity-85"
              >
                <HandCoins className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">
                  Fiado em aberto: <strong className="tnum">{brl(cliente.fiadoAberto)}</strong>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            ) : null}

            {cliente.observacoes ? (
              <div className="mt-3">
                <p className="text-xs text-ink-soft">Observações da ficha</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{cliente.observacoes}</p>
              </div>
            ) : null}

            {agendamento.cliente ? (
              <Link
                href={`/painel/clientes/${agendamento.cliente.id}`}
                className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brass-deep hover:underline"
              >
                Ver ficha completa
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </Bloco>
        ) : null}

        {/* --- Atendimento ----------------------------------------------------- */}
        <Bloco titulo="Atendimento">
          {agendamento.itens.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {agendamento.itens.map((item, i) => (
                <li key={`${item.nome}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm text-ink">
                    {item.nome}
                    <span className="tnum ml-1.5 text-xs text-ink-soft">{duracao(item.duracao)}</span>
                  </span>
                  <span className="tnum shrink-0 text-sm text-ink">{brl(item.preco)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">Sem serviço registrado</p>
          )}

          {agendamento.discount > 0 ? (
            <p className="mt-2 flex justify-between text-sm text-ink-soft">
              <span>Desconto</span>
              <span className="tnum">−{brl(agendamento.discount)}</span>
            </p>
          ) : null}

          <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
            <span>Total</span>
            <span className="tnum">{brl(total)}</span>
          </p>

          <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
            <li>
              {agendamento.source === "online" ? "Marcado pelo cliente, online" : "Marcado no balcão"}
            </li>
            {agendamento.dependente ? (
              <li>
                Agendado por {titular} para {agendamento.dependente.full_name}
              </li>
            ) : null}
          </ul>

          {agendamento.notes ? (
            <p className="mt-3 rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
              {agendamento.notes}
            </p>
          ) : null}
        </Bloco>
      </div>
    </Sheet>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">{titulo}</h3>
      {children}
    </section>
  );
}

function Dado({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  destaque?: "danger";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{rotulo}</dt>
      <dd
        className={cn(
          "tnum text-sm font-medium",
          destaque === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}
