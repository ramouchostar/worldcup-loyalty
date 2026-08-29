import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";

export function Footer() {
  return (
    <footer className="bg-ink border-t border-night-line py-7">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <span className="font-display font-bold text-[15px] text-white">
            BOOST<span className="text-moss">EATS</span>
          </span>
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
          <a href="mailto:contact@boosteats.tech" className="text-night-faint text-xs hover:text-night-text transition-colors">
            contact@boosteats.tech
          </a>
        </div>
      </div>
    </footer>
  );
}
