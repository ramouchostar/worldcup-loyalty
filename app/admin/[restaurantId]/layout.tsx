import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRestaurant, getRestaurantBranding } from "@/lib/restaurant";
import { brandStyle } from "@/lib/branding";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { AdminDesktopNav } from "@/components/admin/AdminDesktopNav";
import { getPlan } from "@/lib/entitlements";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;

  // Défense en profondeur — NE PAS se fier au seul middleware (cf.
  // CVE-2025-29927 : contournement du middleware via x-middleware-subrequest).
  // On re-vérifie ici, côté serveur, que l'utilisateur est admin de CET
  // établissement. Un seul garde protège toutes les pages /admin/[id]/*.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!access.isLegacyAdmin && !access.isOwner && !access.isSuperAdmin)
    redirect("/join?reason=admin-required");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  // ADR 0030 §3 — super-admin en visite sur un resto qui n'est pas le sien :
  // même console, mais un bandeau signale le contexte (anti-erreur de resto).
  const isPlatformMode = access.isSuperAdmin && !access.isOwner && !access.isLegacyAdmin;

  // ADR 0030 §2 — « Mes établissements » si l'utilisateur en administre
  // plusieurs (le sélecteur /admin cessait d'être orphelin).
  const [{ count: ownedCount }, plan] = await Promise.all([
    createAdminClient()
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id),
    // ADR 0029 — badge de plan : le restaurateur sait toujours où il en est.
    getPlan(restaurantId),
  ]);
  const showEstablishmentSwitcher = (ownedCount ?? 0) > 1;
  const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
    gratuit: { label: "Gratuit", cls: "bg-white/10 text-gray-300" },
    croissance: { label: "Croissance", cls: "bg-brand-gold/20 text-brand-gold" },
    pro: { label: "Pro", cls: "bg-brand-gold text-brand-dark" },
  };
  const planBadge = PLAN_BADGE[plan] ?? PLAN_BADGE.gratuit;

  const branding = await getRestaurantBranding(restaurantId);
  const base = `/admin/${restaurantId}`;
  // ADR 0030 §9 — nav en 4 sections thématiques (15+ entrées à plat ne
  // passaient plus à l'échelle) : Au quotidien = le comptoir, Fidélisation =
  // faire revenir, Pilotage = comprendre, Configuration = réglé une fois.
  // Le sandbox (outil de dev) reste volontairement hors nav — accessible par
  // URL, gardé par le middleware comme le reste.
  // Icônes (clé → components/admin/AdminNavIcons.tsx) au lieu d'émojis
  // (redesign m54) — rendu console pro plutôt que grand public.
  const navSections = [
    {
      title: "Au quotidien",
      links: [
        { href: base,                      label: "Dashboard", icon: "dashboard" },
        { href: `${base}/orders`,          label: "Commandes", icon: "orders" },
        { href: `${base}/pending-rewards`, label: "Cadeaux",   icon: "gifts" },
      ],
    },
    {
      title: "Fidélisation",
      links: [
        { href: `${base}/clients`,       label: "Mes clients",      icon: "clients" },
        { href: `${base}/broadcast`,     label: "Broadcasts",       icon: "broadcasts" },
        { href: `${base}/micro-rewards`, label: "Actions",          icon: "actions" },
        { href: `${base}/referrals`,     label: "Parrainages",      icon: "referrals" },
        { href: `${base}/team-tiers`,    label: "Paliers d'équipe", icon: "team-tiers" },
      ],
    },
    {
      title: "Pilotage",
      links: [
        { href: `${base}/sales`,    label: "Ventes",       icon: "sales" },
        { href: `${base}/forecast`, label: "Prévisions",   icon: "forecast" },
        { href: `${base}/insights`, label: "Opportunités", icon: "insights" },
        { href: `${base}/quality`,  label: "Baromètre",    icon: "quality" },
      ],
    },
    {
      title: "Configuration",
      links: [
        { href: `${base}/menu`,       label: "Menu & coûts", icon: "menu" },
        { href: `${base}/thresholds`, label: "Seuils CA",    icon: "thresholds" },
        { href: `${base}/qr`,         label: "QR code",      icon: "qr" },
        { href: `${base}/settings`,   label: "Réglages",     icon: "settings" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-paper font-brand" style={brandStyle(branding)}>
      {/* La console n'est pas instrumentée (hors périmètre GA4), mais c'est la
          destination de la dernière étape d'onboarding : sans ce flush,
          `partner_onboarding_completed` ne serait jamais émis. */}
      <AnalyticsIdentity status="restaurateur" />
      <header className="bg-brand-dark text-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-brand-red flex items-center justify-center font-display font-bold text-brand-dark text-[15px] shrink-0">
              {restaurant.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-white font-semibold text-sm truncate">{restaurant.name}</span>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-brand-gold">
                Console restaurateur
              </span>
            </div>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${planBadge.cls}`}>
              {planBadge.label}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {access.isSuperAdmin && (
              <Link href="/platform" className="text-xs text-brand-gold hover:text-white transition-colors">
                Plateforme
              </Link>
            )}
            {showEstablishmentSwitcher && (
              <Link href="/admin" className="text-xs text-gray-400 hover:text-white transition-colors">
                Mes établissements
              </Link>
            )}
            <Link href={`/r/${restaurantId}/dashboard`} className="text-xs text-gray-400 hover:text-white transition-colors">
              ← Retour espace membre
            </Link>
          </div>
        </div>
      </header>

      {/* Bandeau Mode plateforme (ADR 0030 §3) */}
      {isPlatformMode && (
        <div className="bg-brand-gold/15 border-b border-brand-gold/30">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-xs">
            <span className="text-amber-900 font-semibold truncate">
              🛠️ Mode plateforme — vous consultez « {restaurant.name} »
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={`/platform/members?restaurant=${restaurantId}`}
                className="text-amber-900 font-bold hover:underline"
              >
                👥 Membres
              </Link>
              <Link href="/platform" className="text-amber-900 font-bold hover:underline">
                ← Retour à la plateforme
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-0 md:gap-8">
        {/* Sidebar desktop — état actif + icônes (redesign m54) */}
        <AdminDesktopNav sections={navSections} />

        {/* Mobile — menu hamburger par sections (ADR 0030 §9) */}
        <AdminMobileNav sections={navSections} />

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
