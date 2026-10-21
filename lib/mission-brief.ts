// ============================================================
// Réserver un prestataire (ADR 0084 §3, §5, §7) — le brief.
//
// Les questionnaires sont des DONNÉES (un modèle par métier, modifiable depuis
// /platform/prestataires) : ce fichier porte le modèle vidéo par défaut, la
// validation d'un brief avant verrouillage, les créneaux conseillés, les
// rappels et la qualité d'une remarque de retour. Fonctions PURES, la date du
// jour est injectée (jour belge YYYY-MM-DD).
//
// Règles issues de l'expérience de terrain (ADR 0084 Contexte) : un brief
// incomplet ne part pas, un tournage se prévoit une semaine à l'avance, une
// décision engage tous les décideurs, « je n'aime pas » n'est pas une remarque.
// ============================================================

import { addDays } from "./console-journey";
import { judgeUrl } from "./safe-url";

// ── Modèle de questionnaire ──────────────────────────────────

export type QuestionKind = "choice" | "multi" | "text" | "number" | "date" | "contact" | "list" | "flag" | "files";

/**
 * Deux temps (ADR 0084 §3 et §5) : le BRIEF part au prestataire pour qu'il chiffre ; la
 * PRÉPARATION DU TOURNAGE (date, créneau, qui est là, contact) vient une fois le devis
 * accepté, dans les disponibilités du prestataire — la date ne se choisit pas dans le vide.
 */
export type BriefPhase = "brief" | "tournage";

export type BriefQuestion = {
  key: string;
  /** Absent = « brief ». */
  phase?: BriefPhase;
  label: string;
  kind: QuestionKind;
  required: boolean;
  options?: readonly string[];
  /** Texte : longueur minimale (caractères, espaces rognés). */
  minLength?: number;
  /** Aide sous la question, en langage simple. */
  hint?: string;
};

export type BriefTemplate = {
  metier: "video" | "photo" | "design" | "impression";
  questions: readonly BriefQuestion[];
  /** Budget minimal par format (centimes) : sous ce seuil, l'envoi est refusé. */
  budgetFloorCents?: number;
  /** Budget en dessous duquel l'ambition déclarée est irréaliste : avertissement, jamais un refus. */
  ambitionBudgetCents?: Readonly<Record<string, number>>;
};

export type BriefAnswer = string | number | boolean | string[] | { name: string; phone: string } | null | undefined;
export type BriefAnswers = Record<string, BriefAnswer>;

/** Modèle vidéo par défaut (le graphisme, la photo et l'impression suivent la même forme). */
export const VIDEO_TEMPLATE: BriefTemplate = {
  metier: "video",
  questions: [
    { key: "goal", label: "Pour quoi faire ?", kind: "choice", required: true, options: ["Réseaux sociaux", "Nouveau plat", "Promotion", "Recrutement", "Ambiance du lieu"] },
    { key: "format", label: "Quel format ?", kind: "choice", required: true, options: ["Reels", "Film", "Pack mois", "Face cam"] },
    { key: "idea", label: "Ton idée en deux phrases", kind: "text", required: true, minLength: 20, hint: "Le prestataire te fera 2 à 3 propositions : décris le but, pas le montage." },
    { key: "dishes", label: "Plats à montrer", kind: "list", required: true },
    { key: "kitchen", label: "Montrer la cuisine ?", kind: "choice", required: true, options: ["Oui", "Non", "Partiellement"], hint: "Si c'est non, aucun plan en cuisine." },
    { key: "highlights", label: "À mettre en avant dans la salle", kind: "multi", required: false, options: ["Entrée", "Salle", "Tables", "Bar", "Toilettes", "Nouvelle décoration"] },
    { key: "promo", label: "Promotion à montrer", kind: "text", required: false },
    { key: "extras_count", label: "Figurants", kind: "number", required: false },
    { key: "sound", label: "Son enregistré ?", kind: "choice", required: true, options: ["Oui", "Non"] },
    { key: "noisy", label: "Appareils bruyants à couper", kind: "text", required: false },
    { key: "tone", label: "Ton", kind: "choice", required: true, options: ["Chaleureux", "Dynamique", "Sobre", "Gourmand"] },
    { key: "avoid", label: "À éviter", kind: "text", required: false },
    { key: "shoot_date", phase: "tournage", label: "Date du tournage", kind: "date", required: true, hint: "Au moins 7 jours à l'avance : ton équipe doit être prévenue." },
    { key: "shoot_slot", phase: "tournage", label: "Créneau", kind: "choice", required: true },
    { key: "roles", phase: "tournage", label: "Qui doit être présent", kind: "multi", required: true, options: ["Cuisinier", "Serveur", "Barman"] },
    { key: "contact", phase: "tournage", label: "Contact sur place", kind: "contact", required: true, hint: "Une seule personne, joignable le jour J." },
    { key: "access", phase: "tournage", label: "Accès et déchargement", kind: "text", required: false },
    { key: "deciders", label: "Qui décide avec toi ?", kind: "list", required: true, hint: "Associé, conjoint… Tous doivent avoir validé." },
    { key: "deciders_attested", label: "Tous ont validé ce brief", kind: "flag", required: true },
    { key: "budget_cents", label: "Budget", kind: "number", required: true },
    { key: "notes", label: "Précisions", kind: "text", required: false },
    { key: "files", label: "Pièces jointes", kind: "files", required: false },
  ],
};

