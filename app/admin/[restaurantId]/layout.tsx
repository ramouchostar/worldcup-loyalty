import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRestaurant, getRestaurantBranding } from "@/lib/restaurant";
import { brandStyle } from "@/lib/branding";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";

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
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

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
    { href: `${base}/micro-rewards`,     label: "⭐ Actions" },
    { href: `${base}/referrals`,         label: "👥 Parrainages" },
    { href: `${base}/team-tiers`,        label: "🏆 Paliers d'équipe" },
    { href: `${base}/thresholds`,        label: "🎯 Seuils CA" },
    { href: `${base}/quality`,           label: "💬 Baromètre" },
    { href: `${base}/qr`,                label: "🔲 QR code" },
    { href: `${base}/settings`,          label: "⚙️ Réglages" },
  ];

  return (
    <div className="min-h-screen bg-gray-100" style={brandStyle(branding)}>
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-brand-gold font-black text-lg">⚙️ Admin</span>
            <span className="text-gray-500 text-sm">{restaurant.name}</span>
          </div>
          <Link href={`/r/${restaurantId}/dashboard`} className="text-xs text-gray-400 hover:text-white transition-colors">
            ← Retour membre
          </Link>
        </div>
      </header>

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
