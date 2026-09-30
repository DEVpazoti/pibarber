"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarIntervaloVolta } from "@/app/actions/admin-emails";
import { Button, Field, Input } from "@/components/ui";

/** O campo do intervalo do e-mail de volta, no /admin/emails. */
export function IntervaloVolta({ inicial }: { inicial: number }) {
  const router = useRouter();
  const [dias, setDias] = useState(String(inicial));
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await salvarIntervaloVolta(Number(dias));
      if (!r.ok) return setErro(r.message ?? "Não consegui salvar.");
      setMensagem(r.message ?? "Salvo.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-48">
        <Field label="Dias depois da última visita" htmlFor="volta-dias" erro={erro ?? undefined}>
          <Input
            id="volta-dias"
            type="number"
            inputMode="numeric"
            min={7}
            max={120}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </Field>
      </div>
      <Button carregando={salvando} onClick={salvar} disabled={Number(dias) === inicial}>
        Salvar
      </Button>
      {mensagem ? <p className="text-sm text-money sm:pb-3">{mensagem}</p> : null}
    </div>
  );
}
