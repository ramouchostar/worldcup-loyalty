// ============================================================
// Réserver un prestataire (ADR 0084 §3) — « les règles du jeu », écrites dans le produit et acceptées par case à cocher.
//
// Deux jeux de règles, chacun dans les mots de celui qui les lit : le RESTAURATEUR les accepte à chaque brief qu'il envoie
// (il s'engage mission par mission), le PRESTATAIRE une fois par version, avant son premier devis. Le texte porte une VERSION :
// tout changement de texte change la version, et l'acceptation garde laquelle (qui, quand). Un test épingle l'empreinte du
// texte : on ne peut pas modifier une règle sans le dire. Fonctions PURES, importables par le navigateur.
//
// Brouillon à faire relire par un juriste (contrat-cadre et conditions générales, ADR 0084 §9) avant l'ouverture au public.
// ============================================================

export const RULES_VERSION = "2026-10-14";

import type { Metier } from "./mission-money";

export type Rule = { title: string; text: string };
export type RulesAudience = "restaurant" | "provider";

export const RESTAURANT_RULES: readonly Rule[] = [
  { title: "Ton brief est verrouillé", text: "Une fois envoyé, le brief ne bouge plus. Tout changement ensuite est une demande de modification : le prestataire la chiffre ou la refuse, et tu acceptes ou non son supplément." },
  { title: "Le devis est ferme", text: "Le prestataire chiffre la durée et le prix d'après ton brief. Son prix est ferme pour ce brief : s'il a sous-estimé, c'est son risque, pas le tien." },
  { title: "Tu cadres, il propose", text: "Après la date bloquée, il te propose 2 ou 3 idées de tournage ; tu en choisis une et c'est verrouillé. Sans réponse de ta part, sa première idée est retenue d'office deux jours avant le tournage." },
  { title: "Tous tes décideurs ont validé", text: "Tu as déclaré qui décide avec toi (associé, conjoint…). Une décision que tu prends engage tous les décideurs : on ne revient pas dessus parce que l'un d'eux n'était pas d'accord." },
  { title: "Un seul contact sur place", text: "Tu nommes une seule personne, joignable le jour du tournage. Elle parle au prestataire ; personne d'autre ne s'interpose." },
  { title: "Ton équipe est prévenue à l'avance", text: "La date est choisie au moins 7 jours à l'avance et tu préviens ton équipe au plus tard 7 jours avant le tournage : uniforme propre, plats prêts et bien remplis, salle et cuisine rangées." },
  { title: "Deux tours de retours", text: "Après la livraison, tu as deux tours de retours inclus. Chaque tour est un seul envoi avec toutes tes remarques, chacune classée et expliquée (« je n'aime pas » seul est refusé). Une retouche n'est pas une refonte." },
  { title: "Sans réponse, la livraison est validée", text: "Si tu ne réponds pas après une livraison, deux rappels partent ; au bout de 7 jours, elle est validée automatiquement." },
  { title: "La date est liante", text: "Annuler plus de 7 jours avant le tournage est gratuit. Entre 7 jours et 48 heures avant, la moitié du prix est due au prestataire. À moins de 48 heures, ou si tu n'es pas là, tout est dû." },
  { title: "Un acompte confirme la réservation", text: "À l'acceptation du devis, un acompte d'au moins 20 % confirme la réservation ; le solde est dû à la livraison." },
  { title: "En cas de désaccord, Boosteats tranche", text: "Boosteats examine le brief, le devis, le compte-rendu du tournage et les livraisons, puis décide : payer le prestataire, te rembourser ou partager. La décision est définitive." },
];

