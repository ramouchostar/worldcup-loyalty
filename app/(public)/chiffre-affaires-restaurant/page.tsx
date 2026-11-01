import { CalendarDays, Landmark, MapPin, PartyPopper, Wallet } from "lucide-react";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";
import {
  AnalysisCta,
  FaqList,
  Heading,
  LaptopFrame,
  MarketingShell,
  RelatedPages,
  Section,
  WhatsAppLink,
  type Faq,
} from "@/components/marketing/kit";
import { marketingMetadata } from "@/lib/marketing-pages";
import { DayEntryScreen, DayReasonsCard, ForecastChart, FourteenDaysChart, GrowthSteps, ProgramShare } from "./_visuals";

// Page « Votre chiffre du jour » (pilier Garder la main). Faits vérifiés dans
// le code le 2026-11-01 :
// - saisie en deux blocs, total calculé, nombre de commandes : lib/daily-revenue-entry.ts (ADR 0087) ;
// - comparaison aux mêmes jours, part du programme, taux de capture : lib/revenue-tracker.ts
//   (fonction `revenue_tracker`, plan Croissance — lib/entitlements.ts) ;
// - ce qui s'est passé un jour inhabituel (météo du soir, matchs, événements
//   proches, jour férié, vacances) : lib/day-reasons.ts, fiche du jour ;
// - prévisions : lib/forecast.ts (ADR 0027) — historique importé, facteurs calibrés
//   sur le restaurant (jour de paye, jours fériés, vacances scolaires par
//   communauté) + événements ; fourchette et confiance. La météo et les matchs
//   n'entrent PAS dans la prévision : dit « en préparation ».
// - paliers : lib/growth-game.ts (ADR 0081).
// Données des visuels : illustration, établissement imaginaire.

const SLUG = "chiffre-affaires-restaurant";
const WHERE = `page_${SLUG}`;

export const metadata = marketingMetadata(SLUG);

const FAQ: Faq[] = [
  {
    q: "Je dois relier ma caisse ?",
    a: "Non. Vous notez votre chiffre du jour en un écran, depuis votre téléphone, en recopiant le ticket de clôture de la caisse et les montants des plateformes. Ça prend moins d'une minute.",
  },
  {
    q: "Et si j'oublie un jour ?",
    a: "Vous le notez le lendemain, ou plus tard. Un jour fermé se marque comme fermé : il ne fausse pas vos comparaisons.",
  },
  {
    q: "Pourquoi comparer aux mêmes jours de la semaine ?",
    a: "Parce qu'un mardi ne se compare pas à un samedi. On met votre jour face à la moyenne des quatre derniers jours identiques : c'est la comparaison qui dit vraiment si la journée était bonne.",
  },
  {
    q: "D'où viennent les prévisions ?",
    a: "De votre propre historique de ventes, que vous importez depuis l'export de votre caisse, croisé avec le calendrier : jours fériés, vacances scolaires, jours de paye, événements. Chaque jour prévu est donné en fourchette, avec ce qui le fait monter ou baisser.",
  },
  {
    q: "La météo et les matchs sont pris en compte ?",
    a: "Ils apparaissent déjà sur la fiche de chaque jour, pour comprendre un jour inhabituel. Les intégrer dans la prévision elle-même est en préparation.",
  },
  {
    q: "C'est dans quel plan ?",
    a: "Noter votre chiffre est possible dès le plan Gratuit. Les comparaisons, la part de vos clients inscrits, les prévisions et les ventes par plat sont dans le plan Croissance, à 150 € par mois sans engagement.",
  },
];

const CALENDAR = [
  { icon: Landmark, title: "Jours fériés", body: "Le 15 août ne ressemble pas à un jeudi ordinaire. L'effet des jours fériés est mesuré sur votre propre historique." },
  { icon: CalendarDays, title: "Vacances scolaires", body: "Les calendriers francophone et flamand sont distincts depuis 2022 : deux vagues de vacances, et votre clientèle ne suit pas forcément les deux." },
  { icon: Wallet, title: "Jours de paye", body: "Fin et début de mois, les comptes se remplissent. Si vos clients le montrent dans leurs dépenses, la prévision en tient compte." },
  { icon: PartyPopper, title: "Événements", body: "Fêtes nationales et événements locaux connus à l'avance : la prévision les signale et dit s'ils poussent vers le haut ou vers le bas." },
];

