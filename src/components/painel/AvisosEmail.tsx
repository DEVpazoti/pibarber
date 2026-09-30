"use client";

import { AlertCircle, Check, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarAvisosEmail, type AvisosEmailLigados } from "@/app/actions/shop";
import { Button } from "@/components/ui";

/**
 * Os e-mails desta barbearia (31_emails.sql).
 *
 * Os três vêm LIGADOS (o e-mail de volta também, por decisão do negócio: é
 * o que traz o cliente de volta). A loja desliga o que não quiser. O
 * intervalo não é da loja: é da plataforma, e o super admin muda no /admin.
 *
 * Os e-mails de serviço ao cliente (confirmação, lembrete, cancelamento pela
 * loja) não têm interruptor: são do horário que ele marcou.
 */
export function AvisosEmail({
  iniciais,
  diasVolta,
  emailDono,
}: {
  iniciais: AvisosEmailLigados;
  diasVolta: number;
  emailDono: string | null;
}) {
  const router = useRouter();
  const [ligados, setLigados] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await salvarAvisosEmail(ligados);
      if (!r.ok) return setErro(r.message ?? "Não consegui salvar.");
      setMensagem(r.message ?? "Salvo.");
      router.refresh();
    });
  }

  const itens: { chave: keyof AvisosEmailLigados; rotulo: string; quando: string }[] = [
    {
      chave: "novo",
      rotulo: "Agendamento novo",
      quando: `Um e-mail para você${emailDono ? ` (${emailDono})` : ""} a cada horário marcado pelo cliente, no app ou no link da barbearia.`,
    },
    {
      chave: "cancelado",
      rotulo: "Cancelamento pelo cliente",
      quando: "Um e-mail para você quando o cliente cancela — o horário fica livre para outro.",
    },
    {
      chave: "volta",
      rotulo: "Lembrete de voltar",
      quando: `Um e-mail para o cliente ${diasVolta} dias depois da última visita, com o botão de agendar. Só para quem não tem horário marcado, uma vez por visita, e com a opção de parar de receber.`,
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">E-mails</h2>
        <p className="text-sm text-ink-soft">
          O cliente com e-mail cadastrado recebe a confirmação, o lembrete na véspera e o aviso
          quando você cancela um horário. Aqui você escolhe os avisos para você e o lembrete de
          voltar.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {itens.map((item) => {
          const campo = `email-${item.chave}`;
          return (
            <li
              key={item.chave}
              className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5"
            >
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.rotulo}</p>
                  <p className="text-xs text-ink-faint">{item.quando}</p>
                </div>
              </div>
              <label
                htmlFor={campo}
                className="flex min-h-[44px] cursor-pointer items-center gap-3"
              >
                <input
                  id={campo}
                  type="checkbox"
                  checked={ligados[item.chave]}
                  onChange={(e) => setLigados((a) => ({ ...a, [item.chave]: e.target.checked }))}
                  className="h-5 w-5 accent-brass"
                />
                <span className="text-sm text-ink">
                  {ligados[item.chave] ? "Ligado" : "Desligado"}
                </span>
              </label>
            </li>
          );
        })}
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
        Salvar e-mails
      </Button>
    </section>
  );
}
