import { Eye, MapPin, MousePointerClick, Video } from "lucide-react";
import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";
import { TrackedLink } from "@/components/analytics/TrackedLink";
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
import { CampaignCalendar, ConsolePubScreen, EstimateCard, InstagramAdScreen, RadiusMap } from "./_visuals";

// Pub de quartier (pilier « Faire venir »). Process réel : ADR 0085 / 0086 —
// le restaurateur demande depuis sa console et paie par virement, Mehdi vérifie
// et lance, le reste tourne seul (plafond = budget payé, alertes, pause et ajout
// de budget sans validation). Budget minimum 100 € par campagne. Frais de
// service 20 / 15 / 5 % selon le plan. Aucun résultat promis.

export const metadata = marketingMetadata("publicite-restaurant");

const WHERE = "page_publicite-restaurant";

const FAQ: Faq[] = [
  {
    q: "Quel budget faut-il pour une pub de quartier ?",
    a: "Le minimum est de 100 € par campagne. Un bon départ, c'est 10 à 15 € par jour pendant deux semaines dans un rayon de 3 km. Vous voyez une estimation avant de payer et vous ajustez.",
  },
  {
    q: "Qui fait la pub ?",
    a: "Vous choisissez l'objectif, le budget, les dates, la zone et la photo ou la vidéo. Nous préparons la campagne, nous la vérifions et nous la lançons sur Facebook et Instagram. Vous n'avez pas de compte publicitaire à créer.",
  },
  {
    q: "Je dois avoir un compte Instagram ?",
    a: "Non. La pub peut être signée par votre page Facebook seule et s'affiche quand même sur Instagram. Si vous avez un compte Instagram, vous pouvez reprendre une de vos publications.",
  },
  {
    q: "Comment savoir si des clients sont venus par la pub ?",
    a: "Vous ajoutez une offre et un mot clé à dire au comptoir. Votre équipe coche chaque client qui le dit. Dans votre espace, vous voyez en plus les personnes touchées et le budget dépensé, au jour le jour.",
  },
  {
    q: "Je peux arrêter en cours de route ?",
    a: "Oui. Vous mettez la pub en pause en un geste depuis votre espace, et vous la relancez quand vous voulez. Le budget versé reste à votre campagne.",
  },
  {
    q: "Comment se passe le paiement ?",
    a: "Par virement, avec une communication structurée propre à votre demande. Le montant est votre budget plus les frais de service : 20 % en Gratuit, 15 % en Croissance, 5 % en Pro.",
  },
  {
    q: "Que se passe-t-il quand le budget est dépensé ?",
    a: "La pub s'arrête toute seule à la hauteur de ce que vous avez payé. Vous êtes prévenu quand il reste environ deux jours de budget, pour ajouter du budget si vous voulez continuer.",
  },
];

const OBJECTIVES = [
  {
    icon: Eye,
    title: "Se faire connaître dans le quartier",
    body: "La pub se montre plusieurs fois aux mêmes personnes autour de chez vous. Pour une ouverture, un nouveau plat, une période creuse.",
    result: "Vous suivez : les personnes touchées",
  },
  {
    icon: MousePointerClick,
    title: "Des visites au restaurant",
    body: "La pub pousse à cliquer : itinéraire, carte, page de commande. Pour une offre précise à aller chercher.",
    result: "Vous suivez : les clics",
  },
  {
    icon: Video,
    title: "Faire voir une vidéo autour du resto",
    body: "Votre vidéo de cuisine, de salle ou d'équipe, montrée aux gens du quartier. Pour donner un visage au restaurant.",
    result: "Vous suivez : les vues",
  },
];

const STEPS = [
  { n: "1", title: "Vous demandez", body: "Depuis votre espace : l'objectif, le budget, les dates, le rayon autour du restaurant, une photo ou une vidéo, et si vous voulez une offre avec son mot clé. L'estimation s'affiche tout de suite." },
  { n: "2", title: "Vous payez par virement", body: "Une communication structurée relie votre virement à votre demande. Un QR de paiement vous évite de taper l'IBAN." },
  { n: "3", title: "Nous vérifions et lançons", body: "Nous préparons la campagne, relisons le texte et l'image, et la mettons en ligne sur Facebook et Instagram." },
  { n: "4", title: "Vous suivez, vous décidez", body: "Personnes touchées, budget dépensé, jours restants. Pause et ajout de budget en un geste, sans attendre personne." },
];

const PLAN_FEES = [
  { plan: "Gratuit", fee: "20 %", example: "200 € de budget + 40 € de frais" },
  { plan: "Croissance", fee: "15 %", example: "200 € de budget + 30 € de frais" },
  { plan: "Pro", fee: "5 %", example: "200 € de budget + 10 € de frais" },
];

