// ADR 0069 §3 A — la grille de la fiche Google, sur 100.
//
// Chaque critère vaut ok / partiel / manquant / non_verifie. Un critère non
// vérifié SORT du dénominateur : la note est « sur N critères vérifiés ».
// Les critères d'avis (réponses, délai) viennent du volet D quand il est là.

import type { BusinessInfo } from "./dataforseo";
import type { FicheGap } from "./signals";

export type CriterionStatus = "ok" | "partiel" | "manquant" | "non_verifie";

export interface Criterion {
  key: string;
  block: "identite" | "coordonnees" | "horaires" | "photos" | "attributs" | "liens" | "avis";
  label: string;
  points: number;
  status: CriterionStatus;
  detail?: string;
  /** Le manque correspondant pour le moteur de scénarios. */
  gap?: FicheGap;
}

export interface FicheScore {
  score: number | null;
  verified: number;
  total: number;
  criteria: Criterion[];
  gaps: FicheGap[];
}

const WEIGHT: Record<CriterionStatus, number> = { ok: 1, partiel: 0.5, manquant: 0, non_verifie: 0 };

// Mots qui trahissent un nom de fiche bourré de mots-clés.
const KEYWORD_STUFFING = /\b(meilleur|best|livraison|delivery|halal|pas cher|bruxelles|brussels|ouvert|24h)\b/i;
const GENERIC_CATEGORIES = new Set(["restaurant", "restauration rapide", "fast food restaurant", "restaurant rapide"]);

export interface ReviewFacts {
  rating: number | null;
  reviewsCount: number | null;
  /** Médiane du nombre d'avis des concurrents à moins de 600 m. */
  competitorMedianReviews: number | null;
  responseShare: number | null;
  medianDelayDays: number | null;
}

