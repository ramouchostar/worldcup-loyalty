import { MapPin, Navigation, Star, Store } from "lucide-react";
import {
  AnalysisCta,
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

// Page d'entrée vers l'analyse gratuite, angle « visibilité sur Google Maps »
// (ADR 0069 / 0071). Ce que l'analyse mesure vraiment : dans l'aperçu, la place
// face aux voisins proches (volet « voisins », 20 points, lib/audit/quick-score.ts) ;
// dans le rapport complet, le rang du restaurant dans Google Maps depuis
// 9 points autour de lui (grille 3 × 3, pas de 700 m, lib/audit/competitors.ts),
// jusqu'à 8 concurrents à moins de 2 km et celui qui passe devant le plus
// souvent (lib/audit/neighbors-map.ts), et le site sur téléphone (volet « site » de lib/audit/measure.ts).
// Carte, rangs et voisins ci-dessous : exemple IMAGINAIRE.

const SLUG = "visibilite-restaurant";
const WHERE = `page_${SLUG}`;

export const metadata = marketingMetadata(SLUG);

const FAQ: Faq[] = [
  {
    q: "Pourquoi ma place change-t-elle selon l'endroit d'où l'on cherche ?",
    a: "Google Maps montre d'abord ce qui est proche de la personne qui cherche. Trois rues plus loin, ce n'est plus la même liste : un voisin plus proche ou mieux noté peut passer devant vous.",
  },
  {
    q: "Comment l'analyse mesure-t-elle ma place ?",
    a: "Le rapport complet relève votre rang sur Google Maps depuis neuf points autour du restaurant, espacés d'environ 700 mètres, comme si neuf clients cherchaient à manger au même moment, chacun à un coin du quartier.",
  },
  {
    q: "Qui sont les « voisins » dans l'analyse ?",
    a: "Les restaurants proches qui répondent à la même envie que vous. L'aperçu regarde les plus proches ; le rapport complet en retient jusqu'à huit à moins de deux kilomètres, avec leur note, leur nombre d'avis et leurs photos.",
  },
  {
    q: "Peut-on payer Google pour monter sur Maps ?",
    a: "Non, le classement normal de Google Maps ne s'achète pas. Les emplacements « sponsorisés » existent, mais ils sont marqués comme tels. Votre place dépend de votre fiche, de vos avis et de la distance.",
  },
  {
    q: "Combien de temps faut-il pour gagner des places ?",
    a: "Il n'y a pas de délai garanti, et personne ne peut vous en promettre un. Une fiche complétée et des avis plus nombreux se voient en général au fil des semaines. On mesure avant et après, avec la même grille.",
  },
  {
    q: "L'analyse couvre-t-elle tout Bruxelles ?",
    a: "Oui, les 19 communes de la Région de Bruxelles-Capitale. Ailleurs, laissez votre numéro : l'équipe vous écrit dès que votre commune est couverte.",
  },
];

/* ---------- La carte en grille (SVG) ---------- */

// Rang du restaurant depuis chacun des 9 points (row, col de -1 à 1). Exemple.
const GRID: { row: number; col: number; rank: number | null }[] = [
  { row: -1, col: -1, rank: 7 },
  { row: -1, col: 0, rank: 3 },
  { row: -1, col: 1, rank: 12 },
  { row: 0, col: -1, rank: 2 },
  { row: 0, col: 0, rank: 1 },
  { row: 0, col: 1, rank: 5 },
  { row: 1, col: -1, rank: 9 },
  { row: 1, col: 0, rank: 4 },
  { row: 1, col: 1, rank: null },
];

const rankColor = (r: number | null) => (r == null ? "#B8443A" : r <= 3 ? "#467F3B" : r <= 10 ? "#9E6612" : "#B8443A");

function GridMap() {
  const W = 640;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2;
  const step = 150;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-3xl" role="img" aria-label="Exemple : rang du restaurant dans Google Maps depuis neuf points autour de lui">
      <rect width={W} height={H} fill="#EEF0E8" />
      {/* Îlots et rues stylisés. */}
      {Array.from({ length: 6 }).map((_, i) => (
        <g key={`b${i}`}>
          <rect x={20 + i * 105} y={18} width={88} height={92} rx={10} fill="#E3E6DA" />
          <rect x={20 + i * 105} y={128} width={88} height={78} rx={10} fill="#E3E6DA" />
          <rect x={20 + i * 105} y={232} width={88} height={80} rx={10} fill="#E3E6DA" />
          <rect x={20 + i * 105} y={330} width={88} height={92} rx={10} fill="#E3E6DA" />
        </g>
      ))}
      <path d={`M0,${cy + 6} C160,${cy - 40} 420,${cy + 60} ${W},${cy - 10}`} stroke="#FFFFFF" strokeWidth="16" fill="none" />
      <path d={`M${cx - 30},0 C${cx + 10},140 ${cx - 50},300 ${cx + 20},${H}`} stroke="#FFFFFF" strokeWidth="12" fill="none" />
      <rect x={470} y={40} width={120} height={70} rx={14} fill="#D7E7C3" />
      <text x={530} y={80} textAnchor="middle" fontSize="12" fill="#467F3B">Parc</text>
      {/* Les 9 points. */}
      {GRID.map((g) => {
        const x = cx + g.col * step * 1.25;
        const y = cy + g.row * step;
        const center = g.row === 0 && g.col === 0;
        return (
          <g key={`${g.row}${g.col}`}>
            {center && <circle cx={x} cy={y} r={46} fill="#A2C523" opacity="0.18" />}
            <circle cx={x} cy={y} r={center ? 28 : 24} fill={rankColor(g.rank)} stroke="#FFFFFF" strokeWidth="4" />
            <text x={x} y={y + 6} textAnchor="middle" fontSize={center ? 18 : 16} fontWeight="700" fill="#FFFFFF">
              {g.rank == null ? "20+" : g.rank}
            </text>
            {center && (
              <text x={x} y={y + 52} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0A0A0A">
                Votre restaurant
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const NEIGHBORS = [
  { name: "Burger Atelier", dist: "250 m", rating: "4,6", reviews: 812, photos: 340, ahead: 5 },
  { name: "Smashly Ixelles (vous)", dist: "—", rating: "4,4", reviews: 286, photos: 41, ahead: null },
  { name: "Le Comptoir du Smash", dist: "450 m", rating: "4,5", reviews: 390, photos: 120, ahead: 3 },
  { name: "Grill Flagey", dist: "1,1 km", rating: "4,2", reviews: 154, photos: 66, ahead: 1 },
];

export default function VisibiliteRestaurantPage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. En-tête centré, la recherche, puis la carte en grand. */}
      <section className="bg-moss-tint">
        <div className="max-w-[920px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-10 text-center">
          <Heading
            as="h1"
            center
            eyebrow="Test gratuit · Google Maps"
            title="Votre restaurant est-il visible dans votre quartier ?"
            intro="Quand quelqu'un cherche à manger près de chez vous, Google Maps lui montre trois ou quatre adresses. Êtes-vous dedans ? Ça dépend de la rue d'où il cherche. Tapez le nom de votre restaurant : votre note sur 100 en moins d'une minute."
          />
          <div className="mt-7 max-w-[600px] mx-auto">
            <SearchCard location={WHERE} />
            <p className="text-[13px] text-ink-faint mt-3">Gratuit, sans engagement · 19 communes de Bruxelles</p>
          </div>
        </div>
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 pb-16">
          <div className="rounded-3xl bg-white p-3 sm:p-4 shadow-[0_24px_60px_rgba(10,10,10,0.12)]">
            <GridMap />
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 py-3 text-[13px] text-ink">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-good" />Dans les 3 premiers</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-warn" />De la 4e à la 10e place</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-danger" />Au-delà : presque invisible</span>
            </div>
            <p className="text-center text-[12px] text-ink-faint pb-1">Exemple imaginaire : votre rang dans Google Maps depuis neuf points autour du restaurant.</p>
          </div>
        </div>
      </section>

      {/* 2. Ce que vous ne voyez pas de votre comptoir : trois explications. */}
      <Section>
        <Heading
          eyebrow="Vu de votre comptoir"
          title="Ce que vous ne voyez pas de votre comptoir"
          intro="Quand vous cherchez votre restaurant sur votre téléphone, vous le trouvez : vous êtes juste à côté, et Google sait que vous le cherchez. Vos clients, eux, cherchent « burger » ou « pizza » depuis leur bureau, leur école ou leur canapé."
        />
        <div className="mt-12 space-y-6">
          {[
            {
              n: "1",
              title: "Votre place change d'une rue à l'autre",
              body: "Sur l'exemple ci-dessus, le restaurant est premier devant sa porte, troisième au nord, douzième à l'est, et absent des vingt premiers au sud-est. Un client à 700 mètres ne le voit tout simplement pas. Une seule recherche ne dit rien : il faut regarder plusieurs points autour de vous, c'est ce que fait l'analyse.",
            },
            {
              n: "2",
              title: "Un voisin récent peut passer devant vous",
              body: "Une adresse ouverte il y a six mois, avec une fiche complète, beaucoup de photos et des avis réguliers, peut vous devancer dans une partie du quartier. Le rapport complet nomme le concurrent qui passe devant vous le plus souvent, et montre ce que sa fiche a de plus que la vôtre.",
            },
            {
              n: "3",
              title: "Vos clients vous comparent sans que vous le sachiez",
              body: "Sous votre fiche, Google propose d'autres restaurants, avec leur note et leurs photos. Le client compare en quelques secondes. L'analyse relève ces fiches voisines pour que vous sachiez à qui vous êtes comparé, et sur quoi.",
            },
          ].map((s) => (
            <div key={s.n} className="grid md:grid-cols-[90px_1fr] gap-4 md:gap-8 rounded-2xl bg-white border border-paper-border p-6 sm:p-8">
              <span className="font-display text-[56px] leading-none font-bold text-moss-dark/80">{s.n}</span>
              <div>
                <h3 className="font-display text-[22px] font-bold text-ink">{s.title}</h3>
                <p className="font-landing text-[16px] leading-[1.75] text-ink-muted mt-2">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Les voisins : tableau maquette. */}
      <Section tone="white">
        <Heading
          eyebrow="Dans le rapport complet"
          title="Vous et vos voisins, côte à côte"
          intro="Jusqu'à huit restaurants à moins de deux kilomètres, comparés sur ce que le client voit : la note, le nombre d'avis, les photos. Et combien de fois chacun passe devant vous sur les neuf points."
        />
        <div className="mt-10 overflow-x-auto rounded-2xl border border-paper-border">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-paper-subtle text-[13px] text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-bold">Restaurant</th>
                <th className="px-5 py-3 font-bold">Distance</th>
                <th className="px-5 py-3 font-bold">Note</th>
                <th className="px-5 py-3 font-bold">Avis</th>
                <th className="px-5 py-3 font-bold">Photos</th>
                <th className="px-5 py-3 font-bold">Passe devant vous</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border text-[15px] text-ink">
              {NEIGHBORS.map((n) => {
                const you = n.ahead === null;
                return (
                  <tr key={n.name} className={you ? "bg-moss-tint font-semibold" : "bg-white"}>
                    <td className="px-5 py-3.5">{n.name}</td>
                    <td className="px-5 py-3.5 tabular-nums">{n.dist}</td>
                    <td className="px-5 py-3.5 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {n.rating}
                        <Star className="w-3.5 h-3.5 fill-[#FBBC04] text-[#FBBC04]" aria-hidden />
                      </span>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">{n.reviews}</td>
                    <td className="px-5 py-3.5 tabular-nums">{n.photos}</td>
                    <td className="px-5 py-3.5">
                      {you ? "—" : (
                        <span className={`text-[13px] font-bold rounded-full px-2.5 py-1 ${n.ahead! >= 4 ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"}`}>
                          {n.ahead} points sur 9
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-ink-faint mt-3">Restaurants imaginaires, chiffres d&apos;illustration.</p>
        <p className="font-landing text-[16px] leading-[1.75] text-ink-muted mt-6 max-w-[760px]">
          Ici, le voisin qui passe le plus souvent devant a trois fois plus d&apos;avis et huit fois plus de photos. Il n&apos;est pas meilleur en cuisine : sa fiche raconte simplement plus de choses au client qui hésite.
        </p>
      </Section>

      {/* 4. Ce qui aide à monter, formulé prudemment. */}
      <Section>
        <Heading
          eyebrow="Ce qui joue"
          title="Ce qui aide un restaurant à monter sur Maps"
          intro="Google ne publie pas sa recette en détail. Il dit lui-même regarder trois choses. Sur une, vous ne pouvez rien ; sur les deux autres, vous pouvez beaucoup."
        />
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Navigation,
              title: "La distance",
              body: "Plus le client est proche, plus vous avez de chances d'apparaître. Vous ne déménagerez pas : c'est pour ça qu'on mesure votre place sur plusieurs points, pas un seul.",
              tag: "Vous n'y pouvez rien",
            },
            {
              icon: Store,
              title: "La correspondance avec la recherche",
              body: "Google doit comprendre ce que vous servez : une catégorie précise, des catégories secondaires, une description, des attributs (à emporter, terrasse…), un lien vers la carte.",
              tag: "Dans vos mains",
            },
            {
              icon: Star,
              title: "La notoriété",
              body: "Le nombre d'avis et leur note, les photos, les réponses du gérant, la présence d'un site qui fonctionne bien sur téléphone. Une fiche vivante pèse plus qu'une fiche figée.",
              tag: "Dans vos mains",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl bg-white border border-paper-border p-6 flex flex-col">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-moss-tint text-moss-dark">
                <c.icon className="w-5 h-5" aria-hidden />
              </span>
              <h3 className="font-display text-[20px] font-bold text-ink mt-4">{c.title}</h3>
              <p className="font-landing text-[15.5px] leading-[1.7] text-ink-muted mt-2 flex-1">{c.body}</p>
              <span className={`self-start mt-4 text-[12px] font-bold rounded-full px-3 py-1 ${c.tag === "Dans vos mains" ? "bg-good/10 text-good" : "bg-paper-subtle text-ink-faint"}`}>{c.tag}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl bg-ink p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="font-display text-[22px] font-bold text-white leading-tight">Où êtes-vous visible, et où ne l&apos;êtes-vous pas ?</p>
            <p className="font-landing text-[15.5px] text-night-text mt-2">La note sur 100 tout de suite, la carte de votre quartier dans le rapport complet.</p>
          </div>
          <div className="w-full md:w-[440px]">
            <SearchCard location={`${WHERE}_milieu`} />
          </div>
        </div>
      </Section>

      {/* 5. En dehors de Maps : le site sur téléphone. */}
      <Section tone="white" width="max-w-[900px]">
        <div className="flex gap-4 items-start">
          <span className="grid place-items-center w-12 h-12 rounded-xl bg-moss-tint text-moss-dark shrink-0">
            <MapPin className="w-6 h-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-[26px] sm:text-[30px] font-bold text-ink leading-tight">Et en dehors de Google Maps ?</h2>
            <div className="mt-4 space-y-4 font-landing text-[16.5px] leading-[1.75] text-ink/90">
              <p>
                Beaucoup de clients cliquent ensuite sur « Site web » pour voir la carte. L&apos;analyse vérifie que votre site s&apos;affiche bien sur un téléphone, à quelle vitesse il s&apos;ouvre, et que l&apos;adresse et le téléphone sont les mêmes que sur votre fiche.
              </p>
              <p>
                Le rapport complet dit aussi ce que Google montre de vous dans les résultats classiques, quand on cherche votre nom, et si les plateformes de livraison y passent devant votre propre site.
              </p>
            </div>
            <div className="mt-6">
              <WhatsAppLink location={WHERE} label="En parler sur WhatsApp" message="Bonjour, j'aimerais savoir où mon restaurant est visible sur Google Maps." />
            </div>
          </div>
        </div>
      </Section>

      <Section width="max-w-[900px]">
        <Heading eyebrow="Vos questions" title="Sur votre place dans Google Maps" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <AnalysisCta
        location={WHERE}
        title="Voyez votre quartier comme vos clients le voient"
        body="Tapez le nom de votre restaurant. La note sur 100 en moins d'une minute, puis votre place sur neuf points et vos voisins dans le rapport complet, sur WhatsApp."
        whatsappMessage="Bonjour, j'aimerais savoir où mon restaurant est visible sur Google Maps."
      />
      <RelatedPages slugs={["analyse-fiche-google-restaurant", "analyse-avis-google-restaurant", "publicite-restaurant"]} />
    </MarketingShell>
  );
}
