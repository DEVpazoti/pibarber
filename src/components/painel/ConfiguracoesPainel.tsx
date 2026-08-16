"use client";

import { AlertCircle, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  salvarBarbearia,
  salvarHorarios,
  type LinhaHorario,
} from "@/app/actions/shop";
import { BeneficiosBarbearia } from "@/components/painel/BeneficiosBarbearia";
import { LocalizacaoBarbearia } from "@/components/painel/LocalizacaoBarbearia";
import { Button, CampoImagem, Field, Input, Select, Textarea } from "@/components/ui";
import type { Amenity, Barbershop, BusinessHour } from "@/lib/types";
import { buscarCEP, ESTADOS } from "@/lib/viacep";
import { DIAS_SEMANA, horaCurta, mascaraCEP, mascaraTelefone, soDigitos } from "@/lib/utils";

/**
 * As configurações da barbearia. Só o dono chega aqui.
 *
 * Três formulários independentes: os dados da loja, os benefícios e o horário
 * de funcionamento. Separados porque são salvos em momentos diferentes — o dono
 * mexe no horário duas vezes por ano e no telefone quase nunca.
 */
export function ConfiguracoesPainel({
  loja,
  horarios,
  urlPublica,
  catalogoBeneficios,
  beneficiosMarcados,
}: {
  loja: Barbershop;
  horarios: BusinessHour[];
  urlPublica: string;
  catalogoBeneficios: Amenity[];
  beneficiosMarcados: string[];
}) {
  return (
    <div className="flex flex-col gap-10">
      <FormDados loja={loja} urlPublica={urlPublica} />
      <BeneficiosBarbearia
        catalogo={catalogoBeneficios}
        selecionadosIniciais={beneficiosMarcados}
      />
      <FormHorarios horarios={horarios} />
    </div>
  );
}

/* ==========================================================================
   Dados da barbearia
   ========================================================================== */

