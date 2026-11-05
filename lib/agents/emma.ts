import { addDays } from "../daily-revenue-model";
import { WEEKDAY_LABELS } from "../insights";
import { DAILY_ADVICE, dailyAdvice, type Estimate } from "../ads/estimate";
import { formatEur, MIN_BUDGET_CENTS, quote } from "../ads/money";
import { dayCount, judgeContent, judgeOffer, rankInstagramPosts, type Creative, type Offer } from "../ads/meta-spec";
import { getAdFee } from "../ads/fee";
import { pubConfig } from "../ads/config";
import { estimateFor, instagramPosts, listRequests, pubAvailability } from "../ads/requests";
import { chloeIdeas, loadChloeInput, type IdeaEstimate, type IdeaLines } from "./chloe";

// Emma — la pub (Brigade 10, chantier « La brigade »).
//
// Une seule idée : « Fais connaître ta promo du jour creux autour de toi ». Elle reprend l'offre
// que Chloé a trouvée (la remise sur un plat, le jour le plus calme de la semaine) et en fait une
// DEMANDE DE PUB prête à être payée : objectif Visites, deux semaines, 3 km autour de
// l'établissement, dans le repère de 10 à 15 € par jour, avec l'estimation en fourchette que
// donne déjà le formulaire (`lib/ads/estimate.ts`).
//
// Emma PROPOSE ; le gérant DÉCIDE ; Boosteats VÉRIFIE (ADR 0086 amendé le 2026-11-05) :
//   - rien n'est créé sans le « Oui » du gérant, qui coche lui-même les conditions de la Pub
//     (crédit non remboursable, ADR 0086 §4) : un « Oui » à une idée ne vaut jamais acceptation ;
//   - la demande créée est la demande existante (`createRequest`) : le virement, la communication
//     structurée, la validation de Mehdi avant mise en ligne et les alertes sont inchangés ;
//   - Emma ne touche à aucun argent, ne lance rien chez Meta, ne paie rien.
//
// Un jour sans bonne idée vaut mieux qu'une idée de remplissage : dans tous les autres cas, Emma
// ne dit rien — mais elle dit POURQUOI (`reason`), pour qu'aucune absence ne soit un échec muet.

// ─── Types provisoires ────────────────────────────────────────────────────────
// Le contrat commun des idées (lib/agents/types.ts) est écrit par Mehdi (Brigade 01). À son
// arrivée, on remplace ces types, pas la logique.

/** Ce que `createRequest` reçoit, moins ce que seul le gérant peut fournir (facturation, conditions). */
export type EmmaProposal = {
  objective: "TRAFIC";
  budgetEuros: number;
  startsOn: string;
  endsOn: string;
  radiusKm: number;
  adText: string;
  offer: Offer;
};

export type EmmaIdea = {
  assistant: "emma";
  type: "pub_pour_la_promo";
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: IdeaEstimate | null; // null : pas d'estimation disponible, et on le dit
  decideBy: string; // ISO : l'idée se recalcule chaque jour (la date de départ glisse), elle expire ce soir
  proposal: EmmaProposal;
  creative: Creative; // la publication Instagram la mieux classée, que le gérant peut remplacer
  action: { kind: "create_ad_request"; label: string };
  evidence: Record<string, number | string>; // les chiffres qui ont produit l'idée (trace)
};

export type EmmaBlock =
  | "pub_fermee" // la Pub n'est pas ouverte pour cet établissement (`PUB_RESTAURANTS`)
  | "demande_en_cours" // une pub est déjà demandée, payée ou en diffusion : on n'en empile pas une seconde
  | "pas_de_promo" // Chloé n'a pas de promo de jour creux à faire connaître
  | "pas_de_publication" // aucune publication Instagram à promouvoir (compte non relié, ou vide)
  | "proposition_invalide"; // la proposition ne passerait pas le formulaire : on ne la montre pas

export type EmmaDecision = { idea: EmmaIdea; reason: null } | { idea: null; reason: EmmaBlock };

export const EMMA_BLOCK_TEXT: Record<EmmaBlock, string> = {
  pub_fermee: "La Pub n'est pas ouverte pour cet établissement.",
  demande_en_cours: "Une pub est déjà demandée ou en diffusion.",
  pas_de_promo: "Pas de promo de jour creux à faire connaître en ce moment.",
  pas_de_publication: "Aucune publication Instagram à promouvoir : relie le compte ou envoie un fichier.",
  proposition_invalide: "La proposition ne passerait pas le formulaire de la Pub.",
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Visites : une promo se mesure en passages, avec un mot clé dit au comptoir (ADR 0086 §7). */
export const EMMA_OBJECTIVE = "TRAFIC" as const;
/** Rayon de la zone, en km (valeur de la tâche ; le formulaire propose 1, 3, 5 ou 10). */
export const EMMA_RADIUS_KM = 3;
/** Deux semaines : le raccourci « Les 2 prochaines semaines » du formulaire, soit deux jours creux. */
export const EMMA_CAMPAIGN_DAYS = 14;
/** Milieu du repère de 10 à 15 € par jour (ADR 0086, démo du 2026-10-28). */
export const EMMA_DAILY_EUROS = 12;
/**
 * Délai entre aujourd'hui et le premier jour de diffusion : le temps du virement et de la vérification
 * par Boosteats. HYPOTHÈSE (le formulaire exige seulement « demain ») ; la cible de l'ADR 0086 est
 * « moins de 24 h ouvrables » après le paiement confirmé, le virement ajoute un à deux jours.
 */
export const EMMA_LEAD_DAYS = 3;

const DAY_LABEL_LONG = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });

