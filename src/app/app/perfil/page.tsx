import {
  Clock,
  Heart,
  HelpCircle,
  History,
  KeyRound,
  Lock,
  MapPin,
  User,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { sair } from "@/app/actions/auth";
import { FotoDoPerfil } from "@/components/client/FotoDoPerfil";
import { ProfileMenuItem } from "@/components/client/ProfileMenuItem";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Perfil" };

const ITENS = [
  { href: "/app/perfil/dados", Icone: User, titulo: "Meus Dados", subtitulo: "Altere as informações do seu perfil" },
  { href: "/app/perfil/endereco", Icone: MapPin, titulo: "Endereço", subtitulo: "Altere seu endereço" },
  { href: "/app/perfil/acessos", Icone: KeyRound, titulo: "Acessos", subtitulo: "Métodos de login da sua conta" },
  { href: "/app/perfil/pessoas", Icone: Users, titulo: "Quem eu agendo", subtitulo: "Agende para filhos ou familiares" },
  { href: "/app/perfil/favoritos", Icone: Heart, titulo: "Favoritos", subtitulo: "Suas barbearias favoritas" },
  { href: "/app/perfil/seguranca", Icone: Lock, titulo: "Segurança", subtitulo: "Altere sua senha" },
  { href: "/app/perfil/historico", Icone: History, titulo: "Histórico", subtitulo: "Seu histórico de agendamentos" },
  { href: "/app/perfil/espera", Icone: Clock, titulo: "Lista de espera", subtitulo: "Acompanhe sua lista de espera" },
  { href: "/app/perfil/ajuda", Icone: HelpCircle, titulo: "Central de ajuda", subtitulo: "Perguntas frequentes e suporte" },
] as const;

export default async function PerfilPage() {
  const perfil = await requireRole(["client"]);

  return (
    <div className="flex flex-col gap-6">
      {/* --- Cabeçalho ---------------------------------------------------- */}
      <header className="flex flex-col items-center gap-2 pt-2">
        <FotoDoPerfil
          profileId={perfil.id}
          nome={perfil.full_name}
          urlAtual={perfil.avatar_url}
        />

        <div className="text-center">
          <p className="text-lg font-semibold text-ink">{perfil.full_name ?? "Sua conta"}</p>
          <p className="text-sm text-ink-soft">{perfil.email}</p>
        </div>
      </header>

      {/* --- Menu --------------------------------------------------------- */}
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {ITENS.map((item) => (
          <ProfileMenuItem key={item.href} {...item} />
        ))}
      </ul>

      {/* --- Sair: vermelho, centralizado, sem caixa ---------------------- */}
      <form action={sair}>
        <button
          type="submit"
          className="h-12 w-full text-center text-sm font-semibold text-danger transition-opacity hover:opacity-80"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
