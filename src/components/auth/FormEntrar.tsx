"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { entrar } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

/**
 * ENTRAR — campos controlados, pelo mesmo motivo do FormCriarConta.
 *
 * Com `<form action>` o React 19 limpava os dois campos a cada senha errada.
 * Num formulário de login isso é ainda mais irritante: a pessoa quase sempre
 * acerta o e-mail e erra só a senha, e digitava os dois de novo toda vez.
 *
 * Agora o e-mail fica, o erro aparece embaixo do campo da senha e o foco volta
 * para ela — a correção é uma digitada, não duas.
 */

type Campo = "email" | "senha";
type Erros = Partial<Record<Campo, string>>;

export function FormEntrar({ proximo, erroInicial }: { proximo?: string; erroInicial?: string }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const [erros, setErros] = useState<Erros>({});
  // Nasce com o erro que veio do callback do OAuth pela query string.
  const [erroGeral, setErroGeral] = useState<string | null>(erroInicial ?? null);
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, iniciar] = useTransition();

  /** Trava síncrona: `enviando` só existe depois do re-render. */
  const emVoo = useRef(false);

  const refs: Record<Campo, React.RefObject<HTMLInputElement | null>> = {
    email: useRef<HTMLInputElement>(null),
    senha: useRef<HTMLInputElement>(null),
  };

  function limpar(campo: Campo) {
    setErroGeral(null);
    setErros((atual) => {
      if (!(campo in atual)) return atual;
      const resto = { ...atual };
      delete resto[campo];
      return resto;
    });
  }

  function enviar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setErroGeral(null);
    setErros({});

    iniciar(async () => {
      const resultado = await entrar({ email, senha, proximo });

      // Só chega aqui em caso de erro — o sucesso sai da página por redirect().
      emVoo.current = false;

      const campo = resultado.campo as Campo | undefined;
      const texto = resultado.message ?? "Não consegui entrar.";

      if (campo && campo in refs) {
        setErros({ [campo]: texto });
        refs[campo].current?.focus();
        // Senha errada: limpa SÓ a senha, e só ela. O e-mail fica.
        if (campo === "senha") setSenha("");
      } else {
        setErroGeral(texto);
      }
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="flex flex-col gap-4"
    >
      {erroGeral ? (
        <p role="alert" className="rounded-field bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {erroGeral}
        </p>
      ) : null}

      <Field label="E-mail" htmlFor="email" obrigatorio erro={erros.email}>
        <Input
          id="email"
          name="email"
          ref={refs.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="voce@exemplo.com"
          value={email}
          erro={Boolean(erros.email)}
          onChange={(e) => {
            setEmail(e.target.value);
            limpar("email");
          }}
        />
      </Field>

      <Field label="Senha" htmlFor="senha" obrigatorio erro={erros.senha}>
        <Input
          id="senha"
          name="senha"
          ref={refs.senha}
          type={verSenha ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Sua senha"
          value={senha}
          erro={Boolean(erros.senha)}
          onChange={(e) => {
            setSenha(e.target.value);
            limpar("senha");
          }}
          iconeDireita={
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
              className="grid h-11 w-11 place-items-center rounded-chip text-ink-faint transition-colors hover:text-ink"
            >
              {verSenha ? (
                <EyeOff className="h-4.5 w-4.5" aria-hidden />
              ) : (
                <Eye className="h-4.5 w-4.5" aria-hidden />
              )}
            </button>
          }
        />
      </Field>

      <Button type="submit" tamanho="lg" larguraTotal carregando={enviando}>
        Entrar
      </Button>
    </form>
  );
}