/** Les écrans de l'assistant de brief : quelques questions à la fois, jamais un mur de champs (restaurateur sur téléphone, en plein service). */
export type BriefStep = { key: string; title: string; subtitle: string; keys: readonly string[] };

export const VIDEO_BRIEF_STEPS: readonly BriefStep[] = [
  { key: "idee", title: "Ton idée", subtitle: "Pour quoi faire, et sous quelle forme.", keys: ["goal", "format", "idea"] },
  { key: "image", title: "Ce qu'on voit à l'image", subtitle: "Les plats, la salle, la cuisine, les gens.", keys: ["dishes", "kitchen", "highlights", "promo", "extras_count", "sound", "noisy"] },
  { key: "ton", title: "Le ton", subtitle: "Tu cadres, le vidéaste te fera 2 à 3 propositions.", keys: ["tone", "avoid"] },
  { key: "decideurs", title: "Qui décide ?", subtitle: "Une fois le brief envoyé, la décision est prise.", keys: ["deciders", "deciders_attested"] },
  { key: "budget", title: "Budget et précisions", subtitle: "Juste un repère : tu ne paies rien maintenant.", keys: ["budget_cents", "notes"] },
];

/**
 * Modèle photo (photographe) par défaut : même parcours que la vidéo (une date lie les deux parties, des idées de séance, un
 * compte-rendu du jour J), avec ses propres questions : ce qu'on photographie, combien d'images, pour quel usage, quel niveau de
 * retouche. Les clés de la phase « tournage » sont celles de la vidéo : toute la mécanique du jour J les réutilise telle quelle.
 */
