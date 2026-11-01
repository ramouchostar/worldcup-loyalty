import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  AnalysisCta,
  CompareColumns,
  FaqList,
  Heading,
  MarketingShell,
  RelatedPages,
  SearchCard,
  Section,
  WhatsAppLink,
  type Faq,
} from "@/components/marketing/kit";
import { marketingMetadata } from "@/lib/marketing-pages";
import { GoogleProfileMock, GoogleWordmark, PROFILE_ANNOTATIONS, RankingTrio } from "./_visuals";

// Fiche Google (pilier « Faire venir ») : la page la plus complète du site, écrite
// comme un guide de référence pour un restaurant à Bruxelles. Ce que fait
// Boosteats : l'analyse gratuite (ADR 0069 / 0071) ; en Pro, la fiche tenue à
// jour comme gestionnaire invité, jamais propriétaire (ADR 0082), en partie à
// la main aujourd'hui. Les avis ne s'achètent jamais (ADR 0074 §5).

export const metadata = marketingMetadata("fiche-google-restaurant");

const WHERE = "page_fiche-google-restaurant";

type GuideSection = { id: string; title: string; body: string[]; list?: string[]; table?: { head: string[]; rows: string[][] } };

const GUIDE: GuideSection[] = [
  {
    id: "pourquoi",
    title: "Pourquoi la fiche Google compte plus que votre site",
    body: [
      "Quand quelqu'un cherche « pizza Ixelles » ou « restaurant près de moi », Google lui montre d'abord une carte et trois ou quatre fiches. La plupart des gens choisissent là, sans jamais ouvrir un site. Votre fiche est donc votre vraie vitrine en ligne : c'est elle qui donne l'adresse, les horaires, les photos, la note et le bouton pour appeler.",
      "La bonne nouvelle : elle est gratuite, elle vous appartient, et la plupart de vos voisins la remplissent à moitié. Une fiche complète et vivante se remarque vite dans un quartier.",
    ],
  },
  {
    id: "categorie",
    title: "La catégorie : le réglage le plus important",
    body: [
      "La catégorie principale dit à Google pour quelles recherches vous montrer. Choisissez la plus précise qui vous décrit : « Restaurant de burgers » plutôt que « Restaurant », « Pizzeria » plutôt que « Restaurant italien » si la pizza est votre cœur de métier. Ajoutez ensuite quelques catégories secondaires vraies, sans en empiler dix.",
    ],
    table: {
      head: ["Si vous êtes…", "Catégorie principale", "Catégories secondaires possibles"],
      rows: [
        ["Un snack burgers à emporter", "Restaurant de burgers", "Fast-food, Livraison de repas"],
        ["Une pizzeria de quartier", "Pizzeria", "Restaurant italien, Pizzas à emporter"],
        ["Un restaurant libanais", "Restaurant libanais", "Restaurant méditerranéen, Traiteur"],
        ["Un bar à poké", "Restaurant de poké", "Restaurant hawaïen, Restaurant sain"],
      ],
    },
  },
  {
    id: "nap",
    title: "Nom, adresse, téléphone : les mêmes partout",
    body: [
      "Google compare ce qu'il lit sur votre fiche avec ce qu'il trouve ailleurs : votre site, votre page Facebook, Uber Eats, Deliveroo, Takeaway, les annuaires. Si l'adresse ou le numéro diffère d'un endroit à l'autre, il a moins confiance.",
    ],
    list: [
      "Écrivez le nom exact de l'enseigne, tel qu'il figure sur la façade. Ajouter « meilleur burger Bruxelles » au nom est interdit par Google et peut faire suspendre la fiche.",
      "Gardez la même adresse, au caractère près, sur toutes les plateformes.",
      "Mettez un numéro qui répond vraiment pendant les heures d'ouverture.",
    ],
  },
  {
    id: "horaires",
    title: "Les horaires, y compris les jours fériés",
    body: [
      "Un client qui trouve porte close à cause d'horaires faux ne revient pas, et laisse parfois un avis. Indiquez vos horaires habituels, puis des horaires exceptionnels pour chaque jour férié, vos congés et les travaux.",
      "En Belgique, pensez aux jours fériés légaux : 1er janvier, lundi de Pâques, 1er mai, Ascension, lundi de Pentecôte, 21 juillet, 15 août, 1er novembre, 11 novembre et 25 décembre. Google demande souvent de les confirmer : répondez, sinon la fiche affiche « horaires susceptibles de changer ».",
      "Si la livraison ou l'emporter n'ont pas les mêmes horaires que la salle, renseignez-les à part : la fiche le permet.",
    ],
  },
  {
    id: "photos",
    title: "Les photos : lesquelles, combien, à quel rythme",
    body: [
      "Les photos sont la première chose qu'on regarde. Une fiche sans photo récente laisse le client imaginer le pire.",
    ],
    list: [
      "La façade de jour, pour qu'on vous reconnaisse dans la rue.",
      "La salle, pleine si possible, et le comptoir.",
      "Vos cinq plats les plus commandés, de près, à la lumière du jour, sans filtre.",
      "L'équipe en cuisine ou au service : un visage rassure.",
      "La carte, lisible, avec les prix.",
      "Un rythme simple : une dizaine de photos pour démarrer, puis quelques nouvelles chaque mois, à chaque nouveau plat ou changement de saison.",
    ],
  },
  {
    id: "menu",
    title: "La carte et le bouton « Commander »",
    body: [
      "Ajoutez votre carte avec les prix, et gardez-la à jour : un prix faux crée une dispute au comptoir. Si vous prenez des commandes, reliez le bouton « Commander » ou « Réserver » au lien de votre choix.",
      "Mettez en premier votre propre lien de commande quand vous en avez un : une commande passée chez vous ne paie pas de commission à une plateforme de livraison.",
    ],
  },
  {
    id: "attributs",
    title: "Les attributs : les détails qui font choisir",
    body: [
      "Les attributs sont les petites cases de la fiche : sur place, à emporter, livraison, terrasse, accès en fauteuil roulant, paiement par carte, options végétariennes, toilettes. Ils servent de filtres quand un client cherche « restaurant avec terrasse » ou « végétarien ». Cochez tout ce qui est vrai, et seulement ce qui est vrai.",
    ],
  },
  {
    id: "description",
    title: "La description de l'établissement",
    body: [
      "Vous avez 750 caractères. Les premières lignes sont celles qu'on lit : dites ce que vous servez, ce qui vous distingue et votre quartier, avec les mots que vos clients emploient. Pas de liste de mots-clés, pas de lien, pas de promo datée : la description doit rester vraie toute l'année.",
    ],
  },
  {
    id: "avis",
    title: "Les avis : en demander à tous, répondre à chacun",
    body: [
      "Le nombre d'avis, leur note et leur fraîcheur pèsent dans le choix des clients et dans votre place sur Google. La façon la plus simple d'en avoir plus : demander, à tous les clients, après leur visite. Un QR au comptoir ou un message après le repas suffit.",
      "Répondez à tous les avis, vite et avec votre propre voix. Un avis positif mérite un merci qui cite ce que le client a aimé. Un avis négatif appelle une réponse calme : remercier, reconnaître le problème, dire ce que vous avez changé, inviter à revenir. Évitez la réponse copiée-collée : elle se voit.",
    ],
  },
  {
    id: "posts",
    title: "Les posts et les questions",
    body: [
      "La fiche permet de publier des nouvelles : une offre, un nouveau plat, une soirée match, un changement d'horaires. Un post par semaine ou toutes les deux semaines montre que le restaurant est vivant.",
      "Si la rubrique « Questions et réponses » s'affiche sur votre fiche, lisez-la : n'importe qui peut y répondre à votre place. Répondez vous-même aux questions courantes (parking, halal, réservation, enfants) pour garder la bonne information en haut.",
    ],
  },
  {
    id: "classement",
    title: "Ce qui joue sur votre place dans Google Maps",
    body: [
      "Google explique lui-même qu'il classe les résultats locaux selon trois familles de critères. Personne ne connaît le détail exact, et tout le monde vous promettant « la première place » vous ment. Mais sur ces trois familles, vous en tenez deux.",
    ],
  },
];

