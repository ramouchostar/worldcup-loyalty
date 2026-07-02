import Link from "next/link";

const STEPS = [
  {
    num: "1",
    icon: "🍗",
    title: "Choisis ton restaurant",
    desc: "Scanne le QR code sur place, ou choisis parmi les établissements du réseau.",
  },
  {
    num: "2",
    icon: "👥",
    title: "Rejoins ou crée ton équipe",
    desc: "École, entreprise, quartier, taxis... chaque équipe est propre à son restaurant.",
  },
  {
    num: "3",
    icon: "🎁",
    title: "Commandez, gagnez ensemble",
    desc: "Plus votre équipe commande directement, plus vous débloquez de cadeaux collectifs.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ── */}
      <div className="bg-brand-dark text-white">
        <div className="max-w-lg mx-auto px-5 pt-12 pb-10 text-center">
          <p className="text-4xl mb-4">🍗</p>
          <h1 className="text-4xl font-black leading-tight mb-3">
            Fidélise-toi<br />
            <span className="text-brand-gold">chez tes restaurants préférés.</span>
          </h1>

          <p className="text-gray-300 text-base leading-relaxed mb-8">
            Un réseau de restaurants indépendants, un seul compte. Rejoins une équipe
            par établissement et gagnez des cadeaux ensemble en commandant directement.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
            >
              Rejoindre gratuitement →
            </Link>
            <Link
              href="/join"
              className="flex-1 bg-white/10 text-white text-center py-4 rounded-2xl font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              Voir les restaurants
            </Link>
          </div>
        </div>
      </div>

      {/* ── COMMENT ÇA MARCHE ── */}
      <div className="max-w-lg mx-auto px-5 py-10">
        <h2 className="text-2xl font-black text-gray-900 mb-2">Comment ça marche ?</h2>
        <p className="text-gray-500 text-sm mb-6">3 étapes, c&apos;est tout.</p>

        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={step.num} className="flex gap-4 bg-gray-50 rounded-2xl p-5">
              <div className="w-10 h-10 bg-brand-dark text-brand-gold rounded-xl flex items-center justify-center font-black text-lg shrink-0">
                {step.num}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{step.icon}</span>
                  <h3 className="font-bold text-gray-900">{step.title}</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DEVENIR PARTENAIRE ── */}
      <div className="max-w-lg mx-auto px-5 pb-10">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center gap-4">
          <span className="text-3xl shrink-0">🍽️</span>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-sm">Tu es restaurateur ?</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Rejoins le réseau et fidélise tes propres clients.{" "}
              <Link href="/secteurs" className="text-brand-red font-semibold hover:underline">
                Vois l&apos;activité de ton secteur
              </Link>
            </p>
          </div>
          <Link
            href="/become-a-partner"
            className="shrink-0 text-sm font-semibold text-brand-red hover:underline"
          >
            Devenir partenaire →
          </Link>
        </div>
      </div>

      {/* ── CTA FINAL ── */}
      <div className="bg-brand-red text-white py-12">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-4xl mb-4">🎁</p>
          <h2 className="text-3xl font-black mb-3">Prêt à rejoindre ton réseau ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Inscription gratuite en 30 secondes. Aucune application à télécharger.
          </p>
          <Link
            href="/login"
            className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
          >
            Je rejoins ma communauté →
          </Link>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-dark text-gray-500 py-6">
        <div className="max-w-lg mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="font-bold text-gray-400">Fidélité communautaire</span>
          <div className="flex gap-4">
            <Link href="/join" className="hover:text-gray-300 transition-colors">Restaurants</Link>
            <Link href="/secteurs" className="hover:text-gray-300 transition-colors">Secteurs</Link>
            <Link href="/become-a-partner" className="hover:text-gray-300 transition-colors">Devenir partenaire</Link>
            <Link href="/login" className="hover:text-gray-300 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
