"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { NAV_ICONS } from "@/components/admin/AdminNavIcons";
import type { AdminNavLink } from "@/lib/admin-nav";

type Tab = AdminNavLink & { match: "exact" | "prefix" };

// Navigation de la vue simple (ADR 0064) — quatre onglets, les mêmes partout :
// en bas de l'écran sur téléphone (au pouce, toujours visibles, là où le
// hamburger de la vue pro cachait 18 entrées derrière un bouton), en colonne
// sur ordinateur. Une page qui n'est pas un onglet (Menu, QR code, Clients…)
// allume « Plus » : on sait toujours d'où l'on vient (règle `persistent-nav`).
//
// Un seul badge : le nombre de tickets qui attendent une décision. Rien
// d'autre ne mérite de tirer l'œil depuis la barre (règle `tab-badge`).

function activeHref(tabs: Tab[], pathname: string): string {
  const hit = tabs.find((t) => (t.match === "exact" ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)));
  return hit ? hit.href : tabs[tabs.length - 1].href;
}

export function SimpleNav({ tabs, ticketsBadge, proHref }: { tabs: Tab[]; ticketsBadge: number; proHref: string }) {
  const pathname = usePathname() ?? "";
  const current = activeHref(tabs, pathname);

  return (
    <>
      {/* Ordinateur — colonne à gauche, mêmes quatre entrées */}
      <nav aria-label="Navigation de la console" className="hidden md:flex flex-col gap-0.5 w-[200px] shrink-0">
        {tabs.map((t) => {
          const Icon = NAV_ICONS[t.icon];
          const active = t.href === current;
          const badge = t.icon === "orders" && ticketsBadge > 0 ? ticketsBadge : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
                active ? "bg-paper-subtle text-ink font-semibold" : "text-ink-body font-medium hover:bg-paper-subtle"
              }`}
            >
              {Icon && <Icon size={18} strokeWidth={1.7} className="shrink-0" aria-hidden="true" />}
              <span className="flex-1">{t.label}</span>
              {badge > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-warn text-white text-[11px] font-bold flex items-center justify-center">
                  {badge}
                  <span className="sr-only"> à vérifier</span>
                </span>
              )}
            </Link>
          );
        })}
        <div className="mt-4 pt-4 border-t border-paper-border">
          <Link
            href={proHref}
            className="flex items-start gap-2.5 px-3 py-2 rounded-lg text-ink-muted hover:bg-paper-subtle transition-colors"
          >
            <SlidersHorizontal size={16} strokeWidth={1.7} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="block text-[13px] font-semibold text-ink-body">Passer en vue pro</span>
              <span className="block text-[11.5px] text-ink-faint">Tous les écrans et tous les chiffres</span>
            </span>
          </Link>
        </div>
      </nav>

      {/* Téléphone — barre d'onglets fixe en bas, au-dessus de la zone de geste */}
      <nav
        aria-label="Navigation de la console"
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-paper-border pb-safe"
      >
        <div className="grid grid-cols-4 max-w-md mx-auto">
          {tabs.map((t) => {
            const Icon = NAV_ICONS[t.icon];
            const active = t.href === current;
            const badge = t.icon === "orders" && ticketsBadge > 0 ? ticketsBadge : 0;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[58px] text-[11px] transition-colors ${
                  active ? "text-ink font-semibold" : "text-ink-faint font-medium"
                }`}
              >
                {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-ink" aria-hidden="true" />}
                <span className="relative">
                  {Icon && <Icon size={22} strokeWidth={active ? 2 : 1.7} aria-hidden="true" />}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-warn text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span>
                  {t.label}
                  {badge > 0 && <span className="sr-only"> — {badge} à vérifier</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