// ─── L'offre, depuis Chloé ────────────────────────────────────────────────────

/** Ce que l'idée de Chloé apporte : un plat, une remise, le jour de la semaine le plus calme. */
export type EmmaOffer = { productName: string; discountPct: number; weekday: number }; // weekday : 0 = lundi

/**
 * Le mot clé que le comptoir reconnaît : le premier mot du plat, en majuscules sans accent
 * (« Burger » → BURGER). Deux caractères au moins et vingt-quatre au plus (`judgeOffer`).
 */
export function offerKeyword(productName: string): string {
  const first = productName.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).find((w) => w.length > 0) ?? "";
  const word = first.slice(0, 12);
  return word.length >= 2 ? word : "PROMO";
}

/** Premier jour ≥ `from` qui tombe un `weekday` (0 = lundi). */
function firstWeekdayOnOrAfter(from: string, weekday: number): string {
  const jsDay = (weekday + 1) % 7; // getUTCDay : 0 = dimanche
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === jsDay) return d;
  }
  return from;
}

// ─── L'idée (pur, déterministe) ───────────────────────────────────────────────

export type EmmaInput = {
  restaurantId: string;
  todayISO: string; // jour de Bruxelles
  pubOpen: boolean;
  requestInFlight: boolean;
  offer: EmmaOffer | null;
  creative: Creative | null;
  feePct: number;
  negotiatedFee: boolean;
  vatRate: number;
  estimate: Estimate | null;
};

