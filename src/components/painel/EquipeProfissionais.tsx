"use client";

import { AlertCircle, CalendarOff, Check, Clock, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  registrarFolga,
  removerFolga,
  salvarJornada,
  salvarProfissional,
  type LinhaJornada,
} from "@/app/actions/team";
import {
  Avatar,
  Button,
  CampoImagem,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { cn, dataBR, DIAS_SEMANA, horaCurta, pct } from "@/lib/utils";

/**
 * PROFISSIONAIS — quem corta o cabelo.
 *
 * Não é login: é um registro. Nome, foto, percentual de comissão e jornada.
 * Se a pessoa precisar entrar no sistema, ela vira um ASSISTENTE, na seção de
 * acessos logo abaixo — são coisas diferentes de propósito.
 */

export type ProfissionalDaEquipe = {
  id: string;
  name: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  commission_percent: number;
  is_active: boolean;
  /**
   * O acesso ao painel deste profissional, quando ele tem um. Nulo é o caso
   * normal: profissional é registro, não login.
   *
   * Ligado, o barbeiro passa a ver a PRÓPRIA comissão do dia na aba Hoje — e
   * só a dele. Quem impõe esse recorte é `comissoes_do_dia()` no Postgres.
   */
  profile_id: string | null;
  /** Vazio = segue o horário da loja. Em dia de folga o horário vem nulo. */
  jornada: { weekday: number; starts_at: string | null; ends_at: string | null; is_off: boolean }[];
};

/** Um acesso da loja, para o seletor "este profissional entra no painel?". */
export type AcessoDaLoja = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type FolgaDaEquipe = {
  id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export function EquipeProfissionais({
  profissionais,
  folgas,
  /** Manda a foto para a pasta certa do Storage. Ver DESTINOS em lib/imagens.ts. */
  shopId,
  acessos,
}: {
  profissionais: ProfissionalDaEquipe[];
  folgas: FolgaDaEquipe[];
  shopId: string;
  /** O dono e os assistentes da loja — quem pode ser ligado a um profissional. */
  acessos: AcessoDaLoja[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<ProfissionalDaEquipe | null>(null);
  const [criando, setCriando] = useState(false);
  const [jornadaDe, setJornadaDe] = useState<ProfissionalDaEquipe | null>(null);
  const [folgaAberta, setFolgaAberta] = useState(false);

  function atualizar() {
    router.refresh();
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Profissionais</h2>
        <Button
          tamanho="sm"
          onClick={() => setCriando(true)}
          iconeEsquerda={<Plus className="h-4 w-4" aria-hidden />}
        >
          Novo profissional
        </Button>
      </div>

      {profissionais.length === 0 ? (
        <EmptyState
          icone={<UserCog aria-hidden />}
          titulo="Nenhum profissional cadastrado"
          descricao="A agenda é montada por profissional. Cadastre pelo menos um — pode ser você mesmo."
          acao={<Button onClick={() => setCriando(true)}>Cadastrar profissional</Button>}
        />
      ) : (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2">
          {profissionais.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-start gap-3 rounded-card border border-line bg-surface p-4",
                !p.is_active && "opacity-60",
              )}
            >
              <Avatar src={p.avatar_url} nome={p.name} tamanho="md" />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {p.nickname || p.name}
                  </span>
                  {!p.is_active ? <Chip tom="neutro">Inativo</Chip> : null}
                </p>
                <p className="tnum text-xs text-ink-soft">
                  Comissão de {pct(p.commission_percent, 0)}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {p.jornada.length === 0
                    ? "Segue o horário da loja"
                    : `Jornada própria em ${p.jornada.length} ${p.jornada.length === 1 ? "dia" : "dias"}`}
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setEditando(p)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-field px-3 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setJornadaDe(p)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-field px-3 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Jornada
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ==================================================================
          Folgas e férias
          ================================================================== */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Folgas, férias e feriados</h3>
        <Button
          variante="secondary"
          tamanho="sm"
          onClick={() => setFolgaAberta(true)}
          iconeEsquerda={<CalendarOff className="h-4 w-4" aria-hidden />}
        >
          Registrar folga
        </Button>
      </div>

      {folgas.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          Nenhuma folga registrada. Quem tem folga não aparece com horário livre no
          agendamento.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {folgas.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">
                  {f.professional_id
                    ? (profissionais.find((p) => p.id === f.professional_id)?.nickname ??
                      profissionais.find((p) => p.id === f.professional_id)?.name ??
                      "Profissional")
                    : "A loja inteira"}
                </span>
                <span className="tnum block text-xs text-ink-soft">
                  {dataBR(f.starts_at)} a {dataBR(f.ends_at)}
                  {f.reason ? ` · ${f.reason}` : ""}
                </span>
              </span>

              <BotaoRemoverFolga id={f.id} aoRemover={atualizar} />
            </li>
          ))}
        </ul>
      )}

      {/* ================================================================== */}
      <ProfissionalDialog
        aberto={criando || editando !== null}
        inicial={editando ?? undefined}
        shopId={shopId}
        acessos={acessos}
        aoFechar={() => {
          setCriando(false);
          setEditando(null);
        }}
        aoSalvar={atualizar}
      />

      <JornadaDialog
        profissional={jornadaDe}
        aoFechar={() => setJornadaDe(null)}
        aoSalvar={atualizar}
      />

      <FolgaDialog
        aberto={folgaAberta}
        profissionais={profissionais}
        aoFechar={() => setFolgaAberta(false)}
        aoSalvar={atualizar}
      />
    </section>
  );
}

function BotaoRemoverFolga({ id, aoRemover }: { id: string; aoRemover: () => void }) {
  const [ocupado, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() =>
        iniciar(async () => {
          await removerFolga(id);
          aoRemover();
        })
      }
      aria-label="Remover folga"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

/* ==========================================================================
   Cadastro do profissional
   ========================================================================== */

function ProfissionalDialog({
  aberto,
  inicial,
  shopId,
  acessos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  inicial?: ProfissionalDaEquipe;
  shopId: string;
  acessos: AcessoDaLoja[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [bio, setBio] = useState("");
  const [foto, setFoto] = useState("");
  const [comissao, setComissao] = useState("40");
  const [ativo, setAtivo] = useState(true);
  const [acesso, setAcesso] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.name ?? "");
    setApelido(inicial?.nickname ?? "");
    setBio(inicial?.bio ?? "");
    setFoto(inicial?.avatar_url ?? "");
    setComissao(String(inicial?.commission_percent ?? 40));
    setAtivo(inicial?.is_active ?? true);
    setAcesso(inicial?.profile_id ?? "");
    setErro(null);
  }, [aberto, inicial]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarProfissional({
        id: inicial?.id,
        nome,
        apelido,
        bio,
        fotoUrl: foto,
        comissaoPercent: Number(comissao.replace(",", ".")),
        ativo,
        profileId: acesso || null,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      aoSalvar();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? "Editar profissional" : "Novo profissional"}
      descricao="O profissional não faz login. Para dar acesso ao sistema, crie um assistente."
      rodape={
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
            onClick={enviar}
            iconeEsquerda={<Check className="h-4 w-4" aria-hidden />}
          >
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="prof-nome" obrigatorio>
          <Input id="prof-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>

        <Field label="Apelido" htmlFor="prof-apelido" dica="É o que aparece na agenda e no perfil.">
          <Input
            id="prof-apelido"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Ex: Tião"
          />
        </Field>

        <Field label="Bio" htmlFor="prof-bio" dica="Uma linha, aparece no perfil público.">
          <Textarea id="prof-bio" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>

        <CampoImagem
          rotulo="Foto"
          tipo="barbeiro"
          dono={shopId}
          valor={foto}
          aoMudar={setFoto}
          dica="Aparece na agenda e no perfil público. JPG, PNG ou WebP, até 5 MB."
        />

        <Field
          label="Comissão (%)"
          htmlFor="prof-comissao"
          obrigatorio
          dica="Percentual sobre cada atendimento concluído."
        >
          <Input
            id="prof-comissao"
            inputMode="decimal"
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            className="tnum"
          />
        </Field>

        {/* --- Acesso ao painel ------------------------------------------
            É esta ligação que faz o barbeiro ver a PRÓPRIA comissão do dia na
            aba Hoje sem ver a dos colegas. Sem ela, o sistema sabe que aquele
            assistente entra na loja, mas não sabe qual profissional ele é. */}
        <Field
          label="Acesso ao painel"
          htmlFor="prof-acesso"
          dica={
            acessos.length === 0
              ? "Nenhum acesso cadastrado ainda. Crie um assistente na seção Acessos, logo abaixo."
              : "Ligue o profissional ao login dele para que ele veja a própria comissão do dia na aba Hoje. Ele continua sem ver a dos colegas."
          }
        >
          <Select
            id="prof-acesso"
            value={acesso}
            disabled={acessos.length === 0}
            onChange={(e) => setAcesso(e.target.value)}
          >
            <option value="">Sem acesso ao painel</option>
            {acessos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email || "Acesso sem nome"}
              </option>
            ))}
          </Select>
        </Field>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-5 w-5 accent-brass"
          />
          <span className="text-sm text-ink">Ativo — aparece na agenda e no agendamento</span>
        </label>
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Jornada individual — OPCIONAL, e a tela precisa dizer isso
   ========================================================================== */

function JornadaDialog({
  profissional,
  aoFechar,
  aoSalvar,
}: {
  profissional: ProfissionalDaEquipe | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaJornada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!profissional) return;
    setLinhas(
      Array.from({ length: 7 }, (_, weekday) => {
        const gravada = profissional.jornada.find((j) => j.weekday === weekday);
        return {
          weekday,
          inicio: gravada && !gravada.is_off ? horaCurta(gravada.starts_at) : "",
          fim: gravada && !gravada.is_off ? horaCurta(gravada.ends_at) : "",
          folga: gravada?.is_off ?? false,
        };
      }),
    );
    setErro(null);
  }, [profissional]);

  function alterar(weekday: number, campos: Partial<LinhaJornada>) {
    setLinhas((atual) =>
      atual.map((l) => (l.weekday === weekday ? { ...l, ...campos } : l)),
    );
  }

  function enviar() {
    if (!profissional) return;
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarJornada(profissional.id, linhas);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      aoSalvar();
      aoFechar();
    });
  }

  if (!profissional) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Jornada de ${profissional.nickname || profissional.name}`}
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button tamanho="lg" larguraTotal carregando={enviando} onClick={enviar}>
            Salvar jornada
          </Button>
        </div>
      }
    >
      {/* Este aviso não é decoração: sem ele o dono acha que precisa preencher
          os 7 dias, e acaba fechando a agenda sem querer. */}
      <p className="mb-4 rounded-card bg-brass-soft px-4 py-3 text-sm text-brass-deep">
        A jornada é <strong>opcional</strong>. Dia deixado em branco significa
        “<strong>segue o horário da loja</strong>”. Preencha só os dias em que este
        profissional trabalha em horário diferente.
      </p>

      <ul className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li key={l.weekday} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-sm font-medium text-ink">
              {DIAS_SEMANA[l.weekday]?.slice(0, 3)}
            </span>

            <label className="flex h-12 shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={l.folga}
                onChange={(e) => alterar(l.weekday, { folga: e.target.checked })}
                className="h-4 w-4 accent-brass"
              />
              Folga
            </label>

            <input
              type="time"
              value={l.inicio}
              disabled={l.folga}
              onChange={(e) => alterar(l.weekday, { inicio: e.target.value })}
              aria-label={`Início de ${DIAS_SEMANA[l.weekday]}`}
              className="h-12 min-w-0 flex-1 rounded-field bg-surface-2 px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brass focus:ring-inset disabled:opacity-40"
            />
            <input
              type="time"
              value={l.fim}
              disabled={l.folga}
              onChange={(e) => alterar(l.weekday, { fim: e.target.value })}
              aria-label={`Fim de ${DIAS_SEMANA[l.weekday]}`}
              className="h-12 min-w-0 flex-1 rounded-field bg-surface-2 px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brass focus:ring-inset disabled:opacity-40"
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ==========================================================================
   Folga
   ========================================================================== */

function FolgaDialog({
  aberto,
  profissionais,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  profissionais: ProfissionalDaEquipe[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [quem, setQuem] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setQuem("");
    setDe("");
    setAte("");
    setMotivo("");
    setErro(null);
  }, [aberto]);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await registrarFolga({
        professionalId: quem === "" ? null : quem,
        primeiroDia: de,
        ultimoDia: ate || de,
        motivo,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui registrar.");
        return;
      }
      aoSalvar();
      aoFechar();
    });
  }

  if (!aberto) return null;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Registrar folga"
      descricao="Vale para folga, férias e feriado."
      rodape={
        <div className="flex flex-col gap-2">
          {erro ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {erro}
            </p>
          ) : null}
          <Button tamanho="lg" larguraTotal carregando={enviando} onClick={enviar}>
            Registrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Quem" htmlFor="folga-quem">
          <select
            id="folga-quem"
            value={quem}
            onChange={(e) => setQuem(e.target.value)}
            className="h-12 w-full rounded-field bg-surface-2 px-3.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-brass focus:ring-inset"
          >
            <option value="">A loja inteira (feriado)</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Primeiro dia" htmlFor="folga-de" obrigatorio>
            <Input id="folga-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Field>
          <Field label="Último dia" htmlFor="folga-ate" dica="Vazio = só um dia.">
            <Input
              id="folga-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Motivo" htmlFor="folga-motivo">
          <Input
            id="folga-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: férias, consulta médica"
          />
        </Field>
      </div>
    </Modal>
  );
}
