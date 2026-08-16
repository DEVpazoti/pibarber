/**
 * Helpers gerais do PiBarber.
 *
 * Regra de fuso: o Brasil é UTC−3. Toda formatação de data e hora fixa o fuso
 * em America/Sao_Paulo de propósito — assim o servidor e o navegador escrevem
 * exatamente o mesmo texto, e o agendamento das 23h não cai no dia errado.
 */

export const FUSO = "America/Sao_Paulo";

/* ==========================================================================
   Classes
   ========================================================================== */

/**
 * Junta classes, ficando só com as strings de verdade.
 *
 * Aceita `unknown` porque o padrão `algumaCoisa && "classe"` com um ReactNode
 * do lado esquerdo pode devolver 0 ou "" — e aí `filter(Boolean)` deixaria
 * passar um `0` para dentro do className.
 */
export function cn(...classes: unknown[]): string {
  return classes.filter((c): c is string => typeof c === "string" && c !== "").join(" ");
}

/* ==========================================================================
   Dinheiro
   ========================================================================== */

/** Formata em real. Use SEMPRE junto com a classe `tnum`. */
export function brl(valor: number | string | null | undefined): string {
  const numero = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(numero)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numero);
}

/** Só o número, sem o "R$" — para dentro de campo de formulário. */
export function numeroBR(valor: number | string | null | undefined): string {
  const numero = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(numero)) return "0,00";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero);
}

/** Lê "1.234,56" ou "1234.56" e devolve 1234.56. Devolve null se não der. */
export function lerValor(entrada: string): number | null {
  const limpo = entrada.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "" || limpo === "-") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Porcentagem com uma casa: 12,5%. */
export function pct(valor: number | null | undefined, casas = 1): string {
  const numero = valor ?? 0;
  if (!Number.isFinite(numero)) return "0%";
  return `${numero.toFixed(casas).replace(".", ",")}%`;
}

/* ==========================================================================
   Data e hora
   ========================================================================== */

function paraData(valor: Date | string | number): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

function valida(data: Date): boolean {
  return !Number.isNaN(data.getTime());
}

/** 14/08/2026 */
export function dataBR(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSO,
  }).format(data);
}

/** 14:30 */
export function horaBR(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: FUSO,
  }).format(data);
}

/** 14/08/2026 às 14:30 */
export function dataHoraBR(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  return `${dataBR(data)} às ${horaBR(data)}`;
}

/** Sexta, 14 ago 2026 — a linha abaixo da saudação na home do app. */
export function dataPorExtenso(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  const texto = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: FUSO,
  }).format(data);
  // "sexta-feira, 14 de ago. de 2026" → "Sexta, 14 ago 2026"
  const [semana = "", resto = ""] = texto.split(",");
  const diaLimpo = resto
    .replace(/\sde\s/g, " ")
    .replace(/\./g, "")
    .trim();
  return `${maiuscula(semana.replace("-feira", ""))}, ${diaLimpo}`;
}

/** 14 de agosto — cabeçalho de dia na agenda. */
export function diaEMes(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: FUSO,
  }).format(data);
}

/** Nomes dos dias, na ordem do banco: 0 = domingo. */
export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export const DIAS_SEMANA_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** "há 3 dias", "em 2 horas" — para o fiado e as notificações. */
export function tempoRelativo(valor: Date | string | number | null | undefined): string {
  if (valor == null) return "";
  const data = paraData(valor);
  if (!valida(data)) return "";
  const diferencaMs = data.getTime() - Date.now();
  const formatador = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const minuto = 60_000;
  const hora = 60 * minuto;
  const dia = 24 * hora;

  const absoluto = Math.abs(diferencaMs);
  if (absoluto < hora) return formatador.format(Math.round(diferencaMs / minuto), "minute");
  if (absoluto < dia) return formatador.format(Math.round(diferencaMs / hora), "hour");
  if (absoluto < 30 * dia) return formatador.format(Math.round(diferencaMs / dia), "day");
  return dataBR(data);
}

