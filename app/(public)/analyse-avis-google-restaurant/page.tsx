import { Ban, Star } from "lucide-react";
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

// Page d'entrée vers l'analyse gratuite, angle « avis Google » (ADR 0069 / 0071).
// Ce que l'analyse mesure vraiment : note et part des avis récents à 4★+ dans
// l'aperçu (lib/audit/quick-score.ts) ; dans le rapport complet, les thèmes
// négatifs et positifs comptés sur les avis réels avec une citation tirée du
// texte (lib/audit/review-themes.ts), la part de réponses sur 12 mois et le
// délai médian (lib/audit/fiche-score.ts), la note glissante sur 24 mois
// (AuditReport). Les avis ne s'achètent jamais (ADR 0074 §5).
// Avis, thèmes et chiffres ci-dessous : exemples IMAGINAIRES.

const SLUG = "analyse-avis-google-restaurant";
const WHERE = `page_${SLUG}`;

export const metadata = marketingMetadata(SLUG);

const FAQ: Faq[] = [
  {
    q: "Combien d'avis l'analyse lit-elle ?",
    a: "L'aperçu regarde votre note et vos avis récents. Le rapport complet lit jusqu'à plusieurs centaines d'avis pour trouver ce qui revient, et compte combien d'avis parlent de chaque sujet.",
  },
  {
    q: "Les citations du rapport sont-elles inventées ?",
    a: "Non. Chaque thème est illustré par une phrase tirée telle quelle d'un vrai avis de votre fiche. On ne reformule pas ce que vos clients ont écrit.",
  },
  {
    q: "Peut-on faire supprimer un mauvais avis ?",
    a: "Seulement s'il enfreint les règles de Google (insulte, faux avis, hors sujet). Un avis négatif sincère reste. Ce qui change la perception, c'est votre réponse et ce que vous corrigez ensuite.",
  },
  {
    q: "Puis-je offrir un cadeau en échange d'un avis ?",
    a: "Non. Google interdit toute contrepartie pour un avis et peut retirer les avis concernés, voire sanctionner la fiche. La bonne méthode : demander un avis à tous vos clients après leur visite, sans rien offrir et sans trier les contents des mécontents.",
  },
  {
    q: "Faut-il vraiment répondre aux avis positifs ?",
    a: "Oui, un mot suffit. Une fiche où le gérant répond montre aux futurs clients qu'il y a quelqu'un derrière le comptoir. L'analyse regarde la part d'avis qui ont reçu une réponse sur les douze derniers mois.",
  },
  {
    q: "Boosteats peut-il répondre à mes avis à ma place ?",
    a: "Oui, avec les forfaits Croissance et Pro. On répond à vos avis Google, positifs comme négatifs, dans le ton de votre restaurant. Vous nous invitez comme gestionnaire de votre fiche : elle reste à vous.",
  },
  {
    q: "Ma note est de 4,6, j'ai besoin de l'analyse ?",
    a: "Une bonne note peut cacher un sujet qui monte depuis quelques mois. Le rapport compare les six derniers mois au reste, et montre l'évolution de votre note sur deux ans.",
  },
];

/* ---------- Cartes d'avis (maquettes) ---------- */

function Stars({ n, size = "w-3.5 h-3.5" }: { n: number; size?: string }) {
  return (
    <span className="flex gap-0.5" aria-label={`${n} étoiles sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= n ? "fill-[#FBBC04] text-[#FBBC04]" : "fill-[#E2E2DC] text-[#E2E2DC]"}`} aria-hidden />
      ))}
    </span>
  );
}

