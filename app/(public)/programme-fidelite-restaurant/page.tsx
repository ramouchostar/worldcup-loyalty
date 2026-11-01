import { Clock, Copy, Receipt, ShieldCheck, Smartphone, Ticket } from "lucide-react";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";
import {
  AnalysisCta,
  CompareColumns,
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
import { ConsoleDashboard, HeroComposite, JOURNEY } from "./_visuals";

// Page « programme de fidélité » (stratégie de référencement, retour de Mehdi du 2026-11-01) :
// maquettes téléphone + ordinateur, parcours client illustré, cadeaux calculés
// sur le prix de revient (l'ex-page « cadeaux calculés sur vos coûts » est
// fondue ici), carte à tampons contre Boosteats, garde-fous.

export const metadata = marketingMetadata("programme-fidelite-restaurant");

const WHERE = "page_programme-fidelite-restaurant";

// Exemples au taux de 8 % : prix en points = prix de revient ÷ taux × 10,
// arrondi aux 5 points supérieurs (ADR 0061, catalog_price_points).
const CATALOG = [
  { item: "Boisson", cost: "0,60 €", spend: "7,50 €", pts: 75 },
  { item: "Frites", cost: "0,45 €", spend: "5,63 €", pts: 60 },
  { item: "Dessert", cost: "0,90 €", spend: "11,25 €", pts: 115 },
  { item: "Burger simple", cost: "1,90 €", spend: "23,75 €", pts: 240 },
];

const RATES = [
  { rate: "4 %", pts: 150, note: "Cadeaux plus rares, coût plus bas" },
  { rate: "8 %", pts: 75, note: "L'équilibre de départ conseillé" },
  { rate: "12 %", pts: 50, note: "Cadeaux plus fréquents, plus généreux" },
];

const GUARDS = [
  { Icon: Copy, title: "Un ticket compte une seule fois", body: "Le même ticket envoyé deux fois, par la même personne ou par une autre, est écarté." },
  { Icon: Ticket, title: "Deux tickets par jour et par client", body: "Au-delà, le ticket n'est pas pris. Un client qui en envoie beaucoup sur une semaine passe en vérification." },
  { Icon: Clock, title: "Jamais pendant la même visite", body: "Un cadeau gagné s'ouvre quelques heures après le ticket. Le client revient pour le prendre." },
  { Icon: Smartphone, title: "Un coupon de 10 minutes", body: "Le client l'ouvre au comptoir, devant vous. Une capture d'écran envoyée à un ami ne sert à rien." },
  { Icon: Receipt, title: "10 € de commande minimum", body: "Le cadeau se récupère avec une commande d'au moins 10 €. C'est écrit au client partout où un cadeau l'attend." },
  { Icon: ShieldCheck, title: "Les tickets douteux vous attendent", body: "Un montant très élevé ou un doublon possible n'est pas validé seul : vous décidez depuis votre console." },
];

const FAQ: Faq[] = [
  { q: "Est-ce que je dois changer de caisse ou la faire brancher ?", a: "Non. Le client prend en photo le ticket que votre caisse imprime déjà. Rien à brancher, rien à installer chez vous, et ça marche quelle que soit votre caisse." },
  { q: "Mes clients doivent-ils télécharger une application ?", a: "Non. Ils scannent le QR au comptoir et s'inscrivent dans le navigateur de leur téléphone. Ils peuvent ensuite ajouter le raccourci sur leur écran d'accueil s'ils le veulent." },
  { q: "Combien vont me coûter les cadeaux ?", a: "Ce que vous décidez. Vous choisissez un taux entre 4 et 12 %, et chaque cadeau est mis à prix en points d'après ce qu'il vous coûte. À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats." },
  { q: "Qui choisit les cadeaux du catalogue ?", a: "Vous. Ils viennent de votre carte, avec leur prix de revient. Si vous changez le taux, le prix en points de tous les cadeaux s'ajuste en même temps." },
  { q: "Et si un client triche avec ses tickets ?", a: "Un ticket ne compte qu'une fois, un client ne peut pas en envoyer plus de deux par jour, les tickets douteux sont mis de côté pour que vous décidiez, et une photo illisible doit être reprise. Le cadeau se remet sur un coupon qui expire en 10 minutes." },
  { q: "Combien ça coûte ?", a: "Le plan Gratuit suffit pour démarrer : jusqu'à 500 tickets par mois, sans carte bancaire ni engagement. Au-delà, vos clients ne sont jamais bloqués, on vous prévient." },
  { q: "Je peux garder ma carte à tampons ?", a: "Oui. Beaucoup de restaurants la gardent quelques semaines, le temps que les habitués passent au téléphone. La différence se voit vite : vous avez le contact de vos clients et vous savez qui revient." },
];

export default function ProgrammeFidelitePage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. Héros : promesse à gauche, la console et l'app à droite. */}
      <section className="bg-white border-b border-paper-border overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
          <div>
            <Heading
              as="h1"
              eyebrow="Programme de fidélité · Faire revenir"
              title="Une carte de fidélité qui marche avec la caisse que vous avez déjà"
              intro="Vos clients prennent leur ticket de caisse en photo, gagnent des points et choisissent leur cadeau. Vous récupérez leur contact, et vous savez enfin qui revient."
            />
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation={WHERE}
                audience="restaurateur"
                href="/audit-gratuit"
                className="inline-flex justify-center bg-moss text-ink text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-light transition-colors"
              >
                Analyser mon restaurant gratuitement
              </TrackedLink>
              <WhatsAppLink location={WHERE} message="Bonjour, je voudrais lancer un programme de fidélité dans mon restaurant." />
            </div>
            <ul className="mt-8 grid grid-cols-3 gap-3 max-w-[480px]">
              {[
                ["Rien à brancher", "le ticket suffit"],
                ["10 points", "par euro dépensé"],
                ["Forfait gratuit", "jusqu'à 500 tickets/mois"],
              ].map(([a, b]) => (
                <li key={a} className="rounded-xl border border-paper-border bg-paper px-3 py-3">
                  <p className="font-display font-bold text-[16px] text-ink m-0">{a}</p>
                  <p className="text-[12px] text-ink-muted m-0 mt-0.5">{b}</p>
                </li>
              ))}
            </ul>
          </div>
          <HeroComposite />
        </div>
      </section>

      {/* 2. Le parcours du client, écran par écran. */}
      <Section>
        <Heading
          center
          eyebrow="Côté client"
          title="Quatre écrans, et votre client revient"
          intro="Voici exactement ce que vit votre client, de la caisse au cadeau. Pas de carte à sortir, pas d'application à installer."
        />
        <ol className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {JOURNEY.map(({ n, Icon, title, body, Screen }) => (
            <li key={n} className="flex flex-col items-center text-center">
              <PhoneFrame className="w-[210px]" screenClassName="h-[420px]" statusTone="light">
                <Screen />
              </PhoneFrame>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-moss-tint px-3 py-1 text-[12.5px] font-bold text-moss-dark">
                <Icon className="w-3.5 h-3.5" aria-hidden /> Étape {n}
              </span>
              <h3 className="font-bold text-[18px] text-ink mt-3">{title}</h3>
              <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 3. Carte à tampons contre Boosteats. */}
      <Section tone="white">
        <Heading
          eyebrow="Pourquoi changer"
          title="La carte à tampons fait revenir. Elle ne vous dit rien."
          intro="Elle a rendu service pendant des années. Mais elle ne vous donne ni le nom, ni le contact, ni la fréquence de vos clients, et vous ne savez pas ce qu'elle vous coûte."
        />
        <div className="mt-10">
          <CompareColumns
            badTitle="La carte à tampons"
            bad={[
              "Elle se perd dans un portefeuille ou au fond d'un sac.",
              "Vous ne savez pas qui vient, ni à quelle fréquence.",
              "Un client qui ne revient plus disparaît sans que vous le sachiez.",
              "Le « 10e menu offert » coûte la même chose quel que soit ce qu'il a pris avant.",
              "Un tampon de plus, ça se négocie au comptoir.",
            ]}
            goodTitle="Boosteats"
            good={[
              "La carte est dans son téléphone, il l'a toujours sur lui.",
              "Chaque client inscrit apparaît dans votre liste, avec ses visites.",
              "Vous pouvez lui écrire un soir calme, et il reçoit un mot pour son anniversaire.",
              "Chaque cadeau est mis à prix d'après ce qu'il vous coûte vraiment.",
              "Les points viennent du ticket, pas d'une négociation.",
            ]}
          />
        </div>
      </Section>

      {/* 4. Les cadeaux calculés sur le prix de revient. */}
      <Section tone="ink">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <Heading
              onDark
              eyebrow="Le cœur du système"
              title="Chaque cadeau est calculé sur ce qu'il vous coûte"
              intro="Vous choisissez la part de vos ventes que vous rendez en cadeaux, entre 4 et 12 %. Ensuite, chaque article de votre carte reçoit son prix en points d'après son prix de revient. Un cadeau cher demande plus d'achats, un petit cadeau moins."
            />
            <div className="mt-8 rounded-2xl bg-night-raised border border-night-line p-6">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-light m-0">Exemple à 8 %</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 font-display text-[22px] sm:text-[26px] font-bold text-white">
                <span className="rounded-xl bg-white/10 px-3 py-1.5">0,60 €</span>
                <span className="text-night-text text-[18px]">÷ 8 %</span>
                <span className="text-night-text text-[18px]">=</span>
                <span className="rounded-xl bg-moss text-ink px-3 py-1.5">7,50 € d&apos;achats</span>
              </div>
              <p className="font-landing text-[15.5px] leading-[1.7] text-night-text mt-4 mb-0">
                Une boisson qui vous coûte 0,60 € se gagne après 7,50 € d&apos;achats, soit 75 points. Pour chaque boisson offerte, le client a déjà dépensé chez vous plus de douze fois ce qu&apos;elle vous coûte.
              </p>
            </div>
            <ul className="mt-6 grid grid-cols-3 gap-3">
              {RATES.map((r) => (
                <li key={r.rate} className={`rounded-xl border p-3 ${r.rate === "8 %" ? "border-moss bg-moss/10" : "border-night-line"}`}>
                  <p className="font-display text-[22px] font-bold text-white m-0">{r.rate}</p>
                  <p className="text-[12.5px] text-white m-0 mt-1">Boisson : {r.pts} pts</p>
                  <p className="text-[11.5px] text-night-text m-0 mt-1 leading-snug">{r.note}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="px-5 py-4 border-b border-paper-border flex items-center justify-between">
              <p className="font-bold text-ink m-0">Votre catalogue de cadeaux</p>
              <span className="rounded-full bg-moss-tint text-moss-dark text-[12px] font-bold px-3 py-1">Taux 8 %</span>
            </div>
            <table className="w-full text-left text-[14px]">
              <thead className="bg-paper-subtle text-ink-muted text-[12px] uppercase tracking-[0.06em]">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Cadeau</th>
                  <th className="px-3 py-2.5 font-semibold">Vous coûte</th>
                  <th className="px-3 py-2.5 font-semibold">Après</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                {CATALOG.map((c) => (
                  <tr key={c.item}>
                    <td className="px-5 py-3 font-semibold text-ink">{c.item}</td>
                    <td className="px-3 py-3 text-ink-muted tabular-nums">{c.cost}</td>
                    <td className="px-3 py-3 text-ink-muted tabular-nums">{c.spend}</td>
                    <td className="px-5 py-3 text-right font-bold text-ink tabular-nums">{c.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-4 text-[13px] text-ink-muted bg-paper m-0 font-landing leading-relaxed">
              Exemple d&apos;illustration. Vos prix de revient viennent de votre carte (Menu &amp; coûts). Si vous changez de taux, tous les prix en points s&apos;ajustent d&apos;un coup. Le client ne voit jamais vos coûts, seulement ses points.
            </p>
          </div>
        </div>
      </Section>

      {/* 5. La console : ce que vous voyez. */}
      <Section>
        <Heading
          center
          eyebrow="Côté restaurant"
          title="Tout ce qui se passe, sur un seul écran"
          intro="Sur votre ordinateur ou votre téléphone : qui s'est inscrit, quels tickets sont arrivés, quels cadeaux sont partis, et à quel taux."
        />
        <div className="mt-12 relative">
          <LaptopFrame url="boosteats.be/admin/smashly">
            <ConsoleDashboard />
          </LaptopFrame>
        </div>
        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            ["Clients inscrits", "Combien cette semaine, et la liste de tous, avec leurs visites."],
            ["Tickets reçus", "Chaque ticket envoyé, le jour, l'heure et les points crédités."],
            ["Cadeaux remis", "Quel cadeau, à qui, quand. Le caissier valide d'un geste."],
            ["Taux cadeaux", "Le curseur entre 4 et 12 %, que vous changez quand vous voulez."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-2xl bg-white border border-paper-border p-5">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-ink text-white text-[14px] font-bold">{i + 1}</span>
              <h3 className="font-bold text-[16.5px] text-ink mt-3">{t}</h3>
              <p className="font-landing text-[14.5px] leading-[1.65] text-ink-muted mt-1.5">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 6. Les garde-fous. */}
      <Section tone="tint">
        <Heading
          eyebrow="Pas de mauvaise surprise"
          title="Les garde-fous sont déjà en place"
          intro="Vous n'avez rien à surveiller au comptoir. Les règles qui protègent votre marge s'appliquent toutes seules."
        />
        <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GUARDS.map(({ Icon, title, body }) => (
            <li key={title} className="rounded-2xl bg-white border border-moss/20 p-5">
              <Icon className="w-5 h-5 text-moss-dark" aria-hidden />
              <h3 className="font-bold text-[16.5px] text-ink mt-3">{title}</h3>
              <p className="font-landing text-[14.5px] leading-[1.65] text-ink-muted mt-1.5">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 7. Le jour du lancement. */}
      <Section tone="white">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
          <Heading
            eyebrow="Le jour du lancement"
            title="Dix minutes pour démarrer"
            intro="Pas de formation, pas de technicien. Voici ce qu'il y a à faire, et c'est tout."
          />
          <ol className="relative border-l-2 border-moss/40 pl-8 space-y-8">
            {[
              ["Vous posez l'affiche et le QR", "On vous les donne prêts à imprimer, à vos couleurs. Un au comptoir, un sur les tables si vous voulez."],
              ["Chaque employé reçoit son propre QR", "Vous voyez qui inscrit le plus de clients. Ça se transforme vite en jeu dans l'équipe."],
              ["Votre équipe dit une phrase", "« Prenez votre ticket en photo ici, vous avez un cadeau de bienvenue. » Le cadeau de bienvenue fait le reste."],
              ["Vous choisissez votre taux cadeaux", "8 % pour commencer, puis vous ajustez quand vous voyez vos premiers chiffres."],
            ].map(([t, b]) => (
              <li key={t} className="relative">
                <span className="absolute -left-[41px] top-0.5 w-5 h-5 rounded-full bg-moss border-4 border-white shadow" aria-hidden />
                <h3 className="font-bold text-[17px] text-ink">{t}</h3>
                <p className="font-landing text-[15px] leading-[1.7] text-ink-muted mt-1">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* 8. Questions. */}
      <Section width="max-w-[860px]">
        <Heading title="Les questions qu'on nous pose au comptoir" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <AnalysisCta
        location={WHERE}
        title="Avant de lancer votre programme, voyez où vous en êtes"
        body="Votre fiche Google, vos avis et vos voisins vus comme un client les voit. Une note sur 100 en moins d'une minute, puis le rapport complet sur WhatsApp."
        whatsappMessage="Bonjour, je voudrais lancer un programme de fidélité dans mon restaurant."
      />
      <RelatedPages slugs={["relancer-vos-clients", "food-cost-restaurant", "chiffre-affaires-restaurant"]} />
    </MarketingShell>
  );
}