/** Quantos dias inteiros se passaram desde a data. Usado no "há X dias" do fiado. */
export function diasDesde(valor: Date | string | number): number {
  const data = paraData(valor);
  if (!valida(data)) return 0;
  return Math.floor((Date.now() - data.getTime()) / 86_400_000);
}

/** 90 → "1h30". Duração de serviço. */
export function duracao(minutos: number | null | undefined): string {
  const total = minutos ?? 0;
  if (total < 60) return `${total}min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** "2026-08-14" no fuso de São Paulo — o formato que o Postgres espera em `date`. */
export function paraDataISO(valor: Date | string | number): string {
  const data = paraData(valor);
  if (!valida(data)) return "";
  // en-CA dá exatamente aaaa-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: FUSO,
  }).format(data);
}

/* ==========================================================================
   Data como texto — aaaa-mm-dd, sem fuso no meio do caminho
   ==========================================================================

   A agenda inteira conversa em "2026-08-14". Guardar o dia como string evita
   o erro clássico: `new Date("2026-08-14")` é meia-noite UTC, que no Brasil
   ainda é dia 13. Enquanto a data for texto, ela não escorrega.
*/

/** Hoje, no fuso de São Paulo. Chame no SERVIDOR — nunca no navegador. */
export function hojeISO(): string {
  return paraDataISO(new Date());
}

/**
 * O AGORA de São Paulo — dia e hora, prontos para um `<input type="date">` e um
 * `<input type="time">`.
 *
 * Pode ser chamado no navegador, e é o único helper de "agora" que pode: o fuso
 * é fixado em `America/Sao_Paulo` pelo `Intl`, então um celular configurado em
 * Lisboa devolve o horário do Brasil do mesmo jeito. O que ele NÃO corrige é
 * relógio do aparelho fora de hora — para isso não há jeito no cliente.
 *
 * É o que faz o formulário de agendamento abrir já preenchido com o instante do
 * toque: às 14:09 de hoje, vem hoje e 14:09.
 */
export function agoraSP(): { dia: string; hora: string } {
  const agora = new Date();
  return {
    dia: paraDataISO(agora),
    hora: minutosParaHora(minutosDoDia(agora)),
  };
}

/** Soma (ou subtrai) dias de um "2026-08-14" sem passar por fuso nenhum. */
export function somarDias(diaISO: string, dias: number): string {
  const [ano = 0, mes = 1, dia = 1] = diaISO.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado, para casar com `business_hours.weekday`. */
export function diaDaSemana(diaISO: string): number {
  const [ano = 0, mes = 1, dia = 1] = diaISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** O domingo da semana daquele dia — o começo da grade semanal da agenda. */
export function inicioDaSemana(diaISO: string): string {
  return somarDias(diaISO, -diaDaSemana(diaISO));
}

/**
 * Monta o timestamptz de São Paulo a partir do dia e da hora escolhidos na
 * tela: ("2026-08-14", "14:30") → "2026-08-14T14:30:00-03:00".
 *
 * O Brasil é UTC−3 fixo desde o fim do horário de verão. Fixar o deslocamento
 * aqui é o que garante que o horário gravado seja o horário que o barbeiro viu
 * na tela, não o do fuso do navegador de quem clicou.
 */
export function timestampSP(diaISO: string, hora: string): string {
  const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;
  return `${diaISO}T${horaCompleta}-03:00`;
}

/** O instante em que o dia começa e termina em São Paulo — para filtrar range. */
export function faixaDoDia(diaISO: string): { de: string; ate: string } {
  return { de: timestampSP(diaISO, "00:00"), ate: timestampSP(somarDias(diaISO, 1), "00:00") };
}

/** Minutos desde a meia-noite de São Paulo. É o que posiciona o bloco na grade. */
export function minutosDoDia(valor: Date | string | number): number {
  const data = paraData(valor);
  if (!valida(data)) return 0;
  const texto = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: FUSO,
  }).format(data);
  const [h = "0", m = "0"] = texto.split(":");
  return Number(h) * 60 + Number(m);
}

/** 570 → "09:30". O inverso de `minutosDoDia`. */
export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "2026-08-14" → "14/08/2026", sem passar por Date.
 *
 * Use SEMPRE que o valor já for um dia em texto. `dataBR(new Date(dia))` daria
 * o dia anterior em qualquer navegador a leste de Greenwich.
 */
export function diaBR(diaISO: string): string {
  const [ano, mes, dia] = diaISO.split("-");
  if (!ano || !mes || !dia) return "";
  return `${dia}/${mes}/${ano}`;
}

/** "2026-08-14" → "Sexta, 14 ago" — o cabeçalho de dia da agenda. */
export function diaPorExtenso(diaISO: string, comAno = false): string {
  const [ano = 0, mes = 1, dia = 1] = diaISO.split("-").map(Number);
  // Meio-dia UTC: a hora que nenhum fuso do planeta empurra para outro dia.
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  const texto = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(comAno ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(data);
  const [semana = "", resto = ""] = texto.split(",");
  return `${maiuscula(semana.replace("-feira", ""))},${resto.replace(/\sde\s/g, " ").replace(/\./g, "")}`;
}

/** "09:30:00" do Postgres → "09:30". */
export function horaCurta(valor: string | null | undefined): string {
  return (valor ?? "").slice(0, 5);
}

/* ==========================================================================
   Máscaras
   ========================================================================== */

/**
 * (11) 98765-4321 — aceita 10 ou 11 dígitos e formata enquanto digita.
 *
 * Aceita nulo porque desde o atendimento por ordem de chegada o telefone da
 * ficha é OPCIONAL: o avulso não tem. Devolver "" é o certo aqui — quem chama
 * decide se esconde a linha ou mostra vazia.
 */
export function mascaraTelefone(entrada: string | null | undefined): string {
  const digitos = (entrada ?? "").replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

/** 01310-100 */
export function mascaraCEP(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

/** Tira tudo que não é dígito — é assim que telefone e CEP vão para o banco. */
export function soDigitos(entrada: string | null | undefined): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/** Telefone válido para o Brasil: 10 ou 11 dígitos. */
export function telefoneValido(entrada: string | null | undefined): boolean {
  const digitos = soDigitos(entrada);
  return digitos.length === 10 || digitos.length === 11;
}

/** Monta o link do WhatsApp já com a mensagem — o botão que o barbeiro mais usa. */
export function linkWhatsApp(telefone: string, mensagem?: string): string {
  const digitos = soDigitos(telefone);
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${comPais}${texto}`;
}

