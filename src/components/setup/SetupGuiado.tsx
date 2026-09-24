"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sair } from "@/app/actions/auth";
import {
  concluirSetup,
  salvarSetupBarbearia,
  salvarSetupEndereco,
  salvarSetupEquipe,
  salvarSetupServicos,
  type RegrasDoSetup,
} from "@/app/actions/setup";
import { salvarHorarios, type LinhaHorario } from "@/app/actions/shop";
import { Logo } from "@/components/Logo";
import { EditorHorarios, linhasDeHorario } from "@/components/painel/EditorHorarios";
import { LocalizacaoBarbearia } from "@/components/painel/LocalizacaoBarbearia";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, CampoImagem, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionResult, Barbershop, BusinessHour, Professional, Service } from "@/lib/types";
import { buscarCEP, ESTADOS } from "@/lib/viacep";
import { WHATSAPP_COMERCIAL } from "@/lib/config";
import {
  cn,
  linkWhatsApp,
  mascaraCEP,
  mascaraTelefone,
  primeiroNome,
  soDigitos,
} from "@/lib/utils";

/**
 * O SETUP GUIADO da barbearia recém-criada.
 *
 * Seis etapas, na ordem em que o dono pensa na loja: quem ela é, onde fica,
 * quando abre, o que faz, quem atende e como aceita agendamento. As etapas 2 a
 * 5 são obrigatórias — sem qualquer uma delas o cliente não consegue marcar
 * horário. A 6 tem padrões bons e pode ser pulada.
 *
 * Cada etapa grava ao tocar em "Continuar" e desmonta ao sair. Voltar a uma
 * etapa a remonta com o que o servidor devolveu depois do `router.refresh()`,
 * então o que aparece é sempre o que está gravado — não uma cópia local que
 * pode ter divergido.
 */

export type PassoDoSetup = "barbearia" | "endereco" | "horario" | "servicos" | "equipe" | "regras";

const PASSOS: { id: PassoDoSetup; titulo: string; descricao: string }[] = [
  {
    id: "barbearia",
    titulo: "Sua barbearia",
    descricao: "Como os clientes vão ver você no app.",
  },
  {
    id: "endereco",
    titulo: "Onde fica",
    descricao: "É o endereço que coloca você na busca de quem está por perto.",
  },
  {
    id: "horario",
    titulo: "Horário de funcionamento",
    descricao: "Só dá para agendar dentro dele.",
  },
  {
    id: "servicos",
    titulo: "Serviços",
    descricao: "O que você faz, quanto custa e quanto tempo leva. Dá para mudar depois.",
  },
  {
    id: "equipe",
    titulo: "Quem atende",
    descricao: "Cada pessoa aqui ganha uma coluna na agenda.",
  },
  {
    id: "regras",
    titulo: "Regras de agendamento",
    descricao: "Já vem com valores que funcionam para a maioria. Mude só se quiser.",
  },
];

type ServicoSalvo = Pick<Service, "id" | "name" | "price" | "duration_minutes" | "is_active">;
type ProfissionalSalvo = Pick<
  Professional,
  "id" | "name" | "commission_percent" | "is_active" | "profile_id"
>;

type PropsEtapa = {
  aoAvancar: () => void;
  aoVoltar?: () => void;
};