export function scoreFiche(info: BusinessInfo, reviews: ReviewFacts): FicheScore {
  const c: Criterion[] = [];
  const add = (x: Criterion) => c.push(x);
  const known = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

  // Identité (15)
  add({
    key: "nom", block: "identite", label: "Nom sans mots-clés ajoutés", points: 5,
    status: !info.title ? "non_verifie" : KEYWORD_STUFFING.test(info.title) ? "manquant" : "ok",
    detail: info.title ?? undefined, gap: "nom_surcharge",
  });
  add({
    key: "categorie", block: "identite", label: "Catégorie principale précise", points: 5,
    status: !info.category ? "manquant" : GENERIC_CATEGORIES.has(info.category.toLowerCase()) ? "partiel" : "ok",
    detail: info.category ?? undefined, gap: "categorie_vague",
  });
  add({
    key: "categories_secondaires", block: "identite", label: "Catégories secondaires", points: 5,
    status: !known(info.additional_categories) ? "manquant" : info.additional_categories.length >= 2 ? "ok" : "partiel",
    detail: info.additional_categories?.join(", "),
  });

  // Coordonnées (15)
  add({ key: "telephone", block: "coordonnees", label: "Téléphone", points: 5, status: info.phone ? "ok" : "manquant", gap: "pas_de_telephone" });
  const isFacebook = !!info.url && /facebook\.com|instagram\.com/i.test(info.url);
  add({
    key: "site", block: "coordonnees", label: "Site web", points: 5,
    status: !info.url ? "manquant" : isFacebook ? "partiel" : "ok",
    detail: isFacebook ? "Pointe vers un réseau social" : info.domain ?? undefined,
    gap: !info.url ? "pas_de_site" : isFacebook ? "site_facebook" : undefined,
  });
  add({ key: "adresse", block: "coordonnees", label: "Adresse complète", points: 5, status: info.address_info?.postal_code ? "ok" : info.address ? "partiel" : "manquant" });

  // Horaires (15) — les horaires exceptionnels ne sont pas lus par DataForSEO : non vérifiés.
  const timetable = info.work_time?.work_hours?.timetable;
  add({
    key: "horaires", block: "horaires", label: "Horaires réguliers", points: 8,
    status: timetable && Object.keys(timetable).length ? "ok" : "manquant", gap: "horaires_absents",
  });
  add({ key: "horaires_exceptionnels", block: "horaires", label: "Horaires exceptionnels", points: 4, status: "non_verifie", gap: "horaires_exceptionnels" });
  add({ key: "horaires_services", block: "horaires", label: "Horaires livraison / emporter", points: 3, status: "non_verifie" });

  // Photos (15)
  const photos = info.total_photos;
  add({
    key: "photos", block: "photos", label: "Nombre de photos", points: 8,
    status: !known(photos) ? "non_verifie" : photos >= 50 ? "ok" : photos >= 15 ? "partiel" : "manquant",
    detail: known(photos) ? `${photos} photos` : undefined, gap: "photos_peu_nombreuses",
  });
  add({ key: "photos_recentes", block: "photos", label: "Photo récente de l'établissement", points: 4, status: "non_verifie", gap: "photos_anciennes" });
  add({
    key: "fiche_revendiquee", block: "photos", label: "Fiche revendiquée par l'établissement", points: 3,
    status: !known(info.is_claimed) ? "non_verifie" : info.is_claimed ? "ok" : "manquant",
    gap: "pas_de_photos_proprietaire",
  });

  // Attributs (10)
  const attrs = Object.values(info.attributes?.available_attributes ?? {}).flat().length;
  add({
    key: "attributs", block: "attributs", label: "Attributs renseignés", points: 7,
    status: !info.attributes ? "non_verifie" : attrs >= 12 ? "ok" : attrs >= 5 ? "partiel" : "manquant",
    detail: info.attributes ? `${attrs} attributs` : undefined, gap: "attributs_incomplets",
  });
  add({
    key: "description", block: "attributs", label: "Description rédigée", points: 3,
    status: info.description && info.description.length >= 80 ? "ok" : info.description ? "partiel" : "manquant",
    gap: "pas_de_description",
  });

  // Liens d'action (10)
  const links = (info.local_business_links ?? []).map((l) => l.type.toLowerCase());
  const hasLink = (t: string) => links.some((l) => l.includes(t));
  add({ key: "lien_menu", block: "liens", label: "Carte / menu", points: 3, status: hasLink("menu") ? "ok" : "manquant", gap: "pas_de_menu" });
  add({ key: "lien_commande", block: "liens", label: "Commande en ligne", points: 5, status: hasLink("order") ? "ok" : "manquant", gap: "pas_de_lien_commande" });
  add({ key: "lien_reservation", block: "liens", label: "Réservation", points: 2, status: hasLink("reserv") ? "ok" : "manquant", gap: "pas_de_reservation" });

  // Avis (20)
  const r = reviews.rating ?? info.rating?.value ?? null;
  add({
    key: "note", block: "avis", label: "Note moyenne", points: 7,
    status: r == null ? "non_verifie" : r >= 4.5 ? "ok" : r >= 4.0 ? "partiel" : "manquant",
    detail: r != null ? `${r.toFixed(1).replace(".", ",")}★` : undefined,
  });
  const count = reviews.reviewsCount ?? info.rating?.votes_count ?? null;
  add({
    key: "volume", block: "avis", label: "Nombre d'avis face aux voisins", points: 5,
    status: count == null || reviews.competitorMedianReviews == null ? "non_verifie"
      : count >= reviews.competitorMedianReviews ? "ok" : count >= reviews.competitorMedianReviews * 0.5 ? "partiel" : "manquant",
    detail: count != null ? `${count} avis` : undefined,
  });
  add({
    key: "reponses", block: "avis", label: "Réponses du propriétaire", points: 5,
    status: reviews.responseShare == null ? "non_verifie" : reviews.responseShare >= 0.7 ? "ok" : reviews.responseShare >= 0.2 ? "partiel" : "manquant",
    detail: reviews.responseShare != null ? `${Math.round(reviews.responseShare * 100)} % sur 12 mois` : undefined,
  });
  add({
    key: "delai_reponse", block: "avis", label: "Délai de réponse", points: 3,
    status: reviews.medianDelayDays == null ? "non_verifie" : reviews.medianDelayDays <= 3 ? "ok" : reviews.medianDelayDays <= 14 ? "partiel" : "manquant",
    detail: reviews.medianDelayDays != null ? `${Math.round(reviews.medianDelayDays)} j médian` : undefined,
  });

  const verified = c.filter((x) => x.status !== "non_verifie");
  const max = verified.reduce((a, x) => a + x.points, 0);
  const got = verified.reduce((a, x) => a + x.points * WEIGHT[x.status], 0);
  const gaps = c.filter((x) => x.gap && (x.status === "manquant" || x.status === "partiel")).map((x) => x.gap!);
  return {
    score: max ? Math.round((got / max) * 100) : null,
    verified: verified.length,
    total: c.length,
    criteria: c,
    gaps: [...new Set(gaps)],
  };
}