/* ==========================================================================
   Texto
   ========================================================================== */

export function maiuscula(texto: string): string {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "João da Silva" → "João". A saudação da home. */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0] ?? "";
}

/** "João da Silva" → "JS". Fallback do avatar sem foto. */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.charAt(0) ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** "Barbearia do Zé" → "barbearia-do-ze". Gera o slug público. */
export function paraSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ==========================================================================
   Supabase
   ========================================================================== */

/**
 * Dependendo do formato do `select`, um join "para um" volta como objeto ou
 * como array de um item. Nunca leia a relação direto — passe por aqui.
 *
 *   const dono = one<Profile>(barbearia.owner);
 */
export function one<T>(relacao: T | T[] | null | undefined): T | null {
  if (relacao == null) return null;
  if (Array.isArray(relacao)) return relacao[0] ?? null;
  return relacao;
}

/** A versão em lista, para quando o join "para muitos" vier nulo. */
export function many<T>(relacao: T | T[] | null | undefined): T[] {
  if (relacao == null) return [];
  return Array.isArray(relacao) ? relacao : [relacao];
}

/* ==========================================================================
   Diversos
   ========================================================================== */

/** Distância em km, arredondada como a busca mostra: "1,2 km". */
export function distanciaKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Nota da barbearia: 4.9 → "4.9". Sem nota nenhuma vira "Novo". */
export function nota(valor: number | null | undefined, quantidade?: number | null): string {
  if (!quantidade || valor == null) return "Novo";
  return valor.toFixed(1);
}

/** Espera N ms. Só para animação de feedback, nunca para lógica. */
export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