export const PHOTO_TEMPLATE: BriefTemplate = {
  metier: "photo",
  questions: [
    { key: "goal", label: "Pour quoi faire ?", kind: "choice", required: true, options: ["Carte et menu", "Réseaux sociaux", "Site et Google", "Livraison (Uber Eats, Deliveroo)", "Presse et communication", "Ambiance du lieu"] },
    { key: "shots", label: "Que veux-tu photographier ?", kind: "multi", required: true, options: ["Plats", "Boissons", "Salle", "Façade et terrasse", "Équipe", "Cuisine en action", "Portraits"], hint: "Coche tout ce que tu veux dans cette séance." },
    { key: "count", label: "Combien d'images retouchées ?", kind: "choice", required: true, options: ["10", "20", "40", "60 ou plus"], hint: "Le photographe en prend davantage et te livre les meilleures, retouchées." },
    { key: "idea", label: "Ton idée en deux phrases", kind: "text", required: true, minLength: 20, hint: "Le photographe te fera 2 à 3 propositions de séance : décris le but, pas la technique." },
    { key: "dishes", label: "Plats à photographier", kind: "list", required: true, hint: "Écris « aucun » si tu ne veux pas de plats." },
    { key: "people", label: "Des personnes sur les photos ?", kind: "choice", required: true, options: ["Non", "L'équipe seulement", "Équipe et clients"], hint: "Les clients en salle ne sont jamais reconnaissables." },
    { key: "extras_count", label: "Figurants", kind: "number", required: false },
    { key: "style", label: "Quel style ?", kind: "choice", required: true, options: ["Naturel", "Chaleureux", "Sobre", "Gourmand", "Éditorial"] },
    { key: "avoid", label: "À éviter", kind: "text", required: false },
    { key: "shoot_date", phase: "tournage", label: "Date de la séance", kind: "date", required: true, hint: "Au moins 7 jours à l'avance : ton équipe doit être prévenue." },
    { key: "shoot_slot", phase: "tournage", label: "Créneau", kind: "choice", required: true },
    { key: "roles", phase: "tournage", label: "Qui doit être présent", kind: "multi", required: true, options: ["Cuisinier", "Serveur", "Barman", "Gérant"] },
    { key: "contact", phase: "tournage", label: "Contact sur place", kind: "contact", required: true, hint: "Une seule personne, joignable le jour J." },
    { key: "access", phase: "tournage", label: "Accès et déchargement", kind: "text", required: false },
    { key: "deciders", label: "Qui décide avec toi ?", kind: "list", required: true, hint: "Associé, conjoint… Tous doivent avoir validé." },
    { key: "deciders_attested", label: "Tous ont validé ce brief", kind: "flag", required: true },
    { key: "budget_cents", label: "Budget", kind: "number", required: true },
    { key: "notes", label: "Précisions", kind: "text", required: false },
    { key: "files", label: "Pièces jointes", kind: "files", required: false },
  ],
};

export const PHOTO_BRIEF_STEPS: readonly BriefStep[] = [
  { key: "idee", title: "Ton idée", subtitle: "Pour quoi faire, et ce qu'on photographie.", keys: ["goal", "shots", "count", "idea"] },
  { key: "image", title: "Ce qu'on voit sur les photos", subtitle: "Les plats, les gens, ce qu'il faut éviter.", keys: ["dishes", "people", "extras_count"] },
  { key: "ton", title: "Le style", subtitle: "Tu cadres, le photographe te fera 2 à 3 propositions.", keys: ["style", "avoid"] },
  { key: "decideurs", title: "Qui décide ?", subtitle: "Une fois le brief envoyé, la décision est prise.", keys: ["deciders", "deciders_attested"] },
  { key: "budget", title: "Budget et précisions", subtitle: "Juste un repère : tu ne paies rien maintenant.", keys: ["budget_cents", "notes"] },
];

/**
 * Modèle design (graphiste) par défaut, d'après la maquette V4DesignBrief : quoi, usage, charte, langues, style, ce qu'on aime
 * et n'aime pas, le contenu FINAL (l'ajouter plus tard est une demande de modification), pour quand. Pas de tournage : aucune
 * question de la phase « tournage ».
 */
