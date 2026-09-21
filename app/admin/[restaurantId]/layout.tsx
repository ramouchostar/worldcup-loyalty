import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SlidersHorizontal, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { getRestaurant, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { RestaurantMark } from "@/components/admin/RestaurantMark";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { getAdminRestaurantIds } from "@/lib/restaurant-admins";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { AdminDesktopNav } from "@/components/admin/AdminDesktopNav";
import { SimpleNav } from "@/components/admin/simple/SimpleNav";
import { CONSOLE_VIEW_COOKIE, consoleSections, parseConsoleView, simpleTabs } from "@/lib/admin-nav";
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
  if (!access.isLegacyAdmin && !access.isOwner && !access.isSuperAdmin && access.seatRole === null)
    redirect("/join?reason=admin-required");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  // ADR 0030 §3 — super-admin en visite sur un resto qui n'est pas le sien :
  // même console, mais un bandeau signale le contexte (anti-erreur de resto).
  // ADR 0041 — un titulaire de siège (gérant/manager/équipe) n'est pas non
  // plus en « mode plateforme », même s'il n'est pas isOwner (il peut être
  // le 2ᵉ gérant, un manager, ou un siège équipe).
  const isPlatformMode = access.isSuperAdmin && !access.isOwner && !access.isLegacyAdmin && access.seatRole === null;

  // ADR 0030 §2 — « Mes établissements » si l'utilisateur en administre
  // plusieurs (le sélecteur /admin cessait d'être orphelin).
  // ADR 0041 — inclut les établissements où l'utilisateur n'est owner_id
  // d'aucun (un simple siège manager/équipe), pas seulement ceux qu'il a créés.
  const [adminRestaurantIds, plan] = await Promise.all([
    getAdminRestaurantIds(user.id),
    // ADR 0029 — badge de plan : le restaurateur sait toujours où il en est.
    getPlan(restaurantId),
  ]);
  const showEstablishmentSwitcher = adminRestaurantIds.length > 1;
  const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
    gratuit: { label: "Gratuit", cls: "bg-white/10 text-white/70" },
    croissance: { label: "Croissance", cls: "bg-white/20 text-white" },
    pro: { label: "Pro", cls: "bg-white text-ink" },
  };
  const planBadge = PLAN_BADGE[plan] ?? PLAN_BADGE.gratuit;

  const branding = await getRestaurantBranding(restaurantId);
  // ADR 0054 §4 (amendé le 2026-09-21) — le logo ET le nom de l'établissement
  // en tête de console : le restaurateur reconnaît sa maison avant de lire.
  // C'est tout ce que la console prend à sa charte : ses couleurs et sa
  // police restent celles de la page membre (voir le conteneur ci-dessous).
  const logo = logoPublicUrl(branding.logo_url);
  const base = `/admin/${restaurantId}`;
  // ADR 0041 §6 — un siège équipe n'a pas accès aux trois pages financières
  // /réglages (seuils CA, paliers d'équipe, réglages établissement) : leur
  // lien disparaît de la nav (chaque page se re-garde aussi côté serveur —
  // ce filtrage n'est qu'un confort d'UI, pas la garde elle-même).
  const canManage = canManageEstablishment(access);
  // ADR 0030 §9 — nav pro en 4 sections thématiques ; ADR 0064 — vue simple
  // à quatre onglets, par défaut. Les deux listes vivent dans lib/admin-nav.ts
  // (la page « Plus » affiche la liste complète). Le sandbox (outil de dev)
  // reste volontairement hors nav — accessible par URL, gardé comme le reste.
  const navSections = consoleSections(base, canManage);
  const vue = parseConsoleView((await cookies()).get(CONSOLE_VIEW_COOKIE)?.value);
  // Le seul badge de la barre d'onglets : les tickets qui attendent une
  // décision (ADR 0064). Compté ici parce que la barre est sur chaque page.
  let pendingTickets = 0;
  if (vue === "simple") {
    try {
      const { count } = await createAdminClient()
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending");
      pendingTickets = count ?? 0;
    } catch {
      // Un badge manquant ne casse pas la console.
    }
  }
  const switchHref = `${base}/vue?mode=${vue === "simple" ? "pro" : "simple"}`;

  return (
    // ADR 0054 §2 (amendé le 2026-09-21) — la console porte les couleurs
    // Boosteats, pas celles de l'établissement : aucun `brandStyle` ici, donc
    // les jetons `brand-*` résolvent sur les défauts Boosteats (app/globals.css)
    // et la police sur Inter. Chez Kraainem, la charte rouge faisait lire la
    // moindre bonne nouvelle comme une alerte. Les supports imprimables
    // (qr/print) posent eux-mêmes la charte de l'établissement.
    <div className="min-h-screen bg-paper font-brand">
      {/* La console n'est pas instrumentée (hors périmètre GA4), mais c'est la
          destination de la dernière étape d'onboarding : sans ce flush,
          `partner_onboarding_completed` ne serait jamais émis. */}
      <AnalyticsIdentity status="restaurateur" />
      <header className="bg-ink text-white sticky top-0 z-10 pt-safe">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <RestaurantMark name={restaurant.name} logoUrl={logo} />
            <div className="flex flex-col leading-tight min-w-0">
              {/* Le nom reste écrit à côté du logo (choix du porteur,
                  2026-09-21) : un logo seul se lit mal en 36 px, et un
                  restaurateur qui gère plusieurs établissements doit savoir
                  d'un coup d'œil dans lequel il est. */}
              <span className="text-white font-semibold text-sm truncate">{restaurant.name}</span>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/60 whitespace-nowrap">
                Console restaurateur
              </span>
            </div>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${planBadge.cls}`}>
              {planBadge.label}
            </span>
          </div>
          {/* flex-wrap sur la ligne parente : un super admin ajoute un 3e lien
              (Plateforme) qui ne rentre plus à côté du bloc de marque sur
              mobile — ce groupe bascule alors sur sa propre ligne plutôt que
              de se superposer au reste. */}
          <div className={`${vue === "simple" ? "hidden md:flex" : "flex"} items-center gap-3 flex-wrap`}>
            {/* ADR 0064 — bascule d'affichage. En vue simple sur téléphone,
                ces liens vivent dans l'onglet « Plus » : l'en-tête tient sur
                une ligne et la page commence tout de suite. */}
            <Link href={switchHref} className="text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap">
              <SlidersHorizontal size={12} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
              {vue === "simple" ? "Vue pro" : "Vue simple"}
            </Link>
            {/* Invitation à déposer le logo — visible tant qu'il n'y en a pas,
                et seulement pour qui peut l'ajouter (ADR 0041 §6 : la page
                réglages est réservée aux gérants/managers). Disparaît d'elle
                -même une fois le logo en place. */}
            {!logo && canManage && (
              <Link
                href={`${base}/settings#charte`}
                className="text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap"
              >
                Ajouter ton logo
              </Link>
            )}
            {access.isSuperAdmin && (
              <Link href="/platform" className="text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap">
                Plateforme
              </Link>
            )}
            {showEstablishmentSwitcher && (
              <Link href="/admin" className="text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap">
                Mes établissements
              </Link>
            )}
            <Link href={`/r/${restaurantId}/dashboard`} className="text-xs text-white/60 hover:text-white transition-colors whitespace-nowrap">
              ← Retour espace membre
            </Link>
          </div>
        </div>
      </header>

      {/* Bandeau Mode plateforme (ADR 0030 §3) */}
      {isPlatformMode && (
        <div className="bg-warn/10 border-b border-warn/30">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-xs">
            <span className="text-warn font-semibold truncate">
              <Wrench size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
              Mode plateforme — vous consultez « {restaurant.name} »
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={`/platform/members?restaurant=${restaurantId}`}
                className="text-warn font-bold hover:underline"
              >
                <Users size={13} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5" aria-hidden="true" />
                Membres
              </Link>
              <Link href="/platform" className="text-warn font-bold hover:underline">
                ← Retour à la plateforme
              </Link>
            </div>
          </div>
        </div>
      )}

      <div
        className={`max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-0 md:gap-8 ${
          vue === "simple" ? "pb-28 md:pb-6" : ""
        }`}
      >
        {vue === "simple" ? (
          // ADR 0064 — quatre onglets : en bas sur téléphone, en colonne sur ordinateur.
          <SimpleNav tabs={simpleTabs(base)} ticketsBadge={pendingTickets} proHref={switchHref} />
        ) : (
          <>
            {/* Sidebar desktop — état actif + icônes (redesign m54) */}
            <AdminDesktopNav sections={navSections} />

            {/* Mobile — menu hamburger par sections (ADR 0030 §9) */}
            <AdminMobileNav sections={navSections} />
          </>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
