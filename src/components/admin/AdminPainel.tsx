"use client";

import { AlertCircle, Copy, ExternalLink, Plus, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { alternarBarbearia, criarBarbearia } from "@/app/actions/admin";
import { Button, Chip, EmptyState, Field, Input, Modal, Rating, Select } from "@/components/ui";
import { ESTADOS } from "@/lib/viacep";
import { dataBR, mascaraTelefone, paraSlug } from "@/lib/utils";

/**
 * A tela do administrador da plataforma: cadastrar barbearias e acompanhar as
 * que existem.
 *
 * A criação é uma tacada só — conta do dono e barbearia juntas — porque um
 * dono sem loja não consegue entrar em lugar nenhum, e uma loja sem dono não
 * existe no modelo (`owner_id` é `not null`).
 */

export type BarbeariaNoAdmin = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  rating_avg: number;
  rating_count: number;
  is_active: boolean;
  created_at: string;
  dono: { full_name: string | null; email: string | null } | null;
};

export function AdminPainel({ barbearias }: { barbearias: BarbeariaNoAdmin[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setAberto(true)}
          iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
        >
          Nova barbearia
        </Button>
      </div>

      {barbearias.length === 0 ? (
        <EmptyState
          icone={<Store aria-hidden />}
          titulo="Nenhuma barbearia cadastrada"
          descricao="Cadastre a primeira: a conta do dono e a loja nascem juntas."
          acao={<Button onClick={() => setAberto(true)}>Cadastrar barbearia</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {barbearias.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{b.name}</span>
                  {b.is_active ? null : <Chip tom="neutro">Desativada</Chip>}
                </p>
                <p className="truncate text-xs text-ink-soft">
                  {b.dono?.full_name ?? "Sem dono"} · {b.dono?.email ?? "—"}
                </p>
                <p className="tnum text-xs text-ink-faint">
                  {[b.city, b.state].filter(Boolean).join(", ") || "Sem cidade"} · criada em{" "}
                  {dataBR(b.created_at)}
                </p>
                <div className="mt-1">
                  <Rating valor={b.rating_avg} quantidade={b.rating_count} />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/b/${b.slug}`}
                  target="_blank"
                  className="inline-flex h-11 items-center gap-1.5 rounded-field px-3 text-sm font-medium text-brass"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Ver
                </Link>

                <BotaoAlternar
                  id={b.id}
                  ativa={b.is_active}
                  aoMudar={() => router.refresh()}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <NovaBarbeariaDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoCriar={() => router.refresh()}
      />
    </>
  );
}

function BotaoAlternar({
  id,
  ativa,
  aoMudar,
}: {
  id: string;
  ativa: boolean;
  aoMudar: () => void;
}) {
  const [ocupado, iniciar] = useTransition();

  return (
    <Button
      variante={ativa ? "ghost" : "secondary"}
      tamanho="sm"
      carregando={ocupado}
      onClick={() =>
        iniciar(async () => {
          await alternarBarbearia(id, !ativa);
          aoMudar();
        })
      }
    >
      {ativa ? "Desativar" : "Ativar"}
    </Button>
  );
}

/* ==========================================================================
   Nova barbearia
   ========================================================================== */

/** Senha provisória fácil de ditar: sem 0/O e sem 1/l. */
function senhaProvisoria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  let saida = "";
  for (let i = 0; i < 5; i += 1) saida += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 3; i += 1) saida += numeros[Math.floor(Math.random() * numeros.length)];
  return saida;
}

function NovaBarbeariaDialog({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [nomeDono, setNomeDono] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeBarbearia, setNomeBarbearia] = useState("");
  const [slug, setSlug] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [telefone, setTelefone] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState<{ email: string; senha: string; slug: string } | null>(
    null,
  );
  const [copiado, setCopiado] = useState(false);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNomeDono("");
    setEmail("");
    setSenha(senhaProvisoria());
    setNomeBarbearia("");
    setSlug("");
    setCidade("");
    setEstado("");
    setTelefone("");
    setErro(null);
    setCriada(null);
    setCopiado(false);
  }, [aberto]);

  function fechar() {
    if (criada) aoCriar();
    aoFechar();
  }

  async function copiar() {
    if (!criada) return;
    try {
      await navigator.clipboard.writeText(
        `E-mail: ${criada.email}\nSenha: ${criada.senha}\nLink: /b/${criada.slug}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (error) {
      console.error("[admin] falha ao copiar:", error);
    }
  }

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarBarbearia({
        nomeDono,
        email,
        senha,
        nomeBarbearia,
        slug: slug || undefined,
        cidade,
        estado,
        telefone,
      });

      if (!resultado.ok || !resultado.data) {
        setErro(resultado.message ?? "Não consegui criar.");
        return;
      }
      setCriada(resultado.data);
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={fechar}
      titulo={criada ? "Barbearia criada" : "Nova barbearia"}
      descricao={
        criada
          ? "Copie os dados e entregue ao dono. Esta senha não aparece de novo."
          : "A conta do dono e a barbearia são criadas juntas."
      }
      rodape={
        criada ? (
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
              Criar barbearia
            </Button>
          </div>
        )
      }
    >
      {criada ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-card bg-surface-2 p-4">
            <p className="text-xs uppercase tracking-wide text-ink-faint">E-mail</p>
            <p className="mb-3 break-all text-sm font-medium text-ink">{criada.email}</p>

            <p className="text-xs uppercase tracking-wide text-ink-faint">Senha provisória</p>
            <p className="tnum mb-3 text-lg font-semibold text-brass-deep">{criada.senha}</p>

            <p className="text-xs uppercase tracking-wide text-ink-faint">Link público</p>
            <p className="break-all text-sm text-ink">/b/{criada.slug}</p>
          </div>

          <Button
            variante="secondary"
            larguraTotal
            onClick={copiar}
            iconeEsquerda={<Copy className="h-4 w-4" aria-hidden />}
          >
            {copiado ? "Copiado!" : "Copiar dados de acesso"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            O dono
          </p>

          <Field label="Nome do dono" htmlFor="adm-dono" obrigatorio>
            <Input
              id="adm-dono"
              value={nomeDono}
              onChange={(e) => setNomeDono(e.target.value)}
            />
          </Field>

          <Field label="E-mail" htmlFor="adm-email" obrigatorio>
            <Input
              id="adm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field label="Senha provisória" htmlFor="adm-senha" obrigatorio dica="Já sugerimos uma.">
            <Input
              id="adm-senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="tnum"
              autoComplete="off"
            />
          </Field>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            A barbearia
          </p>

          <Field label="Nome da barbearia" htmlFor="adm-loja" obrigatorio>
            <Input
              id="adm-loja"
              value={nomeBarbearia}
              onChange={(e) => {
                setNomeBarbearia(e.target.value);
                // O link acompanha o nome enquanto ninguém mexer nele à mão.
                if (slug === "" || slug === paraSlug(nomeBarbearia)) {
                  setSlug(paraSlug(e.target.value));
                }
              }}
            />
          </Field>

          <Field
            label="Link público"
            htmlFor="adm-slug"
            dica={`Fica em /b/${slug || "sua-barbearia"}`}
          >
            <Input
              id="adm-slug"
              value={slug}
              onChange={(e) => setSlug(paraSlug(e.target.value))}
            />
          </Field>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="Cidade" htmlFor="adm-cidade">
              <Input id="adm-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </Field>
            <Field label="Estado" htmlFor="adm-estado">
              <Select id="adm-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">UF</option>
                {ESTADOS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Telefone" htmlFor="adm-telefone">
            <Input
              id="adm-telefone"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
