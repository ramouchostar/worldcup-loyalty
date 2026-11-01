import { Clock3, MessageCircle, Search, Sparkles } from "lucide-react";
import {
  AnalysisCta,
  CompareColumns,
  FaqList,
  Heading,
  LaptopFrame,
  MarketingShell,
  RelatedPages,
  SearchCard,
  Section,
  WhatsAppLink,
  type Faq,
} from "@/components/marketing/kit";
import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";
import { marketingMetadata } from "@/lib/marketing-pages";

// Page d'entrée vers l'analyse gratuite, angle « fiche Google » (ADR 0069 / 0071).
// Ne promet que ce que l'analyse mesure : la grille de lib/audit/fiche-score.ts
// (7 blocs, 100 points, critère non vérifié = hors note) et les 4 volets du
// score rapide (lib/audit/quick-score.ts : fiche 30, avis 30, voisins 20, site 20).
// Exemple de rapport : établissement IMAGINAIRE, chiffres d'illustration.

const SLUG = "analyse-fiche-google-restaurant";
const WHERE = `page_${SLUG}`;

export const metadata = marketingMetadata(SLUG);

const FAQ: Faq[] = [
  {
    q: "L'analyse est-elle vraiment gratuite ?",
    a: "Oui. Vous tapez le nom de votre restaurant, la note sur 100 s'affiche en moins d'une minute. Le rapport complet arrive ensuite sur WhatsApp, lui aussi gratuit, sans carte bancaire ni engagement.",
  },
  {
    q: "Faut-il me donner l'accès à ma fiche Google ?",
    a: "Non. L'analyse lit ce que tout client voit déjà sur Google : votre fiche, vos avis, vos voisins et votre site. Vous ne nous donnez aucun mot de passe.",
  },
  {
    q: "Pourquoi certains points sont-ils marqués « non vérifié » ?",
    a: "Certains détails ne se lisent pas depuis l'extérieur, comme les horaires de fête ou la date de vos dernières photos. Un point qu'on n'a pas pu vérifier sort du calcul : il ne fait jamais baisser votre note.",
  },
  {
    q: "Mon restaurant n'est pas à Bruxelles, ça marche ?",
    a: "Pour l'instant, l'analyse couvre les 19 communes de Bruxelles. Ailleurs, laissez votre numéro : l'équipe vous écrit dès que votre commune est couverte.",
  },
  {
    q: "Qui lit mon rapport avant de me l'envoyer ?",
    a: "Le rapport complet est relu par l'équipe Boosteats avant de partir sur WhatsApp. Les cinq priorités sont classées par effet attendu, avec ce qu'il faut faire pour chacune.",
  },
  {
    q: "Je corrige ma fiche moi-même ou vous le faites ?",
    a: "Les deux sont possibles. La plupart des corrections prennent quelques minutes depuis votre téléphone, et le rapport dit comment. Si vous préférez qu'on s'en occupe, la fiche tenue à jour fait partie du plan Pro.",
  },
];

/* ---------- Maquette du rapport (ordinateur) ---------- */

type Status = "ok" | "partiel" | "manquant" | "non_verifie";
const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-good/10 text-good" },
  partiel: { label: "À compléter", cls: "bg-warn/10 text-warn" },
  manquant: { label: "Manquant", cls: "bg-danger/10 text-danger" },
  non_verifie: { label: "Non vérifié", cls: "bg-paper-subtle text-ink-faint" },
};

const REPORT_ROWS: { label: string; points: number; status: Status }[] = [
  { label: "Catégorie principale précise", points: 5, status: "partiel" },
  { label: "Horaires réguliers", points: 8, status: "ok" },
  { label: "Nombre de photos", points: 8, status: "manquant" },
  { label: "Site web relié", points: 5, status: "partiel" },
  { label: "Carte / menu", points: 3, status: "manquant" },
  { label: "Réponses du propriétaire", points: 5, status: "manquant" },
  { label: "Horaires exceptionnels", points: 4, status: "non_verifie" },
];

function ScoreRing({ value, size = 112 }: { value: number; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Note ${value} sur 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#EFF6D8" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#83A115"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="49" textAnchor="middle" className="font-display" fontSize="26" fontWeight="700" fill="#0A0A0A">
        {value}
      </text>
      <text x="50" y="64" textAnchor="middle" fontSize="9" fill="#6E6E68">
        sur 100
      </text>
    </svg>
  );
}

