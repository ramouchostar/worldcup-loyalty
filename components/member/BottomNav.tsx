"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/dashboard",     label: "Dashboard",   icon: "🏠", id: undefined },
  { href: "/submit-order",  label: "Commande",    icon: "🧾", id: "tour-nav-commande" },
  { href: "/rewards",       label: "Récompenses", icon: "🎁", id: "tour-nav-recompenses" },
  { href: "/micro-rewards", label: "Actions",     icon: "⭐", id: "tour-nav-actions" },
  { href: "/leaderboard",   label: "Classement",  icon: "🏆", id: "tour-nav-classement" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10"
      aria-label="Navigation principale"
    >
      <div className="max-w-2xl mx-auto flex justify-around pb-safe">
        {navLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              id={link.id}
              className={`flex flex-col items-center py-2 px-1 text-xs min-w-0 transition-colors ${
                active
                  ? "text-brand-red font-semibold"
                  : "text-gray-500 hover:text-brand-red"
              }`}
              aria-label={link.label}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-lg leading-none mb-0.5" aria-hidden="true">
                {link.icon}
              </span>
              <span className="truncate">{link.label}</span>
              {active && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-brand-red" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
