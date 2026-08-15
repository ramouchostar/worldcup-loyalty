import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";

export function Footer() {
  return (
    <footer className="bg-ink border-t border-night-line py-7">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 flex items-center justify-between gap-6 flex-wrap">
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
    </footer>
  );
}
