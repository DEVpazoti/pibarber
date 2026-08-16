"use client";

import { AlertCircle, Check, Search, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { criarAgendamento } from "@/app/actions/appointments";
import {
  buscarClientes,
  sugerirNomeAvulso,
  type ClienteResumo,
} from "@/app/actions/customers";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import type { ProfissionalNaAgenda, ServicoNaAgenda } from "@/lib/types";
import { agoraSP, brl, cn, diaPorExtenso, duracao, mascaraTelefone } from "@/lib/utils";

/**
 * NOVO AGENDAMENTO pelo painel.
 *
 * ESTE FORMULÁRIO É FEITO PARA SER SALVO SEM SER PREENCHIDO.
 *
 * Muita barbearia trabalha por ordem de chegada: o sujeito entra, senta, corta
 * e vai embora. O barbeiro não vai parar a máquina para digitar nome e telefone
 * de quem já está na cadeira. Por isso, ao abrir, o formulário já vem com:
 *
 *   - o nome sugerido do dia ("Cliente 3"), que ele pode aceitar ou trocar;
 *   - a DATA E A HORA DO MOMENTO DO CLIQUE — abriu às 14:09, vem 14:09;
 *   - o profissional (o primeiro, ou o da coluna clicada na grade).
 *
 * Sobra escolher os serviços e tocar em Agendar. Nenhum campo de cliente é
 * obrigatório.
 *
 * Quem QUER identificar o cliente tem três caminhos, todos opcionais:
 * digitar um nome avulso, buscar quem já tem ficha, ou preencher nome +
 * telefone para a ficha nascer na hora (é o que `book_appointment` faz sozinho
 * quando recebe um telefone que ainda não existe na loja).
 */

type Modo = "rapido" | "busca";

export function NewAppointmentDialog({
  aberto,
  aoFechar,
  aoCriar,
  profissionais,
  servicos,
  /** Pré-preenchimento vindo do clique num vazio da grade. */
  diaInicial,
  horaInicial,
  profissionalInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar?: () => void;
  profissionais: ProfissionalNaAgenda[];
  servicos: ServicoNaAgenda[];
  diaInicial: string;
  horaInicial?: string;
  profissionalInicial?: string;
}) {
  const [modo, setModo] = useState<Modo>("rapido");

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const [buscando, iniciarBusca] = useTransition();
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  /**
   * O nome que o banco sugeriu. Serve para uma coisa só: saber se o barbeiro
   * mexeu no campo. Se não mexeu, mandamos o nome VAZIO e deixamos o banco
   * carimbar o número na hora do insert — assim dois agendamentos criados no
   * mesmo segundo nunca saem como "Cliente 3" os dois.
   */
  const [sugestao, setSugestao] = useState("");

  const [profissionalId, setProfissionalId] = useState(profissionalInicial ?? "");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [dia, setDia] = useState(diaInicial);
  const [hora, setHora] = useState(horaInicial ?? "09:00");
  const [observacao, setObservacao] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();

  // Reabrir o diálogo é sempre começar de novo — menos o que veio do clique
  // na grade, que é justamente o atalho que o barbeiro quis.
  useEffect(() => {
    if (!aberto) return;

    setModo("rapido");
    setTermo("");
    setCliente(null);
    setTelefone("");
    setEscolhidos([]);
    setObservacao("");
    setErro(null);
    setDia(diaInicial);
    setProfissionalId(profissionalInicial ?? profissionais[0]?.id ?? "");

    // A HORA. Veio da grade? é a do vazio que ele tocou. Não veio? é AGORA,
    // no fuso de São Paulo — não o do aparelho, que pode estar em qualquer
    // lugar. Ler o relógio aqui dentro (e não no servidor) é o que faz o campo
    // marcar o instante do clique, e não o instante em que a página carregou.
    setHora(horaInicial ?? agoraSP().hora);

    // A sugestão de nome vem do banco porque o contador é dele. Enquanto não
    // chega, o campo fica vazio — e vazio já é um estado válido para salvar.
    setNome("");
    setSugestao("");
    let valeu = true;
    void sugerirNomeAvulso().then((valor) => {
      if (!valeu || !valor) return;
      setSugestao(valor);
      // `setNome` só aqui: se o barbeiro digitou algo enquanto a sugestão
      // vinha, a resposta tardia não pode apagar o que ele escreveu.
      setNome((atual) => (atual === "" ? valor : atual));
    });

    return () => {
      valeu = false;
    };
  }, [aberto, diaInicial, horaInicial, profissionalInicial, profissionais]);

  // Busca com folga de 300ms: digitar "Jo" não dispara três consultas.
  useEffect(() => {
    if (!aberto || modo !== "busca" || cliente) return;

    const relogio = setTimeout(() => {
      iniciarBusca(async () => {
        const resultado = await buscarClientes(termo);
        if (resultado.ok) setResultados(resultado.data ?? []);
      });
    }, 300);

    return () => clearTimeout(relogio);
  }, [termo, aberto, modo, cliente]);

  const selecionados = useMemo(
    () => servicos.filter((s) => escolhidos.includes(s.id)),
    [servicos, escolhidos],
  );
  const total = selecionados.reduce((acc, s) => acc + s.price, 0);
  const minutos = selecionados.reduce((acc, s) => acc + s.duration_minutes, 0);

  // O CLIENTE NÃO ENTRA AQUI. Só o que o banco realmente precisa para montar
  // um atendimento: quem atende, o que faz e quando.
  const podeEnviar =
    profissionalId !== "" && escolhidos.length > 0 && dia !== "" && hora !== "";

  function alternarServico(id: string) {
    setEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((s) => s !== id) : [...atual, id],
    );
  }

  function enviar() {
    if (!podeEnviar) return;
    setErro(null);

    // Nome intocado = manda vazio e deixa o banco numerar. Ver o comentário de
    // `sugestao` lá em cima.
    const nomeEnviado =
      modo === "busca" && cliente
        ? cliente.full_name
        : nome.trim() === sugestao
          ? ""
          : nome.trim();

    const telefoneEnviado =
      modo === "busca" && cliente ? (cliente.phone ?? "") : telefone;

    iniciarEnvio(async () => {
      const resultado = await criarAgendamento({
        professionalId: profissionalId,
        dia,
        hora,
        serviceIds: escolhidos,
        nome: nomeEnviado,
        telefone: telefoneEnviado,
        observacao,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui criar o agendamento.");
        return;
      }

      aoCriar?.();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Novo agendamento"
      descricao={diaPorExtenso(dia, true)}
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">
              {selecionados.length === 0
                ? "Escolha os serviços"
                : `${selecionados.length} ${selecionados.length === 1 ? "serviço" : "serviços"} · ${duracao(minutos)}`}
            </span>
            <span className="tnum text-lg font-semibold text-ink">{brl(total)}</span>
          </div>

          <Button
            tamanho="lg"
            larguraTotal
            disabled={!podeEnviar}
            carregando={enviando}
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            Agendar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --- Cliente ------------------------------------------------------- */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              Cliente <span className="font-normal text-ink-faint">· opcional</span>
            </p>
            <Button
              variante="ghost"
              tamanho="sm"
              onClick={() => {
                setModo((m) => (m === "busca" ? "rapido" : "busca"));
                setCliente(null);
                setErro(null);
              }}
              iconeEsquerda={
                modo === "busca" ? (
                  <Zap className="h-4 w-4" aria-hidden />
                ) : (
                  <Search className="h-4 w-4" aria-hidden />
                )
              }
            >
              {modo === "busca" ? "Atendimento rápido" : "Buscar cadastrado"}
            </Button>
          </div>

          {modo === "rapido" ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Nome"
                htmlFor="novo-nome"
                dica="Já vem preenchido com o número da vez. Pode trocar por um nome."
              >
                <Input
                  id="novo-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Cliente da vez"
                  autoComplete="off"
                  // Toque no campo já seleciona tudo: trocar "Cliente 3" por um
                  // nome vira digitar por cima, sem apagar letra por letra.
                  onFocus={(e) => {
                    if (e.target.value === sugestao) e.target.select();
                  }}
                />
              </Field>

              <Field
                label="Celular"
                htmlFor="novo-telefone"
                dica="Só se ele quiser ficha. Com o celular, a ficha nasce (ou é reaproveitada) na hora."
              >
                <Input
                  id="novo-telefone"
                  inputMode="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="(11) 98765-4321"
                  autoComplete="off"
                />
              </Field>
            </div>
          ) : cliente ? (
            <div className="flex items-center justify-between gap-3 rounded-field bg-brass-soft px-3.5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{cliente.full_name}</p>
                {cliente.phone ? (
                  <p className="tnum text-xs text-ink-soft">{mascaraTelefone(cliente.phone)}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setCliente(null)}
                aria-label="Escolher outro cliente"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                iconeEsquerda={<Search className="h-4 w-4" aria-hidden />}
                aria-label="Buscar cliente cadastrado"
                autoComplete="off"
              />

              <ul className="max-h-52 overflow-y-auto rounded-field bg-surface-2">
                {resultados.length === 0 ? (
                  <li className="px-3.5 py-4 text-center text-sm text-ink-soft">
                    {buscando
                      ? "Buscando…"
                      : termo
                        ? "Ninguém com esse nome ou telefone. Volte para o atendimento rápido e digite o nome."
                        : "Nenhum cliente cadastrado ainda."}
                  </li>
                ) : (
                  resultados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCliente(c)}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-line"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {c.full_name}
                          </span>
                          <span className="tnum block text-xs text-ink-soft">
                            {mascaraTelefone(c.phone)}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-xs text-ink-faint">
                          {c.total_visits} {c.total_visits === 1 ? "visita" : "visitas"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>

        {/* --- Profissional -------------------------------------------------- */}
        <Field label="Profissional" htmlFor="profissional" obrigatorio>
          <Select
            id="profissional"
            value={profissionalId}
            onChange={(e) => setProfissionalId(e.target.value)}
          >
            {profissionais.length === 0 ? (
              <option value="">Nenhum profissional cadastrado</option>
            ) : null}
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* --- Serviços ------------------------------------------------------ */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">
            Serviços<span className="ml-0.5 text-danger">*</span>
          </p>

          {servicos.length === 0 ? (
            <p className="rounded-field bg-surface-2 px-3.5 py-4 text-sm text-ink-soft">
              Nenhum serviço cadastrado. Cadastre em Serviços para poder agendar.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {servicos.map((s) => {
                const marcado = escolhidos.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => alternarServico(s.id)}
                      aria-pressed={marcado}
                      className={cn(
                        "flex min-h-[52px] w-full items-center gap-3 rounded-field px-3.5 py-2 text-left transition-colors",
                        marcado ? "bg-brass-soft" : "bg-surface-2 hover:bg-line",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
                          marcado ? "border-brass bg-brass" : "border-line-strong",
                        )}
                        aria-hidden
                      >
                        {marcado ? <Check className="h-3.5 w-3.5 text-brass-ink" /> : null}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {s.name}
                        </span>
                        <span className="block text-xs text-ink-soft">
                          {duracao(s.duration_minutes)}
                        </span>
                      </span>

                      <span className="tnum shrink-0 text-sm font-semibold text-ink">
                        {brl(s.price)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* --- Quando --------------------------------------------------------
            Já vem com agora. O barbeiro pode mudar, mas não precisa — que é o
            ponto do atendimento por ordem de chegada. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia" htmlFor="dia" obrigatorio>
            <Input id="dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </Field>
          <Field label="Hora" htmlFor="hora" obrigatorio>
            <Input
              id="hora"
              type="time"
              step={300}
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observação" htmlFor="observacao" dica="Opcional. Fica visível na agenda.">
          <Textarea
            id="observacao"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: vai cortar e fazer a barba, tem pressa"
          />
        </Field>
      </div>
    </Modal>
  );
}