export default function PublicitePage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* En-tête sombre : la pub telle que vos voisins la verront. */}
      <section className="bg-ink overflow-hidden">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <Heading
              as="h1"
              onDark
              eyebrow="Faire venir · Pub de quartier"
              title="Une pub Facebook et Instagram pour les gens qui habitent à côté"
              intro="Vous choisissez un rayon autour de votre restaurant, un budget et une offre. Nous montons la pub, et vos voisins la voient dans leur fil. Au comptoir, un mot clé vous dit qui est venu pour elle."
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
              <WhatsAppLink location={WHERE} variant="onDark" label="Parler de ma pub sur WhatsApp" message="Bonjour, je voudrais lancer une pub de quartier pour mon restaurant." />
            </div>
            <p className="text-[13px] text-night-faint mt-5">Budget à partir de 100 € par campagne · repère : 10 à 15 € par jour</p>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute -inset-8 bg-[radial-gradient(circle,rgba(162,197,35,0.28),transparent_65%)]" aria-hidden />
            <PhoneFrame className="relative w-[280px] sm:w-[300px] rotate-[2deg]" screenClassName="h-[600px]">
              <InstagramAdScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      <Section tone="white">
        <Heading
          eyebrow="Ce qui change"
          title="La même pub Facebook, faite pour un restaurant de quartier"
          intro="Beaucoup de restaurateurs ont déjà « boosté » une publication. Voici ce qui sépare une dépense au hasard d'une campagne qui se mesure au comptoir."
        />
        <div className="mt-10">
          <CompareColumns
            badTitle="La pub faite seul, le soir, en dix minutes"
            bad={[
              "Le bouton « Booster » montre la pub à toute la ville, ou à des gens qui ne passeront jamais devant chez vous.",
              "Aucune offre précise : la personne voit un burger, pas une raison de venir cette semaine.",
              "Aucune idée du résultat avant de payer, et après, des chiffres de « portée » sans lien avec la caisse.",
              "Elle tourne trois jours puis s'oublie, le budget part en une fois.",
            ]}
            goodTitle="La pub de quartier Boosteats"
            good={[
              "Un rayon de 1, 3, 5 ou 10 km autour de votre adresse, pour toucher ceux qui peuvent passer à pied ou en voiture.",
              "Une offre et un mot clé à dire au comptoir : chaque client qui le dit est venu pour la pub.",
              "Une estimation en fourchette avant de payer, puis le suivi jour par jour dans votre espace.",
              "Deux semaines bien placées, en période creuse, avec la pause et l'ajout de budget à portée de main.",
            ]}
          />
        </div>
      </Section>

      <Section>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <RadiusMap />
          <div>
            <Heading
              eyebrow="La zone"
              title="Votre quartier, pas toute la ville"
              intro="Un restaurant vit des gens qui habitent, travaillent ou passent à quelques rues. La pub se concentre sur eux."
            />
            <ul className="mt-7 space-y-4 font-landing text-[16px] leading-[1.65] text-ink">
              <li className="flex gap-3">
                <MapPin className="w-5 h-5 text-moss-dark shrink-0 mt-0.5" aria-hidden />
                <span><strong>1 km</strong> pour un quartier dense où l&apos;on vient à pied ; <strong>3 km</strong> pour la plupart des restaurants de Bruxelles ; <strong>5 ou 10 km</strong> si l&apos;on vient chez vous en voiture.</span>
              </li>
              <li className="flex gap-3">
                <MapPin className="w-5 h-5 text-moss-dark shrink-0 mt-0.5" aria-hidden />
                <span>Tous les adultes de la zone, de 18 à 65 ans et plus : pas de réglage compliqué à choisir.</span>
              </li>
              <li className="flex gap-3">
                <MapPin className="w-5 h-5 text-moss-dark shrink-0 mt-0.5" aria-hidden />
                <span>La pub est signée par votre page Facebook, et par votre compte Instagram si vous en avez un.</span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="tint">
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-12 items-center">
          <div>
            <Heading
              eyebrow="Avant de payer"
              title="Vous voyez ce que la pub peut donner, avant de verser un euro"
              intro="Dès que vous choisissez le budget, la durée et la zone, une fourchette s'affiche : combien de personnes du quartier peuvent la voir. Elle est calculée sur des campagnes réelles, et comparée ensuite à ce qui s'est vraiment passé."
            />
            <ul className="mt-7 space-y-3 font-landing text-[16px] leading-[1.65] text-ink">
              <li><strong>Le repère :</strong> 10 à 15 € par jour pour se faire remarquer dans un quartier.</li>
              <li><strong>Le minimum :</strong> 100 € par campagne.</li>
              <li><strong>La règle :</strong> une fourchette, jamais une promesse de clients.</li>
            </ul>
          </div>
          <EstimateCard />
        </div>
      </Section>

      <Section tone="white">
        <Heading eyebrow="L'objectif" title="Trois façons d'utiliser la pub" intro="Vous choisissez l'objectif ; il décide de ce que Facebook et Instagram cherchent à obtenir, et du chiffre que vous suivez." />
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          {OBJECTIVES.map(({ icon: Icon, title, body, result }) => (
            <div key={title} className="rounded-2xl border border-paper-border bg-paper p-6 flex flex-col">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-ink text-moss-light">
                <Icon className="w-5 h-5" aria-hidden />
              </span>
              <h3 className="font-bold text-[18px] text-ink mt-4">{title}</h3>
              <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2 flex-1">{body}</p>
              <p className="text-[13px] font-semibold text-moss-dark mt-4">{result}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="text-center">
          <Heading center eyebrow="Le mot clé" title="La seule mesure qui compte se fait au comptoir" />
        </div>
        <div className="mt-10 grid md:grid-cols-[1fr_auto_1fr] gap-6 items-center max-w-[900px] mx-auto">
          <div className="rounded-2xl bg-white border border-paper-border p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Dans la pub</p>
            <p className="font-display text-[22px] font-bold text-ink mt-2 leading-tight">« Dites SMASH au comptoir, les frites sont offertes. »</p>
          </div>
          <span className="hidden md:block text-[28px] text-moss-dark font-bold text-center" aria-hidden>→</span>
          <div className="rounded-2xl bg-ink p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-night-faint">Près de la caisse</p>
            <p className="font-display text-[22px] font-bold text-white mt-2 leading-tight">Une coche par client qui dit le mot.</p>
            <p className="font-mono text-[18px] tracking-[0.3em] text-moss-light mt-3" aria-hidden>|||| |||| ||</p>
          </div>
        </div>
        <p className="font-landing text-[16px] leading-[1.7] text-ink-muted text-center max-w-[620px] mx-auto mt-8">
          Le mot clé et l&apos;offre sont rappelés dans votre espace pour que toute l&apos;équipe les ait en tête. À la fin, vous comparez les coches au budget dépensé.
        </p>
      </Section>

      <Section tone="white">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div>
            <Heading eyebrow="Le déroulé" title="Deux validations de notre côté, le reste tourne tout seul" />
            <ol className="mt-8 space-y-5">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-moss text-ink font-bold shrink-0">{s.n}</span>
                  <div>
                    <h3 className="font-bold text-[17px] text-ink">{s.title}</h3>
                    <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-1">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <LaptopFrame url="boosteats.be/admin/smashly/pub">
            <ConsolePubScreen />
          </LaptopFrame>
        </div>
      </Section>

      <Section>
        <Heading
          eyebrow="Un exemple"
          title="Deux semaines en période creuse"
          intro="Le milieu du mois, une rentrée, un mois de novembre calme : la pub sert à remplir les jours que vous connaissez déjà comme faibles."
        />
        <div className="mt-10">
          <CampaignCalendar />
        </div>
      </Section>

      <Section tone="white">
        <Heading eyebrow="Le prix" title="Votre budget, plus des frais qui baissent avec votre plan" intro="Le budget part entièrement en diffusion. Les frais de service couvrent la préparation, la vérification, le suivi et les frais de paiement." />
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          {PLAN_FEES.map((p) => (
            <div key={p.plan} className="rounded-2xl border border-paper-border bg-paper p-6">
              <p className="font-bold text-[16px] text-ink">Plan {p.plan}</p>
              <p className="font-display text-[44px] font-bold text-ink leading-none mt-3">{p.fee}</p>
              <p className="text-[13px] text-ink-muted mt-1">de frais de service</p>
              <p className="font-landing text-[14.5px] text-ink mt-4 pt-4 border-t border-paper-border">Exemple : {p.example}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-ink-faint mt-5">Budget minimum : 100 € par campagne. Paiement par virement.</p>
      </Section>

      <Section width="max-w-[880px]">
        <Heading title="Vos questions sur la pub" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <RelatedPages slugs={["fiche-google-restaurant", "programme-fidelite-restaurant", "visibilite-restaurant"]} />
      <AnalysisCta
        location={WHERE}
        title="Avant la pub, regardez ce que vos voisins voient de vous"
        body="Une pub envoie du monde vers votre fiche Google. Vérifiez-la d'abord : note, photos, horaires, voisins. Une note sur 100 en moins d'une minute."
        whatsappMessage="Bonjour, je voudrais lancer une pub de quartier pour mon restaurant."
      />
    </MarketingShell>
  );
}
