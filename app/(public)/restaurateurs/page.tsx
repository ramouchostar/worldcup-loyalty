import Link from "next/link";
import {
  TrendingDown,
  EyeOff,
  Tag,
  BrainCircuit,
  Share2,
  Gift,
  ShieldCheck,
  TrendingUp,
  Ban,
  Printer,
  CheckCircle2,
  LayoutDashboard,
  MapPin,
  Rocket,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase";
import { IconTile } from "@/components/IconTile";

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
// - Aucun emoji : icônes plates lucide-react, couleur unifiée (brand-red)
//   dans une pastille arrondie, pour garder une identité visuelle cohérente.

export const revalidate = 300;

export const metadata = {
  title: "Fidélité, parrainage, supports, pilotage — un seul outil gratuit",
  description:
    "Fidélité, parrainage, supports imprimés, tableau de bord et visibilité locale : tous les outils que les restaurateurs achètent d'habitude séparément, réunis ici en un seul, gratuit pour démarrer.",
};

const BUNDLE = [
  {
    icon: Gift,
    title: "Programme de fidélité",
    usually: "D'habitude : un logiciel de fidélité dédié, facturé au mois.",
  },
  {
    icon: Share2,
    title: "Parrainage client",
    usually: "D'habitude : un outil de referral marketing à part.",
  },
  {
    icon: Printer,
    title: "Supports imprimés à ta charte",
    usually: "D'habitude : un graphiste ou une plateforme de design.",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord de pilotage",
    usually: "D'habitude : un outil analytics indépendant.",
  },
  {
    icon: MapPin,
    title: "Visibilité dans ton secteur",
    usually: "D'habitude : une agence ou un budget publicitaire local.",
  },
];

const PAIN_POINTS = [
  {
    icon: TrendingDown,
    title: "Les plateformes de livraison rognent ta marge",
    desc: "Commission après commission, le client reste \"leur\" client — jamais le tien. Rien ne le pousse à repasser commande directement.",
  },
  {
    icon: EyeOff,
    title: "Tes clients fidèles sont invisibles",
    desc: "Sans outil dédié, impossible de savoir qui revient, qui ramène du monde, ou qui est sur le point de décrocher.",
  },
  {
    icon: Tag,
    title: "Les remises classiques mangent ta rentabilité",
    desc: "Un programme de points mal calibré peut coûter plus cher qu'il ne rapporte. La plupart des restaurateurs n'ont pas le temps de faire ce calcul à chaque promo.",
  },
];

const MECHANICS = [
  {
    icon: BrainCircuit,
    title: "Un algorithme calcule le bon cadeau, pour chaque client, sans jamais toucher ta marge",
    desc: "À partir de ta propre carte (prix de vente, prix de revient), le programme calibre automatiquement une récompense proportionnée à ce que le client vient de dépenser — jamais une remise générique. Le coût réel d'un cadeau reste toujours plafonné par rapport au chiffre d'affaires qu'il a généré : impossible que le programme te coûte plus qu'il ne rapporte. Tu n'as rien à calculer, rien à surveiller.",
  },
  {
    icon: Share2,
    title: "Ta clientèle actuelle devient ton canal d'acquisition le plus rentable",
    desc: "Chaque client peut recommander le restaurant via un lien personnel partagé sur WhatsApp — gratuit, instantané, zéro budget publicitaire. La récompense n'est créditée que lorsqu'un ami s'inscrit réellement, jamais pour un simple partage. Ce sont tes propres clients qui font le travail de recrutement, de façon totalement organique.",
  },
];

const FEATURES = [
  {
    icon: Printer,
    title: "Supports prêts à imprimer",
    desc: "QR code, sticker de table, flyer, affiche caisse — générés automatiquement aux couleurs et au logo de ton établissement.",
  },
  {
    icon: CheckCircle2,
    title: "Validation des tickets sans effort",
    desc: "Le client scanne son ticket, la commande est vérifiée et comptabilisée sans que tu aies à saisir quoi que ce soit.",
  },
  {
    icon: LayoutDashboard,
    title: "Un tableau de bord pour piloter le programme",
    desc: "Équipes actives, commandes à revoir, seuils de récompenses — tout est configurable depuis ton espace admin.",
  },
  {
    icon: MapPin,
    title: "Visibilité gratuite dans ton secteur",
    desc: "Une page publique montre l'activité de ton quartier aux clients qui cherchent où manger — sans rien débourser en publicité.",
  },
];

const TRUST_STRIP = [
  { icon: ShieldCheck, label: "Marge protégée automatiquement" },
  { icon: TrendingUp, label: "Croissance portée par tes clients" },
  { icon: Ban, label: "0% de commission sur commande directe" },
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
            Tous tes outils réunis en{" "}
            <span className="text-brand-gold">un seul</span>.<br />
            Gratuit.
          </h1>

          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            Fidélité, parrainage, supports imprimés, tableau de bord, visibilité dans ton secteur —
            tout ce qu&apos;un restaurant indépendant achète d&apos;habitude séparément, réunis ici en un seul
            outil, connecté de bout en bout. Sans commission sur tes commandes directes.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <Link
              href="/become-a-partner"
              className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-brand-red/85 transition-colors shadow-lg"
            >
              Devenir partenaire gratuitement →
            </Link>
            <Link
              href="/secteurs"
              className="flex-1 bg-brand-gold text-brand-dark text-center py-4 rounded-2xl font-bold hover:brightness-95 transition-all"
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
              Le réseau démarre — sois l&apos;un des premiers restaurants à en profiter.
            </p>
          )}
        </div>
      </div>

      {/* ── PREUVES RAPIDES ── */}
      <div className="max-w-2xl mx-auto px-5 -mt-6">
        <div className="grid grid-cols-3 gap-3">
          {TRUST_STRIP.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 text-center flex flex-col items-center gap-2">
              <IconTile icon={s.icon} size="sm" />
              <p className="text-xs text-gray-600 font-semibold leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CE QUE ÇA REMPLACE ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Un marché fragmenté</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Ce que ça remplace
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8 max-w-lg mx-auto">
          Chaque brique existe déjà séparément sur le marché, avec son propre abonnement. Ici, elles
          sont connectées entre elles et incluses dans le même outil, gratuit.
        </p>

        <div className="space-y-3">
          {BUNDLE.map((b) => (
            <div key={b.title} className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4">
              <IconTile icon={b.icon} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{b.title}</p>
                <p className="text-gray-500 text-xs">{b.usually}</p>
              </div>
              <span className="shrink-0 bg-brand-red/10 text-brand-red text-xs font-bold px-3 py-1.5 rounded-full">
                Inclus
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAIN POINTS ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Le problème</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Tu reconnais ces problèmes ?
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          Ce ne sont pas des fatalités — c&apos;est exactement ce que le programme corrige.
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
      <div className="bg-gray-50 py-14">
        <div className="max-w-2xl mx-auto px-5">
          <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Moteurs de croissance</p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
            La technologie fait le travail à ta place
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            Deux moteurs automatiques : l&apos;un protège ta rentabilité, l&apos;autre fait grossir ta base client.
          </p>

          <div className="space-y-4">
            {MECHANICS.map((m) => (
              <div key={m.title} className="flex gap-4 bg-white rounded-2xl border border-gray-100 p-5">
                <IconTile icon={m.icon} />
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{m.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3 bg-white/60 border border-dashed border-gray-300 rounded-2xl p-4 text-xs text-gray-500">
            <IconTile icon={Gift} size="sm" />
            <p className="leading-relaxed self-center">
              <span className="font-semibold text-gray-700">En complément</span> : tes clients peuvent aussi se
              regrouper (école, entreprise, quartier) pour débloquer ensemble un cadeau collectif ponctuel — un
              supplément qui renforce le lien avec ton établissement, pas le cœur du calcul de marge.
            </p>
          </div>
        </div>
      </div>

      {/* ── FONCTIONNALITÉS ── */}
      <div className="max-w-2xl mx-auto px-5 py-14">
        <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Fonctionnalités</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
          Ce que tu reçois dès ton inscription
        </h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          Tout est opérationnel dès la validation de ton établissement — rien à développer, rien à configurer techniquement.
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

      {/* ── PLANS ── */}
      <div className="bg-gray-50 py-14">
        <div className="max-w-2xl mx-auto px-5">
          <p className="text-brand-red text-xs font-bold uppercase tracking-widest text-center mb-3">Tarification</p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">
            Gratuit pour démarrer, sans piège
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8 max-w-lg mx-auto">
            Le programme membre complet reste gratuit à vie — c&apos;est lui qui fait grossir ta clientèle.
            Des fonctions avancées pour piloter ton activité arrivent ensuite, sans surprise.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white rounded-2xl border-2 border-brand-red p-6 relative">
              <span className="absolute -top-3 left-6 bg-brand-red text-white text-xs font-bold px-3 py-1 rounded-full">
                Disponible aujourd&apos;hui
              </span>
              <h3 className="font-black text-gray-900 text-lg mt-2 mb-3">Gratuit</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Algorithme de récompenses à marge protégée, sans limite de temps</span></li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Parrainage client illimité, sans budget publicitaire</span></li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Validation des commandes automatisée</span></li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Supports imprimables aux couleurs de ton établissement</span></li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Tableau de bord admin complet</span></li>
                <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" /><span>Visibilité sur la page réseau de ton secteur</span></li>
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
                q: "Comment vous pouvez proposer tout ça gratuitement ?",
                a: "Le programme membre reste gratuit à vie — c'est lui qui fait grandir le réseau. Des fonctions avancées optionnelles arriveront plus tard pour les établissements qui veulent aller plus loin, sans jamais dégrader ce qui est gratuit aujourd'hui.",
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
                q: "Comment l'algorithme protège-t-il ma marge ?",
                a: "Le coût de chaque récompense est calculé automatiquement à partir de ton prix de revient réel et plafonné par rapport au chiffre d'affaires qu'elle a généré. Le programme ne peut jamais te coûter plus qu'il ne rapporte — tu n'as aucun calcul à faire toi-même.",
              },
              {
                q: "Comment ça m'aide vraiment à trouver de nouveaux clients ?",
                a: "Chaque client peut partager un lien personnel par WhatsApp. La récompense n'est créditée qu'à l'inscription réelle d'un ami — jamais pour un simple partage. C'est ta clientèle existante qui recrute pour toi, sans que tu dépenses un centime en publicité.",
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
          <div className="flex justify-center mb-4">
            <IconTile icon={Rocket} tone="onDark" />
          </div>
          <h2 className="text-3xl font-black mb-3">Prêt à faire grossir ta clientèle ?</h2>
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