export const PROVIDER_RULES: readonly Rule[] = [
  { title: "Le brief est verrouillé, ton devis est ferme", text: "Tu chiffres la durée et le prix d'après le brief que tu reçois. Ton devis est ferme pour ce brief : si tu sous-estimes, c'est ton risque. Un changement demandé ensuite est une demande de modification que tu chiffres (un supplément, parfois nul) ou refuses, avec ta raison." },
  { title: "Le restaurateur cadre, tu proposes", text: "Une fois la date bloquée, tu déposes 2 ou 3 idées de tournage au plus tard 4 jours avant (la première est ta recommandation). Il en choisit une ; sans réponse de sa part, la première est retenue d'office." },
  { title: "Ta date t'engage", text: "Une date acceptée est bloquée dans ton calendrier et dans le sien. Tu confirmes ta présence 2 jours avant. Annuler plus de 7 jours avant est sans suite ; entre 7 jours et 48 heures, c'est un avertissement ; à moins de 48 heures ou en cas d'absence, une pénalité (visibilité réduite, puis exclusion en cas de récidive). Le restaurateur est remboursé." },
  { title: "Le compte-rendu du tournage fait foi", text: "Le jour du tournage, tu notes ton heure d'arrivée, ton heure de fin et ce qui a manqué. Le restaurateur le confirme ou le conteste ; c'est la pièce de référence en cas de litige." },
  { title: "Deux tours de retours, en un seul envoi chacun", text: "Après ta livraison, le restaurateur a deux tours de retours. Chaque tour regroupe toutes ses remarques, classées et expliquées. Une retouche corrige ce qui a été demandé ; elle ne refait pas le projet." },
  { title: "Tu livres par liens de téléchargement", text: "Tu livres avec des liens https (WeTransfer, Drive…), pas des fichiers. Le restaurateur a 7 jours pour répondre ; sans réponse, la livraison est validée automatiquement et tu es payé." },
  { title: "Droits à l'image des figurants", text: "Si des figurants apparaissent, c'est toi qui prépares leurs droits à l'image. Les clients en salle sont floutés." },
  { title: "Tu es payé après la validation", text: "Ton paiement est versé une fois la livraison validée (par le restaurateur ou automatiquement), pour le prix de ton devis moins la commission de Boosteats, affichée sur chaque devis avant que tu l'envoies." },
  { title: "En cas de désaccord, Boosteats tranche", text: "Boosteats examine le brief, le devis, le compte-rendu du tournage et les livraisons, puis décide : te payer, rembourser le restaurateur ou partager. La décision est définitive. Tant qu'une médiation est ouverte, rien n'est versé." },
];

// ── Les métiers d'atelier (design, impression) : pas de tournage, d'équipe ni de date liante ──

/** Le texte des règles d'atelier a sa propre version : modifier celles du tournage n'oblige personne à relire celles-ci. */
export const STUDIO_RULES_VERSION = "2026-10-19";

export const STUDIO_RESTAURANT_RULES: readonly Rule[] = [
  { title: "Ton brief est verrouillé", text: "Une fois envoyé, le brief ne bouge plus. Tout changement ensuite est une demande de modification : le prestataire la chiffre ou la refuse, et tu acceptes ou non son supplément." },
  { title: "Le devis est ferme", text: "Le prestataire chiffre le travail d'après ton brief. Son prix est ferme pour ce brief : s'il a sous-estimé, c'est son risque, pas le tien." },
  { title: "Le contenu est final", text: "Tu confirmes que le contenu (plats, prix, horaires, mentions) est celui qui doit figurer. Ajouter ou changer un plat ensuite est une demande de modification, que le prestataire chiffre." },
  { title: "Tous tes décideurs ont validé", text: "Tu as déclaré qui décide avec toi (associé, conjoint…). Une décision que tu prends engage tous les décideurs : on ne revient pas dessus parce que l'un d'eux n'était pas d'accord." },
  { title: "Deux tours de retours", text: "Après la livraison, tu as deux tours de retours inclus. Chaque tour est un seul envoi avec toutes tes remarques, chacune classée et expliquée (« je n'aime pas » seul est refusé). Une retouche n'est pas une refonte." },
  { title: "Sans réponse, la livraison est validée", text: "Si tu ne réponds pas après une livraison, deux rappels partent ; au bout de 7 jours, elle est validée automatiquement." },
  { title: "Tu peux annuler tant que le travail n'a pas commencé", text: "Tant que le prestataire n'a pas commencé, l'annulation est gratuite. Une fois le travail commencé, l'acompte reste au prestataire et le reste t'est rendu." },
  { title: "Un acompte confirme la réservation", text: "À l'acceptation du devis, un acompte d'au moins 20 % confirme la réservation ; le solde est dû à la livraison." },
  { title: "En cas de désaccord, Boosteats tranche", text: "Boosteats examine le brief, le devis et les livraisons, puis décide : payer le prestataire, te rembourser ou partager. La décision est définitive." },
];