const ERRORS_BAD = [
  "Une seule photo, prise de nuit en 2021.",
  "Les horaires de Noël jamais renseignés : « Ouvert » affiché alors que la porte est fermée.",
  "« Restaurant » comme seule catégorie.",
  "Un nom bourré de mots-clés, au risque de voir la fiche suspendue.",
  "Les avis à une étoile restés sans réponse depuis des mois.",
  "Un numéro de téléphone qui sonne dans le vide.",
  "Le bouton « Commander » qui mène à une plateforme qui prend une commission, alors que vous avez votre propre lien.",
];

const ERRORS_GOOD = [
  "Une dizaine de photos récentes : façade, salle, plats, équipe.",
  "Les jours fériés et les congés renseignés à l'avance.",
  "Une catégorie principale précise, et quelques secondaires vraies.",
  "Le nom exact de l'enseigne, comme sur la façade.",
  "Une réponse à chaque avis, dans la semaine, avec vos mots.",
  "Un numéro qui répond aux heures d'ouverture.",
  "Votre propre lien de commande en premier, la carte à jour avec les prix.",
];

const CHECKLIST = [
  "Fiche revendiquée et validée à votre nom",
  "Catégorie principale la plus précise possible",
  "Nom, adresse et téléphone identiques partout",
  "Horaires habituels et jours fériés renseignés",
  "Au moins dix photos récentes, de jour",
  "Carte à jour avec les prix",
  "Lien « Commander » ou « Réserver » vers votre propre page",
  "Attributs cochés : sur place, emporter, livraison, terrasse…",
  "Description de 750 caractères, vraie toute l'année",
  "Une réponse à chaque avis, positifs compris",
  "Un post toutes les une ou deux semaines",
  "Site internet relié, qui s'affiche bien sur téléphone",
];

