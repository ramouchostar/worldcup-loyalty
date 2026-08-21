import {
  LayoutDashboard,
  Receipt,
  Gift,
  Users,
  UsersRound,
  Megaphone,
  Star,
  Share2,
  Trophy,
  TrendingUp,
  Activity,
  Lightbulb,
  Gauge,
  Compass,
  BookOpen,
  Target,
  QrCode,
  Settings,
  type LucideIcon,
} from "lucide-react";

// Icônes de la nav admin (redesign m54) — un seul jeu partagé entre la
// sidebar desktop et le menu mobile, indexé par la même clé que celle posée
// sur chaque lien dans app/admin/[restaurantId]/layout.tsx. Une clé (string)
// plutôt qu'un composant : layout.tsx est un Server Component, un composant
// React ne traverse pas la frontière serveur → client en tant que prop.
export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: Receipt,
  gifts: Gift,
  clients: Users,
  teams: UsersRound,
  broadcasts: Megaphone,
  actions: Star,
  referrals: Share2,
  "team-tiers": Trophy,
  sales: TrendingUp,
  forecast: Activity,
  insights: Lightbulb,
  quality: Gauge,
  benchmarks: Compass,
  menu: BookOpen,
  thresholds: Target,
  qr: QrCode,
  settings: Settings,
};
