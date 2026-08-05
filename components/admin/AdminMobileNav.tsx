"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavSection = {
  title: string;
  links: { href: string; label: string }[];
};

// ADR 0030 §9 — nav admin mobile : menu hamburger par sections, remplace la
// barre horizontale scrollable (16 entrées → celles de droite invisibles).
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
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
      >
        <span className="text-sm font-semibold text-gray-900">{current}</span>
        <span className="text-gray-400 text-lg leading-none" aria-hidden="true">
          {open ? "✕" : "☰"}
        </span>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl p-3 space-y-4 shadow-lg">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                {section.title}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === link.href
                        ? "bg-brand-red/10 text-brand-red"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