function FormDados({ loja, urlPublica }: { loja: Barbershop; urlPublica: string }) {
  const router = useRouter();

  const [nome, setNome] = useState(loja.name);
  const [slug, setSlug] = useState(loja.slug);
  const [descricao, setDescricao] = useState(loja.description ?? "");
  const [telefone, setTelefone] = useState(mascaraTelefone(loja.phone ?? ""));
  const [whatsapp, setWhatsapp] = useState(mascaraTelefone(loja.whatsapp ?? ""));

  const [cep, setCep] = useState(mascaraCEP(loja.zip_code ?? ""));
  const [rua, setRua] = useState(loja.street ?? "");
  const [numero, setNumero] = useState(loja.number ?? "");
  const [complemento, setComplemento] = useState(loja.complement ?? "");
  const [bairro, setBairro] = useState(loja.neighborhood ?? "");
  const [cidade, setCidade] = useState(loja.city ?? "");
  const [estado, setEstado] = useState(loja.state ?? "");
  // Número, não texto: desde o T-4 a coordenada não é mais digitada — ela chega
  // pronta do geocoding, do GPS ou do pin do mapa. Ver LocalizacaoBarbearia.
  const [latitude, setLatitude] = useState<number | null>(loja.latitude);
  const [longitude, setLongitude] = useState<number | null>(loja.longitude);

  const [logoUrl, setLogoUrl] = useState(loja.logo_url ?? "");
  const [capaUrl, setCapaUrl] = useState(loja.cover_url ?? "");
  const [aceitaOnline, setAceitaOnline] = useState(loja.accepts_online_booking);
  const [permiteSemCadastro, setPermiteSemCadastro] = useState(loja.allow_public_booking);
  const [minAntecedencia, setMinAntecedencia] = useState(String(loja.min_advance_minutes));
  const [maxDias, setMaxDias] = useState(String(loja.max_advance_days));
  const [prazoCancelamento, setPrazoCancelamento] = useState(
    String(loja.cancel_deadline_hours),
  );

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

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

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(`${urlPublica}/b/${slug}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (error) {
      console.error("[configurações] falha ao copiar o link:", error);
    }
  }

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarBarbearia({
        nome,
        slug,
        descricao,
        telefone,
        whatsapp,
        cep,
        rua,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        latitude,
        longitude,
        logoUrl,
        capaUrl,
        aceitaOnline,
        permiteSemCadastro,
        antecedenciaMinima: Number(minAntecedencia),
        antecedenciaMaximaDias: Number(maxDias),
        prazoCancelamentoHoras: Number(prazoCancelamento),
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Salvo.");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">Dados da barbearia</h2>

      <Field label="Nome" htmlFor="cfg-nome" obrigatorio>
        <Input id="cfg-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>

      <Field label="Descrição" htmlFor="cfg-descricao" dica="Aparece no seu perfil público.">
        <Textarea
          id="cfg-descricao"
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefone" htmlFor="cfg-telefone">
          <Input
            id="cfg-telefone"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          />
        </Field>
        <Field label="WhatsApp" htmlFor="cfg-whatsapp">
          <Input
            id="cfg-whatsapp"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascaraTelefone(e.target.value))}
          />
        </Field>
      </div>

      {/* --- Link público --------------------------------------------- */}
      <Field
        label="Link público"
        htmlFor="cfg-slug"
        obrigatorio
        dica="Só letras minúsculas, números e hífen. É o link que você põe na bio do Instagram."
      >
        <Input
          id="cfg-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2 rounded-card bg-surface-2 p-3">
        <code className="min-w-0 flex-1 break-all text-xs text-ink-soft">
          {urlPublica}/b/{slug}
        </code>
        <Button
          variante="secondary"
          tamanho="sm"
          onClick={copiarLink}
          iconeEsquerda={<Copy className="h-4 w-4" aria-hidden />}
        >
          {copiado ? "Copiado!" : "Copiar"}
        </Button>
        <a
          href={`/b/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-1.5 rounded-field px-3 text-sm font-medium text-brass"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Abrir
        </a>
      </div>

      {/* --- Endereço -------------------------------------------------- */}
      <h3 className="mt-2 text-sm font-semibold text-ink">Endereço</h3>

      <Field label="CEP" htmlFor="cfg-cep" dica="Preenche o resto sozinho.">
        <Input
          id="cfg-cep"
          inputMode="numeric"
          value={cep}
          onChange={(e) => void aoDigitarCep(e.target.value)}
          className="tnum"
          iconeDireita={
            buscandoCep ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-ink-faint" aria-hidden />
            ) : undefined
          }
        />
      </Field>

      <Field label="Rua" htmlFor="cfg-rua">
        <Input id="cfg-rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" htmlFor="cfg-numero">
          <Input id="cfg-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </Field>
        <Field label="Complemento" htmlFor="cfg-complemento">
          <Input
            id="cfg-complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Bairro" htmlFor="cfg-bairro">
        <Input id="cfg-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      </Field>

      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label="Cidade" htmlFor="cfg-cidade">
          <Input id="cfg-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Field>
        <Field label="Estado" htmlFor="cfg-estado">
          <Select id="cfg-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">UF</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* --- Localização: sem coordenada, a busca "Próximas" não te acha - */}
      <LocalizacaoBarbearia
        latitude={latitude}
        longitude={longitude}
        endereco={{ cep, rua, numero, bairro, cidade, estado }}
        aoMudar={(lat, lng) => {
          setLatitude(lat);
          setLongitude(lng);
        }}
      />

      {/* --- Imagens ---------------------------------------------------
          O envio já grava no Storage na hora da escolha; o campo do
          formulário guarda só a URL. Por isso o dono ainda precisa tocar em
          "Salvar" embaixo — é o que amarra a URL nova à barbearia. */}
      <h3 className="mt-2 text-sm font-semibold text-ink">Imagens</h3>

      <CampoImagem
        rotulo="Logo"
        tipo="logo"
        dono={loja.id}
        valor={logoUrl}
        aoMudar={setLogoUrl}
        dica="Quadrada fica melhor. JPG, PNG ou WebP, até 5 MB."
      />

      <CampoImagem
        rotulo="Capa"
        tipo="capa"
        dono={loja.id}
        valor={capaUrl}
        aoMudar={setCapaUrl}
        formato="largo"
        dica="Deitada, tipo foto de fachada. Aparece no topo da sua página pública."
      />

      {/* --- Agendamento online ---------------------------------------- */}
      <h3 className="mt-2 text-sm font-semibold text-ink">Agendamento online</h3>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={aceitaOnline}
          onChange={(e) => setAceitaOnline(e.target.checked)}
          className="h-5 w-5 accent-brass"
        />
        <span className="text-sm text-ink">
          Aceitar agendamento pelo app. Desligado, o perfil mostra telefone e WhatsApp no
          lugar do botão.
        </span>
      </label>

      {/* --- Sem cadastro ------------------------------------------------
          Só aparece com o agendamento online ligado: sem ele a página pública
          nem carrega, e a opção não teria onde valer.

          Nasce DESMARCADA em toda barbearia. Ligar isto abre um endereço
          público que escreve no banco — quem liga precisa estar ligando de
          propósito, não por herdar um padrão. */}
      {aceitaOnline ? (
        <div className="rounded-card border border-line bg-surface-2 p-3.5">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={permiteSemCadastro}
              onChange={(e) => setPermiteSemCadastro(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-brass"
            />
            <span className="text-sm text-ink">
              <span className="font-medium">Permitir agendamento sem cadastro</span>
              <span className="mt-0.5 block text-ink-soft">
                O cliente agenda informando só nome e telefone. Ele aparece na Agenda e em
                Clientes como qualquer outro, marcado como “sem cadastro”, e recebe um link
                para acompanhar ou cancelar.
              </span>
            </span>
          </label>

          {permiteSemCadastro ? (
            <p className="mt-2 border-t border-line pt-2 text-xs text-ink-faint">
              Converte mais — muita gente desiste na hora de criar conta. Em troca, seu
              endereço de agendamento fica aberto: há limites automáticos por telefone e por
              origem para conter spam, mas se aparecer horário falso, é só desmarcar aqui.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Antecedência mínima"
          htmlFor="cfg-min"
          dica="Em minutos."
        >
          <Input
            id="cfg-min"
            inputMode="numeric"
            value={minAntecedencia}
            onChange={(e) => setMinAntecedencia(e.target.value.replace(/\D/g, ""))}
            className="tnum"
          />
        </Field>

        <Field label="Antecedência máxima" htmlFor="cfg-max" dica="Em dias.">
          <Input
            id="cfg-max"
            inputMode="numeric"
            value={maxDias}
            onChange={(e) => setMaxDias(e.target.value.replace(/\D/g, ""))}
            className="tnum"
          />
        </Field>

        <Field label="Prazo de cancelamento" htmlFor="cfg-cancel" dica="Em horas.">
          <Input
            id="cfg-cancel"
            inputMode="numeric"
            value={prazoCancelamento}
            onChange={(e) => setPrazoCancelamento(e.target.value.replace(/\D/g, ""))}
            className="tnum"
          />
        </Field>
      </div>

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
        Salvar configurações
      </Button>
    </section>
  );
}

/* ==========================================================================
   Horário de funcionamento
   ========================================================================== */

function FormHorarios({ horarios }: { horarios: BusinessHour[] }) {
  const router = useRouter();

  const [linhas, setLinhas] = useState<LinhaHorario[]>(() =>
    Array.from({ length: 7 }, (_, weekday) => {
      const h = horarios.find((x) => x.weekday === weekday);
      return {
        weekday,
        fechado: h?.is_closed ?? true,
        abre: horaCurta(h?.opens_at) || "09:00",
        fecha: horaCurta(h?.closes_at) || "19:00",
        almocoInicio: horaCurta(h?.break_start),
        almocoFim: horaCurta(h?.break_end),
      };
    }),
  );

  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function alterar(weekday: number, campos: Partial<LinhaHorario>) {
    setLinhas((atual) => atual.map((l) => (l.weekday === weekday ? { ...l, ...campos } : l)));
  }

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarHorarios(linhas);
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Horário salvo.");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Horário de funcionamento</h2>
        <p className="text-sm text-ink-soft">
          É o que define os horários oferecidos no agendamento online.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li
            key={l.weekday}
            className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3"
          >
            <span className="w-20 shrink-0 text-sm font-medium text-ink">
              {DIAS_SEMANA[l.weekday]}
            </span>

            <label className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={!l.fechado}
                onChange={(e) => alterar(l.weekday, { fechado: !e.target.checked })}
                className="h-4 w-4 accent-brass"
              />
              Aberto
            </label>

            {l.fechado ? (
              <span className="text-sm text-ink-faint">Fechado</span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <CampoHora
                  valor={l.abre}
                  rotulo={`Abre ${DIAS_SEMANA[l.weekday]}`}
                  aoMudar={(v) => alterar(l.weekday, { abre: v })}
                />
                <span className="text-ink-faint">—</span>
                <CampoHora
                  valor={l.fecha}
                  rotulo={`Fecha ${DIAS_SEMANA[l.weekday]}`}
                  aoMudar={(v) => alterar(l.weekday, { fecha: v })}
                />

                <span className="ml-2 text-xs text-ink-faint">almoço</span>
                <CampoHora
                  valor={l.almocoInicio}
                  rotulo={`Início do almoço ${DIAS_SEMANA[l.weekday]}`}
                  aoMudar={(v) => alterar(l.weekday, { almocoInicio: v })}
                />
                <CampoHora
                  valor={l.almocoFim}
                  rotulo={`Fim do almoço ${DIAS_SEMANA[l.weekday]}`}
                  aoMudar={(v) => alterar(l.weekday, { almocoFim: v })}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

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
        Salvar horário
      </Button>
    </section>
  );
}

function CampoHora({
  valor,
  rotulo,
  aoMudar,
}: {
  valor: string;
  rotulo: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <input
      type="time"
      value={valor}
      aria-label={rotulo}
      onChange={(e) => aoMudar(e.target.value)}
      className="tnum h-11 w-[92px] rounded-field bg-surface-2 px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brass focus:ring-inset"
    />
  );
}
