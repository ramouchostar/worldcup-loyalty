import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";

// Page de vente dédiée aux restaurateurs prospects — distincte du formulaire
// d'inscription (/become-a-partner). Rôle : convaincre avant de faire remplir
// un formulaire. Chantier "landing pages / emailing / ads" (session du
// 2026-07-28) — périmètre 1/3, ciblage restaurateurs en premier.
//
// Règles suivies :
// - Aucun prix inventé : ADR 0029 acte le modèle (Gratuit/Croissance/Pro)
//   mais les montants et la mise en œuvre ne sont "pas encore implémentés" —
//   cette page ne vend donc que ce qui existe réellement aujourd'hui (le
//   plan Gratuit) et présente les plans payants comme une feuille de route,
//   jamais avec un chiffre.
// - Aucun faux témoignage : la preuve sociale vient des vrais agrégats
//   (mêmes requêtes que /secteurs), pas de citations inventées.
// - ADR 0007 ne s'applique pas ici (page B2B, pas client) — euros et
//   mécanique de marge peuvent être mentionnés explicitement.

export const revalidate = 300;

export const metadata = {
  title: "Programme de fidélité pour restaurateurs — gratuit pour démarrer",
  description:
    "Transforme tes clients en communauté fidèle qui commande directement, sans commission de plateforme. Gratuit pour démarrer, aucune carte bancaire requise.",
};

const PAIN_POINTS = [
  {
    icon: "📉",
    title: "Les plateformes de livraison rognent ta marge",
    desc: "Commission après commission, le client reste \"leur\" client — jamais le tien. Rien ne le pousse à repasser commande directement.",
  },
  {
    icon: "🕳️",
    title: "Tes clients fidèles sont invisibles",
    desc: "Sans outil dédié, impossible de savoir qui revient, qui ramène du monde, ou qui est sur le point de décrocher.",
  },
  {
    icon: "🎟️",
    title: "Les remises classiques mangent ta rentabilité",
    desc: "Un programme de points mal calibré peut coûter plus cher qu'il ne rapporte. La plupart des restaurateurs n'ont pas le temps de faire ce calcul à chaque promo.",
  },
];

const MECHANICS = [
  {
    icon: "👥",
    title: "Tes clients se regroupent en équipes",
    desc: "École, entreprise, quartier, taxis... chaque équipe cumule les commandes directes de ses membres et débloque des cadeaux ensemble. C'est ce qui transforme un client seul en ambassadeur d'un groupe entier.",
  },
  {
    icon: "🔗",
    title: "Le parrainage tourne tout seul",
    desc: "Chaque membre partage un lien unique par WhatsApp — gratuit, natif, zéro budget pub. Le jeton n'est crédité qu'à l'inscription réelle d'un ami, jamais au simple partage.",
  },
  {
    icon: "🛡️",
    title: "Ta marge est protégée par construction",
    desc: "Le coût de chaque cadeau est plafonné automatiquement par rapport à ton panier moyen et à ton chiffre d'affaires. Le programme ne peut pas te coûter plus qu'il ne te rapporte.",
  },
];

const FEATURES = [
  {
    icon: "🖨️",
    title: "Supports prêts à imprimer",
    desc: "QR code, sticker de table, flyer, affiche caisse — générés automatiquement aux couleurs et au logo de ton établissement.",
  },
  {
    icon: "✅",
    title: "Validation des tickets sans effort",
    desc: "Le client scanne son ticket, la commande est vérifiée et comptabilisée sans que tu aies à saisir quoi que ce soit.",
  },
  {
    icon: "🎛️",
    title: "Un tableau de bord pour piloter le programme",
    desc: "Équipes actives, commandes à revoir, seuils de récompenses — tout est configurable depuis ton espace admin.",
  },
  {
    icon: "📍",
    title: "Visibilité gratuite dans ton secteur",
    desc: "Une page publique montre l'activité de ton quartier aux clients qui cherchent où manger — sans rien débourser en publicité.",
  },
];