export default function ChiffreAffairesPage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. Héros : la question que se pose le restaurateur à la fermeture. */}
      <section className="bg-white border-b border-paper-border overflow-hidden">
        <div className="max-w-[1150px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <Heading
              as="h1"
              eyebrow="Garder la main"
              title="Combien avez-vous fait hier, combien ferez-vous demain ?"
              intro="Notez votre chiffre du jour en un écran : la caisse d'un côté, les plateformes de l'autre. Vous le voyez aussitôt face aux mêmes jours de la semaine, avec la part qui vient de vos clients inscrits."
            />
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation={WHERE}
                audience="restaurateur"
                href="/become-a-partner"
                className="inline-flex justify-center bg-moss text-white text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-dark transition-colors"
              >
                Noter mon chiffre gratuitement
              </TrackedLink>
              <WhatsAppLink location={WHERE} message="Bonjour, je voudrais voir comment suivre le chiffre d'affaires de mon restaurant avec Boosteats." />
            </div>
            <p className="text-[13px] text-ink-faint mt-4">Rien à brancher sur la caisse. Gratuit pour commencer.</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <PhoneFrame screenClassName="h-[560px]">
              <DayEntryScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* 2. Le constat, en trois chiffres qu'un restaurateur n'a pas le soir. */}
      <Section>
        <Heading
          eyebrow="Le soir, à la fermeture"
          title="Le chiffre, vous l'avez. Ce qui manque, c'est la comparaison."
          intro="La caisse vous donne un total. Elle ne vous dit pas si ce total est bon pour un mardi, si la semaine monte ou descend, ni quelle part vient de clients qui reviennent."
        />
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {[
            ["Un bon jour, comparé à quoi ?", "1 400 € un mardi, c'est excellent. Un samedi, c'est une mauvaise soirée. Sans la comparaison au même jour, le chiffre ne dit rien."],
            ["Les plateformes à part", "Uber Eats, Deliveroo et Takeaway versent plus tard, avec leur commission. Les noter à part montre ce qui entre vraiment par la caisse."],
            ["Les jours qui glissent", "Une baisse de 10 % sur trois mardis de suite ne se voit pas à l'œil. Sur un graphique, elle saute aux yeux."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-2xl bg-white border border-paper-border p-6">
              <p className="font-bold text-[17px] text-ink">{t}</p>
              <p className="font-landing text-[15px] leading-[1.7] text-ink-muted mt-2">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Le graphique des 14 jours, dans l'ordinateur. */}
      <Section tone="white">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 items-center">
          <Heading
            eyebrow="Jour par jour"
            title="Quatorze jours d'un coup d'œil"
            intro="Chaque barre est un jour noté. Le trait noir, c'est la moyenne de vos quatre derniers jours identiques : quand la barre passe au-dessus, la journée a été meilleure que d'habitude. Les jours fermés restent visibles, sans fausser la moyenne."
          />
          <LaptopFrame url="boosteats.be/admin/smashly">
            <FourteenDaysChart />
          </LaptopFrame>
        </div>
        <p className="text-[12.5px] text-ink-faint mt-6 text-center">Illustration : établissement imaginaire, chiffres inventés.</p>
      </Section>

      {/* 4. La part du programme. */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Heading
              eyebrow="Vos clients inscrits"
              title="Quelle part de votre chiffre vient de clients que vous pouvez recontacter ?"
              intro="Vos clients inscrits au programme prennent leur ticket en photo. On additionne ces tickets jour par jour et on les met face à votre chiffre noté."
            />
            <ul className="mt-6 space-y-3 font-landing text-[15.5px] leading-[1.7] text-ink">
              <li><strong>La part du chiffre</strong> : combien d&apos;euros viennent de clients dont vous avez le contact.</li>
              <li><strong>Le taux de capture</strong> : sur 100 tickets de caisse, combien passent par le programme. S&apos;il est bas, c&apos;est au comptoir que ça se joue : l&apos;affiche, le QR, la phrase de l&apos;équipe.</li>
            </ul>
          </div>
          <ProgramShare />
        </div>
      </Section>

      {/* 5. Ce qui s'est passé un jour inhabituel. */}
      <Section tone="white">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <DayReasonsCard />
          <Heading
            eyebrow="Un jour inhabituel"
            title="Un dimanche à −19 % ? Vous voyez ce qui s'est passé autour."
            intro="Sur la fiche de chaque jour, on note la météo du soir, les matchs de foot, les grands événements à proximité, les jours fériés et les vacances scolaires. Vous comprenez une mauvaise journée sans chercher, et vous savez quoi préparer la prochaine fois."
          />
        </div>
      </Section>

      {/* 6. Les prévisions, sur fond sombre. */}
      <section className="bg-ink">
        <div className="max-w-[1150px] mx-auto px-5 sm:px-8 py-20">
          <Heading
            onDark
            eyebrow="Prévisions"
            title="Les douze prochains jours, avant qu'ils arrivent"
            intro="À partir de votre historique de ventes, importé depuis l'export de votre caisse, chaque jour à venir reçoit une fourchette. Les repères du calendrier qui le font bouger sont affichés au-dessus. Vous préparez le personnel, les achats et la promo en conséquence."
          />
          <div className="mt-10 rounded-3xl bg-night-raised border border-night-line p-4 sm:p-6">
            <ForecastChart />
            <div className="flex flex-wrap gap-5 text-[12px] text-night-text mt-3 px-2">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-moss-light border-2 border-ink ring-1 ring-moss-light" /> Chiffre attendu</span>
              <span className="flex items-center gap-2"><span className="w-3 h-5 rounded-full bg-moss/30" /> Fourchette</span>
              <span>Illustration : chiffres inventés</span>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {CALENDAR.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-night-line bg-night-raised p-5">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-moss/15"><Icon className="w-5 h-5 text-moss-light" aria-hidden /></span>
                <p className="font-bold text-white text-[16px] mt-4">{title}</p>
                <p className="font-landing text-[14px] leading-[1.65] text-night-text mt-1.5">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-dashed border-night-line p-5 flex gap-3 items-start">
            <MapPin className="w-5 h-5 text-moss-light shrink-0 mt-0.5" aria-hidden />
            <p className="font-landing text-[14.5px] leading-[1.7] text-night-text">
              <strong className="text-white">En préparation :</strong> la météo annoncée et les matchs de foot dans la prévision elle-même. Aujourd&apos;hui, ils sont relevés après coup sur la fiche de chaque jour, pour expliquer ce qui s&apos;est passé.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Le jeu de la croissance. */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Heading
              eyebrow="Viser plus haut"
              title="Des paliers de chiffre par jour, à votre mesure"
              intro="Votre départ, c'est la moyenne de vos 28 premiers jours notés. Chaque palier ajoute 5 % de ce départ, arrondi à 10 €. Un palier est validé quand vous le tenez trois semaines sur quatre, et un niveau atteint ne se perd jamais."
            />
            <p className="font-landing text-[15px] leading-[1.7] text-ink-muted mt-5">
              Des marches égales se lisent d&apos;un coup d&apos;œil et restent à portée. L&apos;objectif d&apos;un mois n&apos;est jamais un chiffre tiré d&apos;un tableau : c&apos;est votre propre restaurant, un cran plus haut.
            </p>
          </div>
          <div className="rounded-3xl bg-white border border-paper-border p-6 sm:p-8">
            <GrowthSteps />
            <p className="text-[12.5px] text-ink-faint mt-4">Exemple : un départ à 350 € par jour.</p>
          </div>
        </div>
      </Section>

      {/* 8. Ce qui est dans quel plan. */}
      <Section tone="white">
        <Heading eyebrow="Plans" title="Commencez par noter. Le reste vient avec le plan Croissance." center />
        <div className="grid md:grid-cols-2 gap-5 mt-10 max-w-[900px] mx-auto">
          <div className="rounded-2xl border border-paper-border bg-paper p-6">
            <p className="font-display text-[22px] font-bold text-ink">Gratuit</p>
            <ul className="mt-4 space-y-2 font-landing text-[15px] text-ink">
              <li>Le chiffre du jour en deux blocs, total calculé</li>
              <li>Les jours fermés marqués</li>
              <li>Un rappel pour ne pas oublier de noter, qu&apos;on active pour vous</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-moss bg-white p-6">
            <p className="font-display text-[22px] font-bold text-ink">Croissance <span className="text-[15px] font-semibold text-ink-muted">150 €/mois</span></p>
            <ul className="mt-4 space-y-2 font-landing text-[15px] text-ink">
              <li>La comparaison aux mêmes jours et à la semaine d&apos;avant</li>
              <li>La part de vos clients inscrits et le taux de capture</li>
              <li>Les prévisions des jours à venir</li>
              <li>Les ventes par plat</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section width="max-w-[880px]">
        <h2 className="font-display text-[28px] sm:text-[34px] font-bold text-ink mb-6">Vos questions</h2>
        <FaqList items={FAQ} />
      </Section>

      <RelatedPages slugs={["food-cost-restaurant", "programme-fidelite-restaurant", "publicite-restaurant"]} />
      <AnalysisCta
        location={WHERE}
        title="Avant les chiffres, voyez ce que vos clients voient"
        body="Votre fiche Google, vos avis et vos voisins : une note sur 100 en moins d'une minute. Gratuit, sans engagement."
        whatsappMessage="Bonjour, je voudrais suivre le chiffre d'affaires de mon restaurant avec Boosteats."
      />
    </MarketingShell>
  );
}