function ReviewCard({
  name,
  when,
  stars,
  text,
  reply,
  className = "",
}: {
  name: string;
  when: string;
  stars: number;
  text: string;
  reply?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.25)] ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-full bg-moss-tint text-moss-dark text-[13px] font-bold">{name[0]}</span>
        <div>
          <p className="text-[13px] font-bold text-ink leading-tight">{name}</p>
          <p className="text-[11px] text-ink-faint">{when}</p>
        </div>
      </div>
      <div className="mt-2">
        <Stars n={stars} />
      </div>
      <p className="font-landing text-[13px] leading-[1.55] text-ink mt-2">{text}</p>
      {reply && (
        <div className="mt-3 rounded-lg bg-paper-subtle p-2.5 border-l-[3px] border-moss">
          <p className="text-[11px] font-bold text-ink">Réponse du propriétaire</p>
          <p className="font-landing text-[12px] leading-[1.5] text-ink-muted mt-0.5">{reply}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Thèmes (barres) et note glissante (courbe) ---------- */

const THEMES_NEG = [
  { label: "Attente le vendredi soir", share: 31, trend: "monte" },
  { label: "Frites tièdes en livraison", share: 18, trend: "stable" },
  { label: "Accueil au téléphone", share: 9, trend: "baisse" },
];
const THEMES_POS = [
  { label: "Portions généreuses", share: 42 },
  { label: "Équipe souriante", share: 27 },
  { label: "Sauce maison", share: 21 },
];

function ThemeBar({ label, share, tone, note }: { label: string; share: number; tone: "neg" | "pos"; note?: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-[14px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">
          {share} %{note ? ` · ${note}` : ""}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-paper-subtle mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${tone === "neg" ? "bg-danger" : "bg-good"}`} style={{ width: `${Math.min(100, share * 2)}%` }} />
      </div>
    </div>
  );
}

const TREND = [4.6, 4.6, 4.5, 4.5, 4.5, 4.4, 4.4, 4.3, 4.3, 4.2, 4.2, 4.1];

function RatingTrend() {
  const w = 520;
  const h = 150;
  const min = 3.9;
  const max = 4.8;
  const x = (i: number) => 20 + (i * (w - 40)) / (TREND.length - 1);
  const y = (v: number) => 15 + ((max - v) * (h - 40)) / (max - min);
  const d = TREND.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Exemple : note moyenne glissante qui baisse de 4,6 à 4,1 en deux ans">
      {[4.0, 4.5].map((g) => (
        <g key={g}>
          <line x1="20" x2={w - 20} y1={y(g)} y2={y(g)} stroke="#E2E2DC" strokeDasharray="4 4" />
          <text x={w - 18} y={y(g) + 4} fontSize="11" fill="#6E6E68">
            {g.toFixed(1).replace(".", ",")}★
          </text>
        </g>
      ))}
      <path d={`${d} L${x(TREND.length - 1)},${h - 20} L${x(0)},${h - 20} Z`} fill="#B8443A" opacity="0.08" />
      <path d={d} fill="none" stroke="#B8443A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(TREND.length - 1)} cy={y(TREND[TREND.length - 1])} r="5" fill="#B8443A" />
      <text x="20" y={h - 4} fontSize="11" fill="#6E6E68">il y a 2 ans</text>
      <text x={w - 20} y={h - 4} fontSize="11" fill="#6E6E68" textAnchor="end">aujourd&apos;hui</text>
    </svg>
  );
}

export default function AnalyseAvisGooglePage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. En-tête sombre : la recherche à gauche, une pile d'avis à droite. */}
      <section className="bg-ink overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-16 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <Heading
              as="h1"
              onDark
              eyebrow="Analyse gratuite · Avis Google"
              title="Ce que vos avis Google disent vraiment de votre restaurant"
              intro="Un par un, vos avis se lisent comme des humeurs. Mis bout à bout, ils racontent ce que vos clients répètent : ce qu'ils adorent, et ce qui les fait partir. Votre note sur 100 en moins d'une minute, puis le détail sur WhatsApp."
            />
            <div className="mt-7 max-w-[560px]">
              <SearchCard location={WHERE} />
              <p className="text-[13px] text-night-faint mt-3">Gratuit, sans engagement · 19 communes de Bruxelles</p>
            </div>
          </div>
          <div className="relative h-[420px] hidden sm:block" aria-hidden>
            <ReviewCard
              className="absolute left-0 top-0 w-[290px] -rotate-3"
              name="Sarah"
              when="il y a 2 semaines"
              stars={2}
              text="Burger très bon mais 35 minutes d'attente un vendredi soir, sans un mot de l'équipe."
            />
            <ReviewCard
              className="absolute right-0 top-24 w-[300px] rotate-2"
              name="Karim"
              when="il y a 1 mois"
              stars={5}
              text="Les portions sont énormes et la sauce maison est une tuerie. On revient chaque semaine."
              reply="Merci Karim, à la semaine prochaine ! La sauce est faite chaque matin."
            />
            <ReviewCard
              className="absolute left-10 bottom-0 w-[280px] -rotate-1"
              name="Julie"
              when="il y a 3 jours"
              stars={3}
              text="Bon, mais encore une fois l'attente le vendredi. Dommage."
            />
          </div>
        </div>
      </section>

      {/* 2. Ce qu'on rate : rouge à gauche, vert à droite. */}
      <Section>
        <Heading
          eyebrow="Lire ses avis un par un"
          title="Ce qu'on rate en lisant ses avis un par un"
          intro="Au comptoir, on lit le dernier avis, on soupire ou on sourit, et on passe à autre chose. Les signaux utiles sont ailleurs : dans ce qui revient, et dans ce qui monte."
        />
        <div className="mt-10">
          <CompareColumns
            badTitle="Les mauvais signaux qui passent inaperçus"
            bad={[
              "Le même reproche revient tous les vendredis soir, écrit chaque fois avec d'autres mots.",
              "La note baisse de 0,1 tous les trois mois : invisible d'une semaine à l'autre, évident sur deux ans.",
              "Les avis à 1 ou 2 étoiles restent sans réponse, et ce sont ceux que les futurs clients lisent en premier.",
              "Un sujet nouveau apparaît depuis l'arrivée d'un nouveau plat ou d'un nouveau livreur.",
              "Les réponses arrivent trois semaines après l'avis, quand le client est déjà parti ailleurs.",
            ]}
            goodTitle="Les bons signaux à repérer et à garder"
            good={[
              "Le plat que vos clients citent sans qu'on leur demande : c'est lui qu'il faut montrer en photo et en pub.",
              "Le prénom d'un employé qui revient dans les avis : il fait revenir les gens, dites-le-lui.",
              "Les mots que vos clients utilisent (« généreux », « fait maison ») : ce sont les meilleurs pour votre fiche.",
              "Une part d'avis récents à 4 ou 5 étoiles qui monte : la correction faite a été remarquée.",
              "Des clients qui écrivent « on revient chaque semaine » : vos habitués existent, il reste à les inscrire.",
            ]}
          />
        </div>
      </Section>

      {/* 3. Les thèmes comptés, et la note sur deux ans. */}
      <Section tone="white">
        <Heading
          eyebrow="Dans le rapport complet"
          title="Ce qui revient, compté avis par avis"
          intro="Le rapport regroupe vos avis par sujet. Pour chacun : combien d'avis en parlent, si ça monte depuis six mois, et une phrase tirée telle quelle d'un vrai avis. Pour les sujets négatifs, comment les régler ; pour les positifs, comment en profiter."
        />
        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-paper-border bg-paper p-6">
            <p className="font-bold text-[16px] text-danger">À régler · part des avis à 1, 2 ou 3 étoiles</p>
            <div className="mt-5 space-y-4">
              {THEMES_NEG.map((t) => (
                <ThemeBar key={t.label} label={t.label} share={t.share} tone="neg" note={t.trend} />
              ))}
            </div>
            <p className="font-landing italic text-[14px] text-ink-muted mt-5 border-l-[3px] border-danger/40 pl-3">
              « 35 minutes d&apos;attente un vendredi soir, sans un mot de l&apos;équipe. »
            </p>
          </div>
          <div className="rounded-2xl border border-paper-border bg-paper p-6">
            <p className="font-bold text-[16px] text-good">À mettre en avant · part des avis à 4 ou 5 étoiles</p>
            <div className="mt-5 space-y-4">
              {THEMES_POS.map((t) => (
                <ThemeBar key={t.label} label={t.label} share={t.share} tone="pos" />
              ))}
            </div>
            <p className="font-landing italic text-[14px] text-ink-muted mt-5 border-l-[3px] border-good/40 pl-3">
              « Les portions sont énormes et la sauce maison est une tuerie. »
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-paper-border bg-paper p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold text-[16px] text-ink">Votre note moyenne sur deux ans</p>
            <p className="text-[13px] text-ink-faint">Note glissante sur 3 mois · exemple imaginaire</p>
          </div>
          <div className="mt-4">
            <RatingTrend />
          </div>
          <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-3">
            Vu d&apos;une semaine à l&apos;autre, rien ne bouge. Sur deux ans, la pente saute aux yeux, et elle coïncide souvent avec un thème qui monte.
          </p>
        </div>
      </Section>

      {/* 4. Répondre à un avis négatif : deux réponses comparées. */}
      <Section>
        <Heading
          eyebrow="Répondre"
          title="Une réponse se lit plus que l'avis lui-même"
          intro="Un futur client qui tombe sur un avis à 2 étoiles regarde surtout comment vous avez répondu. Voici deux réponses au même avis."
        />
        <div className="mt-10 grid lg:grid-cols-3 gap-5 items-start">
          <ReviewCard
            className="!shadow-none border border-paper-border"
            name="Sarah"
            when="il y a 2 semaines"
            stars={2}
            text="Burger très bon mais 35 minutes d'attente un vendredi soir, sans un mot de l'équipe."
          />
          <div className="rounded-2xl border border-danger/25 bg-white p-5">
            <p className="text-[13px] font-bold text-danger">À éviter</p>
            <p className="font-landing text-[15px] leading-[1.65] text-ink mt-2">
              « Le vendredi c&apos;est le rush, comme partout. Si vous voulez être servie vite, venez un autre jour. »
            </p>
            <p className="text-[13.5px] text-ink-muted mt-3">Défensive, elle donne raison à l&apos;avis aux yeux de tous ceux qui la lisent.</p>
          </div>
          <div className="rounded-2xl border border-good/25 bg-white p-5">
            <p className="text-[13px] font-bold text-good">À faire</p>
            <p className="font-landing text-[15px] leading-[1.65] text-ink mt-2">
              « Merci Sarah, et désolé pour l&apos;attente. Le vendredi soir, on ajoute désormais une personne en cuisine et on prévient au comptoir quand ça dépasse 15 minutes. Content que le burger vous ait plu, on espère vous revoir. »
            </p>
            <p className="text-[13.5px] text-ink-muted mt-3">Elle remercie, reconnaît, dit ce qui change, et invite à revenir. En quelques jours, pas en quelques semaines.</p>
          </div>
        </div>
        {/* Décision de Mehdi (2026-11-01) : la réponse aux avis est un service livré,
            réservé aux forfaits Croissance et Pro. */}
        <div className="mt-10 rounded-2xl border border-good/30 bg-white p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <span className="inline-block rounded-full bg-good/10 text-good text-[12.5px] font-bold px-3 py-1">Forfaits Croissance et Pro</span>
            <p className="font-display text-[22px] font-bold text-ink leading-tight mt-3">Pas le temps de répondre ? Boosteats répond à vos avis pour vous.</p>
            <p className="font-landing text-[15.5px] leading-[1.7] text-ink-muted mt-2">
              Avec les forfaits Croissance et Pro, on répond à vos avis Google, aux bons comme aux mauvais, dans le ton de votre restaurant et dans les jours qui suivent. Vous gardez la main sur votre fiche : vous nous invitez comme gestionnaire, jamais comme propriétaire.
            </p>
          </div>
          <WhatsAppLink location={`${WHERE}_reponses`} variant="solid" label="En parler sur WhatsApp" message="Bonjour, je voudrais que Boosteats réponde aux avis Google de mon restaurant." />
        </div>
        <div className="mt-10 rounded-2xl bg-ink p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="font-display text-[22px] font-bold text-white leading-tight">Combien de vos avis attendent une réponse ?</p>
            <p className="font-landing text-[15.5px] text-night-text mt-2">L&apos;analyse regarde la part d&apos;avis avec réponse sur douze mois, et votre délai moyen.</p>
          </div>
          <div className="w-full md:w-[440px]">
            <SearchCard location={`${WHERE}_milieu`} />
          </div>
        </div>
      </Section>

      {/* 5. Les avis ne s'achètent pas. */}
      <Section tone="tint" width="max-w-[900px]">
        <div className="flex gap-4 items-start">
          <span className="grid place-items-center w-12 h-12 rounded-xl bg-white text-danger shrink-0">
            <Ban className="w-6 h-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-[26px] sm:text-[30px] font-bold text-ink leading-tight">Plus d&apos;avis, oui. Des avis achetés, jamais.</h2>
            <div className="mt-4 space-y-4 font-landing text-[16.5px] leading-[1.75] text-ink/90">
              <p>
                Offrir un dessert, des points ou une réduction contre un avis est interdit par Google. Les avis concernés peuvent être retirés d&apos;un coup, et la fiche peut être sanctionnée. Trier les clients pour n&apos;envoyer la demande qu&apos;aux contents est interdit aussi.
              </p>
              <p>
                Ce qui marche, et qui est permis : demander un avis à tous vos clients après leur visite, simplement, sans contrepartie. Plus vos habitués laissent un mot, plus les avis récents reflètent votre restaurant d&apos;aujourd&apos;hui, et moins un mauvais soir pèse dans la note.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Le nombre d'avis face aux voisins. */}
      <Section width="max-w-[900px]">
        <Heading eyebrow="Face aux voisins" title="Le nombre d'avis compte autant que la note" />
        <div className="mt-6 space-y-5 font-landing text-[16.5px] leading-[1.8] text-ink/90">
          <p>
            Entre un 4,7 sur 40 avis et un 4,5 sur 600 avis, beaucoup de clients choisissent le second : il rassure. C&apos;est pour ça que l&apos;analyse ne regarde pas votre nombre d&apos;avis seul, mais face aux restaurants autour de vous.
          </p>
          <p>
            Si vos voisins ont deux fois plus d&apos;avis, ce n&apos;est pas une fatalité. C&apos;est souvent la preuve que vous ne demandez pas assez, alors que vos clients sont prêts à écrire.
          </p>
        </div>
        <div className="mt-8">
          <WhatsAppLink location={WHERE} label="En parler sur WhatsApp" message="Bonjour, j'aimerais parler des avis Google de mon restaurant." />
        </div>
      </Section>

      <Section tone="white" width="max-w-[900px]">
        <Heading eyebrow="Vos questions" title="Sur vos avis et l'analyse" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <AnalysisCta
        location={WHERE}
        title="Ce que vos clients répètent, en une minute"
        body="Tapez le nom de votre restaurant : la note sur 100 tout de suite, puis les thèmes de vos avis et vos cinq priorités sur WhatsApp."
        whatsappMessage="Bonjour, j'aimerais qu'on regarde ensemble les avis Google de mon restaurant."
      />
      <RelatedPages slugs={["analyse-fiche-google-restaurant", "visibilite-restaurant", "fiche-google-restaurant"]} />
    </MarketingShell>
  );
}
