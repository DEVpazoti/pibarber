"use client";

import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { criarContaBarbearia } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";
import { erroDeTelefone } from "@/lib/telefone";
import { mascaraTelefone } from "@/lib/utils";

/**
 * CRIAR CONTA DE BARBEARIA — o dono cria a conta e a loja de uma vez.
 *
 * Mesmo padrão do FormCriarConta, e pelo mesmo motivo: campos CONTROLADOS e
 * action chamada direto, para um erro não apagar o que já foi digitado.
 *
 * Pede só o que a conta precisa para existir. O resto — endereço, horário,
 * serviços, equipe — é o setup de /configurar, logo em seguida.
 */

type Campo = "nome" | "nomeBarbearia" | "email" | "telefone" | "senha" | "confirmacao";
type Erros = Partial<Record<Campo, string>>;

export function FormCriarBarbearia() {
  const [nome, setNome] = useState("");
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [criada, setCriada] = useState<string | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, iniciar] = useTransition();

  /** Trava síncrona contra duplo envio — ver FormCriarConta. */
  const emVoo = useRef(false);

  const refs: Record<Campo, React.RefObject<HTMLInputElement | null>> = {
    nome: useRef<HTMLInputElement>(null),
    nomeBarbearia: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    telefone: useRef<HTMLInputElement>(null),
    senha: useRef<HTMLInputElement>(null),
    confirmacao: useRef<HTMLInputElement>(null),
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

  function conferirSenhas(nova: string, novaConfirmacao: string) {
    if (novaConfirmacao === "" || nova === novaConfirmacao) {
      limpar("confirmacao");
      return;
    }
    setErros((atual) => ({
      ...atual,
      confirmacao: "As senhas não são iguais.",
    }));
  }

  function enviar() {
    if (emVoo.current) return;

    // O telefone é conferido aqui antes de sair: é o campo que mais se erra, e
    // a resposta do servidor demora uma ida ao banco a mais que os outros.
    const erroTelefone = erroDeTelefone(telefone);
    if (erroTelefone) {
      setErros({ telefone: erroTelefone });
      refs.telefone.current?.focus();
      return;
    }

    emVoo.current = true;
    setErroGeral(null);
    setErros({});

    iniciar(async () => {
      const resultado = await criarContaBarbearia({
        nome,
        nomeBarbearia,
        email,
        telefone,
        senha,
        confirmacao,
      });

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

      // Sem message, a action já redirecionou para /configurar.
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

      <Field
        label="Nome da barbearia"
        htmlFor="nomeBarbearia"
        obrigatorio
        erro={erros.nomeBarbearia}
      >
        <Input
          id="nomeBarbearia"
          ref={refs.nomeBarbearia}
          autoComplete="organization"
          placeholder="Barbearia do Zé"
          value={nomeBarbearia}
          erro={Boolean(erros.nomeBarbearia)}
          onChange={(e) => {
            setNomeBarbearia(e.target.value);
            limpar("nomeBarbearia");
          }}
        />
      </Field>

      <Field label="Seu nome completo" htmlFor="nome" obrigatorio erro={erros.nome}>
        <Input
          id="nome"
          ref={refs.nome}
          autoComplete="name"
          placeholder="Quem é o dono"
          value={nome}
          erro={Boolean(erros.nome)}
          onChange={(e) => {
            setNome(e.target.value);
            limpar("nome");
          }}
        />
      </Field>

      <Field
        label="Celular"
        htmlFor="telefone"
        obrigatorio
        erro={erros.telefone}
        dica="Com DDD. Cada barbearia tem o seu — não dá para repetir o de outra."
      >
        <Input
          id="telefone"
          ref={refs.telefone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98765-4321"
          value={telefone}
          erro={Boolean(erros.telefone)}
          className="tnum"
          onChange={(e) => {
            setTelefone(mascaraTelefone(e.target.value));
            limpar("telefone");
          }}
        />
      </Field>

      <Field label="E-mail" htmlFor="email" obrigatorio erro={erros.email}>
        <Input
          id="email"
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
          ref={refs.senha}
          type={verSenha ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Crie uma senha"
          value={senha}
          erro={Boolean(erros.senha)}
          onChange={(e) => {
            setSenha(e.target.value);
            limpar("senha");
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
        Criar minha barbearia
      </Button>
    </form>
  );
}
