import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRestaurant, getRestaurantBranding } from "@/lib/restaurant";
import { brandStyle } from "@/lib/branding";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";

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
  const { count: ownedCount } = await createAdminClient()
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const showEstablishmentSwitcher = (ownedCount ?? 0) > 1;

  const branding = await getRestaurantBranding(restaurantId);
  const base = `/admin/${restaurantId}`;
  // Ordonné par fréquence d'usage (audit 2026-07-23). Le sandbox (outil de
  // dev) est volontairement hors nav — accessible par URL, gardé par le
  // middleware comme le reste.
  const navLinks = [
    { href: base,                        label: "📊 Dashboard" },
    { href: `${base}/orders`,            label: "🧾 Commandes" },
    { href: `${base}/pending-rewards`,   label: "🎁 Cadeaux" },
    { href: `${base}/insights`,          label: "💡 Opportunités" },
    { href: `${base}/broadcast`,         label: "📣 Broadcasts" },
    { href: `${base}/menu`,              label: "📋 Menu & coûts" },
    { href: `${base}/sales`,             label: "📈 Ventes" },
    { href: `${base}/forecast`,          label: "🔮 Prévisions" },
    { href: `${base}/micro-rewards`,     label: "⭐ Actions" },
    { href: `${base}/referrals`,         label: "👥 Parrainages" },
    { href: `${base}/team-tiers`,        label: "🏆 Paliers d'équipe" },
    { href: `${base}/thresholds`,        label: "🎯 Seuils CA" },
    { href: `${base}/quality`,           label: "💬 Baromètre" },
    { href: `${base}/qr`,                label: "🔲 QR code" },
    { href: `${base}/settings`,          label: "⚙️ Réglages" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 font-brand" style={brandStyle(branding)}>
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-brand-gold font-black text-lg shrink-0">⚙️ Admin</span>
            <span className="text-gray-500 text-sm truncate">{restaurant.name}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {access.isSuperAdmin && (
              <Link href="/platform" className="text-xs text-brand-gold hover:text-white transition-colors">
                🛠️ Plateforme
              </Link>
            )}
            {showEstablishmentSwitcher && (
              <Link href="/admin" className="text-xs text-gray-400 hover:text-white transition-colors">
                Mes établissements
              </Link>
            )}
            <Link href={`/r/${restaurantId}/dashboard`} className="text-xs text-gray-400 hover:text-white transition-colors">
              ← Retour membre
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
            <Link href="/platform" className="text-amber-900 font-bold hover:underline shrink-0">
              ← Retour à la plateforme
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col gap-1 w-48 shrink-0">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-white hover:text-brand-red transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile nav */}
        <div className="md:hidden w-full mb-4">
          <div className="flex overflow-x-auto gap-2 pb-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 px-3 py-2 bg-white rounded-lg text-sm font-medium text-gray-700 hover:text-brand-red border border-gray-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
