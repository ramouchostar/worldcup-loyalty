import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  HelpCircle,
  TrendingDown,
  UserX,
  Users,
  Receipt,
  Share2,
  QrCode,
  Store,
  PiggyBank,
  Trophy,
  Gift,
  Sparkles,
} from "lucide-react";
import { IconTile } from "@/components/IconTile";

// Landing générale — audience membres/clients. Distincte de la racine "/"
// (audience B2B restaurateurs depuis le 2026-08-08 — cf. app/(public)/page.tsx).
// Déménagée de "/" vers "/membres" à cette date pour laisser la racine du
// domaine boosteats.tech à la landing restaurateurs. Chantier "landing pages
// / emailing / ads" (2026-07-28), périmètre 2/3 : même traitement que
// l'ex-/restaurateurs (structure argumentée, icônes plates unifiées, zéro emoji).
//
// Règles ADR 0007 strictement respectées ici (page CLIENT) :
// - Jamais d'euros pour le score communautaire, jamais de CA/seuil restaurant
// - Jamais les mots "automatique" ou "instantané" pour la validation des tickets
// - Le double verrou et le budget cadeaux restent invisibles (progression
//   décrite en termes neutres, jamais de mécanique interne)

export const metadata = {
  title: "Fidélité communautaire — commande directement, gagne avec les tiens",
  description:
    "Rejoins l'équipe de ton école, ton travail ou ton quartier et débloquez des cadeaux ensemble à chaque commande directe. Gratuit à vie, aucune carte à garder.",
};

const PAIN_POINTS = [
  {
    icon: HelpCircle,
    title: "Les cartes de fidélité, personne n'y comprend rien",
    desc: "Dix tampons, un seuil caché, une carte perdue au fond du portefeuille — la plupart des programmes ne servent à personne.",
  },
  {
    icon: TrendingDown,
    title: "Commander seul ne rapporte pas grand-chose",
    desc: "Un rabais isolé pèse peu. Rien ne récompense vraiment la fidélité répétée — encore moins celle de tout un groupe.",
  },
  {
    icon: UserX,
    title: "Tes amis ne profitent jamais de tes bons plans",
    desc: "Tu es fidèle à un resto, mais rien ne permet à ta classe, tes collègues ou ton quartier d'en profiter avec toi.",
  },
];

const MECHANICS = [
  {
    icon: Users,
    title: "Rejoins ou crée une équipe",
    desc: "École, entreprise, quartier, taxis... chaque équipe cumule les commandes directes de ses membres pour débloquer des cadeaux collectifs.",
  },
  {
    icon: Receipt,
    title: "Commande directement, ton cadeau t'attend",
    desc: "Scanne ton ticket après une commande en salle ou par téléphone — ton cadeau est calculé dès que ton ticket est vérifié. Les commandes via Uber Eats, Deliveroo ou Takeaway ne comptent pas.",
  },
  {
    icon: Share2,
    title: "Partage ton lien, gagnez plus vite",
    desc: "Envoie ton lien personnel par WhatsApp — dès qu'un ami s'inscrit vraiment, votre équipe progresse plus vite.",
  },
];

const FEATURES = [
  {
    icon: QrCode,
    title: "Aucune carte à garder",
    desc: "Tout se passe depuis un lien ou un QR code, dans ton navigateur — rien à installer, rien à sortir du portefeuille.",
  },
  {
    icon: Store,
    title: "Un compte, tous tes restaurants",
    desc: "Rejoins autant d'établissements du réseau que tu veux — chacun garde sa propre équipe et ses propres cadeaux.",
  },
  {
    icon: PiggyBank,
    title: "Ta réserve personnelle",
    desc: "Mets un cadeau de côté au lieu de le récupérer tout de suite, et échange-le plus tard contre une récompense plus grande.",
  },
  {
    icon: Trophy,
    title: "Des cadeaux qui montent en gamme",
    desc: "Plus votre équipe commande directement, plus les cadeaux collectifs débloqués grandissent.",
  },
];

const ONBOARDING = [
  { n: "1", t: "Choisis ton restaurant", d: "Scanne le QR code sur place, ou choisis un établissement du réseau." },
  { n: "2", t: "Rejoins ou crée ton équipe", d: "École, entreprise, quartier, taxis... l'équipe reste facultative, jamais obligatoire." },
  { n: "3", t: "Commandez, gagnez ensemble", d: "Chaque commande directe fait progresser toute l'équipe." },
];

