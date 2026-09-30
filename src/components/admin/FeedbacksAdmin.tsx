"use client";

import { Bug, ImageIcon, Lightbulb, MessageCircle, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { mudarSituacaoFeedback } from "@/app/actions/feedback";
import { Chip, EmptyState, Select } from "@/components/ui";
import { cn, dataHoraBR, linkWhatsApp } from "@/lib/utils";

/**
 * A lista de relatos no /admin. Filtra por situação e por tipo; cada relato
 * mostra o contexto que o sistema juntou (página, papel, plano, navegador), o
 * print e o botão de responder no WhatsApp.
 */

export type RelatoNoAdmin = {
  id: string;
  tipo: "problema" | "sugestao" | "elogio";
  mensagem: string;
  pagina: string | null;
  contexto: Record<string, unknown>;
  status: "novo" | "em_analise" | "resolvido";
  criadoEm: string;
  printUrl: string | null;
  loja: string;
  slug: string | null;
  autor: string;
  telefone: string | null;
};

const TIPO = {
  problema: { rotulo: "Problema", Icone: Bug, tom: "danger" },
  sugestao: { rotulo: "Sugestão", Icone: Lightbulb, tom: "brass" },
  elogio: { rotulo: "Elogio", Icone: ThumbsUp, tom: "money" },
} as const;

const SITUACAO = {
  novo: "Novo",
  em_analise: "Em análise",
  resolvido: "Resolvido",
} as const;

export function FeedbacksAdmin({ relatos }: { relatos: RelatoNoAdmin[] }) {
  const [situacao, setSituacao] = useState<"abertos" | "todos" | RelatoNoAdmin["status"]>(
    "abertos",
  );
  const [tipo, setTipo] = useState<"todos" | RelatoNoAdmin["tipo"]>("todos");

  const visiveis = relatos.filter(
    (r) =>
      (situacao === "todos" ||
        (situacao === "abertos" ? r.status !== "resolvido" : r.status === situacao)) &&
      (tipo === "todos" || r.tipo === tipo),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as typeof situacao)}
          aria-label="Filtrar por situação"
        >
          <option value="abertos">Em aberto</option>
          <option value="novo">Novos</option>
          <option value="em_analise">Em análise</option>
          <option value="resolvido">Resolvidos</option>
          <option value="todos">Todos</option>
        </Select>
        <Select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          aria-label="Filtrar por tipo"
        >
          <option value="todos">Todos os tipos</option>
          <option value="problema">Problemas</option>
          <option value="sugestao">Sugestões</option>
          <option value="elogio">Elogios</option>
        </Select>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icone={<MessageCircle aria-hidden />}
          titulo="Nenhum relato aqui"
          descricao="Quando um barbeiro usar o “Reportar problema” do painel, ele aparece nesta lista."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visiveis.map((r) => (
            <Relato key={r.id} relato={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Relato({ relato: r }: { relato: RelatoNoAdmin }) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const { rotulo, Icone, tom } = TIPO[r.tipo];

  const ctx = r.contexto as {
    papel?: string;
    navegador?: string | null;
    tela?: string | null;
    assinatura?: { status?: string; plano?: string | null } | null;
  };

  function mudar(status: RelatoNoAdmin["status"]) {
    setErro(null);
    iniciar(async () => {
      const res = await mudarSituacaoFeedback(r.id, status);
      if (!res.ok) return setErro(res.message ?? "Não consegui atualizar.");
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "rounded-card border bg-surface p-4",
        r.status === "novo" ? "border-brass" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tom={tom}>
          <Icone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {rotulo}
        </Chip>
        <span className="text-sm font-semibold text-ink">{r.loja}</span>
        <span className="text-sm text-ink-soft">
          · {r.autor}
          {ctx.papel ? ` (${ctx.papel})` : ""}
        </span>
        <span className="tnum ml-auto text-xs text-ink-faint">{dataHoraBR(r.criadoEm)}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.mensagem}</p>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-ink-faint sm:grid-cols-2">
        {r.pagina ? (
          <div>
            <dt className="inline">Página: </dt>
            <dd className="inline text-ink-soft">{r.pagina}</dd>
          </div>
        ) : null}
        {ctx.assinatura ? (
          <div>
            <dt className="inline">Assinatura: </dt>
            <dd className="inline text-ink-soft">
              {ctx.assinatura.plano ?? "sem plano pago"} · {ctx.assinatura.status}
            </dd>
          </div>
        ) : null}
        {ctx.tela ? (
          <div>
            <dt className="inline">Tela: </dt>
            <dd className="inline text-ink-soft">{ctx.tela}</dd>
          </div>
        ) : null}
        {ctx.navegador ? (
          <div className="sm:col-span-2">
            <dt className="inline">Navegador: </dt>
            <dd className="inline break-all text-ink-soft">{ctx.navegador}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {r.printUrl ? (
          <a
            href={r.printUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-field bg-surface-2 px-3 text-sm font-medium text-ink hover:bg-line"
          >
            <ImageIcon className="h-4 w-4" aria-hidden />
            Ver print
          </a>
        ) : null}
        {r.telefone ? (
          <a
            href={linkWhatsApp(
              r.telefone,
              `Olá, ${r.autor.split(" ")[0]}! Aqui é do PiBarber, sobre o relato que você enviou pelo painel: "${r.mensagem.slice(0, 120)}${r.mensagem.length > 120 ? "…" : ""}"`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => (r.status === "novo" ? mudar("em_analise") : undefined)}
            className="inline-flex h-10 items-center gap-1.5 rounded-field bg-money-soft px-3 text-sm font-medium text-money"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Responder no WhatsApp
          </a>
        ) : (
          <span className="text-xs text-ink-faint">Sem telefone para responder.</span>
        )}

        <Select
          value={r.status}
          onChange={(e) => mudar(e.target.value as RelatoNoAdmin["status"])}
          disabled={salvando}
          aria-label="Situação do relato"
          className="ml-auto w-40"
        >
          {Object.entries(SITUACAO).map(([v, rotuloSituacao]) => (
            <option key={v} value={v}>
              {rotuloSituacao}
            </option>
          ))}
        </Select>
      </div>

      {erro ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {erro}
        </p>
      ) : null}
    </li>
  );
}
