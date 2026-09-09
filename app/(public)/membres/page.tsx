import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { COIN_EMOJI } from "@/lib/fluent-emoji";

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
// pour le score communautaire, jamais de CA/seuil restaurant. Les pièces
// Fluent Emoji ci-dessous sont une illustration, pas un chiffre : aucune
// valeur, aucune monnaie, aucun solde n'est suggéré.
//
// Illustrations 2026-09-09 : le splash était nu (logo + titre + 2 CTA sur du
// blanc). Les pièces reprennent, sur l'accueil de l'app installée, le langage
// visuel déjà posé sur la vitrine /r/[id] et le dashboard (lib/fluent-emoji,
// retour terrain du 2026-08-30) — même paquet, même CDN, mêmes règles :
// décoratives (alt vide + aria-hidden), derrière le contenu (z-0 vs z-10),
// jamais cliquables. jsDelivr est déjà autorisé en img-src (next.config.mjs).

// Placement des pièces : chacune mord sur le bord gauche ou droit (décalage
// horizontal négatif), et se tient dans l'une des deux bandes libres d'un
// écran de téléphone — au-dessus du titre, ou sous les boutons et au-dessus
// de la mention légale. Sur 390 px de large, le titre occupe toute la
// largeur : c'est l'écart VERTICAL qui garantit qu'aucune pièce ne passe
// derrière un texte.
const COIN_POSITIONS = [
  "top-10 -left-9 w-24 h-24 sm:w-28 sm:h-28 rotate-[18deg]",
  "top-32 -right-8 w-16 h-16 sm:w-20 sm:h-20 -rotate-[14deg]",
  "bottom-40 -left-7 w-20 h-20 sm:w-24 sm:h-24 -rotate-[10deg]",
  "bottom-24 -right-10 w-28 h-28 sm:w-32 sm:h-32 rotate-[24deg]",
];

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
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      {/* Le calque des pièces est borné à la largeur de la colonne de contenu
          (et centré) : sur un téléphone il occupe tout l'écran comme avant,
          sur un grand écran les pièces encadrent le titre au lieu de se
          perdre aux bords du navigateur. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 mx-auto max-w-[520px] pointer-events-none select-none"
      >
        {/* eslint-disable @next/next/no-img-element */}
        {COIN_POSITIONS.map((position) => (
          <img key={position} src={COIN_EMOJI} alt="" className={`absolute ${position}`} />
        ))}
        {/* eslint-enable @next/next/no-img-element */}
      </div>

      <div className="pt-safe relative z-10">
        <div className="pt-8 pb-4 flex justify-center">
          <span className="font-display font-bold text-lg tracking-tight text-brand-dark">
            BOOST<span className="text-brand-red">EATS</span>
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center relative z-10">
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

      <div className="pb-safe relative z-10">
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
