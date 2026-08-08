"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/admin/AdminNavIcons";
import type { AdminNavSection } from "@/components/admin/AdminMobileNav";

// Sidebar desktop (redesign m54) — extraite en client component pour
// détecter la page active via usePathname (l'ancienne nav inline dans
// layout.tsx, un Server Component, ne surlignait jamais l'entrée courante).
export function AdminDesktopNav({ sections }: { sections: AdminNavSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex flex-col gap-5 w-[210px] shrink-0">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-faint px-2.5 mb-1.5">
            {section.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.links.map((link) => {
              const Icon = NAV_ICONS[link.icon];
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors ${
                    active
                      ? "bg-brand-red/10 text-brand-red font-semibold"
                      : "text-ink-body font-medium hover:bg-paper-subtle"
                  }`}
                >
                  {Icon && <Icon size={17} strokeWidth={1.7} className="shrink-0" />}
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