export const DESIGN_TEMPLATE: BriefTemplate = {
  metier: "design",
  questions: [
    { key: "what", label: "Qu'est-ce qu'on dessine ?", kind: "multi", required: true, options: ["Carte ou menu", "Menu du jour", "Flyer", "Affiche", "Logo et charte", "Visuels réseaux sociaux"], hint: "Coche tout ce que tu veux dans cette commande." },
    { key: "use", label: "Pour quel usage ?", kind: "multi", required: true, options: ["Salle", "Vitrine", "Réseaux sociaux", "Livraison et emporter", "Impression"], hint: "Le graphiste choisit les bons formats et la bonne définition." },
    { key: "charte", label: "As-tu déjà une charte graphique ?", kind: "choice", required: true, options: ["J'ai une charte", "Je n'ai rien choisi"], hint: "Logo, couleurs, polices. Rien choisi ? Le graphiste t'envoie un lien pour choisir couleurs, polices et modèle. Ce que tu choisis là t'engage." },
    { key: "languages", label: "Dans quelles langues ?", kind: "multi", required: true, options: ["Français", "Néerlandais", "Anglais"] },
    { key: "style", label: "Quel style ?", kind: "choice", required: true, options: ["Moderne", "Chaleureux", "Sobre", "Gourmand", "Authentique"] },
    { key: "likes", label: "Ce que tu aimes", kind: "text", required: true, minLength: 20, hint: "Donne des liens (ou joins des images à l'étape suivante) et dis pourquoi en une phrase pour chacun." },
    { key: "dislikes", label: "Ce que tu n'aimes pas", kind: "text", required: false, hint: "Pour chaque exemple, dis pourquoi en une phrase." },
    { key: "content", label: "Le contenu final", kind: "text", required: true, minLength: 30, hint: "Les plats et les prix, les horaires, l'adresse, les mentions : tout ce qui doit figurer." },
    { key: "content_final", label: "C'est la version finale du contenu", kind: "flag", required: true, hint: "Ajouter un plat après = demande de modification, que le graphiste chiffre." },
    { key: "deciders", label: "Qui décide avec toi ?", kind: "list", required: true, hint: "Associé, conjoint… Tous doivent avoir validé." },
    { key: "deciders_attested", label: "Tous ont validé ce brief", kind: "flag", required: true },
    { key: "budget_cents", label: "Budget", kind: "number", required: true },
    { key: "deadline", label: "Pour quand ?", kind: "date", required: true, hint: "Le jour où tu veux avoir le visuel. Le graphiste te dit dans son devis si c'est faisable." },
    { key: "notes", label: "Précisions", kind: "text", required: false },
    { key: "files", label: "Pièces jointes", kind: "files", required: false },
  ],
};

export const DESIGN_BRIEF_STEPS: readonly BriefStep[] = [
  { key: "quoi", title: "Qu'est-ce qu'on dessine ?", subtitle: "Un ou plusieurs supports, et à quoi ils servent.", keys: ["what", "use"] },
  { key: "style", title: "Ton style", subtitle: "Ta charte, tes langues, l'ambiance.", keys: ["charte", "languages", "style"] },
  { key: "gouts", title: "Ce que tu aimes, ce que tu n'aimes pas", subtitle: "Des exemples valent mieux qu'un long discours.", keys: ["likes", "dislikes"] },
  { key: "contenu", title: "Le contenu final", subtitle: "C'est la version finale : un plat ajouté après est une modification.", keys: ["content", "content_final"] },
  { key: "decideurs", title: "Qui décide ?", subtitle: "Une fois le brief envoyé, la décision est prise.", keys: ["deciders", "deciders_attested"] },
  { key: "budget", title: "Budget et délai", subtitle: "Juste un repère : tu ne paies rien maintenant.", keys: ["budget_cents", "deadline", "notes"] },
];

/**
 * Modèle impression (imprimeur) par défaut, d'après la maquette V4PrintBrief : produit, quantité, format, papier, finition,
 * fichier (prêt, ou « à faire faire » par un graphiste d'abord), QR code testé avant l'envoi, réception, au plus tard le.
 * Le bon à tirer (BAT) vient APRÈS le devis : voir lib/mission-print.ts.
 */
