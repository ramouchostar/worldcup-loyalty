import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  AnalysisCta,
  CompareColumns,
  FaqList,
  LaptopFrame,
  MarketingShell,
  RelatedPages,
  Section,
  WhatsAppLink,
  type Faq,
} from "@/components/marketing/kit";
import { marketingMetadata } from "@/lib/marketing-pages";
import { BURGER, FormulaCard, MenuCostsScreen, PercentVsEuros, RecipeCard, burgerCost, burgerHt, burgerPct, eur2 } from "./_visuals";

// Page de référence « food cost » (pilier Garder la main) : la recherche la
// plus forte de la stratégie en Belgique (« food cost », 170/mois). Mise en
// scène éditoriale (guide), différente des autres pages. Faits produit
// vérifiés le 2026-11-01 : Menu & coûts (app/admin/[restaurantId]/menu :
// prix vente, prix revient, marge, marge la plus forte / faible, import CSV) ;
// cadeaux au prix de revient au taux choisi 4-12 % (ADR 0017 / 0068).
// Pas de calculateur interactif (reporté par Mehdi le 2026-11-01).

const SLUG = "food-cost-restaurant";
const WHERE = `page_${SLUG}`;

export const metadata = marketingMetadata(SLUG);

const FAQ: Faq[] = [
  {
    q: "Qu'est-ce que le food cost d'un restaurant ?",
    a: "C'est la part du prix de vente d'un plat qui part en matières premières. Un food cost de 28 % veut dire que sur 10 € encaissés hors TVA, 2,80 € ont servi à acheter les ingrédients.",
  },
  {
    q: "Comment calculer le food cost d'un plat ?",
    a: "Additionnez le coût de chaque ingrédient pour la portion servie, puis divisez par le prix de vente hors TVA, et multipliez par 100. Le coût s'appuie sur vos derniers prix d'achat et sur les grammages réellement servis.",
  },
  {
    q: "Quel est un bon food cost pour un restaurant ?",
    a: "On cite souvent 25 à 35 % comme ordre de grandeur, mais il dépend de votre type de cuisine, de vos prix et de vos autres charges. Le plus utile est de suivre le vôtre, plat par plat, et de surveiller qu'il ne dérive pas.",
  },
  {
    q: "Faut-il calculer sur le prix TTC ou HTVA ?",
    a: "Toujours sur le prix hors TVA : la TVA ne vous appartient pas, elle repart à l'État. Calculer sur le prix TTC donne un food cost plus bas que la réalité.",
  },
  {
    q: "Quelle différence entre food cost et marge ?",
    a: "Le food cost est un pourcentage, la marge est un montant en euros. Un plat peut avoir un food cost élevé et rapporter beaucoup d'euros par vente : c'est souvent lui qu'il faut pousser.",
  },
  {
    q: "Boosteats calcule-t-il mon food cost ?",
    a: "Dans Menu & coûts, vous voyez pour chaque article le prix de vente, le prix de revient que vous indiquez et la marge par vente, avec la marge la plus forte et la plus faible de votre carte. Vous importez votre carte depuis un simple fichier.",
  },
];

const TOC = [
  ["definition", "Le food cost, en une phrase"],
  ["calcul", "Le calcul, sur un vrai plat"],
  ["reperes", "Quels repères viser ?"],
  ["erreurs", "Les erreurs qui coûtent cher"],
  ["marge", "Pourcentage ou euros ?"],
  ["suivre", "Suivre sa carte plat par plat"],
  ["cadeaux", "Et les cadeaux de fidélité ?"],
];

