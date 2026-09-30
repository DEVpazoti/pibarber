"use client";

import { useState, useTransition } from "react";

import { redefinirSenha } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

/** A nova senha, com a sessão que o link do e-mail abriu. */
export function FormRedefinirSenha() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erros, setErros] = useState<{ senha?: string; confirmacao?: string; geral?: string }>({});
  const [salvando, iniciar] = useTransition();

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErros({});
        iniciar(async () => {
          // Sucesso sai por redirect; só volta aqui com erro.
          const r = await redefinirSenha({ senha, confirmacao });
          const texto = r.message ?? "Não consegui trocar a senha.";
          if (r.campo === "senha" || r.campo === "confirmacao") setErros({ [r.campo]: texto });
          else setErros({ geral: texto });
        });
      }}
      className="flex flex-col gap-4"
    >
      {erros.geral ? (
        <p role="alert" className="rounded-field bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {erros.geral}
        </p>
      ) : null}
      <Field
        label="Nova senha"
        htmlFor="senha"
        obrigatorio
        dica="Pelo menos 6 caracteres."
        erro={erros.senha}
      >
        <Input
          id="senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          erro={Boolean(erros.senha)}
          onChange={(e) => setSenha(e.target.value)}
        />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirmacao" obrigatorio erro={erros.confirmacao}>
        <Input
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          erro={Boolean(erros.confirmacao)}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </Field>
      <Button type="submit" tamanho="lg" larguraTotal carregando={salvando}>
        Salvar nova senha
      </Button>
    </form>
  );
}
