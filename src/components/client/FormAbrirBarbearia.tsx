"use client";

import { AlertTriangle, Store } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { abrirMinhaBarbearia } from "@/app/actions/client";
import { Button, Field, Input } from "@/components/ui";
import { erroDeTelefone } from "@/lib/telefone";
import { mascaraTelefone } from "@/lib/utils";

/**
 * O cliente vira dono. Pede só o que a loja precisa para nascer; o resto é o
 * setup de /configurar, para onde a action redireciona.
 *
 * O aviso do topo não é enfeite: a conta passa a ser de barbearia e deixa de
 * entrar no app do cliente. Isso tem de estar dito antes do botão.
 */

type Campo = "nomeBarbearia" | "telefone" | "ciente";

export function FormAbrirBarbearia({
  telefoneAtual,
  agendamentosFuturos,
}: {
  telefoneAtual: string;
  agendamentosFuturos: number;
}) {
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [telefone, setTelefone] = useState(mascaraTelefone(telefoneAtual));
  const [ciente, setCiente] = useState(false);

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
        cienteDosAgendamentos: ciente,
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
          <p className="font-medium text-ink">Sua conta vira a conta da barbearia</p>
          <p className="mt-1">
            Você continua entrando com o mesmo e-mail e senha, mas passa a cair no painel da
            barbearia, e não mais no app de cliente. Para agendar em outras barbearias como cliente,
            crie outra conta com outro e-mail.
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

      {agendamentosFuturos > 0 ? (
        <div className="rounded-card border border-amber/40 bg-brass-soft p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
            Você tem {agendamentosFuturos}{" "}
            {agendamentosFuturos === 1 ? "horário marcado" : "horários marcados"} como cliente
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {agendamentosFuturos === 1 ? "Ele continua valendo" : "Eles continuam valendo"}, mas
            você não vai mais conseguir acompanhar ou cancelar pelo app. Se precisar mudar algo,
            faça antes, ou fale direto com a barbearia.
          </p>
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => {
                setCiente(e.target.checked);
                setErros({});
              }}
              className="h-5 w-5 accent-brass"
            />
            <span className="text-sm text-ink">Entendi, quero continuar</span>
          </label>
          {erros.ciente ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {erros.ciente}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" tamanho="lg" larguraTotal carregando={enviando}>
        Abrir minha barbearia
      </Button>

      <p className="text-center text-xs text-ink-faint">
        Em seguida, a gente configura endereço, horário, serviços e equipe com você.
      </p>
    </form>
  );
}