const FAQ = [
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui, à vie. Aucune carte bancaire, aucun abonnement, quel que soit le restaurant.",
  },
  {
    q: "Je dois télécharger une application ?",
    a: "Non — tout fonctionne depuis ton navigateur via un lien ou un QR code.",
  },
  {
    q: "Je suis obligé de rejoindre une équipe ?",
    a: "Non. Sans équipe, tu gardes déjà ton cadeau individuel à chaque commande — l'équipe est un bonus, jamais une obligation.",
  },
  {
    q: "Comment je récupère mon cadeau ?",
    a: "Depuis ton tableau de bord, active « Récupérer mon cadeau » pour générer un coupon à montrer au comptoir.",
  },
  {
    q: "Je peux rejoindre plusieurs restaurants ?",
    a: "Oui, autant que tu veux — chacun garde sa propre équipe et ses propres cadeaux.",
  },
  {
    q: "Une commande Uber Eats ou Deliveroo compte ?",
    a: "Non. Seules les commandes passées directement — en salle ou par téléphone — comptent dans le programme.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ── */}
      <div className="bg-brand-dark text-white">
        <div className="max-w-2xl mx-auto px-5 pt-14 pb-12 text-center">
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Commande directement.<br />
            <span className="text-brand-gold">Gagne avec les tiens.</span>
          </h1>

          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            Un réseau de restaurants indépendants, un seul compte. Rejoins l&apos;équipe de ton école,
            ton travail ou ton quartier et débloquez des cadeaux ensemble à chaque commande directe.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <TrackedLink
              ctaId="rejoindre"
              ctaLocation="hero"
              audience="membre"
              href="/login"
              className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-brand-red/85 transition-colors shadow-lg"
            >
              Rejoindre gratuitement →
            </TrackedLink>
            <TrackedLink
              ctaId="comment_ca_marche"
              ctaLocation="hero"
              audience="membre"
              href="#comment-ca-marche"
              className="flex-1 bg-brand-gold text-brand-dark text-center py-4 rounded-2xl font-bold hover:brightness-95 transition-all"
            >
              Comment ça marche
            </TrackedLink>
          </div>
        </div>
      </div>

      {/* ── PREUVES RAPIDES ── */}
      <div className="max-w-2xl mx-auto px-5 -mt-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Gift, label: "Gratuit à vie" },
            { icon: QrCode, label: "Aucune carte à garder" },
            { icon: Sparkles, label: "Cadeau à chaque commande" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 text-center flex flex-col items-center gap-2">
              <IconTile icon={s.icon} size="sm" />
              <p className="text-xs text-gray-600 font-semibold leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAIN POINTS ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Le problème</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          La fidélité classique ne rapporte à personne
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          C&apos;est exactement ce que le programme corrige.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} className="bg-gray-50 rounded-2xl p-5">
              <IconTile icon={p.icon} />
              <h3 className="font-bold text-gray-900 mt-3 mb-1">{p.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── MÉCANIQUE ── */}
      <div id="comment-ca-marche" className="bg-gray-50 py-14 scroll-mt-6">
        <div className="max-w-2xl mx-auto px-5">
          <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Comment ça marche</p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
            Vous gagnez plus vite à plusieurs
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            3 étapes, c&apos;est tout.
          </p>

          <div className="space-y-4">
            {MECHANICS.map((m, i) => (
              <div key={m.title} className="flex gap-4 bg-white rounded-2xl border border-gray-100 p-5">
                <div className="w-10 h-10 bg-brand-dark text-brand-gold rounded-xl flex items-center justify-center font-black text-lg shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <m.icon className="w-4 h-4 text-brand-red" strokeWidth={2} />
                    <h3 className="font-bold text-gray-900">{m.title}</h3>
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FONCTIONNALITÉS ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Au quotidien</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Ce qui change une fois inscrit
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          Aucune installation, aucune carte — tout depuis ton compte.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 p-5 rounded-2xl border border-gray-100">
              <IconTile icon={f.icon} size="sm" />
              <div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{f.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PROMESSE GRATUITE ── */}
      <div className="bg-gray-50 py-10">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-gray-700 text-sm leading-relaxed">
            <span className="font-bold text-gray-900">Gratuit. Sans carte bancaire. Sans abonnement caché.</span>{" "}
            Et ça ne changera jamais, quel que soit le restaurant que tu rejoins.
          </p>
        </div>
      </div>

      {/* ── ONBOARDING ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-8 text-center">
          Trois étapes, c&apos;est tout
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {ONBOARDING.map((s) => (
            <div key={s.n} className="text-center">
              <div className="w-10 h-10 bg-brand-dark text-brand-gold rounded-xl flex items-center justify-center font-black text-lg mx-auto mb-3">
                {s.n}
              </div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">{s.t}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ── */}
      <div className="bg-gray-50 py-14">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-8 text-center">Questions fréquentes</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="bg-white rounded-2xl border border-gray-100 p-5 group">
                <summary className="font-bold text-gray-900 text-sm cursor-pointer list-none flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-brand-red shrink-0 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-gray-500 text-sm leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* ── DEVENIR PARTENAIRE ── */}
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center gap-4">
          <IconTile icon={Store} />
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-sm">Tu es restaurateur ?</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Fais revenir tes clients directement, sans commission de plateforme.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold text-brand-red hover:underline"
          >
            En savoir plus →
          </Link>
        </div>
      </div>

      {/* ── CTA FINAL ── */}
      <div className="bg-brand-red text-white py-14">
        <div className="max-w-lg mx-auto px-5 text-center">
          <div className="flex justify-center mb-4">
            <IconTile icon={Sparkles} tone="onDark" />
          </div>
          <h2 className="text-3xl font-black mb-3">Prêt à commander malin ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Inscription gratuite en 30 secondes. Aucune application à télécharger.
          </p>
          <TrackedLink
            ctaId="rejoindre"
            ctaLocation="cta_final"
            audience="membre"
            href="/login"
            className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
          >
            Je rejoins mon équipe →
          </TrackedLink>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-dark text-gray-500 py-6">
        <div className="max-w-2xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="font-bold text-gray-400">Boosteats</span>
          <div className="flex gap-4">
            {/* /join est protégée — un visiteur anonyme subissait un double
                saut /join → /login (ADR 0030 §8) */}
            <Link href="/signup" className="hover:text-gray-300 transition-colors">Restaurants</Link>
            <Link href="/" className="hover:text-gray-300 transition-colors">Devenir partenaire</Link>
            <Link href="/login" className="hover:text-gray-300 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