export default function FoodCostPage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* Héros éditorial : un guide, pas une page de vente. */}
      <header className="bg-[#FFFDF6] border-b border-[#E9E2CC]">
        <div className="max-w-[1150px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-[1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-dark">Garder la main · Guide</p>
            <h1 className="font-display text-[38px] sm:text-[50px] lg:text-[58px] leading-[1.04] tracking-[-0.035em] font-bold text-ink text-pretty mt-3">
              Food cost : combien vous coûte vraiment chaque plat ?
            </h1>
            <p className="font-landing text-[18px] leading-[1.7] text-ink-muted mt-5 max-w-[560px]">
              La définition, la formule, un calcul complet sur un burger, les erreurs qui font perdre de l&apos;argent sans qu&apos;on le voie, et la façon de suivre la marge de toute votre carte.
            </p>
            <p className="text-[13.5px] text-ink-faint mt-5">Lecture : 8 minutes</p>
          </div>
          <RecipeCard />
        </div>
      </header>

      <div className="max-w-[1150px] mx-auto px-5 sm:px-8 py-14 grid lg:grid-cols-[230px_1fr] gap-12">
        {/* Sommaire, collé à gauche sur grand écran. */}
        <nav aria-label="Sommaire" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Au sommaire</p>
            <ol className="mt-3 space-y-2 border-l-2 border-paper-border">
              {TOC.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="block pl-4 -ml-[2px] border-l-2 border-transparent hover:border-moss text-[14px] text-ink-muted hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="min-w-0 space-y-16 font-landing text-[17px] leading-[1.8] text-ink/90">
          <section id="definition" className="scroll-mt-24 space-y-4">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Le food cost, en une phrase</h2>
            <p>
              Le food cost, c&apos;est la part du prix de vente d&apos;un plat qui part en matières premières. Un food cost de 30 % veut dire que sur 10 € encaissés hors TVA, 3 € ont servi à acheter la viande, le pain, le fromage et la sauce.
            </p>
            <p>
              C&apos;est le premier coût d&apos;un restaurant avec les salaires. Il bouge tous les mois, au rythme des prix fournisseurs, des portions servies et des pertes en cuisine. Et c&apos;est souvent celui qu&apos;on calcule une fois, à l&apos;ouverture, puis qu&apos;on oublie.
            </p>
          </section>

          <section id="calcul" className="scroll-mt-24 space-y-6">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Le calcul, sur un vrai plat</h2>
            <FormulaCard />
            <p>Le calcul tient en quatre gestes :</p>
            <ol className="space-y-3">
              {[
                "Listez les ingrédients du plat, avec le grammage réellement servi, pas celui de la recette idéale.",
                "Mettez un prix sur chaque ligne, à partir de votre dernière facture fournisseur (prix au kilo × grammage).",
                `Additionnez : pour le ${BURGER.name}, ${eur2(burgerCost)} de matière.`,
                `Divisez par le prix de vente hors TVA. Sur place, la TVA est de 12 % : ${eur2(BURGER.priceTtc)} sur la carte font ${eur2(burgerHt)} hors TVA. Résultat : ${burgerPct.toLocaleString("fr-BE")} %.`,
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-moss-tint text-moss-dark text-[14px] font-bold shrink-0">{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
            <aside className="rounded-2xl bg-moss-tint border border-moss/30 p-5">
              <p className="font-bold text-moss-dark text-[16px]">Pensez aux pertes</p>
              <p className="text-[16px] text-ink mt-1.5">
                Le parage de la viande, la salade qui flétrit, les frites jetées en fin de service : ajoutez une marge de perte à vos coûts. Sinon, votre food cost réel sera toujours au-dessus de celui de la fiche technique.
              </p>
            </aside>
            <p>
              À l&apos;échelle du restaurant, le calcul se fait sur un mois : stock du début, plus les achats, moins le stock de fin, divisé par le chiffre d&apos;affaires hors TVA. Si ce food cost global est nettement au-dessus de celui de vos fiches techniques, l&apos;écart se trouve dans les portions, les pertes ou les repas offerts.
            </p>
          </section>

          <section id="reperes" className="scroll-mt-24 space-y-5">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Quels repères viser ?</h2>
            <p>
              On entend souvent « entre 25 et 35 % ». C&apos;est un ordre de grandeur. Le bon food cost dépend de vos prix, de votre loyer et de votre personnel : un snack avec peu de salariés supporte un food cost plus haut qu&apos;un restaurant avec service à table.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-paper-border bg-white">
              <table className="w-full text-left text-[15px]">
                <thead className="bg-paper-subtle">
                  <tr>
                    <th className="px-4 py-3 font-bold text-ink">Type de plat</th>
                    <th className="px-4 py-3 font-bold text-ink">Ce qui pèse</th>
                    <th className="px-4 py-3 font-bold text-ink">Tendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {[
                    ["Pizza, pâtes", "Farine, sauce tomate, fromage", "Souvent plutôt bas"],
                    ["Burger, poulet", "La viande, surtout le bœuf", "Plutôt au milieu, sensible au prix de la viande"],
                    ["Grillades, poisson", "La pièce principale", "Souvent plus haut"],
                    ["Boissons, frites, desserts maison", "Peu de matière", "Bas : ce sont vos meilleures marges"],
                  ].map((r) => (
                    <tr key={r[0]}>{r.map((c, j) => <td key={j} className="px-4 py-3 align-top text-ink/90">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[15px] text-ink-muted">Ces tendances sont des repères généraux. Votre propre carte, avec vos prix d&apos;achat, est la seule référence qui compte.</p>
          </section>

          <section id="erreurs" className="scroll-mt-24 space-y-6">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Les erreurs qui coûtent cher</h2>
            <div className="font-sans text-[15px]">
              <CompareColumns
                badTitle="Ce qui fait perdre de la marge"
                bad={[
                  "Calculer sur le prix TTC : le food cost paraît plus bas qu'il ne l'est.",
                  "Garder les prix d'achat de l'ouverture alors que la viande a augmenté.",
                  "Servir les portions « à l'œil » : 20 g de plus par burger, chaque jour.",
                  "Lancer une promo sans calculer ce qu'elle coûte par vente.",
                  "Offrir « le 10e menu » sans savoir ce que ça représente sur un mois.",
                  "Ne regarder que le food cost global, jamais plat par plat.",
                ]}
                goodTitle="Ce qui protège votre marge"
                good={[
                  "Calculer sur le prix hors TVA, toujours.",
                  "Mettre à jour les prix fournisseurs au moins chaque trimestre.",
                  "Une fiche technique par plat, avec les grammages, affichée en cuisine.",
                  "Calculer la marge en euros de chaque promo avant de la lancer.",
                  "Des cadeaux calculés sur leur prix de revient, au taux que vous fixez.",
                  "Suivre la marge de chaque plat et pousser ceux qui rapportent le plus.",
                ]}
              />
            </div>
          </section>

          <section id="marge" className="scroll-mt-24 space-y-5">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Pourcentage ou euros ?</h2>
            <p>
              Le food cost est un pourcentage. Votre loyer et vos salaires se paient en euros. Un plat au food cost bas ne rapporte pas forcément plus qu&apos;un plat au food cost élevé : ce qui compte, c&apos;est ce qu&apos;il reste dans la caisse après chaque vente.
            </p>
            <PercentVsEuros />
            <p>
              Les frites ont un food cost bien plus bas, mais le burger laisse plus du double d&apos;euros par vente. Le bon réflexe : proposer les frites avec le burger, plutôt que de mettre les frites seules en avant.
            </p>
          </section>

          <section id="suivre" className="scroll-mt-24 space-y-6">
            <h2 className="font-display text-[30px] sm:text-[34px] leading-[1.2] font-bold text-ink">Suivre sa carte plat par plat</h2>
            <p>
              Dans Boosteats, l&apos;écran Menu &amp; coûts réunit votre carte : prix de vente, prix de revient que vous indiquez, et la marge de chaque article par vente. La marge la plus forte et la plus faible de la carte sont affichées en haut. Vous importez la carte d&apos;un coup depuis un fichier, puis vous corrigez une ligne quand un prix change.
            </p>
          </section>
        </article>
      </div>

      <section className="bg-white border-y border-paper-border">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16">
          <LaptopFrame url="boosteats.be/admin/smashly/menu">
            <MenuCostsScreen />
          </LaptopFrame>
        </div>
      </section>

      {/* Le lien avec la fidélité : le cadeau au prix de revient. */}
      <Section id="cadeaux">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-dark">Et les cadeaux de fidélité ?</p>
            <h2 className="font-display text-[30px] sm:text-[36px] leading-[1.15] tracking-[-0.025em] font-bold text-ink mt-3 text-pretty">
              Un cadeau se calcule comme un plat : sur ce qu&apos;il vous coûte
            </h2>
            <p className="font-landing text-[17px] leading-[1.75] text-ink-muted mt-4">
              Le « 10e menu offert » coûte cher sur un mois, et personne ne sait combien. Avec le programme de fidélité Boosteats, chaque cadeau est calculé sur son prix de revient, au taux que vous choisissez entre 4 et 12 % des achats de vos clients. Un cadeau bon marché se gagne vite, un cadeau cher demande plus d&apos;achats.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                href="/programme-fidelite-restaurant"
                className="inline-flex justify-center rounded-lg border-[1.5px] border-moss text-moss-dark text-[15px] font-bold px-5 py-3 hover:bg-moss-tint transition-colors"
              >
                Voir le programme de fidélité
              </Link>
              <WhatsAppLink location={WHERE} message="Bonjour, je voudrais suivre le food cost et les marges de mon restaurant avec Boosteats." />
            </div>
          </div>
          <div className="rounded-3xl bg-ink p-7 text-white">
            <p className="text-[11px] uppercase tracking-[0.14em] text-night-faint font-bold">Exemple à 8 %</p>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div className="rounded-2xl bg-night-raised border border-night-line p-4">
                <p className="text-[12px] text-night-text">Une boisson vous coûte</p>
                <p className="font-display text-[28px] font-bold">0,60 €</p>
              </div>
              <span className="text-night-faint text-[22px]" aria-hidden>→</span>
              <div className="rounded-2xl bg-moss text-ink p-4">
                <p className="text-[12px] font-semibold">Elle se gagne après</p>
                <p className="font-display text-[28px] font-bold">7,50 €</p>
              </div>
            </div>
            <p className="font-landing text-[14.5px] leading-[1.7] text-night-text mt-5">
              0,60 € ÷ 8 % = 7,50 € d&apos;achats. Vous savez ce que coûte chaque cadeau avant même de l&apos;offrir.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="white" width="max-w-[880px]">
        <h2 className="font-display text-[28px] sm:text-[34px] font-bold text-ink mb-6">Vos questions sur le food cost</h2>
        <FaqList items={FAQ} />
        <div className="mt-8 text-center">
          <TrackedLink
            ctaId="devenir_partenaire"
            ctaLocation={WHERE}
            audience="restaurateur"
            href="/become-a-partner"
            className="inline-flex justify-center bg-moss text-white text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-dark transition-colors"
          >
            Mettre ma carte dans Menu &amp; coûts, gratuitement
          </TrackedLink>
        </div>
      </Section>

      <RelatedPages slugs={["chiffre-affaires-restaurant", "programme-fidelite-restaurant", "relancer-vos-clients"]} />
      <AnalysisCta
        location={WHERE}
        title="Vos coûts sont sous contrôle. Et votre salle ?"
        body="Voyez votre restaurant comme vos clients le voient sur Google : fiche, avis, voisins. Une note sur 100 en moins d'une minute, gratuite."
        whatsappMessage="Bonjour, je voudrais en savoir plus sur Boosteats pour suivre mes coûts et faire revenir mes clients."
      />
    </MarketingShell>
  );
}
