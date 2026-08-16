"use client";

import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { criarConta } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

/**
 * CRIAR CONTA — campos CONTROLADOS, e isso é o ponto do arquivo.
 *
 * A versão anterior usava `useActionState` com `<form action={acao}>`. Nessa
 * combinação o React 19 reseta sozinho todo campo não controlado assim que a
 * action termina — inclusive quando ela termina em ERRO. Errar a confirmação
 * da senha apagava nome, e-mail e senha junto, e a pessoa desistia ali.
 *
 * Guardando os valores em estado e chamando a action direto, nada se perde:
 * o formulário só é limpo quando a conta é criada de verdade.
 *
 * A validação da senha roda enquanto se digita, não só no envio — quem vê o
 * problema antes de tentar enviar não chega a errar.
 */

type Campo = "nome" | "email" | "senha" | "confirmacao";
type Erros = Partial<Record<Campo, string>>;

export function FormCriarConta() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [criada, setCriada] = useState<string | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, iniciar] = useTransition();

  /**
   * Trava síncrona contra duplo envio. `enviando` só fica verdadeiro depois do
   * re-render, e dois toques no mesmo tique passam os dois pelo botão
   * desabilitado. Mesmo padrão do PagarDialog em ComissoesPainel.
   */
  const emVoo = useRef(false);

  const refs: Record<Campo, React.RefObject<HTMLInputElement | null>> = {
    nome: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    senha: useRef<HTMLInputElement>(null),
    confirmacao: useRef<HTMLInputElement>(null),
  };

  /** Some com o erro do campo assim que a pessoa começa a corrigi-lo. */
  function limpar(campo: Campo) {
    setErroGeral(null);
    setErros((atual) => {
      if (!(campo in atual)) return atual;
      const resto = { ...atual };
      delete resto[campo];
      return resto;
    });
  }

  /**
   * A conferência em tempo real das duas senhas.
   *
   * Recebe os valores por parâmetro porque roda no meio do onChange, quando o
   * estado ainda não foi atualizado — ler `senha`/`confirmacao` aqui daria o
   * valor anterior e a mensagem apareceria sempre um caractere atrasada.
   */
  function conferirSenhas(nova: string, novaConfirmacao: string) {
    if (novaConfirmacao === "" || nova === novaConfirmacao) {
      limpar("confirmacao");
      return;
    }
    setErros((atual) => ({ ...atual, confirmacao: "As senhas não são iguais." }));
  }

  function enviar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setErroGeral(null);
    setErros({});

    iniciar(async () => {
      const resultado = await criarConta({ nome, email, senha, confirmacao });

      // Libera para nova tentativa. Nenhum campo é limpo: o caminho de erro
      // devolve a pessoa exatamente onde ela estava.
      emVoo.current = false;

      if (!resultado.ok) {
        const campo = resultado.campo as Campo | undefined;
        const texto = resultado.message ?? "Não consegui criar a conta.";

        if (campo && campo in refs) {
          setErros({ [campo]: texto });
          refs[campo].current?.focus();
        } else {
          setErroGeral(texto);
        }
        return;
      }

      // ok + message = conta criada esperando confirmação de e-mail. Sem
      // message, a action já redirecionou e este código nem chega a rodar.
      if (resultado.message) setCriada(resultado.message);
    });
  }

  if (criada) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-money-soft px-5 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-money" aria-hidden />
        <p className="text-sm text-ink">{criada}</p>
      </div>
    );
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

      <Field label="Nome completo" htmlFor="nome" obrigatorio erro={erros.nome}>
        <Input
          id="nome"
          name="nome"
          ref={refs.nome}
          autoComplete="name"
          placeholder="Como você quer ser chamado"
          value={nome}
          erro={Boolean(erros.nome)}
          onChange={(e) => {
            setNome(e.target.value);
            limpar("nome");
          }}
        />
      </Field>

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

      <Field
        label="Senha"
        htmlFor="senha"
        obrigatorio
        erro={erros.senha}
        dica="Pelo menos 6 caracteres."
      >
        <Input
          id="senha"
          name="senha"
          ref={refs.senha}
          type={verSenha ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Crie uma senha"
          value={senha}
          erro={Boolean(erros.senha)}
          onChange={(e) => {
            setSenha(e.target.value);
            limpar("senha");
            // Já tinha confirmação digitada? Reconfere agora, senão o aviso
            // "as senhas não são iguais" ficaria pendurado depois de a pessoa
            // corrigir justamente o campo de cima.
            conferirSenhas(e.target.value, confirmacao);
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

      <Field label="Repita a senha" htmlFor="confirmacao" obrigatorio erro={erros.confirmacao}>
        <Input
          id="confirmacao"
          name="confirmacao"
          ref={refs.confirmacao}
          type={verSenha ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Digite a senha de novo"
          value={confirmacao}
          erro={Boolean(erros.confirmacao)}
          onChange={(e) => {
            setConfirmacao(e.target.value);
            conferirSenhas(senha, e.target.value);
          }}
          onBlur={(e) => conferirSenhas(senha, e.target.value)}
        />
      </Field>

      <Button type="submit" tamanho="lg" larguraTotal carregando={enviando}>
        Criar minha conta
      </Button>
    </form>
  );
}
