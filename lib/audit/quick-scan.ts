// ADR 0071 — le score rapide de l'audit gratuit : ce qui se lit en moins
// d'une minute, écrit étape par étape dans audit_leads.scan pour que la page
// publique montre ce qu'on lit, pendant qu'on le lit (§2).
//
// Appelé en tâche de fond (`after()`) ; ne lève jamais : un échec se lit
// dans la ligne (scan_status, scan_error) et à l'écran.

import { fetchBusinessInfo, isConfigured as dataForSeoConfigured, type BusinessInfo } from "./dataforseo";
import { scoreFiche } from "./fiche-score";
import { fetchSite, mobileSpeed, scoreSite, type SiteFacts } from "./seo";
import { searchKeyword } from "./competitors";
import { BRUSSELS_POSTAL_CODES } from "./brussels";
import { nearby, photoUri, type Neighbor, type PlaceDetails } from "./places";
import { median, offsetM, quickCompetitorScore, quickGlobal, quickReviewScore, rankAmong, verdictOf } from "./quick-score";
import type { QuickCheck, QuickScan, StepKey, StepState } from "./quick-scan-types";
import { updateLead } from "./leads";

// Coûts indicatifs par appel (USD), pour suivre le coût réel en console.
const COST = { details: 0.025, nearby: 0.035, photo: 0.007 };
const MAX_PHOTOS = 4;
const MAX_REVIEWS = 5;

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

const isSocial = (url: string) => /facebook\.com|instagram\.com|linktr\.ee/i.test(url);

/** Fiche au format DataForSEO reconstituée depuis Places, quand DataForSEO n'est pas branché. */
function infoFromPlaces(d: PlaceDetails): BusinessInfo {
  const generic = new Set(["point_of_interest", "establishment", "food", "restaurant", "store"]);
  return {
    title: d.name,
    description: d.summary,
    category: d.category,
    additional_categories: d.types.filter((t) => !generic.has(t) && t !== d.primaryType),
    cid: null,
    place_id: d.id,
    address: d.address,
    address_info: { postal_code: d.postalCode },
    phone: d.phone,
    url: d.website,
    domain: hostOf(d.website),
    total_photos: null,
    is_claimed: null,
    price_level: null,
    rating: { value: d.rating, votes_count: d.reviewsCount },
    rating_distribution: null,
    place_topics: null,
    attributes: null,
    work_time: d.hasHours ? { work_hours: { timetable: { lu: [] } } } : null,
    local_business_links: null,
    latitude: d.lat,
    longitude: d.lng,
    last_updated_time: null,
  };
}

function orderButtonOf(info: BusinessInfo): boolean | null {
  const links = info.local_business_links;
  const book = !!(info as BusinessInfo & { book_online_url?: string | null }).book_online_url;
  if (book || links?.some((l) => /order/i.test(l.type))) return true;
  return Array.isArray(links) ? false : null;
}

const SITE_KEYS = new Set(["https", "titre", "description", "schema", "nap", "menu", "commande", "noindex"]);