export const STUDIO_PROVIDER_RULES: readonly Rule[] = [
  { title: "Le brief est verrouillé, ton devis est ferme", text: "Tu chiffres le travail et le délai d'après le brief que tu reçois. Ton devis est ferme pour ce brief : si tu sous-estimes, c'est ton risque. Un changement demandé ensuite est une demande de modification que tu chiffres (un supplément, parfois nul) ou refuses, avec ta raison." },
  { title: "Tu dis quand tu commences", text: "Touche « Je commence » quand tu démarres. Avant, le restaurateur peut annuler sans frais ; après, ton acompte te reste acquis. Si tu annules après avoir commencé, le restaurateur est remboursé en entier et tu reçois un avertissement." },
  { title: "Le jour souhaité est dit dans le brief", text: "Le restaurateur indique pour quand il veut son travail. Si tu ne peux pas le tenir, dis-le dans ton devis avec ton vrai délai de livraison : tu t'engages sur ce que tu écris." },
  { title: "Deux tours de retours, en un seul envoi chacun", text: "Après ta livraison, le restaurateur a deux tours de retours. Chaque tour regroupe toutes ses remarques, classées et expliquées. Une retouche corrige ce qui a été demandé ; elle ne refait pas le projet." },
  { title: "Tu livres par liens de téléchargement", text: "Tu livres avec des liens https (WeTransfer, Drive…), pas des fichiers. Le restaurateur a 7 jours pour répondre ; sans réponse, la livraison est validée automatiquement et tu es payé." },
  { title: "Tu livres un travail dont tu as les droits", text: "Images, polices, illustrations : tu n'utilises que ce dont tu détiens les droits, et le restaurateur peut utiliser ce que tu livres pour son restaurant." },
  { title: "Tu es payé après la validation", text: "Ton paiement est versé une fois la livraison validée (par le restaurateur ou automatiquement), pour le prix de ton devis moins la commission de Boosteats, affichée sur chaque devis avant que tu l'envoies." },
  { title: "En cas de désaccord, Boosteats tranche", text: "Boosteats examine le brief, le devis et les livraisons, puis décide : te payer, rembourser le restaurateur ou partager. La décision est définitive. Tant qu'une médiation est ouverte, rien n'est versé." },
];

export const RULES: Record<RulesAudience, readonly Rule[]> = { restaurant: RESTAURANT_RULES, provider: PROVIDER_RULES };

// ── L'impression : les règles d'atelier, plus le bon à tirer ──

/** Le texte des règles d'impression a sa propre version (le bon à tirer n'existe qu'ici). */
export const PRINT_RULES_VERSION = "2026-10-20";

const BAT_RESTAURANT_RULE: Rule = { title: "Le bon à tirer fait foi", text: "L'imprimeur t'envoie une épreuve : tu la vérifies point par point, puis tu la signes, ou tu demandes des corrections (deux tours, chacun en un seul envoi). Une fois signée, c'est exactement ce qui sera imprimé : tu ne peux plus annuler, et une erreur visible sur le bon à tirer n'est pas réimprimée gratuitement. Le solde est dû à la signature." };
const BAT_PROVIDER_RULE: Rule = { title: "Le bon à tirer fait foi", text: "Tu envoies une épreuve au restaurateur ; il la signe ou demande des corrections (deux tours, chacun en un seul envoi). Tu n'imprimes qu'après la signature, et ce que tu imprimes doit correspondre au bon à tirer signé. Tu reteste le QR code sur l'épreuve avant de l'envoyer. Une erreur visible sur un bon à tirer signé n'est pas à ta charge." };

// Les règles d'atelier, avec la règle d'annulation remplacée (le bon à tirer signé ferme l'annulation) et la règle du bon à tirer en plus.
export const PRINT_RESTAURANT_RULES: readonly Rule[] = [
  ...STUDIO_RESTAURANT_RULES.filter((r) => r.title !== "Deux tours de retours" && r.title !== "Tu peux annuler tant que le travail n'a pas commencé"),
  BAT_RESTAURANT_RULE,
  { title: "Tu peux annuler jusqu'à la signature", text: "Tant que l'imprimeur n'a pas commencé, l'annulation est gratuite. Une fois commencé, l'acompte lui reste et le reste t'est rendu. Après la signature du bon à tirer, on n'annule plus." },
];

