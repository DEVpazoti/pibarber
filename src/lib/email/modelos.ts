/**
 * OS E-MAILS DO PIBARBER — texto e layout de cada um.
 *
 * A fila (`email_messages`) guarda só o TIPO e os PARÂMETROS; o e-mail é
 * montado aqui na hora de enviar. Mudar um texto, portanto, vale até para o
 * que já está na fila — e nenhum texto mora no banco.
 *
 * O remetente é sempre o PiBarber (é um marketplace, CONTEXT §1); o nome da
 * barbearia entra no texto. O layout é tabela com estilo inline, porque é o
 * que o Gmail e o Outlook desenham igual.
 *
 * Sem import de servidor: a tela de configurações também lê `TIPOS_DO_DONO`
 * para mostrar a prévia.
 */

export type TipoEmail =
  // Para o dono
  | "novo_agendamento"
  | "cancelamento_dono"
  | "teste_3d"
  | "teste_1d"
  | "pausada"
  | "fatura_vencida"
  | "pagamento"
  | "renovar"
  // Para o cliente
  | "confirmacao"
  | "lembrete"
  | "cancelamento"
  | "aviso_app"
  | "recorrencia";

export type ParametrosEmail = Record<string, string | null | undefined>;

type Conteudo = {
  assunto: string;
  /** A linha que aparece ao lado do assunto na caixa de entrada. */
  resumo: string;
  titulo: string;
  paragrafos: string[];
  detalhes?: [string, string | null | undefined][];
  botao?: { texto: string; link: string | null | undefined };
  /** Por que a pessoa recebeu — obrigatório para não parecer spam. */
  motivo: string;
};