export async function runQuickScan(leadId: string, d: PlaceDetails): Promise<void> {
  const calls: Record<string, number> = { places_details: 1 };
  let cost = COST.details;
  const scan: QuickScan = {
    steps: { voisins: "en_cours", fiche: "en_cours", avis: "en_cours", photos: "en_cours", site: "en_cours", mobile: "en_cours" },
    place: {
      name: d.name,
      address: d.address,
      category: d.category,
      rating: d.rating,
      reviewsCount: d.reviewsCount,
      phone: !!d.phone,
      website: d.website,
      openNow: d.openNow,
      hasHours: d.hasHours,
      orderButton: null,
      totalPhotos: null,
    },
  };

  // Les écritures sont enchaînées : chaque étape écrit l'objet entier, dans l'ordre.
  let chain: Promise<void> = Promise.resolve();
  const save = () => {
    const snapshot = JSON.parse(JSON.stringify(scan)) as QuickScan;
    chain = chain.then(() => updateLead(leadId, { scan: snapshot })).catch((e) => console.error("[audit-gratuit] écriture :", e));
    return chain;
  };
  const step = (k: StepKey, s: StepState) => {
    scan.steps![k] = s;
    return save();
  };

  try {
    await save();

    // Avis : les 5 avis de la fiche (Places), auteurs réduits à l'initiale.
    scan.reviews = d.reviews
      .filter((r) => r.text)
      .slice(0, MAX_REVIEWS)
      .map((r) => ({ initial: r.initial, rating: r.rating, when: r.when, text: r.text!.slice(0, 320) }));
    const avisDone = step("avis", scan.reviews.length ? "ok" : "sans_objet");

    const voisins = (async (): Promise<Neighbor[]> => {
      if (d.lat == null || d.lng == null) {
        await step("voisins", "echec");
        return [];
      }
      try {
        calls.places_nearby = 1;
        cost += COST.nearby;
        const list = (await nearby(d.lat, d.lng, d.primaryType)).filter((n) => n.id !== d.id).slice(0, 8);
        scan.neighbors = list.map((n) => ({ name: n.name, rating: n.rating, reviewsCount: n.reviewsCount, ...offsetM({ lat: d.lat!, lng: d.lng! }, n) }));
        scan.ranking = rankAmong({ name: d.name, rating: d.rating, reviewsCount: d.reviewsCount }, list);
        await step("voisins", list.length ? "ok" : "sans_objet");
        return list;
      } catch (e) {
        console.error("[audit-gratuit] voisins :", e);
        await step("voisins", "echec");
        return [];
      }
    })();

    const fiche = (async (): Promise<BusinessInfo> => {
      if (!dataForSeoConfigured()) return infoFromPlaces(d);
      try {
        const r = await fetchBusinessInfo({ placeId: d.id });
        calls.dataforseo = (calls.dataforseo ?? 0) + r.tries;
        cost += r.cost;
        return r.info ?? infoFromPlaces(d);
      } catch (e) {
        console.error("[audit-gratuit] fiche DataForSEO :", e);
        return infoFromPlaces(d);
      }
    })();

    const photos = (async () => {
      const names = d.photoNames.slice(0, MAX_PHOTOS);
      calls.places_photos = names.length;
      cost += names.length * COST.photo;
      const uris = (await Promise.all(names.map((n) => photoUri(n)))).filter((u): u is string => !!u);
      scan.photos = uris;
      await step("photos", uris.length ? "ok" : names.length ? "echec" : "sans_objet");
    })();

    const website = d.website && !isSocial(d.website) ? d.website : null;
    const site = (async (): Promise<SiteFacts | null> => {
      if (!website) {
        scan.site = null;
        await step("site", "sans_objet");
        return null;
      }
      try {
        const facts = await fetchSite(website, { phone: d.phone, postalCode: d.postalCode });
        const kw = searchKeyword(d.category, null, d.name);
        const checks = scoreSite(facts, null, null, { keyword: kw, commune: d.postalCode ? BRUSSELS_POSTAL_CODES[d.postalCode] ?? null : null }).checks;
        scan.site = {
          url: facts.finalUrl ?? website,
          title: facts.title,
          checks: checks.filter((c) => SITE_KEYS.has(c.key) && c.status !== "non_verifie").map((c): QuickCheck => ({ label: c.label, ok: c.status === "ok", detail: c.detail })),
        };
        await step("site", "ok");
        return facts;
      } catch (e) {
        console.error("[audit-gratuit] site :", e);
        scan.site = { url: website, title: null, checks: [{ label: "Site joignable", ok: false, detail: "le site n'a pas répondu" }] };
        await step("site", "echec");
        return null;
      }
    })();

    const mobile = (async (): Promise<number | null> => {
      if (!website) {
        scan.mobile = null;
        await step("mobile", "sans_objet");
        return null;
      }
      calls.pagespeed = 1;
      const r = await mobileSpeed(website);
      const facts = await site;
      const checks: QuickCheck[] = [];
      if (r.score != null) checks.push({ label: `Vitesse sur mobile : ${Math.round(r.score * 100)}/100`, ok: r.score >= 0.5, detail: "selon Google PageSpeed" });
      if (facts) checks.push({ label: facts.viewport ? "Lisible sur mobile" : "Pas adapté au mobile", ok: facts.viewport });
      if (facts && facts.images) checks.push({ label: `${facts.imagesWithoutAlt} image(s) sans description sur ${facts.images}`, ok: facts.imagesWithoutAlt === 0 });
      scan.mobile = { speed: r.score, checks };
      await step("mobile", r.score != null || checks.length ? "ok" : "echec");
      return r.score;
    })();

    const [neighbors, info, facts, speed] = await Promise.all([voisins, fiche, site, mobile, photos, avisDone]);

    // Fiche : la grille de l'audit complet, avec le volume d'avis face aux voisins.
    const med = median(neighbors.map((n) => n.reviewsCount).filter((x): x is number => x != null));
    const fs = scoreFiche(info, { rating: d.rating, reviewsCount: d.reviewsCount, competitorMedianReviews: med, responseShare: null, medianDelayDays: null });
    scan.place!.orderButton = orderButtonOf(info);
    scan.place!.totalPhotos = info.total_photos;
    scan.ficheIssues = fs.criteria.filter((c) => c.status === "manquant" || c.status === "partiel").map((c) => c.label).slice(0, 8);
    scan.steps!.fiche = "ok";

    const kw = searchKeyword(info.category ?? d.category, info.additional_categories, d.name);
    // Pas de site (ou une page Facebook) : le volet compte comme « site manquant », comme dans l'audit complet.
    const siteScore = scoreSite(facts, speed, null, { keyword: kw, commune: d.postalCode ? BRUSSELS_POSTAL_CODES[d.postalCode] ?? null : null }).score;
    const scores = {
      fiche: fs.score,
      avis: quickReviewScore(d.rating, d.reviews.map((r) => r.rating)),
      concurrents: quickCompetitorScore({ rating: d.rating, reviewsCount: d.reviewsCount }, neighbors),
      site: siteScore,
    };
    const global = quickGlobal(scores);
    scan.scores = { ...scores, global };
    scan.verdict = verdictOf(global);
    await save();
    await chain;
    await updateLead(leadId, {
      scan_status: global == null ? "echec" : "ok",
      score: global,
      scan_error: global == null ? "aucune note calculable (fiche sans note ni voisin)" : null,
      cost_usd: Math.round(cost * 10000) / 10000,
      calls,
    });
  } catch (e) {
    console.error("[audit-gratuit] score rapide :", e);
    await chain;
    await updateLead(leadId, {
      scan_status: "echec",
      scan_error: e instanceof Error ? e.message : String(e),
      cost_usd: Math.round(cost * 10000) / 10000,
      calls,
    }).catch(() => {});
  }
}
