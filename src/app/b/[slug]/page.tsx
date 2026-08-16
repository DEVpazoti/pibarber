import { MapPin, MessageCircle, Phone, Star } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { registrarVisita } from "@/app/actions/booking";
import { AbasPerfil, type AbaDoPerfil } from "@/components/booking/AbasPerfil";
import { BotaoFavoritoPublico } from "@/components/booking/BotaoFavoritoPublico";
import { Avatar, Chip, Rating } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { iconeDoBeneficio } from "@/lib/beneficios";
import {
  carregarBarbeariaPorSlug,
  estaAbertaAgora,
  indiceDoDia,
  type AvaliacaoPublica,
} from "@/lib/queries/barbearia";
import { createClient } from "@/lib/supabase/server";
import type { Amenity, BusinessHour, Professional, Service } from "@/lib/types";
import {
  brl,
  cn,
  dataBR,
  DIAS_SEMANA,
  duracao,
  horaCurta,
  linkWhatsApp,
  mascaraTelefone,
} from "@/lib/utils";

/**
 * O PERFIL PÚBLICO da barbearia.
 *
 * Abre sem login: é o link que vai na bio do Instagram e no grupo do WhatsApp.
 * Por isso o `openGraph` do metadata — sem ele o link compartilhado aparece
 * como uma URL crua, e ninguém toca.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dados = await carregarBarbeariaPorSlug(slug);

  if (!dados) return { title: "Barbearia não encontrada" };

  const { loja } = dados;
  const local = [loja.neighborhood, loja.city].filter(Boolean).join(", ");
  const descricao =
    loja.description ?? `Agende seu horário na ${loja.name}${local ? ` — ${local}` : ""}.`;

  return {
    title: loja.name,
    description: descricao,
    openGraph: {
      title: loja.name,
      description: descricao,
      type: "website",
      images: loja.cover_url ? [{ url: loja.cover_url }] : undefined,
    },
  };
}

export default async function PerfilBarbeariaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { slug } = await params;
  const { aba } = await searchParams;
  const dados = await carregarBarbeariaPorSlug(slug);

  if (!dados) notFound();

  const { loja, servicos, profissionais, horarios, avaliacoes, beneficios } = dados;

  // Registra o acesso para alimentar "Últimos acessos" na home do app.
  // Só faz efeito para cliente logado; visitante passa direto.
  await registrarVisita(loja.id);

  const perfil = await getProfile();
  const favoritada = perfil ? await jaEFavorita(perfil.id, loja.id) : false;

  const aberta = estaAbertaAgora(horarios);
  const hoje = indiceDoDia();
  const endereco = [loja.street, loja.number, loja.neighborhood, loja.city, loja.state]
    .filter(Boolean)
    .join(", ");

  /* --- As abas (T-5) ------------------------------------------------------
     Montadas aqui, no servidor, e passadas prontas para o componente de
     cliente: é assim que o conteúdo das cinco sai no HTML do SSR, inclusive o
     das abas fechadas, que é o requisito de SEO. Ver AbasPerfil.tsx.

     Aba sem conteúdo não entra na lista — a de Benefícios some quando o dono
     não marcou nenhum, e a mesma regra vale para as outras. Horário é a única
     que existe sempre: `business_hours` nasce com a barbearia. */
  const abas: AbaDoPerfil[] = [
    {
      id: "horarios",
      rotulo: "Horários",
      conteudo: <SecaoHorarios horarios={horarios} hoje={hoje} />,
    },
  ];

  if (servicos.length > 0) {
    abas.push({
      id: "servicos",
      rotulo: "Serviços",
      conteudo: <SecaoServicos servicos={servicos} />,
    });
  }

  if (profissionais.length > 0) {
    abas.push({
      id: "equipe",
      rotulo: "Equipe",
      conteudo: <SecaoEquipe profissionais={profissionais} />,
    });
  }

  if (beneficios.length > 0) {
    abas.push({
      id: "beneficios",
      rotulo: "Benefícios",
      conteudo: <SecaoBeneficios beneficios={beneficios} />,
    });
  }

  if (avaliacoes.length > 0) {
    abas.push({
      id: "avaliacoes",
      rotulo: "Avaliações",
      conteudo: <SecaoAvaliacoes avaliacoes={avaliacoes} />,
    });
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <div className="mx-auto max-w-[560px]">
        {/* --- Capa e logo -----------------------------------------------
            A capa é o maior elemento da página e o principal candidato a LCP
            (G6 do PERFORMANCE.md). Passou a `next/image` com `fill` porque a
            altura é fixa pelo CSS (h-40 / sm:h-52) e a largura acompanha a
            coluna — não há dimensão intrínseca para declarar.

            `priority` porque ela está no topo: sem isso o `next/image` a trata
            como lazy e ela só começa a baixar depois do layout, atrasando
            justamente o elemento que o visitante vê primeiro.

            `sizes` evita servir 1080px de largura para um celular de 390px, que
            é onde essa página quase sempre abre.

            `unoptimized` NÃO foi usado, mas repare no `remotePatterns` do
            next.config.ts: a URL é texto livre digitado pelo dono. Se ela
            estiver quebrada, o `next/image` falha o carregamento da imagem —
            e é só isso: o bloco tem `bg-surface-2` por baixo, então a capa
            some sem derrubar a página nem deslocar nada. */}
        <div className="relative h-40 w-full overflow-hidden bg-surface-2 sm:h-52">
          {loja.cover_url ? (
            <Image
              src={loja.cover_url}
              alt=""
              fill
              priority
              sizes="(max-width: 560px) 100vw, 560px"
              className="object-cover"
            />
          ) : null}

          <div className="absolute right-3 top-3">
            <BotaoFavoritoPublico
              barbershopId={loja.id}
              inicial={favoritada}
              logado={perfil != null}
            />
          </div>
        </div>

        <div className="px-4">
          <div className="-mt-10 flex items-end gap-3">
            <Avatar src={loja.logo_url} nome={loja.name} tamanho="xl" anel />

            <div className="min-w-0 flex-1 pb-1">
              <Chip tom={aberta ? "money" : "neutro"}>{aberta ? "Aberto agora" : "Fechado"}</Chip>
            </div>
          </div>

          <h1 className="mt-3 text-2xl leading-tight text-ink">{loja.name}</h1>
          <div className="mt-1">
            <Rating valor={Number(loja.rating_avg)} quantidade={loja.rating_count} tamanho="md" />
          </div>

          {loja.description ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{loja.description}</p>
          ) : null}

          {/* --- Contato --------------------------------------------------- */}
          <section className="mt-5 flex flex-col gap-2">
            {endereco ? (
              <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-ink">{endereco}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-my-1 inline-flex h-11 shrink-0 items-center text-sm font-medium text-brass"
                >
                  Como chegar
                </a>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {loja.phone ? (
                <a
                  href={`tel:${loja.phone}`}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-field bg-surface-2 px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  <span className="tnum">{mascaraTelefone(loja.phone)}</span>
                </a>
              ) : null}

              {loja.whatsapp ? (
                <a
                  href={linkWhatsApp(loja.whatsapp, `Olá! Vi a ${loja.name} no PiBarber.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-field bg-money-soft px-4 text-sm font-medium text-money transition-opacity hover:opacity-85"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </section>

          {/* --- As seções, agora em abas --------------------------------- */}
          <AbasPerfil abas={abas} abaInicial={aba ?? ""} />

          <p className="mt-8 pb-4 text-center text-xs text-ink-faint">
            PiBarber — desenvolvido por PiSystem.
          </p>
        </div>
      </div>

      {/* --- Chamada fixa na base -------------------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-safe pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[560px] gap-2 pb-3">
          {loja.accepts_online_booking ? (
            <Link
              href={`/b/${loja.slug}/agendar`}
              className="inline-flex h-[50px] w-full items-center justify-center rounded-field bg-brass text-base font-medium text-brass-ink transition-opacity active:scale-[0.98]"
            >
              Agendar
            </Link>
          ) : (
            <>
              {/* Sem agendamento online, o caminho é o telefone — e a tela
                  precisa dizer isso, não sumir com o botão. */}
              {loja.phone ? (
                <a
                  href={`tel:${loja.phone}`}
                  className="inline-flex h-[50px] flex-1 items-center justify-center gap-2 rounded-field bg-brass text-sm font-medium text-brass-ink"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  Ligar para agendar
                </a>
              ) : null}
              {loja.whatsapp ? (
                <a
                  href={linkWhatsApp(loja.whatsapp, `Olá! Queria agendar um horário.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[50px] flex-1 items-center justify-center gap-2 rounded-field bg-money-soft text-sm font-medium text-money"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   As seções — uma por aba
   ==========================================================================

   Componentes de servidor comuns: não têm estado nem evento, só desenham. Ficam
   aqui, e não em `components/`, porque nenhum outro lugar os usa e o arquivo
   inteiro descreve uma tela só.

   Nenhum deles traz `<h2>` de título: o rótulo já está no botão da aba, e um
   título repetindo "Serviços" logo abaixo do botão "Serviços" é ruído. O que a
   semântica de tabs perde em cabeçalho ela devolve em `aria-labelledby`, que o
   AbasPerfil liga entre painel e botão.
   ========================================================================== */

function SecaoHorarios({ horarios, hoje }: { horarios: BusinessHour[]; hoje: number }) {
  return (
    <ul className="overflow-hidden rounded-card border border-line bg-surface">
      {DIAS_SEMANA.map((nome, indice) => {
        const h = horarios.find((x) => x.weekday === indice);
        const eHoje = indice === hoje;

        return (
          <li
            key={nome}
            className={cn(
              "flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0",
              eHoje && "bg-brass-soft",
            )}
          >
            <span className={cn("text-sm", eHoje ? "font-semibold text-brass-deep" : "text-ink")}>
              {nome}
            </span>
            <span className="tnum text-sm text-ink-soft">
              {!h || h.is_closed || !h.opens_at || !h.closes_at
                ? "Fechado"
                : `${horaCurta(h.opens_at)} — ${horaCurta(h.closes_at)}${
                    h.break_start && h.break_end
                      ? ` (almoço ${horaCurta(h.break_start)}–${horaCurta(h.break_end)})`
                      : ""
                  }`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SecaoServicos({ servicos }: { servicos: Service[] }) {
  return (
    <ul className="overflow-hidden rounded-card border border-line bg-surface">
      {servicos.map((s) => (
        <li
          key={s.id}
          className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
        >
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
        </li>
      ))}
    </ul>
  );
}

function SecaoEquipe({ profissionais }: { profissionais: Professional[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {profissionais.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
        >
          <Avatar src={p.avatar_url} nome={p.name} tamanho="md" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{p.nickname || p.name}</span>
            {p.bio ? <span className="line-clamp-1 text-xs text-ink-soft">{p.bio}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A grade de comodidades (T-5).
 *
 * Duas colunas no celular, três no desktop. `min-w-0` no item não é enfeite: é
 * a armadilha nº9 do ESTADO.md — item de grid nasce com `min-width: auto` e
 * "Ar-condicionado" numa coluna estreita esticaria a página inteira, criando
 * rolagem horizontal onde não deveria haver.
 */
function SecaoBeneficios({ beneficios }: { beneficios: Amenity[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {beneficios.map((b) => {
        const Icone = iconeDoBeneficio(b.icon);
        return (
          <li
            key={b.id}
            className="flex min-w-0 items-center gap-2.5 rounded-card border border-line bg-surface p-3"
          >
            <Icone className="h-4 w-4 shrink-0 text-brass" aria-hidden />
            <span className="min-w-0 flex-1 text-sm text-ink">{b.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SecaoAvaliacoes({ avaliacoes }: { avaliacoes: AvaliacaoPublica[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {avaliacoes.map((a) => (
        <li key={a.id} className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    "h-3.5 w-3.5",
                    n <= a.rating ? "fill-brass text-brass" : "text-line-strong",
                  )}
                />
              ))}
            </span>
            <span className="text-xs text-ink-faint">
              {a.autor ?? "Cliente"} · {dataBR(a.created_at)}
            </span>
          </div>

          {a.comment ? (
            <p className="mt-2 text-sm leading-relaxed text-ink">{a.comment}</p>
          ) : null}

          {a.reply ? (
            <div className="mt-3 rounded-field bg-surface-2 p-3">
              <p className="text-xs font-semibold text-brass-deep">Resposta da barbearia</p>
              <p className="mt-0.5 text-sm text-ink-soft">{a.reply}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

async function jaEFavorita(profileId: string, shopId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("id")
    .eq("profile_id", profileId)
    .eq("barbershop_id", shopId)
    .maybeSingle();

  if (error) {
    console.error("[barbearia] falha ao conferir o favorito:", error);
    return false;
  }
  return data != null;
}
