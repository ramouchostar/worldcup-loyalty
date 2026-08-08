"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/admin/AdminNavIcons";

export type AdminNavSection = {
  title: string;
  links: { href: string; label: string; icon: string }[];
};

// ADR 0030 §9 — nav admin mobile : menu hamburger par sections, remplace la
// barre horizontale scrollable (16 entrées → celles de droite invisibles).
// Palette + icônes alignées (redesign m54) sur AdminDesktopNav.
export function AdminMobileNav({ sections }: { sections: AdminNavSection[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const current =
    sections.flatMap((s) => s.links).find((l) => l.href === pathname)?.label ?? "Menu";

  return (
    <div className="md:hidden w-full mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between bg-white border border-paper-border rounded-xl px-4 py-3"
      >
        <span className="text-sm font-semibold text-ink">{current}</span>
        <span className="text-ink-faint text-lg leading-none" aria-hidden="true">
          {open ? "✕" : "☰"}
        </span>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-paper-border rounded-xl p-3 space-y-4 shadow-lg">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="font-mono px-2 text-[10px] tracking-[0.12em] uppercase text-ink-faint mb-1">
                {section.title}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {section.links.map((link) => {
                  const Icon = NAV_ICONS[link.icon];
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-red/10 text-brand-red"
                          : "text-ink-body hover:bg-paper-subtle"
                      }`}
                    >
                      {Icon && <Icon size={15} strokeWidth={1.7} className="shrink-0" />}
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