export function SetupGuiado({
  loja,
  horarios,
  servicos,
  profissionais,
  dono,
  urlPublica,
  passoInicial,
}: {
  loja: Barbershop;
  horarios: BusinessHour[];
  servicos: ServicoSalvo[];
  profissionais: ProfissionalSalvo[];
  dono: { id: string; nome: string };
  urlPublica: string;
  passoInicial: PassoDoSetup;
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(() => PASSOS.findIndex((p) => p.id === passoInicial));
  // null = setup em andamento. Depois de concluir: se a loja foi ao ar ou
  // ficou retida pelo bloqueio da plataforma.
  const [concluido, setConcluido] = useState<{ noAr: boolean } | null>(null);

  const passo = PASSOS[indice]!;

  function avancar() {
    // Traz do servidor o que acabou de ser gravado, para a etapa voltar certa.
    router.refresh();
    setIndice((i) => Math.min(i + 1, PASSOS.length - 1));
    window.scrollTo({ top: 0 });
  }

  function voltar() {
    setIndice((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0 });
  }

  const aoVoltar = indice > 0 ? voltar : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <form action={sair}>
            <button
              type="submit"
              className="inline-flex h-11 items-center px-3 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-2 sm:px-6">
        {concluido ? (
          <Pronto slug={loja.slug} urlPublica={urlPublica} noAr={concluido.noAr} />
        ) : (
          <>
            {indice === 0 ? (
              <p className="mb-4 text-sm text-ink-soft">
                Olá, {primeiroNome(dono.nome) || "tudo bem"}! Vamos deixar a{" "}
                <strong className="text-ink">{loja.name}</strong> pronta para receber agendamentos.
                Leva uns 5 minutos.
              </p>
            ) : null}

            <Progresso atual={indice} />

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-brass">
                Passo {indice + 1} de {PASSOS.length}
              </p>
              <h1 className="mt-1 text-2xl text-ink sm:text-3xl">{passo.titulo}</h1>
              <p className="mt-1 text-sm text-ink-soft">{passo.descricao}</p>
            </div>

            <div className="mt-6">
              {passo.id === "barbearia" ? (
                <EtapaBarbearia loja={loja} urlPublica={urlPublica} aoAvancar={avancar} />
              ) : passo.id === "endereco" ? (
                <EtapaEndereco loja={loja} aoAvancar={avancar} aoVoltar={aoVoltar} />
              ) : passo.id === "horario" ? (
                <EtapaHorario horarios={horarios} aoAvancar={avancar} aoVoltar={aoVoltar} />
              ) : passo.id === "servicos" ? (
                <EtapaServicos servicos={servicos} aoAvancar={avancar} aoVoltar={aoVoltar} />
              ) : passo.id === "equipe" ? (
                <EtapaEquipe
                  profissionais={profissionais}
                  dono={dono}
                  aoAvancar={avancar}
                  aoVoltar={aoVoltar}
                />
              ) : (
                <EtapaRegras loja={loja} aoConcluir={setConcluido} aoVoltar={aoVoltar} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ==========================================================================
   Moldura comum
   ========================================================================== */

function Progresso({ atual }: { atual: number }) {
  return (
    <ol className="flex gap-1.5" aria-label="Progresso do setup">
      {PASSOS.map((p, i) => (
        <li
          key={p.id}
          aria-current={i === atual ? "step" : undefined}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i <= atual ? "bg-brass" : "bg-surface-2",
          )}
        >
          <span className="sr-only">
            {p.titulo}
            {i < atual ? " — feito" : i === atual ? " — atual" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * O "salvar e seguir" de toda etapa: chama a action, mostra o erro ou avança.
 * `emVoo` fica a cargo do `useTransition` — o botão já nasce desabilitado
 * enquanto a action roda.
 */
function useEnvioDaEtapa<T = undefined>(aoAvancar: (dados: T | undefined) => void) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function enviar(acao: () => Promise<ActionResult<T>>) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar. Tente de novo.");
        return;
      }
      aoAvancar(resultado.data);
    });
  }

  return { erro, setErro, salvando, enviar };
}

function Rodape({
  erro,
  salvando,
  aoContinuar,
  aoVoltar,
  rotulo = "Continuar",
  extra,
}: {
  erro: string | null;
  salvando: boolean;
  aoContinuar: () => void;
  aoVoltar?: () => void;
  rotulo?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {erro ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {aoVoltar ? (
          <Button
            variante="ghost"
            tamanho="lg"
            onClick={aoVoltar}
            disabled={salvando}
            iconeEsquerda={<ArrowLeft className="h-4 w-4" aria-hidden />}
          >
            Voltar
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {extra}
          <Button tamanho="lg" carregando={salvando} onClick={aoContinuar}>
            {rotulo}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   1 — Sua barbearia
   ========================================================================== */

function EtapaBarbearia({
  loja,
  urlPublica,
  aoAvancar,
}: { loja: Barbershop; urlPublica: string } & PropsEtapa) {
  const [nome, setNome] = useState(loja.name);
  const [slug, setSlug] = useState(loja.slug);
  const [whatsapp, setWhatsapp] = useState(mascaraTelefone(loja.whatsapp ?? ""));
  const [telefone, setTelefone] = useState(mascaraTelefone(loja.phone ?? ""));
  const [descricao, setDescricao] = useState(loja.description ?? "");
  const [logoUrl, setLogoUrl] = useState(loja.logo_url ?? "");

  const { erro, salvando, enviar } = useEnvioDaEtapa(aoAvancar);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome da barbearia" htmlFor="st-nome" obrigatorio>
        <Input id="st-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>

      <Field
        label="Link da sua página"
        htmlFor="st-slug"
        obrigatorio
        dica={
          <>
            É o link que você põe na bio do Instagram:{" "}
            <span className="break-all text-ink">
              {urlPublica.replace(/^https?:\/\//, "")}/b/{slug || "…"}
            </span>
          </>
        }
      >
        <Input
          id="st-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp" htmlFor="st-whatsapp" dica="Aparece no seu perfil público.">
          <Input
            id="st-whatsapp"
            inputMode="tel"
            className="tnum"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascaraTelefone(e.target.value))}
          />
        </Field>
        <Field label="Telefone fixo" htmlFor="st-telefone" dica="Opcional.">
          <Input
            id="st-telefone"
            inputMode="tel"
            className="tnum"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          />
        </Field>
      </div>

      <Field
        label="Descrição"
        htmlFor="st-descricao"
        dica="Uma ou duas frases. Ex.: “Corte clássico e barba na toalha quente, no centro.”"
      >
        <Textarea
          id="st-descricao"
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </Field>

      <CampoImagem
        rotulo="Logo"
        tipo="logo"
        dono={loja.id}
        valor={logoUrl}
        aoMudar={setLogoUrl}
        dica="Opcional. Quadrada fica melhor. JPG, PNG ou WebP, até 5 MB."
      />

      <Rodape
        erro={erro}
        salvando={salvando}
        aoContinuar={() =>
          enviar(() =>
            salvarSetupBarbearia({
              nome,
              slug,
              descricao,
              telefone,
              whatsapp,
              logoUrl,
            }),
          )
        }
      />
    </div>
  );
}

/* ==========================================================================
   2 — Onde fica
   ========================================================================== */

function EtapaEndereco({ loja, aoAvancar, aoVoltar }: { loja: Barbershop } & PropsEtapa) {
  const [cep, setCep] = useState(mascaraCEP(loja.zip_code ?? ""));
  const [rua, setRua] = useState(loja.street ?? "");
  const [numero, setNumero] = useState(loja.number ?? "");
  const [complemento, setComplemento] = useState(loja.complement ?? "");
  const [bairro, setBairro] = useState(loja.neighborhood ?? "");
  const [cidade, setCidade] = useState(loja.city ?? "");
  const [estado, setEstado] = useState(loja.state ?? "");
  const [latitude, setLatitude] = useState<number | null>(
    loja.latitude == null ? null : Number(loja.latitude),
  );
  const [longitude, setLongitude] = useState<number | null>(
    loja.longitude == null ? null : Number(loja.longitude),
  );
  const [buscandoCep, setBuscandoCep] = useState(false);

  const { erro, salvando, enviar } = useEnvioDaEtapa(aoAvancar);

  async function aoDigitarCep(valor: string) {
    const mascarado = mascaraCEP(valor);
    setCep(mascarado);
    if (soDigitos(mascarado).length !== 8) return;

    setBuscandoCep(true);
    const achado = await buscarCEP(mascarado);
    setBuscandoCep(false);
    if (!achado) return;

    if (achado.logradouro) setRua(achado.logradouro);
    if (achado.bairro) setBairro(achado.bairro);
    if (achado.localidade) setCidade(achado.localidade);
    if (achado.uf) setEstado(achado.uf);
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="CEP" htmlFor="st-cep" dica="Preenche o resto sozinho.">
        <Input
          id="st-cep"
          inputMode="numeric"
          className="tnum"
          value={cep}
          onChange={(e) => void aoDigitarCep(e.target.value)}
          iconeDireita={
            buscandoCep ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-ink-faint" aria-hidden />
            ) : undefined
          }
        />
      </Field>

      <Field label="Rua" htmlFor="st-rua" obrigatorio>
        <Input id="st-rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" htmlFor="st-numero">
          <Input id="st-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </Field>
        <Field label="Complemento" htmlFor="st-complemento">
          <Input
            id="st-complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Bairro" htmlFor="st-bairro">
        <Input id="st-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      </Field>

      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label="Cidade" htmlFor="st-cidade" obrigatorio>
          <Input id="st-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Field>
        <Field label="Estado" htmlFor="st-estado" obrigatorio>
          <Select id="st-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">UF</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <LocalizacaoBarbearia
        latitude={latitude}
        longitude={longitude}
        endereco={{ cep, rua, numero, bairro, cidade, estado }}
        aoMudar={(lat, lng) => {
          setLatitude(lat);
          setLongitude(lng);
        }}
      />

      <Rodape
        erro={erro}
        salvando={salvando}
        aoVoltar={aoVoltar}
        aoContinuar={() =>
          enviar(() =>
            salvarSetupEndereco({
              cep,
              rua,
              numero,
              complemento,
              bairro,
              cidade,
              estado,
              latitude,
              longitude,
            }),
          )
        }
      />
    </div>
  );
}

/* ==========================================================================
   3 — Horário de funcionamento
   ========================================================================== */

/** Os atalhos: o horário de quase toda barbearia é um destes. */
const MODELOS_HORARIO: { rotulo: string; dias: number[] }[] = [
  { rotulo: "Seg a Sáb", dias: [1, 2, 3, 4, 5, 6] },
  { rotulo: "Ter a Sáb", dias: [2, 3, 4, 5, 6] },
  { rotulo: "Todos os dias", dias: [0, 1, 2, 3, 4, 5, 6] },
];

function aplicarModelo(dias: number[], base?: LinhaHorario): LinhaHorario[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    fechado: !dias.includes(weekday),
    abre: base?.abre || "09:00",
    fecha: base?.fecha || "19:00",
    almocoInicio: base?.almocoInicio ?? "",
    almocoFim: base?.almocoFim ?? "",
  }));
}

function EtapaHorario({
  horarios,
  aoAvancar,
  aoVoltar,
}: { horarios: BusinessHour[] } & PropsEtapa) {
  // Loja sem horário gravado começa em "Seg a Sáb, 9h às 19h" em vez de tudo
  // fechado: é o caso mais comum, e ajustar é mais rápido que montar do zero.
  const [linhas, setLinhas] = useState<LinhaHorario[]>(() =>
    horarios.length > 0 ? linhasDeHorario(horarios) : aplicarModelo([1, 2, 3, 4, 5, 6]),
  );

  const { erro, setErro, salvando, enviar } = useEnvioDaEtapa(aoAvancar);

  function alterar(weekday: number, campos: Partial<LinhaHorario>) {
    setLinhas((atual) => atual.map((l) => (l.weekday === weekday ? { ...l, ...campos } : l)));
  }

  /** Copia o horário do primeiro dia aberto para todos os outros abertos. */
  function repetirPrimeiro() {
    const modelo = linhas.find((l) => !l.fechado);
    if (!modelo) return;
    setLinhas((atual) =>
      atual.map((l) =>
        l.fechado
          ? l
          : {
              ...l,
              abre: modelo.abre,
              fecha: modelo.fecha,
              almocoInicio: modelo.almocoInicio,
              almocoFim: modelo.almocoFim,
            },
      ),
    );
  }

  const primeiroAberto = linhas.find((l) => !l.fechado);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {MODELOS_HORARIO.map((m) => (
          <Button
            key={m.rotulo}
            variante="secondary"
            tamanho="sm"
            onClick={() => setLinhas(aplicarModelo(m.dias, primeiroAberto))}
          >
            {m.rotulo}
          </Button>
        ))}
        <Button variante="ghost" tamanho="sm" onClick={repetirPrimeiro} disabled={!primeiroAberto}>
          Repetir o 1º dia aberto nos outros
        </Button>
      </div>

      <EditorHorarios linhas={linhas} aoAlterar={alterar} />

      <p className="text-xs text-ink-faint">
        O almoço é opcional. Com ele preenchido, ninguém consegue agendar nesse intervalo.
      </p>

      <Rodape
        erro={erro}
        salvando={salvando}
        aoVoltar={aoVoltar}
        aoContinuar={() => {
          if (linhas.every((l) => l.fechado)) {
            setErro("Abra pelo menos um dia da semana.");
            return;
          }
          enviar(() => salvarHorarios(linhas));
        }}
      />
    </div>
  );
}

/* ==========================================================================
   4 — Serviços
   ========================================================================== */

type LinhaServico = {
  chave: string;
  id?: string;
  nome: string;
  preco: string;
  duracao: string;
  ativo: boolean;
};

/** Ponto de partida de quem ainda não tem serviço. O dono ajusta o preço. */
const SUGESTOES_SERVICO: Omit<LinhaServico, "chave">[] = [
  { nome: "Corte", preco: "40", duracao: "30", ativo: true },
  { nome: "Barba", preco: "30", duracao: "30", ativo: true },
  { nome: "Corte + barba", preco: "65", duracao: "60", ativo: true },
  { nome: "Sobrancelha", preco: "15", duracao: "15", ativo: false },
  { nome: "Pezinho", preco: "15", duracao: "15", ativo: false },
];

/** "45,50" → 45.5. Vazio ou lixo vira NaN, e a action recusa com a mensagem. */
function lerPreco(texto: string): number {
  return texto.trim() === "" ? Number.NaN : Number(texto.replace(/\./g, "").replace(",", "."));
}

function EtapaServicos({
  servicos,
  aoAvancar,
  aoVoltar,
}: { servicos: ServicoSalvo[] } & PropsEtapa) {
  const [linhas, setLinhas] = useState<LinhaServico[]>(() =>
    servicos.length > 0
      ? servicos.map((s) => ({
          chave: s.id,
          id: s.id,
          nome: s.name,
          preco: String(s.price).replace(".", ","),
          duracao: String(s.duration_minutes),
          ativo: s.is_active,
        }))
      : SUGESTOES_SERVICO.map((s, i) => ({ ...s, chave: `sugestao-${i}` })),
  );

  const { erro, salvando, enviar } = useEnvioDaEtapa(aoAvancar);

  function alterar(chave: string, campos: Partial<LinhaServico>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  function adicionar() {
    setLinhas((atual) => [
      ...atual,
      {
        chave: `novo-${Date.now()}`,
        nome: "",
        preco: "",
        duracao: "30",
        ativo: true,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li
            key={l.chave}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3",
              !l.ativo && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={l.ativo}
              onChange={(e) => alterar(l.chave, { ativo: e.target.checked })}
              aria-label={`Oferecer ${l.nome || "este serviço"}`}
              className="h-5 w-5 shrink-0 accent-brass"
            />
            <div className="min-w-[10rem] flex-1">
              <Input
                value={l.nome}
                placeholder="Nome do serviço"
                aria-label="Nome do serviço"
                onChange={(e) => alterar(l.chave, { nome: e.target.value })}
                className="min-w-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-28">
                <Input
                  value={l.preco}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={`Preço de ${l.nome || "este serviço"}, em reais`}
                  onChange={(e) =>
                    alterar(l.chave, {
                      preco: e.target.value.replace(/[^\d,.]/g, ""),
                    })
                  }
                  className="tnum"
                  iconeEsquerda={<span className="pl-3 text-sm text-ink-faint">R$</span>}
                />
              </div>
              <Select
                value={l.duracao}
                aria-label={`Duração de ${l.nome || "este serviço"}`}
                onChange={(e) => alterar(l.chave, { duracao: e.target.value })}
                className="w-28"
              >
                {[10, 15, 20, 30, 40, 45, 60, 75, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variante="secondary"
        onClick={adicionar}
        iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
        className="self-start"
      >
        Adicionar outro serviço
      </Button>

      <Rodape
        erro={erro}
        salvando={salvando}
        aoVoltar={aoVoltar}
        aoContinuar={() =>
          enviar(() =>
            salvarSetupServicos(
              linhas
                // Linha nova deixada em branco não é um serviço — é só um
                // "adicionar" que o dono não usou.
                .filter((l) => l.id || l.nome.trim() || l.preco.trim())
                .map((l) => ({
                  id: l.id,
                  nome: l.nome,
                  preco: lerPreco(l.preco),
                  duracaoMinutos: Number(l.duracao),
                  ativo: l.ativo,
                })),
            ),
          )
        }
      />
    </div>
  );
}

/* ==========================================================================
   5 — Quem atende
   ========================================================================== */

type LinhaProfissional = {
  chave: string;
  id?: string;
  nome: string;
  comissao: string;
  ativo: boolean;
};

function EtapaEquipe({
  profissionais,
  dono,
  aoAvancar,
  aoVoltar,
}: {
  profissionais: ProfissionalSalvo[];
  dono: { id: string; nome: string };
} & PropsEtapa) {
  const meu = profissionais.find((p) => p.profile_id === dono.id);

  // O dono que também corta é o caso comum de barbearia pequena, por isso a
  // caixa nasce marcada numa loja sem ninguém cadastrado.
  const [euAtendo, setEuAtendo] = useState(meu ? meu.is_active : profissionais.length === 0);
  const [meuNome, setMeuNome] = useState(meu?.name ?? primeiroNome(dono.nome));

  const [outros, setOutros] = useState<LinhaProfissional[]>(() =>
    profissionais
      .filter((p) => p.id !== meu?.id)
      .map((p) => ({
        chave: p.id,
        id: p.id,
        nome: p.name,
        comissao: String(p.commission_percent).replace(".", ","),
        ativo: p.is_active,
      })),
  );

  const { erro, salvando, enviar } = useEnvioDaEtapa(aoAvancar);

  function alterar(chave: string, campos: Partial<LinhaProfissional>) {
    setOutros((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  function adicionar() {
    setOutros((atual) => [
      ...atual,
      { chave: `novo-${Date.now()}`, nome: "", comissao: "40", ativo: true },
    ]);
  }

  /** Linha nova sai da lista; a que já existia é desativada (tem histórico). */
  function remover(l: LinhaProfissional) {
    if (l.id) alterar(l.chave, { ativo: false });
    else setOutros((atual) => atual.filter((x) => x.chave !== l.chave));
  }

  const visiveis = outros.filter((l) => l.ativo || !l.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-card border border-line bg-surface p-4">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={euAtendo}
            onChange={(e) => setEuAtendo(e.target.checked)}
            className="h-5 w-5 accent-brass"
          />
          <span className="text-sm font-medium text-ink">Eu também atendo clientes</span>
        </label>

        {euAtendo ? (
          <Field
            label="Como os clientes te chamam"
            htmlFor="st-meu-nome"
            dica="É o nome que aparece para escolher na hora de agendar."
          >
            <Input id="st-meu-nome" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} />
          </Field>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink">Outros barbeiros</h2>

        {visiveis.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {euAtendo
              ? "Trabalha sozinho? Pode seguir. Dá para adicionar gente depois, em Equipe."
              : "Adicione quem atende na sua barbearia."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visiveis.map((l) => (
              <li
                key={l.chave}
                className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-3"
              >
                <Field label="Nome" htmlFor={`st-prof-${l.chave}`}>
                  <div className="min-w-[10rem]">
                    <Input
                      id={`st-prof-${l.chave}`}
                      value={l.nome}
                      onChange={(e) => alterar(l.chave, { nome: e.target.value })}
                    />
                  </div>
                </Field>
                <Field label="Comissão" htmlFor={`st-com-${l.chave}`}>
                  <div className="w-24">
                    <Input
                      id={`st-com-${l.chave}`}
                      value={l.comissao}
                      inputMode="decimal"
                      className="tnum"
                      onChange={(e) =>
                        alterar(l.chave, {
                          comissao: e.target.value.replace(/[^\d,.]/g, ""),
                        })
                      }
                      iconeDireita={<span className="pr-3 text-sm text-ink-faint">%</span>}
                    />
                  </div>
                </Field>
                <Button
                  variante="ghost"
                  onClick={() => remover(l)}
                  aria-label={`Remover ${l.nome || "este barbeiro"}`}
                  className="text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          variante="secondary"
          onClick={adicionar}
          iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
          className="self-start"
        >
          Adicionar barbeiro
        </Button>

        <p className="text-xs text-ink-faint">
          A comissão é o percentual do serviço que vai para o barbeiro a cada atendimento concluído.
          Foto, jornada própria e acesso ao painel ficam em Equipe, depois.
        </p>
      </div>

      <Rodape
        erro={erro}
        salvando={salvando}
        aoVoltar={aoVoltar}
        aoContinuar={() =>
          enviar(() =>
            salvarSetupEquipe([
              ...(meu || euAtendo
                ? [
                    {
                      id: meu?.id,
                      nome: meuNome,
                      // O dono não paga comissão a si mesmo.
                      comissaoPercent: meu ? Number(meu.commission_percent) : 0,
                      souEu: true,
                      ativo: euAtendo,
                    },
                  ]
                : []),
              ...outros
                .filter((l) => l.id || l.nome.trim())
                .map((l) => ({
                  id: l.id,
                  nome: l.nome,
                  comissaoPercent: Number(l.comissao.replace(",", ".") || "0"),
                  souEu: false,
                  ativo: l.ativo,
                })),
            ]),
          )
        }
      />
    </div>
  );
}

/* ==========================================================================
   6 — Regras de agendamento
   ========================================================================== */

function EtapaRegras({
  loja,
  aoConcluir,
  aoVoltar,
}: {
  loja: Barbershop;
  aoConcluir: (resultado: { noAr: boolean }) => void;
  aoVoltar?: () => void;
}) {
  // Agendamento online e "sem cadastro" NÃO entram no setup: ficam como a loja
  // nasce (online ligado, sem cadastro desligado) e o dono muda em
  // Configurações. Aqui só os três prazos.
  const [minimo, setMinimo] = useState(String(loja.min_advance_minutes));
  const [maximo, setMaximo] = useState(String(loja.max_advance_days));
  const [cancelamento, setCancelamento] = useState(String(loja.cancel_deadline_hours));

  const { erro, salvando, enviar } = useEnvioDaEtapa<{ noAr: boolean }>((dados) =>
    aoConcluir(dados ?? { noAr: true }),
  );

  const regras: RegrasDoSetup = {
    antecedenciaMinima: Number(minimo),
    antecedenciaMaximaDias: Number(maximo),
    prazoCancelamentoHoras: Number(cancelamento),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Antecedência mínima"
          htmlFor="st-min"
          dica="Quanto antes o cliente pode marcar."
        >
          <Select id="st-min" value={minimo} onChange={(e) => setMinimo(e.target.value)}>
            {opcoes(minimo, [0, 15, 30, 60, 120, 180, 1440], (m) =>
              m === 0 ? "Sem mínimo" : m < 60 ? `${m} min` : m === 1440 ? "1 dia" : `${m / 60} h`,
            )}
          </Select>
        </Field>

        <Field label="Agenda aberta por" htmlFor="st-max" dica="Até quando dá para marcar.">
          <Select id="st-max" value={maximo} onChange={(e) => setMaximo(e.target.value)}>
            {opcoes(maximo, [7, 15, 30, 60, 90], (d) => `${d} dias`)}
          </Select>
        </Field>

        <Field label="Cancelar até" htmlFor="st-cancel" dica="Antes do horário marcado.">
          <Select
            id="st-cancel"
            value={cancelamento}
            onChange={(e) => setCancelamento(e.target.value)}
          >
            {opcoes(cancelamento, [0, 1, 2, 3, 6, 12, 24], (h) =>
              h === 0 ? "A qualquer hora" : `${h} h antes`,
            )}
          </Select>
        </Field>
      </div>

      <Rodape
        erro={erro}
        salvando={salvando}
        aoVoltar={aoVoltar}
        rotulo="Concluir e abrir a barbearia"
        aoContinuar={() => enviar(() => concluirSetup(regras))}
      />
    </div>
  );
}

/**
 * As opções de um select numérico, incluindo o valor atual mesmo quando ele
 * não está na lista (loja criada no /admin com um valor fora do padrão).
 */
function opcoes(atual: string, valores: number[], rotulo: (v: number) => string) {
  const n = Number(atual);
  const todos = valores.includes(n) ? valores : [...valores, n].sort((a, b) => a - b);
  return todos.map((v) => (
    <option key={v} value={v}>
      {rotulo(v)}
    </option>
  ));
}

/* ==========================================================================
   Pronto
   ========================================================================== */

function Pronto({
  slug,
  urlPublica,
  noAr,
}: {
  slug: string;
  urlPublica: string;
  /** Falso quando a plataforma bloqueou a loja: o setup acabou, mas ela não abriu. */
  noAr: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = `${urlPublica}/b/${slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (error) {
      console.error("[setup] falha ao copiar o link:", error);
    }
  }

  if (!noAr) {
    return (
      <div className="mt-6 flex flex-col items-center gap-5 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-ink-soft">
          <AlertCircle className="h-8 w-8" aria-hidden />
        </span>

        <div>
          <h1 className="text-3xl text-ink">Configuração concluída</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            Sua barbearia está suspensa pela equipe do PiBarber e ainda não aparece para os
            clientes. Fale com a gente para liberar — o que você configurou fica guardado.
          </p>
        </div>

        <a
          href={linkWhatsApp(
            WHATSAPP_COMERCIAL,
            "Olá! Terminei de configurar minha barbearia no PiBarber, mas ela está suspensa.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-field bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-line"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Falar com o PiBarber
        </a>

        <BotaoIrParaPainel />
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-5 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-money-soft text-money">
        <CheckCircle2 className="h-8 w-8" aria-hidden />
      </span>

      <div>
        <h1 className="text-3xl text-ink">Sua barbearia está no ar!</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Os clientes já podem agendar. Mande o link para eles e coloque na bio do Instagram.
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 rounded-card bg-surface-2 p-3">
        <code className="min-w-0 flex-1 break-all text-left text-xs text-ink-soft">{link}</code>
        <Button
          variante="secondary"
          tamanho="sm"
          onClick={copiar}
          iconeEsquerda={
            copiado ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )
          }
        >
          {copiado ? "Copiado!" : "Copiar"}
        </Button>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Agora dá para agendar comigo pelo celular: ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-field bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-line"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Enviar no WhatsApp
        </a>
        <a
          href={`/b/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-field bg-surface-2 text-sm font-medium text-ink transition-colors hover:bg-line"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Ver minha página
        </a>
      </div>

      <BotaoIrParaPainel />
    </div>
  );
}

function BotaoIrParaPainel() {
  return (
    /* Link, não router.push: o layout do painel precisa ler o contexto de
       novo, já com `setup_completed_at` gravado. */
    <Link
      href="/painel"
      className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass font-medium text-brass-ink transition-colors hover:bg-brass-deep"
    >
      Ir para o painel
    </Link>
  );
}
