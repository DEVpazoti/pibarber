"use client";

import { CreditCard, Eye, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adicionarNota, apagarNota } from "@/app/actions/admin-notas";
import { iniciarVisualizacao } from "@/app/actions/admin-visualizacao";
import { BotaoAlternar } from "@/components/admin/AdminPainel";
import { AssinaturaAdminSheet } from "@/components/admin/AssinaturaAdmin";
import { Button, Textarea } from "@/components/ui";
import { dataHoraBR } from "@/lib/utils";

/**
 * As partes interativas da ficha de uma barbearia no /admin. A página em si
 * é de servidor (src/app/admin/barbearias/[id]/page.tsx); aqui só os botões.
 */

export function AcoesDaFicha({ shopId, bloqueada }: { shopId: string; bloqueada: boolean }) {
  const router = useRouter();
  const [assinaturaAberta, setAssinaturaAberta] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Form com action: o redirect para /painel acontece no servidor, já com
          o cookie de visualização gravado e o registro na auditoria feito. */}
      <form action={iniciarVisualizacao.bind(null, shopId)}>
        <Button type="submit" iconeEsquerda={<Eye className="h-4 w-4" aria-hidden />}>
          Ver como o dono
        </Button>
      </form>
      <Button
        variante="secondary"
        onClick={() => setAssinaturaAberta(true)}
        iconeEsquerda={<CreditCard className="h-4 w-4" aria-hidden />}
      >
        Gerenciar assinatura
      </Button>
      <BotaoAlternar id={shopId} ativa={!bloqueada} aoMudar={() => router.refresh()} />

      <AssinaturaAdminSheet
        shopId={assinaturaAberta ? shopId : null}
        aoFechar={() => setAssinaturaAberta(false)}
        aoMudar={() => router.refresh()}
      />
    </div>
  );
}

export type Nota = { id: string; body: string; created_at: string; autor: string | null };

export function NotasInternas({ shopId, notas }: { shopId: string; notas: Nota[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await adicionarNota(shopId, texto);
      if (!r.ok) return setErro(r.message ?? "Não consegui salvar.");
      setTexto("");
      router.refresh();
    });
  }

  function apagar(id: string) {
    iniciar(async () => {
      const r = await apagarNota(id, shopId);
      if (!r.ok) return setErro(r.message ?? "Não consegui apagar.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: liguei dia 12, vai assinar em outubro"
          aria-label="Nova nota interna"
          maxLength={2000}
        />
        <Button
          tamanho="sm"
          className="self-end"
          carregando={salvando}
          disabled={!texto.trim()}
          onClick={salvar}
        >
          Adicionar nota
        </Button>
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      ) : null}
      {notas.length === 0 ? (
        <p className="text-sm text-ink-faint">Nenhuma nota ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notas.map((n) => (
            <li key={n.id} className="rounded-field bg-surface-2 p-3">
              <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-faint">
                <span>
                  {n.autor ?? "—"} · {dataHoraBR(n.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => apagar(n.id)}
                  aria-label="Apagar nota"
                  className="grid h-8 w-8 place-items-center rounded-chip hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
