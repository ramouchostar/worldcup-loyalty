"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UsersRound, Gift, Star, ReceiptText, type LucideIcon } from "lucide-react";

type Tab = { href: string; label: string; icon: LucideIcon; id?: string };

// 5 destinations (audit 2026-07-23) : la photo du ticket est l'action n°1,
// mise en avant par un bouton surélevé au centre — icône ReceiptText (ticket
// papier), la même que sur la vitrine et l'écran de capture. JAMAIS l'icône
// Scan (cadre de visée) : c'est celle des scanners de QR, et c'est
// précisément ce que des clients ont photographié à la place de leur ticket
// (ADR 0048 / audit du 2026-09-04). Les 4 autres restent des onglets sobres.
// Le compte/RGPD vit dans HeaderMenu.
const TABS: Tab[] = [
  { href: "dashboard",     label: "Accueil",     icon: Home },
  { href: "my-team",       label: "Équipe",      icon: UsersRound, id: "tour-nav-equipe" },
  { href: "my-rewards",    label: "Mes cadeaux", icon: Gift, id: "tour-nav-recompenses" },
  { href: "micro-rewards", label: "Actions",     icon: Star, id: "tour-nav-actions" },
];

export function BottomNav({ restaurantId }: { restaurantId: string }) {
  const pathname = usePathname();
  const base = `/r/${restaurantId}`;
  const scanHref = `${base}/submit-order`;
  const scanActive = pathname === scanHref || pathname.startsWith(scanHref + "/");
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10"
      aria-label="Navigation principale"
    >
      <div className="max-w-2xl mx-auto relative grid grid-cols-5 pb-safe">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} base={base} pathname={pathname} />
        ))}
        <div aria-hidden="true" />
        {right.map((tab) => (
          <NavTab key={tab.href} tab={tab} base={base} pathname={pathname} />
        ))}

        {/* Bouton ticket surélevé — action n°1, sort du grid pour flotter
            au-dessus de la barre (pattern FAB, absent ailleurs du repo). */}
        <Link
          href={scanHref}
          id="tour-nav-commande"
          aria-label="Photographier mon ticket"
          aria-current={scanActive ? "page" : undefined}
          className="absolute left-1/2 -top-6 -translate-x-1/2 flex items-center justify-center w-14 h-14 rounded-full bg-brand-red text-white transition-transform hover:scale-105 active:scale-95"
          style={{ boxShadow: "0 8px 20px -2px rgb(var(--brand-red) / 0.5)" }}
        >
          <ReceiptText className="w-6 h-6" strokeWidth={2.5} />
        </Link>
      </div>
    </nav>
  );
}

function NavTab({ tab, base, pathname }: { tab: Tab; base: string; pathname: string }) {
  const href = `${base}/${tab.href}`;
  const active = pathname === href || pathname.startsWith(href + "/");
  const Icon = tab.icon;
  return (
    <Link
      href={href}
      id={tab.id}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] min-w-0 transition-colors ${
        active ? "text-brand-red font-semibold" : "text-gray-400 hover:text-brand-red"
      }`}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 1.8} />
      <span className="truncate">{tab.label}</span>
      {active && (
        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-red" aria-hidden="true" />
      )}
    </Link>
  );
}
