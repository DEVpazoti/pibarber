"use client";

import { AlertCircle, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { criarAssistente, removerAssistente } from "@/app/actions/team";
import { Button, Field, Input, Modal } from "@/components/ui";

/**
 * ACESSOS — os assistentes, as únicas pessoas além do dono que fazem login
 * neste painel.
 *
 * O dono cria informando nome, e-mail e senha provisória, e a senha aparece na
 * tela para ele copiar e passar na mão. Sem convite, sem e-mail, sem código de
 * resgate: uma tela a menos e um problema a menos.
 *
 * O assistente NUNCA vê Caixa, Comissões, Relatórios, Equipe nem
 * Configurações. Não é o menu escondido que garante isso — é a RLS.
 */

export type AssistenteDaEquipe = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export function EquipeAcessos({ assistentes }: { assistentes: AssistenteDaEquipe[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Acessos</h2>
          <p className="text-sm text-ink-soft">
            Quem entra no painel além de você. O assistente não vê dinheiro.
          </p>
        </div>
        <Button
          tamanho="sm"
          onClick={() => setAberto(true)}
          iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
        >
          Novo acesso
        </Button>
      </div>

      {assistentes.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          Nenhum assistente cadastrado. Crie um acesso para quem atende no balcão marcar
          horário sem enxergar seu faturamento.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {assistentes.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brass-soft text-brass-deep">
                <KeyRound className="h-4 w-4" aria-hidden />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {a.full_name ?? "Assistente"}
                </span>
                <span className="block truncate text-xs text-ink-soft">{a.email}</span>
              </span>

              <BotaoRemoverAcesso id={a.id} aoRemover={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}

      <NovoAcessoDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoCriar={() => router.refresh()}
      />
    </section>
  );
}

function BotaoRemoverAcesso({ id, aoRemover }: { id: string; aoRemover: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (confirmando) {
    return (
      <span className="flex shrink-0 gap-1">
        <Button
          variante="dangerSolid"
          tamanho="sm"
          carregando={ocupado}
          onClick={() =>
            iniciar(async () => {
              await removerAssistente(id);
              aoRemover();
            })
          }
        >
          Remover
        </Button>
        <Button variante="ghost" tamanho="sm" onClick={() => setConfirmando(false)}>
          Não
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label="Remover acesso"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

/* ==========================================================================
   Criar acesso
   ========================================================================== */

/** Senha provisória fácil de ditar por telefone: sem 0/O, sem 1/l. */
function senhaProvisoria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  let saida = "";
  for (let i = 0; i < 5; i += 1) {
    saida += letras[Math.floor(Math.random() * letras.length)];
  }
  for (let i = 0; i < 3; i += 1) {
    saida += numeros[Math.floor(Math.random() * numeros.length)];
  }
  return saida;
}

function NovoAcessoDialog({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviando, iniciar] = useTransition();

  // Abrir é sempre começar do zero, com uma senha nova sugerida — o dono não
  // precisa inventar uma na hora, e nenhuma sobra da vez anterior.
  useEffect(() => {
    if (!aberto) return;
    setNome("");
    setEmail("");
    setSenha(senhaProvisoria());
    setErro(null);
    setCriado(null);
    setCopiado(false);
  }, [aberto]);

  function fechar() {
    if (criado) aoCriar();
    aoFechar();
  }

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarAssistente({ nome, email, senha });
      if (!resultado.ok || !resultado.data) {
        setErro(resultado.message ?? "Não consegui criar o acesso.");
        return;
      }
      setCriado(resultado.data);
    });
  }

  async function copiar() {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(`E-mail: ${criado.email}\nSenha: ${criado.senha}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (error) {
      console.error("[equipe] falha ao copiar para a área de transferência:", error);
    }
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={fechar}
      titulo={criado ? "Acesso criado" : "Novo acesso"}
      descricao={
        criado
          ? "Copie os dados e entregue ao assistente. Esta senha não aparece de novo."
          : "O assistente entra em /entrar com estes dados."
      }
      rodape={
        criado ? (
          <Button tamanho="lg" larguraTotal onClick={fechar}>
            Pronto
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {erro ? (
              <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {erro}
              </p>
            ) : null}
            <Button tamanho="lg" larguraTotal carregando={enviando} onClick={enviar}>
              Criar acesso
            </Button>
          </div>
        )
      }
    >
      {criado ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-card bg-surface-2 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-faint">E-mail</p>
            <p className="mb-3 break-all text-sm font-medium text-ink">{criado.email}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Senha provisória</p>
            <p className="tnum text-lg font-semibold text-brass-deep">{criado.senha}</p>
          </div>

          <Button
            variante="secondary"
            larguraTotal
            onClick={copiar}
            iconeEsquerda={<Copy className="h-4 w-4" aria-hidden />}
          >
            {copiado ? "Copiado!" : "Copiar e-mail e senha"}
          </Button>

          <p className="flex items-start gap-2 rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Peça para ele trocar a senha em Perfil → Segurança assim que entrar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Nome" htmlFor="acesso-nome" obrigatorio>
            <Input
              id="acesso-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
            />
          </Field>

          <Field label="E-mail" htmlFor="acesso-email" obrigatorio>
            <Input
              id="acesso-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="assistente@exemplo.com"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Senha provisória"
            htmlFor="acesso-senha"
            obrigatorio
            dica="Já sugerimos uma. Você pode trocar."
          >
            <Input
              id="acesso-senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="tnum"
              autoComplete="off"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
