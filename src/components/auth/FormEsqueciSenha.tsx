"use client";

import { useState, useTransition } from "react";

import { pedirNovaSenha } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";
import type { Lado } from "@/lib/lado";

/** Pede o link de redefinir a senha. A resposta é neutra — ver `pedirNovaSenha`. */
export function FormEsqueciSenha({ lado }: { lado: Lado }) {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (enviado) {
    return (
      <p role="status" className="rounded-field bg-money-soft px-3.5 py-3 text-sm text-money">
        {enviado}
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await pedirNovaSenha({ email, lado });
          if (!r.ok) return setErro(r.message ?? "Não consegui enviar.");
          setEnviado(r.message ?? "Enviado.");
        });
      }}
      className="flex flex-col gap-4"
    >
      <Field label="E-mail da sua conta" htmlFor="email" obrigatorio erro={erro ?? undefined}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="voce@exemplo.com"
          value={email}
          erro={Boolean(erro)}
          onChange={(e) => {
            setEmail(e.target.value);
            setErro(null);
          }}
        />
      </Field>
      <Button type="submit" tamanho="lg" larguraTotal carregando={enviando}>
        Enviar link
      </Button>
    </form>
  );
}