const FAQ: Faq[] = [
  {
    q: "Combien coûte une fiche d'établissement Google ?",
    a: "Rien. La fiche est gratuite. Ce qui demande du temps, c'est de la garder complète : photos, horaires exceptionnels, réponses aux avis, posts.",
  },
  {
    q: "Comment savoir si ma fiche est bien remplie ?",
    a: "Lancez l'analyse gratuite : vous tapez le nom du restaurant et vous obtenez une note sur 100, ce qui manque sur la fiche et vos voisins à 600 m, en moins d'une minute.",
  },
  {
    q: "Combien de temps faut-il pour remonter sur Google Maps ?",
    a: "Les corrections simples (catégorie, horaires, photos) se voient souvent en quelques semaines. Les avis se construisent sur des mois. Personne ne peut garantir une place : la distance avec la personne qui cherche ne dépend pas de vous.",
  },
  {
    q: "Je peux offrir un cadeau contre un avis Google ?",
    a: "Non. Google interdit toute contrepartie à un avis, même une petite réduction. Il peut supprimer les avis concernés et sanctionner la fiche. Demandez des avis à tous vos clients, sans rien en échange.",
  },
  {
    q: "Je peux supprimer un avis négatif ?",
    a: "Seulement s'il enfreint les règles de Google (insulte, faux client, conflit d'intérêts) : vous pouvez alors le signaler depuis la fiche. Un avis négatif sincère reste ; votre réponse est ce que les futurs clients liront.",
  },
  {
    q: "Mon ancienne agence a encore accès à ma fiche, c'est grave ?",
    a: "Vérifiez dans « Personnes et accès » qui est propriétaire et qui est gestionnaire. Le propriétaire doit être vous. Retirez les accès dont vous n'avez plus besoin.",
  },
  {
    q: "Vous pouvez gérer ma fiche à ma place ?",
    a: "Oui, en plan Pro. Vous nous invitez comme gestionnaire depuis votre fiche : vous en restez propriétaire et vous pouvez retirer l'accès à tout moment. Aujourd'hui, une partie de ce travail est faite à la main par notre équipe.",
  },
  {
    q: "Faut-il un site internet si j'ai une bonne fiche Google ?",
    a: "Ce n'est pas obligatoire, mais un site relié à la fiche, rapide sur téléphone, avec la carte et un lien de commande, renforce votre fiche et vous donne un endroit à vous.",
  },
];

