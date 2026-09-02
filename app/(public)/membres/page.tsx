import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { TrackedLink } from "@/components/analytics/TrackedLink";

// Landing générale — audience membres/clients. Distincte de la racine "/"
// (audience B2B restaurateurs depuis le 2026-08-08 — cf. app/(public)/page.tsx).
//
// Refonte 2026-08-31 : écran unique (splash) — logo, titre, CTA connexion /
// création de compte. Remplace l'ancienne page longue (points de douleur,
// mécanique, FAQ) qui ne convertissait pas assez vite au comptoir.
// `ctaId="rejoindre"` conservé sur le CTA principal malgré le changement de
// libellé ("Rejoindre gratuitement" → "Se connecter") : même position/
// destination (/login), et docs/tracking-plan.md demande de garder un
// cta_id stable pour ne pas couper la série temporelle GA4.
//
// Règles ADR 0007 strictement respectées ici (page CLIENT) : jamais d'euros
// pour le score communautaire, jamais de CA/seuil restaurant.

export const metadata = {
  title: "Transforme tes tickets de caisse en cadeaux",
  description:
    "Rejoins le programme de fidélité de ton restaurant et gagne des cadeaux à chaque commande directe. Gratuit à vie, aucune carte à garder.",
};

export default async function LandingPage() {
  // Bug 2026-09-02 — /membres est le start_url de la PWA : un membre déjà
  // connecté qui ouvre l'app installée ne doit JAMAIS retomber sur le splash
  // de connexion. Même règle que la vitrine /r/[id] (ADR 0040) ; la
  // destination par rôle (ADR 0030 §1) couvre aussi restaurateur et
  // plateforme.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(await resolvePostLoginDestination(user.id));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="pt-safe">
        <div className="pt-8 pb-4 flex justify-center">
          <span className="font-display font-bold text-lg tracking-tight text-brand-dark">
            BOOST<span className="text-brand-red">EATS</span>
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-black leading-tight text-gray-900 max-w-md mb-10">
          Transforme tes tickets de caisse en <span className="text-brand-red">cadeaux</span>
        </h1>

        <div className="w-full max-w-xs flex flex-col items-center gap-4">
          <TrackedLink
            ctaId="rejoindre"
            ctaLocation="hero"
            audience="membre"
            href="/login"
            className="w-full bg-brand-red text-white text-center py-4 rounded-full font-bold text-lg hover:bg-brand-red/85 transition-colors shadow-lg"
          >
            Se connecter
          </TrackedLink>
          <TrackedLink
            ctaId="creer_compte"
            ctaLocation="hero"
            audience="membre"
            href="/signup"
            className="font-semibold text-gray-900 hover:underline"
          >
            Créer un compte
          </TrackedLink>
        </div>
      </div>

      <div className="pb-safe">
        <div className="pb-8 px-6 text-center">
          <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
            En continuant, tu acceptes les{" "}
            <Link href="/terms" className="underline hover:text-gray-600">
              Conditions d&apos;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">
              Politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
