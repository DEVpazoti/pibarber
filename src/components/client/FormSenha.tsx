"use client";

import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";

import { trocarSenha } from "@/app/actions/client";
import { Button, Field, Input } from "@/components/ui";

/**
 * Trocar a senha. Os três campos com botão de olho — no celular, digitar uma
 * senha às cegas é a receita para errar a confirmação três vezes seguidas.
 */
export function FormSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await trocarSenha({
        senhaAtual: atual,
        novaSenha: nova,
        confirmacao,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui trocar a senha.");
        return;
      }

      setMensagem(resultado.message ?? "Senha alterada.");
      setAtual("");
      setNova("");
      setConfirmacao("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <CampoSenha
        id="atual"
        label="Senha atual"
        valor={atual}
        aoMudar={setAtual}
        autoComplete="current-password"
      />
      <CampoSenha
        id="nova"
        label="Nova senha"
        valor={nova}
        aoMudar={setNova}
        dica="Pelo menos 6 caracteres."
        autoComplete="new-password"
      />
      <CampoSenha
        id="confirmacao"
        label="Confirme a nova senha"
        valor={confirmacao}
        aoMudar={setConfirmacao}
        autoComplete="new-password"
      />

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

      <Button
        tamanho="lg"
        larguraTotal
        carregando={enviando}
        disabled={nova === "" || confirmacao === ""}
        onClick={enviar}
      >
        Alterar senha
      </Button>
    </div>
  );
}

function CampoSenha({
  id,
  label,
  valor,
  aoMudar,
  dica,
  autoComplete,
}: {
  id: string;
  label: string;
  valor: string;
  aoMudar: (v: string) => void;
  dica?: string;
  autoComplete?: string;
}) {
  const [visivel, setVisivel] = useState(false);

  return (
    <Field label={label} htmlFor={id} obrigatorio dica={dica}>
      <Input
        id={id}
        type={visivel ? "text" : "password"}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        iconeDireita={
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            aria-label={visivel ? "Esconder a senha" : "Mostrar a senha"}
            className="grid h-11 w-11 place-items-center rounded-chip text-ink-faint transition-colors hover:text-ink"
          >
            {visivel ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        }
      />
    </Field>
  );
}
