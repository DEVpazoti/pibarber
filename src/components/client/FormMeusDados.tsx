"use client";

import { AlertCircle, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { excluirMinhaConta, salvarMeusDados } from "@/app/actions/client";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { GENEROS, type Profile } from "@/lib/types";
import { mascaraTelefone } from "@/lib/utils";

/**
 * Meus Dados.
 *
 * Nome e celular são obrigatórios — o celular é a chave que liga esta pessoa à
 * ficha dela em cada barbearia. Gênero é opcional, com "Outros", e nunca vira
 * campo obrigatório.
 */
export function FormMeusDados({ perfil }: { perfil: Profile }) {
  const router = useRouter();

  const [nome, setNome] = useState(perfil.full_name ?? "");
  const [nascimento, setNascimento] = useState(perfil.birth_date ?? "");
  const [telefone, setTelefone] = useState(mascaraTelefone(perfil.phone ?? ""));
  const [genero, setGenero] = useState(perfil.gender ?? "");

  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [excluindoAberto, setExcluindoAberto] = useState(false);

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarMeusDados({ nome, nascimento, telefone, genero });
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Dados salvos.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome completo" htmlFor="nome" obrigatorio>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>

      <Field label="Data de nascimento" htmlFor="nascimento">
        <Input
          id="nascimento"
          type="date"
          value={nascimento}
          onChange={(e) => setNascimento(e.target.value)}
        />
      </Field>

      <Field label="Celular" htmlFor="telefone" obrigatorio>
        <Input
          id="telefone"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          placeholder="(11) 98765-4321"
        />
      </Field>

      <Field label="Gênero" htmlFor="genero" dica="Opcional.">
        <Select id="genero" value={genero} onChange={(e) => setGenero(e.target.value)}>
          <option value="">Prefiro não informar</option>
          {GENEROS.map((g) => (
            <option key={g.valor} value={g.valor}>
              {g.rotulo}
            </option>
          ))}
        </Select>
      </Field>

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

      <Button tamanho="lg" larguraTotal carregando={salvando} onClick={salvar}>
        Salvar
      </Button>

      {/* --- Excluir conta: destrutivo, texto vermelho, sem caixa --------- */}
      <button
        type="button"
        onClick={() => setExcluindoAberto(true)}
        className="mt-4 h-12 w-full text-center text-sm font-semibold text-danger transition-opacity hover:opacity-80"
      >
        Excluir conta
      </button>

      <ExcluirContaDialog aberto={excluindoAberto} aoFechar={() => setExcluindoAberto(false)} />
    </div>
  );
}

/**
 * A confirmação de exclusão precisa DIZER o que some e o que fica. Um "tem
 * certeza?" seco faz a pessoa clicar sem saber, e depois reclamar do que
 * perdeu.
 */
function ExcluirContaDialog({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, iniciar] = useTransition();

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Excluir sua conta"
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button
            variante="dangerSolid"
            tamanho="lg"
            larguraTotal
            carregando={excluindo}
            onClick={() =>
              iniciar(async () => {
                const resultado = await excluirMinhaConta();
                // Sucesso redireciona e nunca volta. Só o erro chega aqui.
                if (!resultado.ok) setErro(resultado.message ?? "Não consegui excluir.");
              })
            }
          >
            Sim, excluir minha conta
          </Button>
          <Button variante="secondary" larguraTotal onClick={aoFechar}>
            Manter minha conta
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink">Esta ação não tem volta. Vão ser apagados:</p>
        <ul className="list-inside list-disc text-ink-soft">
          <li>seu perfil, endereço e as pessoas que você agenda</li>
          <li>seus favoritos e os últimos acessos</li>
          <li>suas notificações e a lista de espera</li>
          <li>as avaliações que você escreveu</li>
        </ul>
        <p className="rounded-card bg-surface-2 px-4 py-3 text-ink-soft">
          O <strong className="text-ink">histórico de atendimentos</strong> continua com cada
          barbearia onde você foi atendido — é o registro contábil dela, e não pode ser
          apagado por você.
        </p>
      </div>
    </Modal>
  );
}
