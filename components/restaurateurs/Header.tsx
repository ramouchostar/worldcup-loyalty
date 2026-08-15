"use client";

import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { useScrolled } from "./motion";

export function Header() {
  const scrolled = useScrolled();

  return (
    <header
      className={`sticky top-0 z-20 bg-ink/[0.92] backdrop-blur-xl border-b transition-shadow duration-300 ${
        scrolled ? "border-night-line shadow-[0_8px_24px_rgba(0,0,0,0.25)]" : "border-transparent"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <span className="font-display font-bold text-[17px] tracking-tight text-white">
          BOOST<span className="text-moss">EATS</span>
        </span>
        <nav className="hidden md:flex items-center gap-7">
          <NavLink href="#produit">Le produit</NavLink>
          <NavLink href="#plans">Plans</NavLink>
          <NavLink href="#demarrer">Démarrer</NavLink>
          <NavLink href="/login?as=resto">Connexion</NavLink>
          <TrackedLink
            ctaId="devenir_partenaire"
            ctaLocation="header_desktop"
            audience="restaurateur"
            href="/become-a-partner"
            className="bg-moss text-white text-[13.5px] font-bold px-4 py-2.5 rounded-lg hover:bg-moss-dark transition-colors"
          >
            Devenir partenaire
          </TrackedLink>
        </nav>
        <TrackedLink
          ctaId="devenir_partenaire"
          ctaLocation="header_mobile"
          audience="restaurateur"
          href="/become-a-partner"
          className="md:hidden bg-moss text-white text-[13px] font-bold px-3.5 py-2 rounded-lg hover:bg-moss-dark transition-colors"
        >
          Partenaire
        </TrackedLink>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-night-text text-[13.5px] font-medium hover:text-white transition-colors">
      {children}
    </Link>
  );
}
