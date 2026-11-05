"use client";

import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { useScrolled } from "./motion";
import { BoosteatsLogo } from "@/components/brand/BoosteatsLogo";
import { OfferMenu } from "./OfferMenu";

// z-40 : au-dessus de la recherche du héros (z-30), sinon elle mord sur le menu « Notre offre ».
export function Header() {
  const scrolled = useScrolled();

  return (
    <header
      className={`sticky top-0 z-40 pt-safe bg-ink border-b transition-colors duration-200 ${
        scrolled ? "border-night-line" : "border-transparent"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="shrink-0">
          <BoosteatsLogo tone="light" className="h-8 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-4 xl:gap-6">
          <OfferMenu />
          <NavLink href="/audit-gratuit">Analyse gratuite</NavLink>
          <NavLink href="/#plans">Tarifs</NavLink>
          <span className="hidden lg:inline">
            <NavLink href="/#cas-client">Cas client</NavLink>
          </span>
          <span className="hidden xl:inline">
            <NavLink href="/#questions">Questions</NavLink>
          </span>
          <span className="hidden lg:inline">
            <NavLink href="/blog">Blog</NavLink>
          </span>
          <NavLink href="/login?as=resto">Connexion</NavLink>
          <TrackedLink
            ctaId="devenir_partenaire"
            ctaLocation="header_desktop"
            audience="restaurateur"
            href="/become-a-partner"
            className="bg-boost-olive text-white text-[13px] xl:text-[15px] font-semibold whitespace-nowrap px-4 py-2.5 rounded-lg hover:bg-boost-olive-dark active:bg-boost-night transition-colors"
          >
            Devenir partenaire
          </TrackedLink>
        </nav>
        <Link
          href="/login?as=resto"
          className="md:hidden bg-boost-olive text-white text-[15px] font-semibold px-4 min-h-[44px] inline-flex items-center rounded-lg hover:bg-boost-olive-dark active:bg-boost-night transition-colors"
        >
          Connexion
        </Link>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-night-text text-[13px] xl:text-[15px] font-medium whitespace-nowrap hover:text-white transition-colors">
      {children}
    </Link>
  );
}