export default function FicheGooglePage() {
  return (
    <MarketingShell faq={FAQ}>
      <section className="bg-white border-b border-paper-border overflow-hidden">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-start">
          <div className="lg:pt-6">
            <div className="flex items-center gap-3">
              <GoogleWordmark className="text-[26px]" />
              <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-faint">Le guide de la fiche</span>
            </div>
            <Heading
              as="h1"
              title="Votre fiche Google est la vitrine que vos clients voient avant la vôtre"
              intro="Le guide complet pour un restaurant à Bruxelles : catégorie, horaires, photos, carte, avis, réponses. Ce qui fait qu'un client choisit votre restaurant sur Google Maps, et ce qui le fait passer chez le voisin."
            />
            <div className="mt-8 max-w-[560px]">
              <SearchCard location={WHERE} />
              <p className="text-[13px] text-ink-faint mt-3">Tapez le nom de votre restaurant : votre fiche notée sur 100, gratuitement, en moins d&apos;une minute.</p>
            </div>
          </div>
          <GoogleProfileMock />
        </div>
      </section>

      <Section tone="paper">
        <Heading eyebrow="En cinq secondes" title="Ce qu'un client regarde sur votre fiche" intro="Les numéros renvoient à la fiche ci-dessus. Six éléments décident si l'on vous appelle, si l'on vient, ou si l'on continue de chercher." />
        <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {PROFILE_ANNOTATIONS.map((a) => (
            <li key={a.n} className="rounded-2xl bg-white border border-paper-border p-5">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-ink text-moss-light text-[13px] font-bold">{a.n}</span>
              <h3 className="font-bold text-[17px] text-ink mt-3">{a.title}</h3>
              <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-1.5">{a.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <section className="bg-white border-y border-paper-border">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16 sm:py-20 grid lg:grid-cols-[240px_1fr] gap-12">
          <nav aria-label="Sommaire du guide" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">Le guide</p>
              <ol className="mt-3 space-y-2 border-l border-paper-border">
                {GUIDE.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block pl-4 -ml-px border-l-2 border-transparent hover:border-moss text-[14px] leading-snug text-ink-muted hover:text-ink">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
          <div className="max-w-[720px] space-y-14">
            {GUIDE.map((s, i) => (
              <article key={s.id} id={s.id} className="scroll-mt-24">
                <p className="font-mono text-[12px] tracking-[0.14em] text-moss-dark">{String(i + 1).padStart(2, "0")}</p>
                <h2 className="font-display text-[26px] sm:text-[30px] leading-[1.2] tracking-[-0.02em] font-bold text-ink mt-1">{s.title}</h2>
                <div className="mt-4 space-y-4">
                  {s.body.map((p) => (
                    <p key={p} className="font-landing text-[17px] leading-[1.8] text-ink/90">{p}</p>
                  ))}
                  {s.list && (
                    <ul className="space-y-2.5">
                      {s.list.map((it) => (
                        <li key={it} className="flex gap-3 font-landing text-[16.5px] leading-[1.7] text-ink/90">
                          <span aria-hidden className="mt-[11px] w-1.5 h-1.5 rounded-full bg-moss-dark shrink-0" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.table && (
                    <div className="overflow-x-auto rounded-xl border border-paper-border">
                      <table className="w-full text-left text-[14.5px]">
                        <thead className="bg-paper">
                          <tr>{s.table.head.map((h) => <th key={h} className="px-4 py-3 font-bold text-ink">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-paper-border">
                          {s.table.rows.map((r) => (
                            <tr key={r[0]}>{r.map((c, j) => <td key={j} className="px-4 py-3 font-landing text-ink/90 align-top">{c}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {s.id === "avis" && (
                    <aside className="rounded-2xl border border-danger/25 bg-danger/5 p-5">
                      <p className="flex items-center gap-2 font-bold text-[16px] text-danger">
                        <ShieldAlert className="w-4 h-4" aria-hidden /> Un avis ne s&apos;achète jamais
                      </p>
                      <p className="font-landing text-[15.5px] leading-[1.7] text-ink mt-2">
                        Une boisson offerte, des points, une réduction ou un tirage au sort contre un avis : Google l&apos;interdit. Il peut supprimer les avis concernés, même anciens, et sanctionner la fiche. Ne triez pas non plus les clients à qui vous demandez un avis selon qu&apos;ils sont contents ou pas : demandez à tous.
                      </p>
                    </aside>
                  )}
                  {s.id === "classement" && (
                    <div className="pt-2">
                      <RankingTrio />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Section>
        <Heading eyebrow="Les erreurs fréquentes" title="La fiche qui fait fuir, la fiche qui fait entrer" intro="Ce qu'on voit le plus souvent en analysant les fiches des restaurants bruxellois." />
        <div className="mt-10">
          <CompareColumns badTitle="Ce qui fait passer chez le voisin" bad={ERRORS_BAD} goodTitle="Ce qui fait choisir votre restaurant" good={ERRORS_GOOD} />
        </div>
      </Section>

      <Section tone="tint">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-start">
          <div>
            <Heading eyebrow="À cocher" title="La liste de contrôle de votre fiche" intro="Douze points. Chaque case vide est une raison de plus de choisir le voisin." />
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation={`${WHERE}_liste`}
                audience="restaurateur"
                href="/analyse-fiche-google-restaurant"
                className="inline-flex justify-center bg-ink text-white text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-ink/85 transition-colors"
              >
                Faire vérifier ma fiche gratuitement
              </TrackedLink>
              <WhatsAppLink location={`${WHERE}_liste`} message="Bonjour, je voudrais de l'aide pour ma fiche Google." />
            </div>
          </div>
          <ul className="grid gap-2.5">
            {CHECKLIST.map((c, i) => (
              <li key={c} className="flex items-center gap-3 rounded-xl bg-white border border-moss/25 px-4 py-3">
                <span className="grid place-items-center w-6 h-6 rounded-md border-2 border-moss-dark text-[11px] font-bold text-moss-dark shrink-0">{i + 1}</span>
                <span className="font-landing text-[15px] text-ink">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="white">
        <Heading eyebrow="Avec Boosteats" title="Ce que nous faisons pour votre fiche" />
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          <div className="rounded-2xl border border-paper-border bg-paper p-6">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-dark">Gratuit, pour tous</p>
            <h3 className="font-display text-[22px] font-bold text-ink mt-2">L&apos;analyse de votre fiche</h3>
            <p className="font-landing text-[15.5px] leading-[1.7] text-ink-muted mt-2">
              Une note sur 100, ce qui manque sur la fiche, vos avis, vos voisins à 600 m et votre place sur Google Maps. Le rapport complet et cinq priorités arrivent sur WhatsApp.
            </p>
            <Link href="/analyse-fiche-google-restaurant" className="inline-block mt-4 text-[15px] font-bold text-moss-dark hover:underline">
              Voir ce que l&apos;analyse vérifie →
            </Link>
          </div>
          <div className="rounded-2xl border border-paper-border bg-ink p-6">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-light">Plan Pro</p>
            <h3 className="font-display text-[22px] font-bold text-white mt-2">Votre fiche tenue à jour</h3>
            <p className="font-landing text-[15.5px] leading-[1.7] text-night-text mt-2">
              Vous nous invitez comme gestionnaire, vous restez propriétaire. Nous corrigeons ce qui manque, nous gardons la fiche à jour et nous faisons le point avec vous chaque mois. Aujourd&apos;hui, une partie de ce travail est faite à la main par notre équipe.
            </p>
          </div>
        </div>
      </Section>

      <Section width="max-w-[880px]">
        <Heading title="Vos questions sur la fiche Google" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <RelatedPages slugs={["analyse-fiche-google-restaurant", "analyse-avis-google-restaurant", "visibilite-restaurant", "publicite-restaurant"]} />
      <AnalysisCta
        location={WHERE}
        title="Votre fiche, notée sur 100 en une minute"
        body="Tapez le nom de votre restaurant. Vous voyez ce qui manque sur votre fiche Google et où vous en êtes face à vos voisins. Gratuit, sans engagement."
        whatsappMessage="Bonjour, je voudrais de l'aide pour ma fiche Google."
      />
    </MarketingShell>
  );
}
