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

export const RULES: Record<RulesAudience, readonly Rule[]> = { restaurant: RESTAURANT_RULES, provider: PROVIDER_RULES };

export const RULES_ACCEPT_LABEL: Record<RulesAudience, string> = {
  restaurant: "J'ai lu les règles et je les accepte pour ce brief.",
  provider: "J'ai lu les règles et je les accepte.",
};

/** L'empreinte du texte (sans dépendance : FNV-1a 32 bits) : un test l'épingle, pour qu'on ne change pas une règle sans changer la version. */
export function rulesFingerprint(): string {
  const text = JSON.stringify({ version: RULES_VERSION, restaurant: RESTAURANT_RULES, provider: PROVIDER_RULES });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type RulesAcceptance = { accepted: true; version: string };

/** Ce que le réseau envoie : « j'accepte » ET la version qu'on lui a montrée. Une autre version, ou rien : refusé. */
export function readAcceptance(raw: unknown): { ok: true; acceptance: RulesAcceptance } | { ok: false; reason: "not_accepted" | "outdated" } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (o.accepted !== true) return { ok: false, reason: "not_accepted" };
  if (o.version !== RULES_VERSION) return { ok: false, reason: "outdated" };
  return { ok: true, acceptance: { accepted: true, version: RULES_VERSION } };
}

export const RULES_REFUSAL_TEXT = {
  not_accepted: "Coche la case pour accepter les règles.",
  outdated: "Les règles ont changé : recharge la page et relis-les avant de les accepter.",
} as const;
