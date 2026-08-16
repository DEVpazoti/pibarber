import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock,
  HandCoins,
  LayoutDashboard,
  Scissors,
  Settings,
  Star,
  Users,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type ItemMenu = {
  href: string;
  rotulo: string;
  Icone: LucideIcon;
  /** Só o dono vê. Financeiro ou configuração. */
  soDono?: boolean;
  /** Aparece na barra inferior do celular (as demais vão para "Mais"). */
  destaque?: boolean;
  /**
   * Este item carrega o contador de pendências.
   *
   * É uma marca no item, e não um href comparado com string na navegação, para
   * o dia em que a rota mudar não deixar o badge apontando para o nada em
   * silêncio.
   */
  temBadge?: boolean;
};

const TODOS: ItemMenu[] = [
  { href: "/painel", rotulo: "Hoje", Icone: LayoutDashboard, destaque: true },
  { href: "/painel/agenda", rotulo: "Agenda", Icone: CalendarDays, destaque: true },
  { href: "/painel/clientes", rotulo: "Clientes", Icone: Users, destaque: true },
  // NÃO é `soDono`: quem opera o balcão é quem esquece de concluir, e é o
  // assistente que precisa resolver. Ele faz isso sem ver valor nenhum.
  {
    href: "/painel/pendencias",
    rotulo: "Pendências",
    Icone: AlertTriangle,
    temBadge: true,
  },
  { href: "/painel/servicos", rotulo: "Serviços", Icone: Scissors },
  { href: "/painel/equipe", rotulo: "Equipe", Icone: UserCog, soDono: true },
  { href: "/painel/espera", rotulo: "Lista de espera", Icone: Clock },
  { href: "/painel/avaliacoes", rotulo: "Avaliações", Icone: Star, soDono: true },
  { href: "/painel/caixa", rotulo: "Caixa", Icone: Wallet, soDono: true },
  { href: "/painel/comissoes", rotulo: "Comissões", Icone: ClipboardList, soDono: true },
  { href: "/painel/fiado", rotulo: "Fiado", Icone: HandCoins, destaque: true },
  { href: "/painel/relatorios", rotulo: "Relatórios", Icone: BarChart3, soDono: true },
  { href: "/painel/configuracoes", rotulo: "Configurações", Icone: Settings, soDono: true },
];

/**
 * O menu do papel.
 *
 * O assistente recebe 7 itens: Hoje, Agenda, Clientes, Pendências, Serviços,
 * Lista de espera e Fiado. Os itens de dinheiro e de configuração simplesmente
 * não existem para ele — e a rota também é bloqueada no servidor e na RLS.
 */
export function itensDoMenu(podeVerDinheiro: boolean): ItemMenu[] {
  return podeVerDinheiro ? TODOS : TODOS.filter((i) => !i.soDono);
}