export const PRINT_PROVIDER_RULES: readonly Rule[] = [
  ...STUDIO_PROVIDER_RULES.filter((r) => r.title !== "Deux tours de retours, en un seul envoi chacun" && r.title !== "Tu dis quand tu commences"),
  BAT_PROVIDER_RULE,
  { title: "Tu dis quand tu commences", text: "Touche « Je commence » quand tu démarres l'épreuve. Avant, le restaurateur peut annuler sans frais ; après, ton acompte te reste acquis, jusqu'à la signature du bon à tirer, après laquelle plus personne n'annule. Si tu annules après avoir commencé, le restaurateur est remboursé en entier et tu reçois un avertissement." },
];

export type RulesKind = "tournage" | "atelier" | "impression";

export const rulesKindOf = (m: Metier): RulesKind => (m === "impression" ? "impression" : m === "design" ? "atelier" : "tournage");

/** Les règles d'un type de mission, pour un côté. */
export function rulesFor(audience: RulesAudience, kind: RulesKind): readonly Rule[] {
  if (kind === "impression") return audience === "restaurant" ? PRINT_RESTAURANT_RULES : PRINT_PROVIDER_RULES;
  if (kind === "atelier") return audience === "restaurant" ? STUDIO_RESTAURANT_RULES : STUDIO_PROVIDER_RULES;
  return RULES[audience];
}

export const rulesVersionFor = (kind: RulesKind): string => (kind === "impression" ? PRINT_RULES_VERSION : kind === "atelier" ? STUDIO_RULES_VERSION : RULES_VERSION);

/** L'empreinte du texte des règles d'impression (voir `rulesFingerprint`). */
export function printRulesFingerprint(): string {
  return fnv(JSON.stringify({ version: PRINT_RULES_VERSION, restaurant: PRINT_RESTAURANT_RULES, provider: PRINT_PROVIDER_RULES }));
}

/** Toutes les versions en vigueur (le prestataire peut accepter l'une ou l'autre). */
export const CURRENT_RULES_VERSIONS: readonly string[] = [RULES_VERSION, STUDIO_RULES_VERSION, PRINT_RULES_VERSION];

export const RULES_ACCEPT_LABEL: Record<RulesAudience, string> = {
  restaurant: "J'ai lu les règles et je les accepte pour ce brief.",
  provider: "J'ai lu les règles et je les accepte.",
};

/** L'empreinte du texte (sans dépendance : FNV-1a 32 bits) : un test l'épingle, pour qu'on ne change pas une règle sans changer la version. */
export function rulesFingerprint(): string {
  return fnv(JSON.stringify({ version: RULES_VERSION, restaurant: RESTAURANT_RULES, provider: PROVIDER_RULES }));
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** L'empreinte du texte des règles d'atelier (voir `rulesFingerprint`). */
export function studioRulesFingerprint(): string {
  return fnv(JSON.stringify({ version: STUDIO_RULES_VERSION, restaurant: STUDIO_RESTAURANT_RULES, provider: STUDIO_PROVIDER_RULES }));
}

export type RulesAcceptance = { accepted: true; version: string };

/** Ce que le réseau envoie : « j'accepte » ET la version qu'on lui a montrée. Une autre version, ou rien : refusé. */
export function readAcceptance(raw: unknown, version: string = RULES_VERSION): { ok: true; acceptance: RulesAcceptance } | { ok: false; reason: "not_accepted" | "outdated" } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (o.accepted !== true) return { ok: false, reason: "not_accepted" };
  if (o.version !== version) return { ok: false, reason: "outdated" };
  return { ok: true, acceptance: { accepted: true, version } };
}

export const RULES_REFUSAL_TEXT = {
  not_accepted: "Coche la case pour accepter les règles.",
  outdated: "Les règles ont changé : recharge la page et relis-les avant de les accepter.",
} as const;