export default async function RestaurateursLandingPage() {
  const admin = createAdminClient();
  const [{ count: restaurantCount }, { count: memberCount }] = await Promise.all([
    admin.from("restaurants").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("memberships").select("user_id", { count: "exact", head: true }),
  ]);

  const hasNetwork = (restaurantCount ?? 0) > 0;

  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ── */}
      <div className="bg-brand-dark text-white">
        <div className="max-w-2xl mx-auto px-5 pt-14 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-gold/15 border border-brand-gold/30 rounded-full px-3 py-1 mb-6">
            <span className="text-brand-gold text-xs font-bold uppercase tracking-widest">Pour les restaurateurs</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Fais revenir tes clients{" "}
            <span className="text-brand-gold">directement</span>,<br />
            sans commission de plateforme.
          </h1>

          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            Boosteats transforme chaque commande directe en cadeau collectif que tes clients
            gagnent en équipe. Gratuit pour démarrer, aucune carte bancaire, en ligne en quelques jours.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <Link
              href="/become-a-partner"
              className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
            >
              Devenir partenaire gratuitement →
            </Link>
            <Link
              href="/secteurs"
              className="flex-1 bg-white/10 text-white text-center py-4 rounded-2xl font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              Voir l&apos;activité de mon secteur
            </Link>
          </div>

          {hasNetwork ? (
            <p className="text-gray-400 text-sm mt-6">
              Déjà <span className="text-white font-bold">{restaurantCount}</span> établissement
              {(restaurantCount ?? 0) > 1 ? "s" : ""} et{" "}
              <span className="text-white font-bold">{memberCount ?? 0}</span> membre
              {(memberCount ?? 0) > 1 ? "s" : ""} actifs sur le réseau.
            </p>
          ) : (
            <p className="text-gray-400 text-sm mt-6">
              Le réseau démarre — sois l&apos;un des premiers restaurants à construire ta communauté.
            </p>
          )}
        </div>
      </div>

      {/* ── PAIN POINTS ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Tu reconnais ces problèmes ?
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          Ce ne sont pas des fatalités — c&apos;est exactement ce que le programme corrige.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} className="bg-gray-50 rounded-2xl p-5">
              <span className="text-2xl">{p.icon}</span>
              <h3 className="font-bold text-gray-900 mt-2 mb-1">{p.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── MÉCANIQUE ── */}
      <div className="bg-gray-50 py-14">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
            Comment le programme fait grossir ta clientèle
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            Trois mécaniques, pensées pour que tes clients fassent le travail de recrutement à ta place.
          </p>

          <div className="space-y-4">
            {MECHANICS.map((m, i) => (
              <div key={m.title} className="flex gap-4 bg-white rounded-2xl border border-gray-100 p-5">
                <div className="w-10 h-10 bg-brand-dark text-brand-gold rounded-xl flex items-center justify-center font-black text-lg shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{m.icon}</span>
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
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Ce que tu reçois dès ton inscription
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          Tout est opérationnel dès la validation de ton établissement — rien à développer, rien à configurer techniquement.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 p-5 rounded-2xl border border-gray-100">
              <span className="text-2xl shrink-0">{f.icon}</span>
              <div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{f.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PLANS ── */}
      <div className="bg-gray-50 py-14">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
            Gratuit pour démarrer, sans piège
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8 max-w-lg mx-auto">
            Le programme membre complet reste gratuit à vie — c&apos;est lui qui fait grossir ta communauté.
            Des fonctions avancées pour piloter ton activité arrivent ensuite, sans surprise.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white rounded-2xl border-2 border-brand-red p-6 relative">
              <span className="absolute -top-3 left-6 bg-brand-red text-white text-xs font-bold px-3 py-1 rounded-full">
                Disponible aujourd&apos;hui
              </span>
              <h3 className="font-black text-gray-900 text-lg mt-2 mb-3">Gratuit</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>✓ Équipes, récompenses et parrainage sans limite de temps</li>
                <li>✓ Validation des commandes automatisée</li>
                <li>✓ Supports imprimables aux couleurs de ton établissement</li>
                <li>✓ Tableau de bord admin complet</li>
                <li>✓ Visibilité sur la page réseau de ton secteur</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 opacity-80">
              <span className="inline-block bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-2">
                En construction
              </span>
              <h3 className="font-black text-gray-900 text-lg mb-3">Croissance &amp; Pro</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Prévision de chiffre d&apos;affaires, suggestions tarifaires basées sur tes propres ventes, et repères
                anonymisés de ton secteur. Encore en développement — les premiers restaurants du réseau y auront
                accès en priorité, avant tout le monde.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ONBOARDING ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-8 text-center">
          En ligne en trois étapes
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { n: "1", t: "Présente ton établissement", d: "Nom, ville, quartier, réseaux sociaux — 2 minutes." },
            { n: "2", t: "Envoie ta carte", d: "Un fichier avec tes prix — les récompenses se calibrent seules sur tes marges." },
            { n: "3", t: "Lance-toi", d: "Notre équipe valide ton établissement, puis ton QR est prêt à imprimer." },
          ].map((s) => (
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
            {[
              {
                q: "C'est vraiment gratuit ?",
                a: "Oui. Le programme membre complet (équipes, récompenses, parrainage, tableau de bord) est gratuit à vie, sans carte bancaire à l'inscription.",
              },
              {
                q: "Dois-je changer de caisse ou de logiciel ?",
                a: "Non. Le programme fonctionne en parallèle de ta caisse actuelle — tes clients scannent leur ticket papier, rien à connecter techniquement.",
              },
              {
                q: "Mes clients doivent-ils télécharger une application ?",
                a: "Non, tout se passe dans le navigateur via un simple lien ou QR code — aucune installation requise.",
              },
              {
                q: "Comment le programme protège-t-il ma marge ?",
                a: "Le coût de chaque récompense est calculé automatiquement à partir de ton prix de revient réel et plafonné par rapport au chiffre d'affaires qu'elle a généré. Le programme ne peut jamais te coûter plus qu'il ne rapporte.",
              },
              {
                q: "Combien de temps avant d'être visible par mes clients ?",
                a: "Ton établissement est examiné manuellement avant mise en ligne — un contrôle qualité rapide, pas un long processus commercial.",
              },
            ].map((item) => (
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

      {/* ── CTA FINAL ── */}
      <div className="bg-brand-red text-white py-14">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-4xl mb-4">🚀</p>
          <h2 className="text-3xl font-black mb-3">Prêt à faire grossir ta communauté ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Inscription gratuite en 2 minutes. Aucune carte bancaire, aucun engagement.
          </p>
          <Link
            href="/become-a-partner"
            className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
          >
            Devenir partenaire gratuitement →
          </Link>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-dark text-gray-500 py-6">
        <div className="max-w-2xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="font-bold text-gray-400">Boosteats</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-gray-300 transition-colors">Accueil</Link>
            <Link href="/secteurs" className="hover:text-gray-300 transition-colors">Secteurs</Link>
            <Link href="/become-a-partner" className="hover:text-gray-300 transition-colors">Devenir partenaire</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
