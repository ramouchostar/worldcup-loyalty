import Link from "next/link";
import {
  TriangleAlert,
  Receipt,
  Star,
  CircleCheck,
  ChevronRight,
  Lightbulb,
  Trophy,
  TrendingUp,
  QrCode,
  Settings,
  Award,
  type LucideIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { getRestaurant } from "@/lib/restaurant";
import { getPlan } from "@/lib/entitlements";
import { getScanUsage, SCAN_CAP_GRATUIT } from "@/lib/scan-meter";
import { RequestPlanButton } from "@/components/admin/Paywall";
import { InstallAppCard } from "@/components/InstallAppCard";

// Dashboard admin (redesign m54) — priorise ce qui demande une action
// aujourd'hui avant les chiffres. Un restaurateur débordé doit comprendre en
// un coup d'œil où il en est ; les stats détaillées restent à une page de
// clic (ventes, opportunités…) plutôt que noyées ici (ADR 0010, transposé
// côté restaurateur — ici les € restent autorisés, cf. ADR 0007 §admin).
export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  // `?bienvenue=1` : première arrivée par lien d'invitation (ADR 0032). La
  // proposition d'installer l'app y prend un ton d'accueil, au lieu de se
  // fondre dans la console d'un habitué.
  searchParams: Promise<{ bienvenue?: string; seat?: string }>;
}) {
  const { restaurantId } = await params;
  const { bienvenue, seat } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const r = (path: string) => `/admin/${restaurantId}${path}`;
  const restaurant = await getRestaurant(restaurantId);

  const [
    { count: pendingOrders },
    { count: pendingClaims },
    { count: totalMembers },
    { data: thresholdHistory },
    { data: pendingOrdersData },
    { data: validatedAmounts },
    { data: marginItems },
    { data: budgetRows },
  ] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    admin.from("micro_reward_claims").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    // Tous les membres inscrits — l'équipe est optionnelle (ADR 0018), le
    // filtre team_id sous-comptait (audit 2026-07-23).
    admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    // Historique (pas juste la période en cours) : permet de calculer une
    // vraie série de périodes déverrouillées d'affilée, sans l'inventer.
    admin.from("restaurant_thresholds").select("period_label, current_revenue, target_revenue, is_unlocked").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(12),
    admin.from("orders").select("flag_reasons").eq("restaurant_id", restaurantId).eq("status", "pending"),
    // Gains du programme (depuis le début) : CA scanné + marge estimée sur
    // les articles reconnus (ADR 0020) + coût réel des cadeaux distribués
    admin.from("orders").select("amount").eq("restaurant_id", restaurantId).eq("status", "validated").limit(10000),
    admin
      .from("order_items")
      .select("quantity, menu_items!inner(menu_price, cost_price), orders!inner(restaurant_id, status)")
      .eq("orders.restaurant_id", restaurantId)
      .eq("orders.status", "validated")
      .limit(10000),
    admin.from("reward_budget_tracking").select("rewards_cost").eq("restaurant_id", restaurantId),
  ]);

  const programRevenue = (validatedAmounts ?? []).reduce((s, o) => s + Number((o as { amount: number }).amount), 0);
  type MarginRow = { quantity: number; menu_items: { menu_price: number; cost_price: number } | { menu_price: number; cost_price: number }[] };
  const programMargin = ((marginItems ?? []) as unknown as MarginRow[]).reduce((s, row) => {
    const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
    if (!mi) return s;
    return s + (Number(mi.menu_price) - Number(mi.cost_price)) * (Number(row.quantity) || 1);
  }, 0);
  const rewardsCost = (budgetRows ?? []).reduce((s, r) => s + Number((r as { rewards_cost: number }).rewards_cost), 0);
  const netGain = programMargin - rewardsCost;

  const flaggedCount = (pendingOrdersData ?? []).filter(
    (o: { flag_reasons: string[] | null }) => Array.isArray(o.flag_reasons) && o.flag_reasons.length > 0
  ).length;
  const nonFlaggedPending = Math.max(0, (pendingOrders ?? 0) - flaggedCount);

  // ADR 0029 §6 (Phase 3) — nudge de croissance positif si le volume de
  // scans du mois dépasse la couverture du plan Gratuit. Jamais bloquant.
  const plan = await getPlan(restaurantId);
  const scanUsage = await getScanUsage(restaurantId, plan);

  const thRows = (thresholdHistory ?? []) as {
    period_label: string;
    current_revenue: number;
    target_revenue: number;
    is_unlocked: boolean;
  }[];
  const th = thRows[0] ?? null;

  const revenuePct = th
    ? Math.min(100, Math.round((th.current_revenue / th.target_revenue) * 100))
    : 0;
  const missingToUnlock = th ? Math.max(0, Number(th.target_revenue) - Number(th.current_revenue)) : 0;
  // Périodes déverrouillées d'affilée, la plus récente en premier — calculé
  // depuis l'historique réel (jamais inventé), affiché seulement à partir de
  // 2 pour ne pas parader un non-signal côté restaurants tout neufs.
  let unlockStreak = 0;
  for (const row of thRows) {
    if (!row.is_unlocked) break;
    unlockStreak++;
  }

  const dateLabel = capitalize(
    new Date().toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" })
  );
  const members = totalMembers ?? 0;
  const membersLabel = `${members} membre${members > 1 ? "s" : ""} inscrit${members > 1 ? "s" : ""}`;

  // "À faire aujourd'hui" — priorité absolue de la page : ce qui bloque une
  // commande ou un cadeau, avant toute donnée de pilotage.
  const actionItems: {
    href: string;
    icon: LucideIcon;
    tone: "danger" | "warn";
    title: string;
    sub: string;
    count: number;
  }[] = [];
  if (flaggedCount > 0) {
    actionItems.push({
      href: `${r("/orders")}?filter=flagged`,
      icon: TriangleAlert,
      tone: "danger",
      title: `${flaggedCount} commande${flaggedCount > 1 ? "s" : ""} suspecte${flaggedCount > 1 ? "s" : ""} à vérifier`,
      sub: "Montant inhabituel ou ticket ambigu détecté par l'OCR",
      count: flaggedCount,
    });
  }
  if (nonFlaggedPending > 0) {
    actionItems.push({
      href: `${r("/orders")}?filter=pending`,
      icon: Receipt,
      tone: "warn",
      title: `${nonFlaggedPending} commande${nonFlaggedPending > 1 ? "s" : ""} en attente de validation`,
      sub: "La confirmation automatique n'a pas pu conclure",
      count: nonFlaggedPending,
    });
  }
  if ((pendingClaims ?? 0) > 0) {
    actionItems.push({
      href: r("/micro-rewards"),
      icon: Star,
      tone: "warn",
      title: `${pendingClaims} action${(pendingClaims ?? 0) > 1 ? "s" : ""} client à valider`,
      sub: "Avis Google, abonnements sociaux en attente de confirmation",
      count: pendingClaims ?? 0,
    });
  }

  const secondaryLinks = [
    { href: r("/team-tiers"), icon: Trophy, label: "Paliers d'équipe", sub: "Récompenses collectives" },
    { href: `/r/${restaurantId}/leaderboard`, icon: Award, label: "Classement public", sub: "Vue temps réel ↗", external: true },
    { href: r("/sales"), icon: TrendingUp, label: "Ventes par plat", sub: "Quantités, CA, marges, heures" },
    { href: r("/qr"), icon: QrCode, label: "QR code", sub: "À imprimer pour tes clients" },
    { href: r("/settings"), icon: Settings, label: "Mon établissement", sub: "Infos & liens sociaux" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink">Tableau de bord</h1>
          <p className="text-ink-muted text-[13.5px] mt-1">{dateLabel} · {membersLabel}</p>
        </div>
      </div>

      {/* ── ADR 0038 — installer la console ─────────────────────────────────
          Le restaurateur arrive ici par le lien d'invitation (ADR 0032) et
          n'a jamais vu de proposition d'installation : le navigateur ne la
          fait pas toujours, et rien d'autre ne la faisait. Disparaît une fois
          l'app installée. */}
      <InstallAppCard
        audience="restaurateur"
        surface={bienvenue ? "console_premiere_visite" : "console_admin"}
        ton={bienvenue ? "accueil" : "discret"}
      />

      {/* ADR 0041 — le rôle proposé sur l'invitation a été rétrogradé en
          équipe (quota gérant/manager déjà atteint) : le dire une fois,
          plutôt que de laisser la personne découvrir en silence qu'elle a un
          rôle différent de celui annoncé. */}
      {seat === "equipe-quota" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-900">
            Ton accès a été ajouté en <strong>équipe (accès établissement)</strong> — le quota de
            gérants/managers était déjà atteint. Ton accès à la console reste complet.
          </p>
        </div>
      )}

      {/* Établissement pas encore en ligne : guider la fin de l'inscription
          (audit 2026-07-23 — un abandon d'onboarding atterrissait dans une
          console vide sans explication). */}
      {restaurant?.status === "pending" && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4">
          <p className="font-bold text-amber-900 text-sm mb-1">
            ⏳ Ton établissement n&apos;est pas encore visible des clients
          </p>
          <p className="text-xs text-amber-800 mb-3">
            Il sera mis en ligne après validation par notre équipe. En attendant,
            assure-toi d&apos;avoir terminé les 3 étapes de l&apos;inscription :
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={r("/menu")} className="text-xs font-semibold bg-white border border-warn/30 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-warn/10 transition-colors">
              2/3 · Menu &amp; coûts →
            </Link>
            <Link href={`/become-a-partner/${restaurantId}/receipt`} className="text-xs font-semibold bg-white border border-warn/30 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-warn/10 transition-colors">
              3/3 · Configurer le ticket de caisse →
            </Link>
          </div>
        </div>
      )}

      {/* Nudge scans (ADR 0029 §6) — ton POSITIF : l'élan du resto, jamais
          « quota dépassé, paie ». Rien ne s'arrête au-dessus du plafond. */}
      {scanUsage.over && (
        <div className="bg-good/10 border border-good/30 rounded-xl p-4">
          <p className="font-bold text-green-900 text-sm mb-1">
            🚀 {scanUsage.count} tickets scannés ce mois-ci — tes clients jouent le jeu !
          </p>
          <p className="text-xs text-green-800 mb-3">
            Ton programme dépasse le volume couvert par le plan Gratuit ({SCAN_CAP_GRATUIT}{" "}
            scans/mois). Rien ne s&apos;arrête — mais avec le plan Croissance, les scans
            deviennent illimités et tu touches cette communauté avec des promos ciblées,
            des prévisions et tes ventes par plat.
          </p>
          <RequestPlanButton
            restaurantId={restaurantId}
            feature="scan_cap"
            requiredPlan="croissance"
            className="bg-good text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-good/90 transition-colors"
          />
        </div>
      )}

      {/* À faire aujourd'hui — priorité n°1 de la page */}
      <section className="bg-white border border-paper-border rounded-xl overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand-red">▶ À faire aujourd&apos;hui</p>
        </div>

        {actionItems.length > 0 ? (
          actionItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3.5 px-5 py-3.5 border-t border-paper-border hover:bg-paper transition-colors"
            >
              <span
                className={`w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 ${
                  item.tone === "danger" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"
                }`}
              >
                <item.icon size={18} strokeWidth={1.7} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-semibold text-ink">{item.title}</p>
                <p className="text-[12.5px] text-ink-muted mt-0.5">{item.sub}</p>
              </div>
              <span
                className={`text-white text-[11px] font-bold rounded-full px-2.5 py-0.5 shrink-0 ${
                  item.tone === "danger" ? "bg-danger" : "bg-warn"
                }`}
              >
                {item.count}
              </span>
              <ChevronRight size={15} className="text-ink-faint shrink-0" />
            </Link>
          ))
        ) : (
          <div className="flex items-center gap-3.5 px-5 py-5 border-t border-paper-border">
            <span className="w-9 h-9 rounded-[9px] bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
              <CircleCheck size={18} strokeWidth={1.7} />
            </span>
            <div>
              <p className="text-[14.5px] font-semibold text-ink">Tout est à jour</p>
              <p className="text-[12.5px] text-ink-muted mt-0.5">Aucune action urgente. Bon service !</p>
            </div>
          </div>
        )}
      </section>

      {/* Opportunités — renvoie vers le moteur de suggestions (promos,
          combos, créneaux creux) plutôt que de dupliquer son calcul ici :
          la page dédiée fait déjà tout le travail d'agrégation. */}
      <Link
        href={r("/insights")}
        className="flex items-center gap-3.5 bg-white border-[1.5px] border-brand-gold/40 rounded-xl px-5 py-4 hover:border-brand-gold transition-colors"
      >
        <span className="w-9 h-9 rounded-[9px] bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
          <Lightbulb size={18} strokeWidth={1.7} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold text-ink">Opportunités pour toi</p>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Promos, combos et créneaux à fort potentiel identifiés à partir de tes ventes
          </p>
        </div>
        <span className="text-brand-red text-[12.5px] font-bold shrink-0">Découvrir →</span>
      </Link>

      {/* Gains du programme — depuis le début */}
      <section className="bg-brand-dark text-white rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand-gold">Ce que le programme t&apos;a rapporté</p>
          <Link href={r("/sales")} className="text-xs font-semibold text-brand-gold hover:text-white transition-colors">Détail par plat →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-display text-2xl font-bold tabular-nums">
              {programRevenue.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11.5px] text-white/70 mt-1">CA généré (tickets scannés)</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold tabular-nums text-brand-gold">
              {programMargin.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11.5px] text-white/70 mt-1">marge sur articles reconnus</p>
          </div>
          <div>
            <p className={`font-display text-2xl font-bold tabular-nums ${netGain >= 0 ? "text-good" : "text-danger"}`}>
              {netGain.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11.5px] text-white/70 mt-1">
              gain net estimé (marge − {rewardsCost.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} de cadeaux)
            </p>
          </div>
        </div>
      </section>

      {/* Statut CA restaurant — barre à paliers + trophée en ligne d'arrivée
          (plutôt qu'une barre plate) : rendre la progression désirable, pas
          juste l'afficher. */}
      {th && (
        <section className="bg-white border border-paper-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brand-red">Objectif CA — {th.period_label}</p>
            <Link href={r("/thresholds")} className="text-xs font-semibold text-brand-red hover:underline">
              Gérer →
            </Link>
          </div>

          <p className="font-display text-[19px] font-bold tracking-[-0.01em] text-ink my-2.5">
            {th.is_unlocked
              ? "Bonus communautaire débloqué pour cette période 🎉"
              : `${missingToUnlock.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} pour débloquer le bonus communautaire`}
          </p>

          <div className="relative px-3.5 mb-9">
            <div className="relative w-full bg-paper-subtle rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${th.is_unlocked ? "bg-good" : "bg-gradient-to-r from-brand-gold to-brand-red"}`}
                style={{ width: `${revenuePct}%` }}
              />
              {/* Repères 25/50/75% — juste de la lisibilité visuelle, pas de données */}
              <div className="absolute left-1/4 -top-[3px] w-0.5 h-4 bg-white" />
              <div className="absolute left-1/2 -top-[3px] w-0.5 h-4 bg-white" />
              <div className="absolute left-3/4 -top-[3px] w-0.5 h-4 bg-white" />
            </div>
            {/* Ligne d'arrivée — le trophée marque l'objectif à atteindre, pas la position actuelle */}
            <div
              className="absolute -right-1 -top-[13px] w-[34px] h-[34px] rounded-full bg-brand-red flex items-center justify-center text-white"
              style={{ boxShadow: "0 0 20px rgb(var(--brand-red) / 0.5)" }}
            >
              <Trophy size={17} strokeWidth={1.8} />
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-ink-muted">
              {Number(th.current_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
              {" / "}
              {Number(th.target_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
              {" · "}
              <strong className="text-ink">{revenuePct}%</strong>
            </span>
            {unlockStreak >= 2 && (
              <span className="font-mono text-[11px] tracking-[0.06em] text-brand-red font-semibold">
                {unlockStreak} périodes d&apos;objectif atteint d&apos;affilée
              </span>
            )}
          </div>
        </section>
      )}

      {/* Pour aller plus loin — liens secondaires, volontairement en retrait
          visuel (icônes fines, pas de couleur) : la priorité de la page va
          aux sections ci-dessus. */}
      <section>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-faint mb-2">Pour aller plus loin</p>
        <div className="bg-white border border-paper-border rounded-xl overflow-hidden">
          {secondaryLinks.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              className={`flex items-center gap-3.5 px-5 py-3.5 hover:bg-paper transition-colors ${i > 0 ? "border-t border-paper-border" : ""}`}
            >
              <span className="w-[34px] h-[34px] rounded-lg bg-paper-subtle text-ink-muted flex items-center justify-center shrink-0">
                <link.icon size={17} strokeWidth={1.6} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{link.label}</p>
                <p className="text-xs text-ink-faint mt-0.5">{link.sub}</p>
              </div>
              <ChevronRight size={14} className="text-ink-faint shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