/** La proposition de pub, ou la raison pour laquelle il n'y en a pas. */
export function emmaDecision(input: EmmaInput): EmmaDecision {
  if (!input.pubOpen) return { idea: null, reason: "pub_fermee" };
  if (input.requestInFlight) return { idea: null, reason: "demande_en_cours" };
  if (!input.offer) return { idea: null, reason: "pas_de_promo" };
  if (!input.creative) return { idea: null, reason: "pas_de_publication" };

  const { offer, creative, todayISO } = input;
  const day = WEEKDAY_LABELS[offer.weekday];
  const startsOn = addDays(todayISO, EMMA_LEAD_DAYS);
  const endsOn = addDays(startsOn, EMMA_CAMPAIGN_DAYS - 1);
  const days = dayCount(startsOn, endsOn);
  const budgetEuros = Math.max(MIN_BUDGET_CENTS / 100, EMMA_DAILY_EUROS * days);

  const offerText = `−${offer.discountPct} % sur ${offer.productName} le ${day}`;
  const proposal: EmmaProposal = {
    objective: EMMA_OBJECTIVE,
    budgetEuros,
    startsOn,
    endsOn,
    radiusKm: EMMA_RADIUS_KM,
    adText: `Chaque ${day}, ${offerText} pour les membres. Montre ton app en caisse 🎉`,
    offer: { text: offerText, keyword: offerKeyword(offer.productName), from: firstWeekdayOnOrAfter(startsOn, offer.weekday), to: endsOn },
  };

  // La proposition doit passer le formulaire : sinon on ne la montre pas (un « Oui » qui échouerait
  // ensuite serait pire qu'une absence d'idée).
  const content = judgeContent(EMMA_OBJECTIVE, proposal.adText, creative);
  const offerOk = judgeOffer(proposal.offer);
  const dailyCents = Math.floor((budgetEuros * 100) / days);
  if (!content.ok || !offerOk.ok || dailyAdvice(dailyCents) !== "ok") return { idea: null, reason: "proposition_invalide" };

  const q = quote({ budgetCents: budgetEuros * 100, feePct: input.feePct, vatRate: input.vatRate });
  const e = input.estimate;
  const estimate: IdeaEstimate | null =
    e && e.kind === "clicks"
      ? {
          low: e.lo,
          high: e.hi,
          unit: "clics vers ton site",
          basis: `${formatEur(q.budgetCents)} sur ${days} jours dans ${EMMA_RADIUS_KM} km, d'après ${e.calibrated ? "le coût réel de nos campagnes précédentes" : "des coûts constatés sur des campagnes réelles"}. Une fourchette, pas une promesse.`,
        }
      : null;

  return {
    reason: null,
    idea: {
      assistant: "emma",
      type: "pub_pour_la_promo",
      title: `Fais connaître ta promo du ${day} autour de toi`,
      question: "Je prépare la pub ?",
      lines: {
        what: `Une pub de ${days} jours (du ${DAY_LABEL_LONG(startsOn)} au ${DAY_LABEL_LONG(endsOn)}) dans ${EMMA_RADIUS_KM} km autour de chez toi, pour annoncer « ${offerText} ». Mot clé à dire en caisse : ${proposal.offer.keyword}.`,
        who: "Toi : tu choisis la publication (je propose ta meilleure), tu coches les conditions et tu paies par virement. Boosteats vérifie la pub avant de la mettre en ligne.",
        cost: `${formatEur(q.totalCents)} à virer : ${formatEur(q.budgetCents)} de pub (${formatEur(Math.floor((q.budgetCents) / days))} par jour, dans le repère de ${DAILY_ADVICE.lowCents / 100} à ${DAILY_ADVICE.highCents / 100} €) + ${q.feePct} % de frais de service${input.negotiatedFee ? " (tarif négocié)" : ""}.`,
      },
      estimate,
      decideBy: todayISO,
      proposal,
      creative,
      action: { kind: "create_ad_request", label: "Préparer la pub" },
      evidence: {
        product: offer.productName,
        discountPct: offer.discountPct,
        weekday: day,
        days,
        budgetEuros,
        dailyEuros: Math.round(dailyCents / 100),
        radiusKm: EMMA_RADIUS_KM,
        feePct: q.feePct,
        totalEuros: Math.round(q.totalCents / 100),
        leadDays: EMMA_LEAD_DAYS,
        estimated: estimate ? "oui" : "non",
      },
    },
  };
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

/** L'offre de la promo du jour creux que Chloé propose aujourd'hui, ou `null`. */
async function loadOffer(restaurantId: string, todayISO: string): Promise<EmmaOffer | null> {
  const chloe = await loadChloeInput(restaurantId, todayISO);
  const quiet = chloeIdeas(chloe).find((i) => i.type === "jour_creux_promo");
  if (!quiet || quiet.relay.discountPct == null) return null;
  const product = chloe.products.find((p) => p.id === quiet.relay.productId);
  const weekday = Number(quiet.evidence.weekday);
  if (!product || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  return { productName: product.name, discountPct: quiet.relay.discountPct, weekday };
}

const IN_FLIGHT = new Set(["paiement_attendu", "payee", "preparee", "a_corriger", "en_diffusion", "en_pause"]);

/**
 * La décision d'Emma pour un établissement. Les vérifications peu coûteuses passent d'abord : l'appel
 * à Meta (audience de la zone, pour l'estimation) n'a lieu que si une idée existe vraiment.
 * Une lecture qui échoue remonte : elle ne se déguise pas en « pas d'idée ».
 */
export async function loadEmmaDecision(restaurantId: string, isSuperAdmin: boolean, todayISO: string): Promise<EmmaDecision> {
  const availability = await pubAvailability(restaurantId, isSuperAdmin);
  const base = { restaurantId, todayISO, pubOpen: availability.open, requestInFlight: false, offer: null, creative: null, feePct: 0, negotiatedFee: false, vatRate: 0, estimate: null } satisfies EmmaInput;
  if (!availability.open) return emmaDecision(base);

  const listed = await listRequests(restaurantId);
  if (!listed.ok) throw new Error("Emma : demandes de pub illisibles");
  if (listed.requests.some((r) => IN_FLIGHT.has(r.status))) return emmaDecision({ ...base, requestInFlight: true });

  const offer = await loadOffer(restaurantId, todayISO);
  if (!offer) return emmaDecision(base);

  const posts = await instagramPosts(restaurantId);
  const best = posts.ok ? rankInstagramPosts(posts.posts, new Date(), 1)[0] : undefined;
  const creative: Creative | null = best
    ? { kind: "instagram_post", mediaId: best.id, mediaType: best.media_type, permalink: best.permalink ?? null, thumbnail: best.thumbnail_url ?? null }
    : null;
  if (!creative) return emmaDecision({ ...base, offer });

  const fee = await getAdFee(restaurantId);
  const budgetCents = Math.max(MIN_BUDGET_CENTS, EMMA_DAILY_EUROS * EMMA_CAMPAIGN_DAYS * 100);
  const est = await estimateFor(restaurantId, EMMA_OBJECTIVE, EMMA_RADIUS_KM, budgetCents).catch(() => ({ ok: false as const }));
  return emmaDecision({
    ...base,
    offer,
    creative,
    feePct: fee.feePct,
    negotiatedFee: fee.negotiated,
    vatRate: pubConfig().vatRate,
    estimate: est.ok ? est.estimate : null,
  });
}
