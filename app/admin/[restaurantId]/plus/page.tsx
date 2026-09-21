import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeftRight, ChevronRight, Image as ImageIcon, LayoutDashboard, Store, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { getAdminRestaurantIds } from "@/lib/restaurant-admins";
import { getRestaurantBranding } from "@/lib/restaurant";
import { CONSOLE_VIEW_COOKIE, consoleSections, parseConsoleView, simpleTabs } from "@/lib/admin-nav";
import { NAV_ICONS } from "@/components/admin/AdminNavIcons";
import { Card, PageHeader, SectionLabel } from "@/components/admin/ui";

export const metadata = { title: "Plus" };

// Onglet « Plus » de la vue simple (ADR 0064) — tout ce qui n'est pas un des
// quatre onglets, sans rien retirer : chaque page de la vue pro est ici, dite
// en mots de restaurateur (« ce que tu vends, plat par plat » plutôt que
// « Ventes »). C'est aussi là que vivent, sur téléphone, les liens de
// l'en-tête (plateforme, établissements, espace membre) et la bascule vers la
// vue pro.
export default async function AdminPlusPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Défense en profondeur — ne pas dépendre du seul layout (CVE-2025-29927).
  const access = await getAdminAccess(user.id, restaurantId);
  if (!access.isLegacyAdmin && !access.isOwner && !access.isSuperAdmin && access.seatRole === null) redirect("/join?reason=admin-required");

  const base = `/admin/${restaurantId}`;
  const canManage = canManageEstablishment(access);
  const [adminRestaurantIds, branding] = await Promise.all([getAdminRestaurantIds(user.id), getRestaurantBranding(restaurantId)]);
  const vue = parseConsoleView((await cookies()).get(CONSOLE_VIEW_COOKIE)?.value);

  // Les onglets sont déjà sous le pouce : les relister ici serait du bruit.
  const tabHrefs = new Set(simpleTabs(base).map((t) => t.href));
  const sections = consoleSections(base, canManage)
    .map((s) => ({ ...s, links: s.links.filter((l) => !tabHrefs.has(l.href)) }))
    .filter((s) => s.links.length > 0);

  const account: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
    ...(!branding.logo_url && canManage
      ? [{ href: `${base}/settings#charte`, label: "Ajouter ton logo", hint: "Il apparaît dans l'app de tes clients, sur tes QR et ici", icon: ImageIcon }]
      : []),
    ...(adminRestaurantIds.length > 1 ? [{ href: "/admin", label: "Mes établissements", hint: "Changer d'établissement", icon: Store }] : []),
    ...(access.isSuperAdmin ? [{ href: "/platform", label: "Plateforme", hint: "La console du réseau", icon: Wrench }] : []),
    { href: `/r/${restaurantId}/dashboard`, label: "Espace membre", hint: "Ce que voient tes clients dans l'app", icon: UserRound },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Plus" subtitle="Tous les outils de ta console." />

      {/* La bascule d'affichage d'abord : c'est la seule chose de cette page
          qui change la console elle-même. */}
      <Card padding="p-0">
        <div className="px-5 pt-4 pb-3">
          <SectionLabel tone="muted">Affichage</SectionLabel>
        </div>
        <Link
          href={`${base}/vue?mode=${vue === "simple" ? "pro" : "simple"}`}
          className="flex items-center gap-3.5 px-5 py-3.5 border-t border-paper-border hover:bg-paper transition-colors"
        >
          <span className="w-9 h-9 rounded-[9px] bg-paper-subtle text-ink flex items-center justify-center shrink-0" aria-hidden="true">
            {vue === "simple" ? <LayoutDashboard size={18} strokeWidth={1.7} /> : <ArrowLeftRight size={18} strokeWidth={1.7} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-semibold text-ink">{vue === "simple" ? "Passer en vue pro" : "Revenir à la vue simple"}</p>
            <p className="text-[12.5px] text-ink-muted mt-0.5">
              {vue === "simple"
                ? "Toutes les pages dans le menu, et le tableau de bord détaillé du mois."
                : "L'essentiel du jour, quatre onglets, l'étape où tu en es."}
            </p>
          </div>
          <ChevronRight size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
        </Link>
      </Card>

      {sections.map((section) => (
        <Card key={section.title} padding="p-0">
          <div className="px-5 pt-4 pb-3">
            <SectionLabel tone="muted">{section.title}</SectionLabel>
          </div>
          {section.links.map((link) => {
            const Icon = NAV_ICONS[link.icon];
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3.5 px-5 py-3 border-t border-paper-border hover:bg-paper transition-colors min-h-[56px]"
              >
                <span className="w-9 h-9 rounded-[9px] bg-paper-subtle text-ink-muted flex items-center justify-center shrink-0" aria-hidden="true">
                  {Icon && <Icon size={18} strokeWidth={1.7} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{link.label}</p>
                  <p className="text-[12.5px] text-ink-muted mt-0.5">{link.hint}</p>
                </div>
                <ChevronRight size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
              </Link>
            );
          })}
        </Card>
      ))}

      <Card padding="p-0">
        <div className="px-5 pt-4 pb-3">
          <SectionLabel tone="muted">Compte</SectionLabel>
        </div>
        {account.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3.5 px-5 py-3 border-t border-paper-border hover:bg-paper transition-colors min-h-[56px]"
          >
            <span className="w-9 h-9 rounded-[9px] bg-paper-subtle text-ink-muted flex items-center justify-center shrink-0" aria-hidden="true">
              <a.icon size={18} strokeWidth={1.7} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold text-ink">{a.label}</p>
              <p className="text-[12.5px] text-ink-muted mt-0.5">{a.hint}</p>
            </div>
            <ChevronRight size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
