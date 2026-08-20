"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ADR 0030 §2 + ADR 0033 §4 — la console plateforme n'est plus une page mais un
// espace : sa navigation est portée par le layout, jamais recopiée dans chaque
// page. La « règle du retour » (CONTEXT.md) est satisfaite par le lien de
// sortie vers l'app membre, présent partout.
const TABS = [
  { href: "/platform", label: "Réseau", icon: "🛠️" },
  { href: "/platform/stats", label: "Chiffres", icon: "📈" },
  { href: "/platform/backlog", label: "Backlog", icon: "🗂️" },
  { href: "/platform/members", label: "Membres", icon: "👥" },
  { href: "/platform/scans", label: "Tickets", icon: "🧾" },
];

export function PlatformHeader({ backHref }: { backHref: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10 pt-safe">
      <div className="max-w-3xl mx-auto px-4 pt-3 flex items-center justify-between gap-3">
        <span className="text-brand-gold font-black text-lg">Plateforme</span>
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-xs text-gray-400 hover:text-white transition-colors">
            ← Retour à l&apos;app
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              Déco
            </button>
          </form>
        </div>
      </div>

      <nav className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          // `/platform` est le préfixe de toutes les autres : sa correspondance
          // doit être exacte, sinon les quatre onglets s'allument ensemble.
          const active = tab.href === "/platform" ? pathname === "/platform" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? "border-brand-gold text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <span aria-hidden="true">{tab.icon}</span> {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