export const PRINT_TEMPLATE: BriefTemplate = {
  metier: "impression",
  questions: [
    { key: "product", label: "On imprime quoi ?", kind: "choice", required: true, options: ["Menus", "Flyers", "Affiches", "Banderoles", "Chevalets de table", "Sets de table", "Sacs et emballages", "Autocollants", "Cartes de visite"] },
    { key: "quantity", label: "Quelle quantité ?", kind: "choice", required: true, options: ["100", "250", "500", "1000", "Plus de 1000"], hint: "Plus de 1000 : dis le nombre exact dans les précisions." },
    { key: "size", label: "Quel format ?", kind: "choice", required: true, options: ["A6", "A5", "A4", "A3", "DL", "Autre format"], hint: "Autre format : dis les dimensions dans les précisions." },
    { key: "paper", label: "Quel papier ?", kind: "choice", required: true, options: ["Standard", "Épais", "Recyclé"] },
    { key: "finish", label: "Quelle finition ?", kind: "choice", required: true, options: ["Mat", "Brillant", "Pelliculé"] },
    { key: "file_state", label: "Ton fichier", kind: "choice", required: true, options: ["Prêt à imprimer", "À faire faire"], hint: "Prêt à imprimer : joins le PDF à la dernière étape. Pas de fichier ? Fais d'abord un brief avec un graphiste, puis reviens ici." },
    { key: "qr_url", label: "L'adresse du QR code", kind: "text", required: false, hint: "Si ton impression porte un QR code : colle l'adresse qu'il doit ouvrir, puis teste-la. L'imprimeur reteste le scan sur le bon à tirer." },
    { key: "qr_tested", label: "Le QR code est testé", kind: "flag", required: false },
    { key: "delivery_mode", label: "Comment reçois-tu l'impression ?", kind: "choice", required: true, options: ["Livraison au restaurant", "Retrait chez l'imprimeur"] },
    { key: "deadline", label: "Reçu au plus tard le", kind: "date", required: true, hint: "L'imprimeur confirme dans son devis si c'est faisable." },
    { key: "deciders", label: "Qui décide avec toi ?", kind: "list", required: true, hint: "Associé, conjoint… Tous doivent avoir validé." },
    { key: "deciders_attested", label: "Tous ont validé ce brief", kind: "flag", required: true },
    { key: "budget_cents", label: "Budget", kind: "number", required: true },
    { key: "notes", label: "Précisions", kind: "text", required: false },
    { key: "files", label: "Pièces jointes", kind: "files", required: false },
  ],
};

export const PRINT_BRIEF_STEPS: readonly BriefStep[] = [
  { key: "produit", title: "On imprime quoi ?", subtitle: "Le produit, la quantité et le format.", keys: ["product", "quantity", "size"] },
  { key: "papier", title: "Papier et finition", subtitle: "Le rendu entre tes mains.", keys: ["paper", "finish"] },
  { key: "fichier", title: "Ton fichier et ton QR code", subtitle: "Un QR code qui ne marche pas, ça coûte cher : teste-le maintenant.", keys: ["file_state", "qr_url", "qr_tested"] },
  { key: "reception", title: "Réception", subtitle: "Où et pour quand.", keys: ["delivery_mode", "deadline"] },
  { key: "decideurs", title: "Qui décide ?", subtitle: "Une fois le brief envoyé, la décision est prise.", keys: ["deciders", "deciders_attested"] },
  { key: "budget", title: "Budget et précisions", subtitle: "Juste un repère : tu ne paies rien maintenant.", keys: ["budget_cents", "notes"] },
];

/** Le modèle par défaut du code pour un métier (la base peut le remplacer). `null` : ce métier n'est pas encore ouvert. */
export function defaultTemplate(metier: BriefTemplate["metier"]): BriefTemplate | null {
  if (metier === "video") return VIDEO_TEMPLATE;
  if (metier === "photo") return PHOTO_TEMPLATE;
  if (metier === "design") return DESIGN_TEMPLATE;
  if (metier === "impression") return PRINT_TEMPLATE;
  return null;
}

/** Les écrans de l'assistant de brief d'un métier. */
export function stepsFor(metier: BriefTemplate["metier"]): readonly BriefStep[] {
  return metier === "photo" ? PHOTO_BRIEF_STEPS : metier === "design" ? DESIGN_BRIEF_STEPS : metier === "impression" ? PRINT_BRIEF_STEPS : VIDEO_BRIEF_STEPS;
}

// ── Validation ───────────────────────────────────────────────

/** Un tournage se prévoit au moins une semaine après le choix de la date (les étudiants ne travaillent pas toute la semaine). */
export const SHOOT_MIN_DAYS = 7;

export type BriefIssueCode = "missing" | "too_short" | "too_soon" | "deadline_too_soon" | "bad_url" | "needs_detail" | "past" | "bad_option" | "bad_phone" | "not_attested" | "budget_below_floor";
export type BriefIssue = { key: string; code: BriefIssueCode };
export type BriefWarning = { code: "ambition_vs_budget"; format: string };
export type BriefVerdict = { ok: boolean; issues: BriefIssue[]; warnings: BriefWarning[] };

