"use client";

import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { agendar, entrarNaEspera, horariosDisponiveis } from "@/app/actions/booking";
import { agendarSemLogin } from "@/app/actions/publico";
import { Avatar, Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { erroDeTelefone } from "@/lib/telefone";
import { PERIODOS, type Dependent, type Professional, type Service } from "@/lib/types";
import {
  brl,
  cn,
  diaPorExtenso,
  DIAS_SEMANA_CURTOS,
  duracao,
  mascaraTelefone,
  diaDaSemana,
  somarDias,
} from "@/lib/utils";

/**
 * O FLUXO DE AGENDAMENTO — um passo por tela no celular.
 *
 *   1. Serviço (pode escolher mais de um)
 *   2. Profissional — com "Tanto faz" EM PRIMEIRO: aumenta a conversão
 *   3. Dia e hora — se o dia estiver lotado, oferece a lista de espera
 *   4. Para quem — PULADO quando não há dependentes
 *   5. Confirmação — dá para agendar sem conta, com nome e telefone
 *
 * Sobre corrida: dois clientes podem tocar no mesmo horário no mesmo segundo.
 * Não há checagem preventiva aqui de propósito — a constraint
 * `appointments_no_overlap` resolve no banco, e o que a tela faz é mostrar
 * "esse horário acabou de ser preenchido" e recarregar a grade.
 */

const TANTO_FAZ = "tanto-faz";

type Passo = 1 | 2 | 3 | 4 | 5;

export function BookingWizard({
  shopId,
  slug,
  nomeLoja,
  servicos,
  profissionais,
  dependentes,
  maxDiasAntecedencia,
  nomeInicial,
  telefoneInicial,
  logado,
  permiteSemCadastro,
  /** Hoje, calculado no SERVIDOR — o navegador não decide que dia é. */
  hoje,
}: {
  shopId: string;
  slug: string;
  nomeLoja: string;
  servicos: Service[];
  profissionais: Professional[];
  dependentes: Dependent[];
  maxDiasAntecedencia: number;
  nomeInicial: string;
  telefoneInicial: string;
  logado: boolean;
  /**
   * A barbearia aceita agendamento sem conta? Vem de
   * `barbershops.allow_public_booking`, que nasce DESLIGADO.
   *
   * Desligado, o visitante sem sessão vê um convite para entrar ou criar conta
   * no lugar do formulário — que é exatamente o fluxo que existia antes.
   */
  permiteSemCadastro: boolean;
  hoje: string;
}) {
  const temPassoParaQuem = dependentes.length > 0;

  const [passo, setPasso] = useState<Passo>(1);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [profissionalId, setProfissionalId] = useState<string>(TANTO_FAZ);
  const [dia, setDia] = useState(hoje);
  const [hora, setHora] = useState<string | null>(null);
  const [horaProfissional, setHoraProfissional] = useState<string | null>(null);
  const [dependenteId, setDependenteId] = useState<string>("");
  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState(mascaraTelefone(telefoneInicial));
  const [observacao, setObservacao] = useState("");

  /**
   * O CAMPO-ARMADILHA (honeypot).
   *
   * Fica escondido no formulário e sempre vazio para uma pessoa. Bot que
   * preenche todo `<input>` que encontra o preenche, e o servidor recusa.
   * Custa um estado e barra boa parte do spam automatizado — sem captcha, sem
   * nada para o cliente resolver.
   */
  const [armadilha, setArmadilha] = useState("");

  /** O erro do telefone, conferido enquanto se digita. */
  const [erroTelefone, setErroTelefone] = useState<string | null>(null);

  const [horarios, setHorarios] = useState<{ hora: string; professionalId: string }[] | null>(
    null,
  );
  const [carregandoHorarios, iniciarHorarios] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  /** `token` só existe no agendamento sem conta — é o link de acompanhamento. */
  const [pronto, setPronto] = useState<{ token?: string } | null>(null);
  const [esperaAberta, setEsperaAberta] = useState(false);

  const selecionados = useMemo(
    () => servicos.filter((s) => escolhidos.includes(s.id)),
    [servicos, escolhidos],
  );
  const total = selecionados.reduce((acc, s) => acc + Number(s.price), 0);
  const minutos = selecionados.reduce((acc, s) => acc + s.duration_minutes, 0);

  // A tira de datas: de hoje até o limite de antecedência da barbearia.
  const dias = useMemo(() => {
    const quantos = Math.min(Math.max(maxDiasAntecedencia, 1), 60);
    return Array.from({ length: quantos }, (_, i) => somarDias(hoje, i));
  }, [hoje, maxDiasAntecedencia]);

  // Busca os horários toda vez que o dia, o profissional ou a duração mudam.
  useEffect(() => {
    if (passo !== 3 || minutos === 0) return;

    const ids =
      profissionalId === TANTO_FAZ ? profissionais.map((p) => p.id) : [profissionalId];
    if (ids.length === 0) return;

    setHorarios(null);
    setHora(null);

    iniciarHorarios(async () => {
      const resultado = await horariosDisponiveis({
        professionalIds: ids,
        dia,
        duracaoMinutos: minutos,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui carregar os horários.");
        setHorarios([]);
        return;
      }
      setErro(null);
      setHorarios(resultado.data ?? []);
    });
  }, [passo, dia, profissionalId, minutos, profissionais]);

  function avancar() {
    setErro(null);
    if (passo === 3 && !temPassoParaQuem) setPasso(5);
    else setPasso((p) => Math.min(5, p + 1) as Passo);
  }

  function voltar() {
    setErro(null);
    if (passo === 5 && !temPassoParaQuem) setPasso(3);
    else setPasso((p) => Math.max(1, p - 1) as Passo);
  }

  /**
   * O horário foi tomado no meio do caminho: recarrega a grade e volta para o
   * passo de escolher a hora. Vale para os dois caminhos de envio.
   */
  function tratarErro(mensagem: string) {
    if (mensagem.includes("já tem atendimento") || mensagem.includes("não está mais disponível")) {
      setErro("Esse horário acabou de ser preenchido. Escolha outro.");
      setHora(null);
      setPasso(3);
      return;
    }
    setErro(mensagem);
  }

  function enviar() {
    if (!hora) return;

    // O telefone é conferido antes de sair do navegador. A regra que VALE está
    // no Postgres e roda de novo lá — esta só evita uma ida e volta à toa.
    const problema = erroDeTelefone(telefone);
    if (!logado && problema) {
      setErroTelefone(problema);
      setErro(problema);
      return;
    }

    setErro(null);

    iniciarEnvio(async () => {
      // ------------------------------------------------------------------
      // DOIS CAMINHOS, e eles não se misturam.
      //
      // Com sessão: `agendar`, que vincula o perfil, permite dependente e usa
      // o cliente com cookie (a RLS continua valendo).
      //
      // Sem sessão: `agendarSemLogin`, que passa pelos limites anti-abuso e
      // devolve o token de acompanhamento. Só existe se a loja tiver ligado a
      // opção — e o servidor recusa mesmo que a tela seja burlada.
      // ------------------------------------------------------------------
      if (!logado) {
        const resultado = await agendarSemLogin({
          shopId,
          professionalId: horaProfissional ?? profissionalId,
          dia,
          hora,
          serviceIds: escolhidos,
          nome,
          telefone,
          observacao,
          armadilha,
        });

        if (!resultado.ok || !resultado.data) {
          tratarErro(resultado.message ?? "Não consegui agendar.");
          return;
        }

        setPronto({ token: resultado.data.token });
        return;
      }

      const resultado = await agendar({
        shopId,
        professionalId: horaProfissional ?? profissionalId,
        dia,
        hora,
        serviceIds: escolhidos,
        dependentId: dependenteId || null,
        nome,
        telefone,
        observacao,
      });

      if (!resultado.ok || !resultado.data) {
        tratarErro(resultado.message ?? "Não consegui agendar.");
        return;
      }

      setPronto({});
    });
  }

  /* ======================================================================
     Sucesso
     ====================================================================== */
  if (pronto) {
    return (
      <ConfirmacaoFinal
        nomeLoja={nomeLoja}
        dia={dia}
        hora={hora ?? ""}
        minutos={minutos}
        servicos={selecionados.map((s) => s.name)}
        logado={logado}
        token={pronto.token}
      />
    );
  }

  const podeAvancar =
    (passo === 1 && escolhidos.length > 0) ||
    passo === 2 ||
    (passo === 3 && hora !== null) ||
    passo === 4;

  const numeroDePassos = temPassoParaQuem ? 5 : 4;
  const passoVisual = temPassoParaQuem ? passo : passo === 5 ? 4 : passo;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* --- Cabeçalho com progresso ---------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[560px] items-center gap-2 px-4 py-3">
          {passo === 1 ? (
            <Link
              href={`/b/${slug}`}
              aria-label="Voltar para a barbearia"
              className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-2"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={voltar}
              aria-label="Voltar"
              className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-chip text-ink-soft transition-colors hover:bg-surface-2"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{nomeLoja}</p>
            <p className="tnum text-xs text-ink-faint">
              Passo {passoVisual} de {numeroDePassos}
            </p>
          </div>
        </div>

        <div className="h-1 w-full bg-surface-2">
          <div
            className="h-full bg-brass transition-all duration-300"
            style={{ width: `${(passoVisual / numeroDePassos) * 100}%` }}
          />
        </div>
      </header>

      {/* --- Conteúdo --------------------------------------------------- */}
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-5">
        {passo === 1 ? (
          <PassoServico
            servicos={servicos}
            escolhidos={escolhidos}
            aoAlternar={(id) =>
              setEscolhidos((atual) =>
                atual.includes(id) ? atual.filter((s) => s !== id) : [...atual, id],
              )
            }
          />
        ) : null}

        {passo === 2 ? (
          <PassoProfissional
            profissionais={profissionais}
            escolhido={profissionalId}
            aoEscolher={setProfissionalId}
          />
        ) : null}

        {passo === 3 ? (
          <PassoDiaEHora
            dias={dias}
            dia={dia}
            aoEscolherDia={setDia}
            horarios={horarios}
            carregando={carregandoHorarios}
            hora={hora}
            aoEscolherHora={(h, prof) => {
              setHora(h);
              setHoraProfissional(prof);
            }}
            aoEntrarNaEspera={() => setEsperaAberta(true)}
          />
        ) : null}

        {passo === 4 ? (
          <PassoParaQuem
            dependentes={dependentes}
            escolhido={dependenteId}
            aoEscolher={setDependenteId}
            nomeTitular={nomeInicial || "Para mim"}
          />
        ) : null}

        {passo === 5 ? (
          <PassoConfirmacao
            nomeLoja={nomeLoja}
            servicos={selecionados.map((s) => s.name)}
            total={total}
            minutos={minutos}
            dia={dia}
            hora={hora ?? ""}
            profissional={
              profissionais.find((p) => p.id === (horaProfissional ?? profissionalId))
            }
            nome={nome}
            telefone={telefone}
            observacao={observacao}
            logado={logado}
            permiteSemCadastro={permiteSemCadastro}
            erroTelefone={erroTelefone}
            armadilha={armadilha}
            aoMudarNome={setNome}
            aoMudarTelefone={(v) => {
              setTelefone(mascaraTelefone(v));
              // Só reclama depois que o número tem tamanho de número: acusar
              // "faltam dígitos" no segundo caractere é pura implicância.
              const digitos = v.replace(/\D/g, "");
              setErroTelefone(digitos.length >= 10 ? erroDeTelefone(v) : null);
            }}
            aoBorrarTelefone={() => setErroTelefone(erroDeTelefone(telefone))}
            aoMudarObservacao={setObservacao}
            aoMudarArmadilha={setArmadilha}
          />
        ) : null}

        {erro ? (
          <p
            className="mt-4 flex items-start gap-2 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {erro}
          </p>
        ) : null}
      </main>

      {/* --- Rodapé fixo ------------------------------------------------ */}
      <footer className="sticky bottom-0 border-t border-line bg-surface/95 px-4 pb-safe pt-3 backdrop-blur">
        <div className="mx-auto max-w-[560px] pb-3">
          {selecionados.length > 0 ? (
            <p className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">
                {selecionados.length}{" "}
                {selecionados.length === 1 ? "serviço" : "serviços"} · {duracao(minutos)}
              </span>
              <span className="tnum text-lg font-semibold text-ink">{brl(total)}</span>
            </p>
          ) : null}

          {passo === 5 && !logado && !permiteSemCadastro ? (
            // A loja exige cadastro. O botão vira o caminho para a conta — e
            // o `proximo` traz a pessoa de volta para esta página depois.
            <Link
              href={`/entrar?proximo=${encodeURIComponent(`/b/${slug}/agendar`)}`}
              className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass text-base font-medium text-brass-ink"
            >
              Entrar para confirmar
            </Link>
          ) : passo === 5 ? (
            <Button
              tamanho="lg"
              larguraTotal
              carregando={enviando}
              onClick={enviar}
              iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
            >
              Confirmar agendamento
            </Button>
          ) : (
            <Button tamanho="lg" larguraTotal disabled={!podeAvancar} onClick={avancar}>
              Continuar
            </Button>
          )}
        </div>
      </footer>

      <EsperaDialog
        aberto={esperaAberta}
        shopId={shopId}
        dia={dia}
        profissionalId={profissionalId === TANTO_FAZ ? null : profissionalId}
        serviceId={escolhidos[0] ?? null}
        logado={logado}
        aoFechar={() => setEsperaAberta(false)}
      />
    </div>
  );
}

/* ==========================================================================
   Passo 1 — serviço
   ========================================================================== */

function PassoServico({
  servicos,
  escolhidos,
  aoAlternar,
}: {
  servicos: Service[];
  escolhidos: string[];
  aoAlternar: (id: string) => void;
}) {
  return (
    <section>
      <h1 className="mb-1 text-2xl leading-tight text-ink">O que você quer fazer?</h1>
      <p className="mb-4 text-sm text-ink-soft">Dá para escolher mais de um.</p>

      {servicos.length === 0 ? (
        <p className="rounded-card bg-surface-2 px-4 py-6 text-center text-sm text-ink-soft">
          Esta barbearia ainda não cadastrou serviços.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {servicos.map((s) => {
            const marcado = escolhidos.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => aoAlternar(s.id)}
                  aria-pressed={marcado}
                  className={cn(
                    "flex min-h-[64px] w-full items-center gap-3 rounded-card border p-3 text-left transition-colors",
                    marcado
                      ? "border-brass bg-brass-soft"
                      : "border-line bg-surface hover:bg-surface-2",
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
                    <span className="block text-sm font-medium text-ink">{s.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {duracao(s.duration_minutes)}
                      {s.description ? ` · ${s.description}` : ""}
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-sm font-semibold text-ink">
                    {brl(Number(s.price))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ==========================================================================
   Passo 2 — profissional
   ========================================================================== */

function PassoProfissional({
  profissionais,
  escolhido,
  aoEscolher,
}: {
  profissionais: Professional[];
  escolhido: string;
  aoEscolher: (id: string) => void;
}) {
  return (
    <section>
      <h1 className="mb-1 text-2xl leading-tight text-ink">Com quem?</h1>
      <p className="mb-4 text-sm text-ink-soft">
        “Tanto faz” costuma abrir mais horários — o sistema encaixa com quem estiver livre.
      </p>

      <ul className="flex flex-col gap-2">
        {/* "Tanto faz" EM PRIMEIRO, de propósito. */}
        <li>
          <button
            type="button"
            onClick={() => aoEscolher(TANTO_FAZ)}
            aria-pressed={escolhido === TANTO_FAZ}
            className={cn(
              "flex min-h-[64px] w-full items-center gap-3 rounded-card border p-3 text-left transition-colors",
              escolhido === TANTO_FAZ
                ? "border-brass bg-brass-soft"
                : "border-line bg-surface hover:bg-surface-2",
            )}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-soft">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Tanto faz</span>
              <span className="block text-xs text-ink-soft">Quem tiver horário livre</span>
            </span>
          </button>
        </li>

        {profissionais.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => aoEscolher(p.id)}
              aria-pressed={escolhido === p.id}
              className={cn(
                "flex min-h-[64px] w-full items-center gap-3 rounded-card border p-3 text-left transition-colors",
                escolhido === p.id
                  ? "border-brass bg-brass-soft"
                  : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <Avatar src={p.avatar_url} nome={p.name} tamanho="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">
                  {p.nickname || p.name}
                </span>
                {p.bio ? (
                  <span className="line-clamp-1 text-xs text-ink-soft">{p.bio}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ==========================================================================
   Passo 3 — dia e hora
   ========================================================================== */

function PassoDiaEHora({
  dias,
  dia,
  aoEscolherDia,
  horarios,
  carregando,
  hora,
  aoEscolherHora,
  aoEntrarNaEspera,
}: {
  dias: string[];
  dia: string;
  aoEscolherDia: (d: string) => void;
  horarios: { hora: string; professionalId: string }[] | null;
  carregando: boolean;
  hora: string | null;
  aoEscolherHora: (hora: string, professionalId: string) => void;
  aoEntrarNaEspera: () => void;
}) {
  return (
    <section>
      <h1 className="mb-1 text-2xl leading-tight text-ink">Quando?</h1>
      <p className="mb-4 text-sm text-ink-soft">{diaPorExtenso(dia, true)}</p>

      {/* Tira de datas na horizontal */}
      {/* `min-w-0`: sem ele o container de rolagem não encolhe (item de flex
          nasce com `min-width: auto`) e a tira de datas estica a tela toda. */}
      <ul className="mb-5 flex min-w-0 gap-2 overflow-x-auto no-scrollbar pb-1">
        {dias.map((d) => {
          const ativo = d === dia;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => aoEscolherDia(d)}
                aria-pressed={ativo}
                className={cn(
                  "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-card border transition-colors",
                  ativo
                    ? "border-brass bg-brass text-brass-ink"
                    : "border-line bg-surface text-ink hover:bg-surface-2",
                )}
              >
                <span className="text-[11px] uppercase opacity-80">
                  {DIAS_SEMANA_CURTOS[diaDaSemana(d)]}
                </span>
                <span className="tnum text-lg font-semibold">{d.slice(8, 10)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {carregando || horarios === null ? (
        <ul className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="skeleton h-12 rounded-field" aria-hidden />
          ))}
        </ul>
      ) : horarios.length === 0 ? (
        /* Dia lotado ou fechado: oferecer a fila é melhor que um vazio inútil. */
        <div className="rounded-card border border-line bg-surface p-5 text-center">
          <span className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-faint">
            <Clock className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-base font-semibold text-ink">Nenhum horário livre neste dia</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
            Entre na lista de espera: se alguém desmarcar, a gente te avisa na hora.
          </p>
          <div className="mt-3">
            <Button onClick={aoEntrarNaEspera}>Entrar na lista de espera</Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {horarios.map((h) => {
            const ativo = hora === h.hora;
            return (
              <li key={h.hora}>
                <button
                  type="button"
                  onClick={() => aoEscolherHora(h.hora, h.professionalId)}
                  aria-pressed={ativo}
                  className={cn(
                    "tnum h-12 w-full rounded-field border text-sm font-medium transition-colors",
                    ativo
                      ? "border-brass bg-brass text-brass-ink"
                      : "border-line bg-surface text-ink hover:bg-surface-2",
                  )}
                >
                  {h.hora}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ==========================================================================
   Passo 4 — para quem
   ========================================================================== */

function PassoParaQuem({
  dependentes,
  escolhido,
  aoEscolher,
  nomeTitular,
}: {
  dependentes: Dependent[];
  escolhido: string;
  aoEscolher: (id: string) => void;
  nomeTitular: string;
}) {
  return (
    <section>
      <h1 className="mb-1 text-2xl leading-tight text-ink">Para quem é?</h1>
      <p className="mb-4 text-sm text-ink-soft">
        A barbearia vê o nome de quem vai sentar na cadeira.
      </p>

      <ul className="flex flex-col gap-2">
        {[{ id: "", full_name: nomeTitular }, ...dependentes].map((pessoa) => {
          const ativo = escolhido === pessoa.id;
          return (
            <li key={pessoa.id || "titular"}>
              <button
                type="button"
                onClick={() => aoEscolher(pessoa.id)}
                aria-pressed={ativo}
                className={cn(
                  "flex min-h-[56px] w-full items-center gap-3 rounded-card border p-3 text-left transition-colors",
                  ativo
                    ? "border-brass bg-brass-soft"
                    : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <Avatar nome={pessoa.full_name} tamanho="sm" />
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                  {pessoa.id === "" ? `${pessoa.full_name} (eu)` : pessoa.full_name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ==========================================================================
   Passo 5 — confirmação
   ========================================================================== */

function PassoConfirmacao({
  nomeLoja,
  servicos,
  total,
  minutos,
  dia,
  hora,
  profissional,
  nome,
  telefone,
  observacao,
  logado,
  permiteSemCadastro,
  erroTelefone,
  armadilha,
  aoMudarNome,
  aoMudarTelefone,
  aoBorrarTelefone,
  aoMudarObservacao,
  aoMudarArmadilha,
}: {
  nomeLoja: string;
  servicos: string[];
  total: number;
  minutos: number;
  dia: string;
  hora: string;
  profissional?: Professional;
  nome: string;
  telefone: string;
  observacao: string;
  logado: boolean;
  permiteSemCadastro: boolean;
  erroTelefone: string | null;
  armadilha: string;
  aoMudarNome: (v: string) => void;
  aoMudarTelefone: (v: string) => void;
  aoBorrarTelefone: () => void;
  aoMudarObservacao: (v: string) => void;
  aoMudarArmadilha: (v: string) => void;
}) {
  /** Visitante numa loja que exige cadastro: nada de formulário. */
  const exigeConta = !logado && !permiteSemCadastro;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl leading-tight text-ink">Confirme</h1>
        <p className="text-sm text-ink-soft">Confira antes de fechar.</p>
      </div>

      <dl className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Barbearia</dt>
          <dd className="text-right font-medium text-ink">{nomeLoja}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Serviço</dt>
          <dd className="text-right font-medium text-ink">{servicos.join(" + ")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Profissional</dt>
          <dd className="text-right font-medium text-ink">
            {profissional ? profissional.nickname || profissional.name : "Quem estiver livre"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Quando</dt>
          <dd className="tnum text-right font-semibold text-brass-deep">
            {diaPorExtenso(dia, true)} às {hora}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt className="text-ink-soft">Total · {duracao(minutos)}</dt>
          <dd className="tnum text-right text-lg font-semibold text-ink">{brl(total)}</dd>
        </div>
      </dl>

      {exigeConta ? (
        <div className="rounded-card border border-line bg-surface p-5 text-center">
          <p className="text-base font-semibold text-ink">Falta só entrar na sua conta</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
            Esta barbearia pede cadastro para agendar. Leva menos de um minuto — e depois
            você acompanha, cancela e avalia tudo pelo app.
          </p>
        </div>
      ) : (
        <>
          {!logado ? (
            <p className="rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
              Você pode agendar sem criar conta. A gente te dá um link para acompanhar e
              cancelar — guarde ele.
            </p>
          ) : null}

          <Field label="Seu nome" htmlFor="conf-nome" obrigatorio>
            <Input
              id="conf-nome"
              autoComplete="name"
              value={nome}
              onChange={(e) => aoMudarNome(e.target.value)}
            />
          </Field>

          <Field
            label="Seu celular"
            htmlFor="conf-telefone"
            obrigatorio
            erro={erroTelefone}
            dica="É por ele que a barbearia te encontra."
          >
            <Input
              id="conf-telefone"
              inputMode="tel"
              autoComplete="tel"
              value={telefone}
              erro={Boolean(erroTelefone)}
              onChange={(e) => aoMudarTelefone(e.target.value)}
              onBlur={aoBorrarTelefone}
              placeholder="(11) 98765-4321"
            />
          </Field>

          <Field label="Observação" htmlFor="conf-obs" dica="Opcional.">
            <Textarea
              id="conf-obs"
              rows={2}
              value={observacao}
              onChange={(e) => aoMudarObservacao(e.target.value)}
              placeholder="Algo que o barbeiro precise saber"
            />
          </Field>

          {/* ------------------------------------------------------------
              O CAMPO-ARMADILHA.
              Escondido de gente e de leitor de tela, visível para o robô que
              varre o HTML e preenche todo input. Preenchido = o servidor
              recusa e registra.

              Escondido com posicionamento fora da tela, e NÃO com
              `display:none` ou `type=hidden`: bot bom ignora o que está
              claramente oculto, e aí a armadilha não pegaria ninguém.
              `tabindex=-1` e `autocomplete=off` mantêm gerenciador de senhas
              e navegação por teclado longe dele.
              ------------------------------------------------------------ */}
          <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
            <label htmlFor="conf-site">Não preencha este campo</label>
            <input
              id="conf-site"
              name="site"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={armadilha}
              onChange={(e) => aoMudarArmadilha(e.target.value)}
            />
          </div>
        </>
      )}
    </section>
  );
}

/* ==========================================================================
   Sucesso
   ========================================================================== */

function ConfirmacaoFinal({
  nomeLoja,
  dia,
  hora,
  minutos,
  servicos,
  logado,
  token,
}: {
  nomeLoja: string;
  dia: string;
  hora: string;
  minutos: number;
  servicos: string[];
  logado: boolean;
  /** Só no agendamento sem conta: a chave do link de acompanhamento. */
  token?: string;
}) {
  /**
   * O arquivo .ics é montado aqui e baixado como data URL.
   *
   * Datas em UTC, com o −3 do Brasil somado de volta: um .ics com fuso errado
   * põe o corte de cabelo três horas fora do lugar no calendário.
   */
  function baixarICS() {
    const [ano = 0, mes = 1, d = 1] = dia.split("-").map(Number);
    const [h = 0, m = 0] = hora.split(":").map(Number);

    const inicio = new Date(Date.UTC(ano, mes - 1, d, h + 3, m));
    const fim = new Date(inicio.getTime() + minutos * 60_000);
    const paraICS = (data: Date) => data.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const conteudo = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PiBarber//PT-BR//",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@pibarber`,
      `DTSTAMP:${paraICS(new Date())}`,
      `DTSTART:${paraICS(inicio)}`,
      `DTEND:${paraICS(fim)}`,
      `SUMMARY:${servicos.join(" + ")} — ${nomeLoja}`,
      `DESCRIPTION:Agendamento pelo PiBarber`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const link = document.createElement("a");
    link.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(conteudo)}`;
    link.download = "agendamento.ics";
    link.click();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-money-soft text-money">
        <CalendarCheck className="h-10 w-10" aria-hidden />
      </span>

      <div>
        <h1 className="text-2xl leading-tight text-ink">Agendado!</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {servicos.join(" + ")} na {nomeLoja}
        </p>
        <p className="tnum mt-2 text-lg font-semibold text-brass-deep">
          {diaPorExtenso(dia, true)} às {hora}
        </p>
      </div>

      {/* --------------------------------------------------------------------
          O LINK DE ACOMPANHAMENTO, só para quem agendou sem conta.

          É a única forma de essa pessoa voltar a este agendamento — não há
          login para recuperá-lo. Por isso ele aparece em destaque, com o
          endereço à vista, e o texto pede para guardar. O botão principal leva
          direto para lá, para o endereço ficar no histórico do navegador mesmo
          que a pessoa não copie nada.
          -------------------------------------------------------------------- */}
      {token ? (
        <div className="w-full max-w-xs rounded-card border border-brass bg-brass-soft p-4 text-left">
          <p className="text-sm font-semibold text-brass-deep">Guarde este link</p>
          <p className="mt-1 text-xs text-brass-deep/80">
            É por ele que você acompanha ou cancela este horário. Sem conta, não há outro
            jeito de voltar aqui.
          </p>
          <p className="tnum mt-2 break-all rounded-field bg-surface px-2.5 py-2 text-xs text-ink">
            {`/a/${token}`}
          </p>
        </div>
      ) : null}

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button
          variante="secondary"
          larguraTotal
          onClick={baixarICS}
          iconeEsquerda={<CalendarPlus className="h-4 w-4" aria-hidden />}
        >
          Adicionar ao calendário
        </Button>

        <Link
          href={token ? `/a/${token}` : logado ? "/app/agendamentos" : "/criar-conta"}
          className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass text-base font-medium text-brass-ink"
        >
          {token
            ? "Abrir meu agendamento"
            : logado
              ? "Ver meus agendamentos"
              : "Criar conta para acompanhar"}
        </Link>

        {token ? (
          <Link
            href="/criar-conta"
            className="inline-flex h-11 w-full items-center justify-center text-sm font-medium text-ink-soft hover:text-ink"
          >
            Criar conta para não depender do link
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* ==========================================================================
   Lista de espera
   ========================================================================== */

function EsperaDialog({
  aberto,
  shopId,
  dia,
  profissionalId,
  serviceId,
  logado,
  aoFechar,
}: {
  aberto: boolean;
  shopId: string;
  dia: string;
  profissionalId: string | null;
  serviceId: string | null;
  logado: boolean;
  aoFechar: () => void;
}) {
  const [periodo, setPeriodo] = useState<string>("any");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setPeriodo("any");
    setErro(null);
    setPronto(false);
  }, [aberto]);

  if (!aberto) return null;

  if (!logado) {
    return (
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo="Entre para usar a lista de espera"
        descricao="Precisamos de uma conta para te avisar quando vagar."
        rodape={
          <Link
            href="/entrar"
            className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass text-base font-medium text-brass-ink"
          >
            Entrar ou criar conta
          </Link>
        }
      >
        <p className="text-sm text-ink-soft">
          Sem conta você ainda pode agendar em outro dia — é só escolher outra data na tira
          acima.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={pronto ? "Você está na fila" : "Entrar na lista de espera"}
      descricao={diaPorExtenso(dia, true)}
      rodape={
        pronto ? (
          <Button tamanho="lg" larguraTotal onClick={aoFechar}>
            Fechar
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            {erro ? (
              <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {erro}
              </p>
            ) : null}
            <Button
              tamanho="lg"
              larguraTotal
              carregando={enviando}
              onClick={() =>
                iniciar(async () => {
                  const resultado = await entrarNaEspera({
                    shopId,
                    professionalId: profissionalId,
                    serviceId,
                    dia,
                    periodo,
                  });
                  if (!resultado.ok) {
                    setErro(resultado.message ?? "Não consegui entrar na fila.");
                    return;
                  }
                  setPronto(true);
                })
              }
            >
              Entrar na fila
            </Button>
          </div>
        )
      }
    >
      {pronto ? (
        <p className="text-sm text-ink-soft">
          Se alguém desmarcar nesse dia e período, você recebe uma notificação. É por ordem
          de chegada — vale correr.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">Qual período te serve?</p>
          <ul className="flex flex-col gap-2">
            {PERIODOS.map((p) => (
              <li key={p.valor}>
                <button
                  type="button"
                  onClick={() => setPeriodo(p.valor)}
                  aria-pressed={periodo === p.valor}
                  className={cn(
                    "min-h-[48px] w-full rounded-field px-4 text-left text-sm font-medium transition-colors",
                    periodo === p.valor
                      ? "bg-brass text-brass-ink"
                      : "bg-surface-2 text-ink hover:bg-line",
                  )}
                >
                  {p.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
