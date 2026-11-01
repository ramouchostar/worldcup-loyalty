import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { BoosteatsLogo } from "@/components/brand/BoosteatsLogo";
import { MARKETING_PAGES, PILLAR_LABEL, type Pillar } from "@/lib/marketing-pages";

// Liens vers toutes les pages publiques (stratégie SEO, 2026-11-01) : chaque page
// du site mène aux autres, Google les trouve sans passer par le sitemap seul.
const COLUMNS: { title: string; pages: typeof MARKETING_PAGES }[] = [
  ...(["revenir", "venir", "main"] as Pillar[]).map((p) => ({
    title: PILLAR_LABEL[p],
    pages: MARKETING_PAGES.filter((m) => m.kind === "fonction" && m.pillar === p),
  })),
  { title: "Analyse gratuite", pages: MARKETING_PAGES.filter((m) => m.kind === "analyse") },
];

export function Footer() {
  return (
    <footer className="bg-ink border-t border-night-line py-7">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 flex flex-col gap-4">
        <nav aria-label="Pages du site" className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 mb-2 border-b border-night-line">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-night-text text-[13px] font-bold mb-2">{c.title}</p>
              <ul className="space-y-1.5">
                {c.title === "Analyse gratuite" && (
                  <li>
                    <Link href="/audit-gratuit" className="text-night-faint text-[13px] hover:text-night-text transition-colors">
                      Analyser mon restaurant
                    </Link>
                  </li>
                )}
                {c.title === "Analyse gratuite" && (
                  <li>
                    <Link href="/blog" className="text-night-faint text-[13px] hover:text-night-text transition-colors">
                      Le blog
                    </Link>
                  </li>
                )}
                {c.pages.map((m) => (
                  <li key={m.slug}>
                    <Link href={`/${m.slug}`} className="text-night-faint text-[13px] hover:text-night-text transition-colors">
                      {m.navLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <BoosteatsLogo tone="light" className="h-7 w-auto" />
          <div className="flex gap-6">
            <Link href="/" className="text-night-faint text-[13px] hover:text-night-text transition-colors">
              Accueil
            </Link>
            <TrackedLink
              ctaId="devenir_partenaire"
              ctaLocation="footer"
              audience="restaurateur"
              href="/become-a-partner"
              className="text-night-faint text-[13px] hover:text-night-text transition-colors"
            >
              Devenir partenaire
            </TrackedLink>
            <Link href="/login?as=resto" className="text-night-faint text-[13px] hover:text-night-text transition-colors">
              Connexion
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 border-t border-night-line">
          <Link href="/terms" className="text-night-faint text-xs hover:text-night-text transition-colors">
            Conditions générales
          </Link>
          <Link href="/privacy" className="text-night-faint text-xs hover:text-night-text transition-colors">
            Politique de confidentialité
          </Link>
          <a href="mailto:contact@boosteats.be" className="text-night-faint text-xs hover:text-night-text transition-colors">
            contact@boosteats.be
          </a>
        </div>
      </div>
    </footer>
  );
}
