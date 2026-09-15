"use client";

import { AlertCircle, Check, Info, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarAvisosWhatsapp } from "@/app/actions/shop";
import { Button, Chip } from "@/components/ui";
import type { PainelWhatsapp, WhatsappEvent } from "@/lib/types";
import { dataHoraBR } from "@/lib/utils";
import { CATALOGO } from "@/lib/whatsapp/catalogo";
import { STATUS_MENSAGEM, templateIndisponivel } from "@/lib/whatsapp/rotulos";

/**
 * As mensagens de WhatsApp que o PiBarber manda para os clientes desta loja.
 *
 * ---------------------------------------------------------------------------
 * "POR QUE NÃO DÁ PARA EDITAR O TEXTO?"
 * ---------------------------------------------------------------------------
 * É a primeira pergunta de quem abre este arquivo, então a resposta fica aqui.
 *
 * Mensagem que a empresa inicia no WhatsApp oficial só sai por TEMPLATE
 * aprovado pela Meta. Cada texto diferente é um template diferente, com
 * análise própria (de minutos a dias) e risco de reprovação. Se cada
 * barbearia escrevesse o seu, seriam centenas de templates na conta da
 * plataforma — que tem teto de 250 enquanto a empresa não é verificada —,
 * cada edição esperando análise, e loja com mensagem reprovada sem entender
 * por quê.
 *
 * Por isso os textos são FIXOS, da plataforma, e o nome da barbearia entra
 * como parâmetro. O remetente é o PiBarber (é um marketplace), e o que a loja
 * decide é SE cada mensagem sai. Ver CONTEXT §9 e src/lib/whatsapp/catalogo.ts.
 */
export function AvisosWhatsapp({ painel }: { painel: PainelWhatsapp }) {
  const router = useRouter();

  const [ligados, setLigados] = useState<Record<WhatsappEvent, boolean>>(() => ({
    confirmation: painel.eventos.find((e) => e.evento === "confirmation")?.ligado ?? true,
    reminder: painel.eventos.find((e) => e.evento === "reminder")?.ligado ?? true,
    cancellation: painel.eventos.find((e) => e.evento === "cancellation")?.ligado ?? true,
  }));

  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarAvisosWhatsapp(ligados);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Salvo.");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Mensagens de WhatsApp</h2>
        <p className="text-sm text-ink-soft">
          O PiBarber avisa seus clientes pelo WhatsApp oficial da plataforma. Você escolhe quais
          mensagens saem; o texto é o mesmo para todas as barbearias.
        </p>
      </div>

      {!painel.integracaoAtiva ? (
        <p className="flex items-start gap-2 rounded-card bg-surface-2 p-3 text-sm text-ink-soft">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          O envio de mensagens ainda não está ativo. Suas escolhas ficam salvas e passam a valer
          assim que for ligado.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {painel.eventos.map((item) => {
          const catalogo = CATALOGO[item.evento];
          const indisponivel = templateIndisponivel(item.templateStatus);
          const campo = `wa-${item.evento}`;

          return (
            <li
              key={item.evento}
              className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{catalogo.rotulo}</p>
                  <p className="text-xs text-ink-faint">{catalogo.quando}</p>
                </div>

                {item.templateStatus === "pending" ? (
                  <Chip tom="brass">Em análise pela Meta</Chip>
                ) : null}
                {item.templateStatus === "rejected" ? <Chip tom="danger">Reprovado</Chip> : null}
              </div>

              {/* Reprovado, pausado ou desativado: a Meta recusaria cada envio.
                  O interruptor some para o dono não ligar uma coisa que não
                  vai acontecer. */}
              {indisponivel ? (
                <p className="text-sm text-ink-soft">
                  Indisponível no momento
                  {item.templateStatus === "rejected" && item.motivoReprovacao ? (
                    <span className="block text-xs text-ink-faint">
                      Motivo da Meta: {item.motivoReprovacao}
                    </span>
                  ) : null}
                </p>
              ) : (
                <label htmlFor={campo} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input
                    id={campo}
                    type="checkbox"
                    checked={ligados[item.evento]}
                    onChange={(e) =>
                      setLigados((atual) => ({ ...atual, [item.evento]: e.target.checked }))
                    }
                    className="h-5 w-5 accent-brass"
                  />
                  <span className="text-sm text-ink">
                    {ligados[item.evento] ? "Ligada" : "Desligada"}
                  </span>
                </label>
              )}

              <div className="flex items-start gap-2 rounded-card bg-surface-2 p-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-money" aria-hidden />
                <p className="min-w-0 break-words text-sm text-ink-soft">{item.previa}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {erro ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {mensagem ? (
        <p className="flex items-start gap-2 text-sm text-money">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mensagem}
        </p>
      ) : null}

      <Button tamanho="lg" larguraTotal carregando={salvando} onClick={salvar}>
        Salvar mensagens
      </Button>

      {/* --- O que saiu ------------------------------------------------ */}
      <h3 className="mt-2 text-sm font-semibold text-ink">Últimos envios</h3>

      {painel.envios.length === 0 ? (
        <p className="text-sm text-ink-faint">Nenhuma mensagem enviada ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {painel.envios.map((envio) => {
            const status = STATUS_MENSAGEM[envio.status];
            return (
              <li key={envio.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{envio.cliente ?? "Cliente"}</p>
                  <p className="tnum text-xs text-ink-faint">
                    {CATALOGO[envio.evento].rotulo} · {dataHoraBR(envio.criadoEm)}
                  </p>
                  {envio.falha ? <p className="text-xs text-danger">{envio.falha}</p> : null}
                </div>
                <Chip tom={status.tom}>{status.rotulo}</Chip>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