function ReportMockup() {
  const volets = [
    { label: "Fiche Google", value: 58, weight: 30 },
    { label: "Avis", value: 74, weight: 30 },
    { label: "Face aux voisins", value: 49, weight: 20 },
    { label: "Site et mobile", value: 66, weight: 20 },
  ];
  return (
    <LaptopFrame url="boosteats.be/audit-gratuit">
      <div className="grid sm:grid-cols-[200px_1fr] gap-0 text-ink">
        <div className="bg-moss-tint p-5 flex flex-col items-center text-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-moss-dark">Exemple · Smashly Ixelles</p>
          <ScoreRing value={62} />
          <p className="text-[12px] text-ink-muted leading-snug">Note sur 100, calculée sur les points vérifiés</p>
          <div className="w-full mt-2 space-y-2">
            {volets.map((v) => (
              <div key={v.label} className="text-left">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold">{v.label}</span>
                  <span className="tabular-nums text-ink-muted">{v.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-moss-dark" style={{ width: `${v.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5">
          <p className="font-display font-bold text-[15px]">Votre fiche Google, point par point</p>
          <ul className="mt-3 divide-y divide-paper-border">
            {REPORT_ROWS.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[12.5px]">{r.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-ink-faint tabular-nums">{r.points} pts</span>
                  <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status].cls}`}>{STATUS_STYLE[r.status].label}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-faint mt-3">Établissement imaginaire, chiffres d&apos;illustration.</p>
        </div>
      </div>
    </LaptopFrame>
  );
}

/* ---------- Maquette du message WhatsApp (téléphone) ---------- */

const PRIORITIES = [
  "Ajouter 20 photos récentes : salle, comptoir, vos trois plats phares.",
  "Répondre aux 9 avis restés sans réponse depuis l'été.",
  "Relier votre carte à la fiche (lien « Menu »).",
  "Préciser la catégorie : « Restaurant de hamburgers » plutôt que « Restaurant ».",
  "Remplacer le lien Facebook par votre propre site, ou une page de commande.",
];

function WhatsAppMockup() {
  return (
    <PhoneFrame className="w-[280px] sm:w-[300px]" screenClassName="h-[560px]" statusTone="light">
      <div className="h-full flex flex-col bg-[#ECE5DD]">
        <div className="bg-[#075E54] text-white px-4 pt-11 pb-3 flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-white/20 text-[12px] font-bold">B</span>
          <div>
            <p className="text-[13px] font-bold leading-tight">Boosteats</p>
            <p className="text-[10px] text-white/75">en ligne</p>
          </div>
        </div>
        <div className="flex-1 px-3 py-3 space-y-2 overflow-hidden">
          <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm">
            <p className="text-[11.5px] leading-snug text-ink">
              Bonjour ! Voici le rapport complet de votre restaurant : <strong>62/100</strong>. Vos cinq priorités, de la plus utile à la moins urgente :
            </p>
          </div>
          <div className="max-w-[92%] rounded-lg bg-white px-3 py-2 shadow-sm">
            <ol className="space-y-1.5">
              {PRIORITIES.map((p, i) => (
                <li key={p} className="flex gap-1.5 text-[11px] leading-snug text-ink">
                  <span className="font-bold text-[#075E54]">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <p className="text-[9px] text-ink-faint text-right mt-1">14:32 ✓✓</p>
          </div>
          <div className="max-w-[70%] ml-auto rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 shadow-sm">
            <p className="text-[11.5px] text-ink">Merci, je commence par les photos ce soir.</p>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ---------- Grille complète ---------- */

const BLOCKS: { name: string; points: number; checks: string[] }[] = [
  { name: "Identité", points: 15, checks: ["Un nom sans mots ajoutés (« meilleur », « livraison », « halal »…)", "Une catégorie principale précise", "Au moins deux catégories secondaires"] },
  { name: "Coordonnées", points: 15, checks: ["Un téléphone qui répond", "Votre propre site plutôt qu'une page Facebook", "Une adresse complète, code postal compris"] },
  { name: "Horaires", points: 15, checks: ["Des horaires réguliers renseignés", "Les horaires de fête et de vacances", "Les horaires de livraison et d'emporter"] },
  { name: "Photos", points: 15, checks: ["Au moins 50 photos, 15 au strict minimum", "Une photo récente de la façade ou de la salle", "Une fiche revendiquée, avec vos propres photos"] },
  { name: "Attributs", points: 10, checks: ["Une douzaine d'attributs (terrasse, à emporter, paiement par carte…)", "Une description rédigée de plus de quelques mots"] },
  { name: "Liens", points: 10, checks: ["Un lien vers votre carte", "Un lien « Commander »", "Un lien de réservation si vous en prenez"] },
  { name: "Avis", points: 20, checks: ["Une note moyenne de 4,5 ou plus", "Autant d'avis que vos voisins, ou plus", "Des réponses à la plupart des avis de l'année", "Une réponse en moins de trois jours"] },
];

export default function AnalyseFicheGooglePage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. En-tête : la question, la recherche, puis le rapport à droite. */}
      <section className="bg-white border-b border-paper-border overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-14 grid lg:grid-cols-[1fr_1.15fr] gap-12 items-center">
          <div>
            <Heading
              as="h1"
              eyebrow="Analyse gratuite · Fiche Google"
              title="Votre fiche Google donne-t-elle envie d'entrer ?"
              intro="Avant de pousser votre porte, vos clients regardent votre fiche : les photos, les horaires, la note, les réponses. Tapez le nom de votre restaurant : votre note sur 100 s'affiche en moins d'une minute."
            />
            <div className="mt-7 max-w-[560px]">
              <SearchCard location={WHERE} />
              <p className="text-[13px] text-ink-faint mt-3">Gratuit, sans engagement · 19 communes de Bruxelles</p>
            </div>
          </div>
          <ReportMockup />
        </div>
      </section>

      {/* 2. Ce que vous avez à faire / ce que vous recevez — trois temps. */}
      <Section>
        <Heading
          eyebrow="Comment ça se passe"
          title="Trente secondes de votre côté, un rapport complet du nôtre"
          intro="Vous n'avez rien à installer et rien à nous donner. L'analyse lit ce qu'un client voit déjà sur Google."
        />
        <div className="mt-12 grid lg:grid-cols-[1fr_auto] gap-12 items-center">
          <ol className="space-y-5">
            {[
              {
                icon: Search,
                when: "Vous · 30 secondes",
                title: "Vous tapez le nom de votre restaurant",
                body: "Vous le choisissez dans la liste, comme sur Google Maps. Rien d'autre à remplir à ce stade.",
              },
              {
                icon: Clock3,
                when: "Tout de suite · moins d'une minute",
                title: "Votre note sur 100 s'affiche",
                body: "Elle réunit quatre volets : votre fiche Google (30 points), vos avis (30), votre place face aux voisins proches (20) et votre site sur téléphone (20). Un volet qu'on ne peut pas lire sort du calcul, il ne vous pénalise jamais.",
              },
              {
                icon: MessageCircle,
                when: "Ensuite · sur WhatsApp",
                title: "Vous laissez votre numéro, le rapport complet arrive",
                body: "Le détail de chaque point, critère par critère, et vos cinq priorités classées par effet attendu, avec quoi faire pour chacune. Le rapport est relu par l'équipe avant de partir.",
              },
              {
                icon: Sparkles,
                when: "Quand vous voulez",
                title: "Vous corrigez, ou on en parle",
                body: "La plupart des corrections se font en quelques minutes depuis votre téléphone. Une question sur une priorité ? Vous répondez simplement au message.",
              },
            ].map((s) => (
              <li key={s.title} className="flex gap-4 rounded-2xl bg-white border border-paper-border p-5">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-moss-tint text-moss-dark shrink-0">
                  <s.icon className="w-5 h-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-faint">{s.when}</p>
                  <h3 className="font-bold text-[17.5px] text-ink mt-1">{s.title}</h3>
                  <p className="font-landing text-[15.5px] leading-[1.65] text-ink-muted mt-1.5">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex justify-center">
            <WhatsAppMockup />
          </div>
        </div>
      </Section>

      {/* 3. Fiche qui fait fuir / fiche qui fait entrer. */}
      <Section tone="white">
        <Heading
          eyebrow="Critère par critère"
          title="La fiche qui fait fuir, la fiche qui fait entrer"
          intro="Sur Google Maps, votre fiche est posée à côté de celle de vos voisins. Le client compare en quelques secondes, souvent sans s'en rendre compte. Voici ce qu'il voit d'un côté et de l'autre."
        />
        <div className="mt-10">
          <CompareColumns
            badTitle="Ce qui fait passer le client à la fiche suivante"
            bad={[
              "Une catégorie « Restaurant » tout court : Google ne sait pas quand vous montrer.",
              "Huit photos, dont la moitié floues ou prises par des clients le soir.",
              "Pas d'horaires pour le jour férié : le client ne prend pas le risque de trouver porte close.",
              "Le lien « site » renvoie vers une page Facebook pas mise à jour.",
              "Aucun lien vers la carte : le client ne sait pas ce qu'il va manger ni à quel prix.",
              "Des avis à 2 étoiles sans réponse depuis des mois, en haut de la liste.",
              "Un nom de fiche rallongé de mots comme « meilleur burger Bruxelles livraison ».",
            ]}
            goodTitle="Ce qui donne envie de pousser la porte"
            good={[
              "Une catégorie précise (« Restaurant de hamburgers ») et deux ou trois catégories secondaires.",
              "Plus de 50 photos, dont des récentes : la façade, la salle, vos plats phares.",
              "Des horaires réguliers et ceux des fêtes, à jour avant chaque congé.",
              "Votre propre site, ou une page où l'on peut commander.",
              "Un lien « Menu » et un lien « Commander » visibles dès la fiche.",
              "Une réponse polie à chaque avis, même aux mauvais, en quelques jours.",
              "Le vrai nom du restaurant, rien de plus.",
            ]}
          />
        </div>
        <div className="mt-10 rounded-2xl bg-moss-tint p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="font-display text-[22px] font-bold text-ink leading-tight">De quel côté est votre fiche ?</p>
            <p className="font-landing text-[15.5px] text-ink-muted mt-2">L&apos;analyse vous le dit en moins d&apos;une minute, point par point.</p>
          </div>
          <div className="w-full md:w-[440px]">
            <SearchCard location={`${WHERE}_milieu`} />
          </div>
        </div>
      </Section>

      {/* 4. La grille complète : les 7 blocs et leurs points. */}
      <Section>
        <Heading
          eyebrow="La liste de contrôle complète"
          title="Les 7 blocs de votre fiche, notés sur 100"
          intro="Voici exactement ce que regarde l'analyse. Gardez cette liste sous la main : chaque point est une correction que vous pouvez faire vous-même."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BLOCKS.map((b) => (
            <div key={b.name} className="rounded-2xl bg-white border border-paper-border p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display font-bold text-[19px] text-ink">{b.name}</h3>
                <span className="text-[13px] font-bold text-moss-dark tabular-nums">{b.points} pts</span>
              </div>
              <ul className="mt-3 space-y-2">
                {b.checks.map((c) => (
                  <li key={c} className="flex gap-2 font-landing text-[14.5px] leading-[1.55] text-ink">
                    <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full bg-moss-dark shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl bg-ink p-5 flex flex-col justify-between">
            <p className="font-landing text-[15px] leading-[1.6] text-night-text">
              Un point qu&apos;on ne peut pas lire depuis l&apos;extérieur, comme les horaires de fête, est marqué « non vérifié » et sort du calcul. Votre note porte uniquement sur ce qui a été vérifié.
            </p>
            <div className="mt-4">
              <WhatsAppLink location={WHERE} variant="onDark" label="Une question ? WhatsApp" />
            </div>
          </div>
        </div>
      </Section>

      {/* 5. Pourquoi ça compte. */}
      <Section tone="white" width="max-w-[900px]">
        <Heading eyebrow="Pourquoi ça compte" title="Votre fiche travaille même quand vous êtes fermé" />
        <div className="mt-6 space-y-5 font-landing text-[16.5px] leading-[1.8] text-ink/90">
          <p>
            Un client qui cherche « burger » ou « pizza » autour de lui ne tombe pas sur votre site : il tombe sur Google Maps, avec trois ou quatre fiches côte à côte. Il choisit en regardant les photos, la note et les horaires, souvent en moins de dix secondes.
          </p>
          <p>
            Une fiche incomplète ne fait pas de bruit. Personne ne vient vous dire qu&apos;il est parti chez le voisin parce que vos horaires du dimanche manquaient. C&apos;est pour ça qu&apos;on la regarde point par point, avec la même grille pour tout le monde : ce qui manque se voit, ce qui est fait aussi.
          </p>
          <p>
            La bonne nouvelle : la plupart des corrections sont gratuites et rapides. Ajouter des photos, préciser la catégorie, relier la carte ou répondre aux avis se fait depuis votre téléphone. Le rapport vous dit par où commencer pour que l&apos;effort serve d&apos;abord là où il compte le plus.
          </p>
        </div>
      </Section>

      <Section width="max-w-[900px]">
        <Heading eyebrow="Vos questions" title="Avant de lancer l'analyse" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <AnalysisCta
        location={WHERE}
        title="Votre note sur 100, maintenant"
        body="Tapez le nom de votre restaurant. Moins d'une minute pour la note, puis le rapport complet et vos cinq priorités sur WhatsApp."
        whatsappMessage="Bonjour, j'aimerais qu'on regarde ensemble la fiche Google de mon restaurant."
      />
      <RelatedPages slugs={["analyse-avis-google-restaurant", "visibilite-restaurant", "fiche-google-restaurant"]} />
    </MarketingShell>
  );
}