const MODELOS: Record<TipoEmail, (p: ParametrosEmail) => Conteudo> = {
  /* ---------------------------------------------------------------- dono */
  novo_agendamento: (p) => ({
    assunto: `Novo agendamento: ${p.cliente} · ${p.data} às ${p.hora}`,
    resumo: `${p.cliente} marcou ${p.servicos ?? "um horário"} com ${p.profissional}.`,
    titulo: "Novo agendamento",
    paragrafos: [`${p.cliente} acabou de marcar pelo PiBarber na ${p.barbearia}.`],
    detalhes: [
      ["Quando", `${p.data} às ${p.hora}`],
      ["Com", p.profissional],
      ["Serviço", p.servicos],
      ["Valor", p.total],
      ["Telefone", p.telefone],
    ],
    botao: { texto: "Abrir a agenda", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber. Dá para desligar em Configurações.`,
  }),
  cancelamento_dono: (p) => ({
    assunto: `Cancelado: ${p.cliente} · ${p.data} às ${p.hora}`,
    resumo: `${p.cliente} cancelou o horário com ${p.profissional}. O horário ficou livre.`,
    titulo: "Um cliente cancelou",
    paragrafos: [
      `${p.cliente} cancelou o horário na ${p.barbearia}. Ele já está livre na agenda para outro cliente.`,
    ],
    detalhes: [
      ["Era", `${p.data} às ${p.hora}`],
      ["Com", p.profissional],
      ["Serviço", p.servicos],
    ],
    botao: { texto: "Abrir a agenda", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber. Dá para desligar em Configurações.`,
  }),
  teste_3d: (p) => ({
    assunto: "Seu teste grátis do PiBarber acaba em 3 dias",
    resumo: `A ${p.barbearia} continua no ar escolhendo um plano até ${p.data}.`,
    titulo: `Faltam 3 dias, ${p.nome || "tudo certo"}`,
    paragrafos: [
      `O teste grátis da ${p.barbearia} vai até ${p.data}. Para a agenda online continuar aberta sem interrupção, escolha um plano antes disso.`,
      "Os planos vão de R$ 69,99 por mês (1 profissional) a R$ 159,99 (até 8), com desconto no semestral e no anual. Cartão ou Pix.",
    ],
    botao: { texto: "Escolher meu plano", link: p.link },
    motivo: `Você recebe este aviso porque a ${p.barbearia} está no teste grátis do PiBarber.`,
  }),
  teste_1d: (p) => ({
    assunto: "Seu teste grátis do PiBarber acaba amanhã",
    resumo: `Escolha um plano para a agenda da ${p.barbearia} não pausar.`,
    titulo: "Último dia de teste",
    paragrafos: [
      `O teste grátis da ${p.barbearia} acaba em ${p.data}. Depois disso o painel pausa e a página pública para de aceitar agendamento novo — nada é apagado, e assinar libera na hora.`,
    ],
    botao: { texto: "Escolher meu plano", link: p.link },
    motivo: `Você recebe este aviso porque a ${p.barbearia} está no teste grátis do PiBarber.`,
  }),
  pausada: (p) => ({
    assunto: `A agenda online da ${p.barbearia} está pausada`,
    resumo: "Nada foi apagado. Assinar libera na hora.",
    titulo: "Sua agenda está pausada",
    paragrafos: [
      `O período da ${p.barbearia} acabou e a página pública parou de aceitar agendamento novo. Os horários já marcados continuam valendo, e nenhum dado foi apagado.`,
      "Assim que o pagamento for confirmado, tudo volta a funcionar na hora.",
    ],
    botao: { texto: "Reativar a barbearia", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber.`,
  }),
  fatura_vencida: (p) => ({
    assunto: "Sua fatura do PiBarber venceu",
    resumo: `Fatura de ${p.valor} com vencimento em ${p.data}.`,
    titulo: "Fatura em aberto",
    paragrafos: [
      `A fatura de ${p.valor} da ${p.barbearia}, com vencimento em ${p.data}, ainda não foi paga. Há 1 dia de tolerância; depois a agenda online pausa até o pagamento.`,
    ],
    botao: { texto: "Pagar agora", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber.`,
  }),
  pagamento: (p) => ({
    assunto: "Pagamento confirmado — obrigado!",
    resumo: `Recebemos ${p.valor} da ${p.barbearia}.`,
    titulo: "Pagamento confirmado",
    paragrafos: [
      `Recebemos o pagamento de ${p.valor} da ${p.barbearia}. Está tudo liberado.`,
      "Se mudar de ideia em até 7 dias, devolvemos o valor integral — é só falar com a gente.",
    ],
    botao: { texto: "Ver minha assinatura", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber.`,
  }),
  renovar: (p) => ({
    assunto: "Hora de renovar o plano do PiBarber",
    resumo: `O período pago da ${p.barbearia} vai até ${p.data}.`,
    titulo: "Seu período está acabando",
    paragrafos: [
      `O plano parcelado da ${p.barbearia} vai até ${p.data}. O parcelado não renova sozinho: escolha o próximo período para a agenda não pausar.`,
    ],
    botao: { texto: "Renovar agora", link: p.link },
    motivo: `Você recebe este aviso porque é dono da ${p.barbearia} no PiBarber.`,
  }),

  /* ------------------------------------------------------------- cliente */
  confirmacao: (p) => ({
    assunto: `Agendado na ${p.barbearia}: ${p.data} às ${p.hora}`,
    resumo: `${p.servicos ?? "Seu horário"} com ${p.profissional}.`,
    titulo: `Tudo certo, ${p.nome}!`,
    paragrafos: [`Seu horário na ${p.barbearia} está marcado.`],
    detalhes: [
      ["Quando", `${p.data} às ${p.hora}`],
      ["Com", p.profissional],
      ["Serviço", p.servicos],
      ["Onde", p.endereco],
    ],
    botao: { texto: "Ver meu agendamento", link: p.link },
    motivo: `Você recebe este e-mail porque marcou um horário na ${p.barbearia} pelo PiBarber.`,
  }),
  lembrete: (p) => ({
    assunto: `Lembrete: ${p.data} às ${p.hora} na ${p.barbearia}`,
    resumo: `${p.servicos ?? "Seu horário"} com ${p.profissional}.`,
    titulo: `Até amanhã, ${p.nome}!`,
    paragrafos: [
      `Passando para lembrar do seu horário na ${p.barbearia}. Se não puder ir, cancele pelo link — assim o horário fica livre para outra pessoa.`,
    ],
    detalhes: [
      ["Quando", `${p.data} às ${p.hora}`],
      ["Com", p.profissional],
      ["Serviço", p.servicos],
      ["Onde", p.endereco],
    ],
    botao: { texto: "Ver ou cancelar", link: p.link },
    motivo: `Você recebe este e-mail porque marcou um horário na ${p.barbearia} pelo PiBarber.`,
  }),
  cancelamento: (p) => ({
    assunto: `Seu horário na ${p.barbearia} foi cancelado`,
    resumo: `Era ${p.data} às ${p.hora}. Marque outro quando quiser.`,
    titulo: "Horário cancelado",
    paragrafos: [
      `Olá, ${p.nome}. A ${p.barbearia} cancelou o seu horário de ${p.data} às ${p.hora}.`,
      "Se quiser, é só marcar outro — leva menos de um minuto.",
    ],
    botao: { texto: "Marcar outro horário", link: p.link },
    motivo: `Você recebe este e-mail porque tinha um horário na ${p.barbearia} pelo PiBarber.`,
  }),
  aviso_app: (p) => ({
    assunto: p.titulo ?? "Novidade no PiBarber",
    resumo: p.corpo ?? "",
    titulo: p.titulo ?? "Novidade no PiBarber",
    paragrafos: [p.nome ? `Olá, ${p.nome}. ${p.corpo ?? ""}` : (p.corpo ?? "")],
    botao: { texto: p.botao ?? "Abrir o PiBarber", link: p.link },
    motivo: "Você recebe este e-mail porque tem conta no PiBarber.",
  }),
  recorrencia: (p) => ({
    assunto: `${p.nome ? `${p.nome}, ` : ""}bora dar um tapa no visual?`,
    resumo: `Já faz ${p.dias} dias desde a sua última visita na ${p.barbearia}.`,
    titulo: `Já faz ${p.dias} dias${p.nome ? `, ${p.nome}` : ""}!`,
    paragrafos: [
      `Sua última visita na ${p.barbearia} foi em ${p.ultima}. Que tal já deixar o próximo horário marcado?`,
    ],
    botao: { texto: "Marcar meu horário", link: p.link },
    motivo: `Você recebe este e-mail porque é cliente da ${p.barbearia}.`,
  }),
};

/** Tipos que são marketing: levam descadastro e o cabeçalho de um clique. */
export const TIPOS_MARKETING: readonly TipoEmail[] = ["recorrencia"];

export function ehTipoEmail(valor: string): valor is TipoEmail {
  return valor in MODELOS;
}

/* ==========================================================================
   Montar
   ========================================================================== */

const COR = {
  fundo: "#f5f1ea",
  cartao: "#ffffff",
  tinta: "#1c1917",
  suave: "#57534e",
  fraca: "#a8a29e",
  linha: "#e7e0d4",
  latao: "#b87a2e",
};

function esc(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailMontado = { assunto: string; html: string; texto: string };

/**
 * O e-mail pronto. `descadastro` é o link de "não quero mais receber" — só os
 * tipos de marketing o recebem, e para eles é obrigatório.
 */
export function montarEmail(
  tipo: TipoEmail,
  params: ParametrosEmail,
  descadastro?: string | null,
): EmailMontado {
  const c = MODELOS[tipo](params);
  const detalhes = (c.detalhes ?? []).filter(([, v]) => v && v.trim());
  const botao = c.botao?.link ? c.botao : null;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(c.assunto)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.resumo)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;font:700 20px/1.2 Georgia,'Times New Roman',serif;color:${COR.tinta};">Pi<span style="color:${COR.latao};">Barber</span></td></tr>
<tr><td style="background:${COR.cartao};border:1px solid ${COR.linha};border-radius:14px;padding:28px 24px;font:15px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COR.tinta};">
<h1 style="margin:0 0 12px;font:700 22px/1.25 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COR.tinta};">${esc(c.titulo)}</h1>
${c.paragrafos.map((t) => `<p style="margin:0 0 12px;color:${COR.suave};">${esc(t)}</p>`).join("\n")}
${
  detalhes.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-top:1px solid ${COR.linha};">
${detalhes
  .map(
    ([r, v]) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid ${COR.linha};color:${COR.fraca};font-size:13px;width:34%;vertical-align:top;">${esc(r)}</td><td style="padding:8px 0;border-bottom:1px solid ${COR.linha};color:${COR.tinta};font-weight:600;">${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : ""
}
${
  botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr><td style="background:${COR.latao};border-radius:10px;">
<a href="${esc(botao.link)}" style="display:inline-block;padding:13px 22px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(botao.texto)}</a>
</td></tr></table>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 8px;font:12px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COR.fraca};">
${esc(c.motivo)}${
    descadastro
      ? ` <a href="${esc(descadastro)}" style="color:${COR.fraca};text-decoration:underline;">Não quero mais receber estes e-mails</a>.`
      : ""
  }
</td></tr>
</table></td></tr></table></body></html>`;

  const texto = [
    c.titulo,
    "",
    ...c.paragrafos,
    ...(detalhes.length ? ["", ...detalhes.map(([r, v]) => `${r}: ${v}`)] : []),
    ...(botao ? ["", `${botao.texto}: ${botao.link}`] : []),
    "",
    "—",
    c.motivo,
    ...(descadastro ? [`Não quero mais receber: ${descadastro}`] : []),
  ].join("\n");

  return { assunto: c.assunto, html, texto };
}