/** Un visuel se prévoit au moins quelques jours à l'avance : le graphiste confirme ensuite si c'est faisable. */
export const DESIGN_MIN_DAYS = 5;
/** Les cases qui ENGAGENT : cochées, jamais « à remplir » (le message dit « coche cette case »). */
export const ATTESTATION_KEYS: readonly string[] = ["deciders_attested", "content_final", "qr_tested"];

/** Première date de livraison possible d'un visuel depuis le jour belge `today`. */
export function earliestDeadline(today: string): string {
  return addDays(today, DESIGN_MIN_DAYS);
}

/** Première date de tournage possible depuis le jour belge `today`. */
export function earliestShootDate(today: string): string {
  return addDays(today, SHOOT_MIN_DAYS);
}

const isBlank = (v: BriefAnswer): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export function phoneLooksValid(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Le brief peut-il être verrouillé et envoyé ?
 * Chaque refus a un code nommé (la trace : « briefs refusés par champ manquant »).
 */
export function validateBrief(answers: BriefAnswers, template: BriefTemplate, today: string, phase: BriefPhase = "brief"): BriefVerdict {
  const issues: BriefIssue[] = [];
  const warnings: BriefWarning[] = [];

  for (const q of template.questions) {
    if ((q.phase ?? "brief") !== phase) continue;
    const v = answers[q.key];

    if (q.kind === "flag") {
      if (q.required && v !== true) issues.push({ key: q.key, code: ATTESTATION_KEYS.includes(q.key) ? "not_attested" : "missing" });
      continue;
    }

    if (isBlank(v)) {
      if (q.required) issues.push({ key: q.key, code: "missing" });
      continue;
    }

    if (q.kind === "text" && typeof v === "string" && q.minLength && v.trim().length < q.minLength) {
      issues.push({ key: q.key, code: "too_short" });
    }
    if (q.kind === "choice" && q.options && typeof v === "string" && !q.options.includes(v)) {
      issues.push({ key: q.key, code: "bad_option" });
    }
    if (q.kind === "multi" && q.options && Array.isArray(v) && v.some((x) => !q.options!.includes(x))) {
      issues.push({ key: q.key, code: "bad_option" });
    }
    if (q.kind === "contact") {
      const c = v as { name?: string; phone?: string };
      if (!c || typeof c !== "object" || !c.name?.trim()) issues.push({ key: q.key, code: "missing" });
      else if (!c.phone || !phoneLooksValid(c.phone)) issues.push({ key: q.key, code: "bad_phone" });
    }
    if (q.kind === "date" && typeof v === "string") {
      if (v < today) issues.push({ key: q.key, code: "past" });
      else if (q.key === "shoot_date" && v < earliestShootDate(today)) issues.push({ key: q.key, code: "too_soon" });
      else if (q.key === "deadline" && v < earliestDeadline(today)) issues.push({ key: q.key, code: "deadline_too_soon" });
    }
  }

  if (phase !== "brief") return { ok: issues.length === 0, issues, warnings };

  // Impression : un QR code écrit doit être une adresse https admissible ET testée ; un format ou une quantité « hors liste » se précise.
  const qr = typeof answers.qr_url === "string" ? answers.qr_url.trim() : "";
  if (qr) {
    if (!judgeUrl(qr).ok) issues.push({ key: "qr_url", code: "bad_url" });
    else if (answers.qr_tested !== true) issues.push({ key: "qr_tested", code: "not_attested" });
  }
  const notes = typeof answers.notes === "string" ? answers.notes.trim() : "";
  if ((answers.quantity === "Plus de 1000" || answers.size === "Autre format") && notes.length < 10 && template.metier === "impression") issues.push({ key: "notes", code: "needs_detail" });

  const budget = answers.budget_cents;
  if (typeof budget === "number" && template.budgetFloorCents !== undefined && budget < template.budgetFloorCents) {
    issues.push({ key: "budget_cents", code: "budget_below_floor" });
  }
  const format = answers.format;
  if (typeof format === "string" && typeof budget === "number") {
    const needed = template.ambitionBudgetCents?.[format];
    if (needed !== undefined && budget < needed) warnings.push({ code: "ambition_vs_budget", format });
  }

  return { ok: issues.length === 0, issues, warnings };
}

// ── Créneaux conseillés ──────────────────────────────────────

export type SlotAdvice = "recommended" | "ok" | "discouraged";
export type ShootSlot = { start: string; end: string; tag: string; advice: SlotAdvice; darkWarning: boolean };

/** Samedi et dimanche : le rush du soir est le pire moment (« on tourne quand le restaurant est vide »). */
function isWeekend(dateISO: string): boolean {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** D'octobre à février, la lumière du jour a disparu avant 17 h : une scène de jour ne se tourne pas le soir. */
function isDarkSeason(dateISO: string): boolean {
  const m = Number(dateISO.slice(5, 7));
  return m >= 10 || m <= 2;
}

export function shootSlots(dateISO: string): ShootSlot[] {
  const base: Omit<ShootSlot, "darkWarning">[] = isWeekend(dateISO)
    ? [
        { start: "09:30", end: "11:30", tag: "Avant l'ouverture", advice: "recommended" },
        { start: "15:00", end: "17:00", tag: "Entre deux services", advice: "ok" },
        { start: "19:00", end: "21:00", tag: "Rush du week-end", advice: "discouraged" },
      ]
    : [
        { start: "09:30", end: "11:30", tag: "Avant le lunch", advice: "recommended" },
        { start: "14:30", end: "17:00", tag: "Entre lunch et dîner", advice: "recommended" },
        { start: "18:30", end: "20:30", tag: "Service du soir", advice: "discouraged" },
      ];
  const dark = isDarkSeason(dateISO);
  return base.map((s) => ({ ...s, darkWarning: dark && s.start >= "17:00" }));
}

// ── Rappels ──────────────────────────────────────────────────

export type ReminderKey = "j7" | "j2" | "veille";

/** Dates (jour belge) des rappels par mail : équipe prévenue, présence confirmée, récap. */
export function reminderDates(shootDate: string): { key: ReminderKey; date: string }[] {
  return [
    { key: "j7", date: addDays(shootDate, -7) },
    { key: "j2", date: addDays(shootDate, -2) },
    { key: "veille", date: addDays(shootDate, -1) },
  ];
}

// ── Remarques de retour ──────────────────────────────────────

export const VIDEO_NOTE_CATEGORIES = ["Cadrage", "Lumière", "Rythme", "Texte", "Son", "Couleurs", "Musique", "Autre"] as const;
export const PHOTO_NOTE_CATEGORIES = ["Cadrage", "Lumière", "Couleurs", "Retouche", "Sélection", "Texte", "Autre"] as const;
export const DESIGN_NOTE_CATEGORIES = ["Texte", "Prix", "Couleur", "Logo", "Photo", "Mise en page", "Autre"] as const;

const VAGUE = /^(je n'?aime pas|j'?aime pas|pas bien|bof|nul|à refaire|a refaire)[ .!]*$/i;
export const NOTE_MIN_LENGTH = 12;

export type NoteIssue = "no_category" | "empty" | "vague" | "too_short";

/** Une remarque de retour dit QUOI changer et POURQUOI — jamais « je n'aime pas » seul. */
export function checkRetouchNote(note: { category: string | null; text: string }, categories: readonly string[]): NoteIssue | null {
  const text = note.text.trim();
  if (!note.category || !categories.includes(note.category)) return "no_category";
  if (!text) return "empty";
  if (VAGUE.test(text)) return "vague";
  if (text.length < NOTE_MIN_LENGTH) return "too_short";
  return null;
}

/** Un tour de retours : au moins une remarque, toutes valables, envoyées EN UNE FOIS. */
export function checkRetouchRound(notes: { category: string | null; text: string }[], categories: readonly string[]): { ok: boolean; problems: { index: number; issue: NoteIssue }[]; empty: boolean } {
  const problems: { index: number; issue: NoteIssue }[] = [];
  notes.forEach((n, index) => {
    const issue = checkRetouchNote(n, categories);
    if (issue) problems.push({ index, issue });
  });
  const empty = notes.length === 0;
  return { ok: !empty && problems.length === 0, problems, empty };
}
