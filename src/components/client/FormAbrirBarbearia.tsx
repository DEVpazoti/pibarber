"use client";

import { Store } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { abrirMinhaBarbearia } from "@/app/actions/client";
import { Button, Field, Input } from "@/components/ui";
import { erroDeTelefone } from "@/lib/telefone";
import { mascaraTelefone } from "@/lib/utils";

/**
 * O cliente vira dono. Pede só o que a loja precisa para nascer; o resto é o
 * setup de /configurar, para onde a action redireciona.
 *
 * O aviso do topo diz o que muda: a mesma conta ganha o painel da barbearia
 * e continua cliente (src/lib/lado.ts) — nada do que ela tinha se perde.
 */

type Campo = "nomeBarbearia" | "telefone";

export function FormAbrirBarbearia({ telefoneAtual }: { telefoneAtual: string }) {
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [telefone, setTelefone] = useState(mascaraTelefone(telefoneAtual));

  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const emVoo = useRef(false);

  const refNome = useRef<HTMLInputElement>(null);
  const refTelefone = useRef<HTMLInputElement>(null);

  function enviar() {
    if (emVoo.current) return;

    const erroTelefone = erroDeTelefone(telefone);
    if (erroTelefone) {
      setErros({ telefone: erroTelefone });
      refTelefone.current?.focus();
      return;
    }

    emVoo.current = true;
    setErros({});
    setErroGeral(null);

    iniciar(async () => {
      const resultado = await abrirMinhaBarbearia({
        nomeBarbearia,
        telefone,
      });
      emVoo.current = false;

      // Sucesso redireciona para /configurar; só o erro volta até aqui.
      if (!resultado.ok) {
        const campo = resultado.campo as Campo | undefined;
        const texto = resultado.message ?? "Não consegui abrir a barbearia.";
        if (campo) {
          setErros({ [campo]: texto });
          if (campo === "nomeBarbearia") refNome.current?.focus();
          if (campo === "telefone") refTelefone.current?.focus();
        } else {
          setErroGeral(texto);
        }
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
      <div className="flex gap-3 rounded-card border border-line bg-surface p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-surface-2 text-brass">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <div className="text-sm leading-relaxed text-ink-soft">
          <p className="font-medium text-ink">Uma conta, os dois lados</p>
          <p className="mt-1">
            Você continua com o mesmo e-mail e senha. Pelo “Entrar” da página inicial, cai no painel
            da barbearia; pelo “Sou cliente”, continua agendando como sempre — seus horários e
            favoritos ficam onde estão.
          </p>
        </div>
      </div>

      {erroGeral ? (
        <p role="alert" className="rounded-field bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {erroGeral}
        </p>
      ) : null}

      <Field label="Nome da barbearia" htmlFor="ab-nome" obrigatorio erro={erros.nomeBarbearia}>
        <Input
          id="ab-nome"
          ref={refNome}
          autoComplete="organization"
          placeholder="Barbearia do Zé"
          value={nomeBarbearia}
          erro={Boolean(erros.nomeBarbearia)}
          onChange={(e) => {
            setNomeBarbearia(e.target.value);
            setErros({});
          }}
        />
      </Field>

      <Field
        label="Celular da barbearia"
        htmlFor="ab-telefone"
        obrigatorio
        erro={erros.telefone}
        dica="Com DDD. Cada barbearia tem o seu — não dá para repetir o de outra."
      >
        <Input
          id="ab-telefone"
          ref={refTelefone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="tnum"
          value={telefone}
          erro={Boolean(erros.telefone)}
          onChange={(e) => {
            setTelefone(mascaraTelefone(e.target.value));
            setErros({});
          }}
        />
      </Field>

      <Button type="submit" tamanho="lg" larguraTotal carregando={enviando}>
        Abrir minha barbearia
      </Button>

      <p className="text-center text-xs text-ink-faint">
        Em seguida, a gente configura endereço, horário, serviços e equipe com você.
      </p>
    </form>
  );
}
