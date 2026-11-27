// ADR 0112 — pourquoi un article automatique n'est pas paru. Un code par motif (c'est la trace qu'on compte), une
// phrase lue par le restaurateur dans « Pas publiés ». PUR.

export const AUTO_REASONS = {
  un_par_jour: "Un article par jour au plus.",
  limite_semaine: "Trois articles par semaine au plus.",
  priorite: "Une autre occasion passait avant ce jour-là.",
  type_decoche: "Tu as décoché ce type d'occasion.",
  arret: "La publication automatique a été arrêtée.",
  refus: "Tu as dit de ne pas le publier.",
  espace_ferme: "Ton espace de commande était fermé.",
  ferme_ce_jour: "Tu es fermé à ce moment-là.",
  horaires_inconnus: "Tes horaires ne sont pas connus : ta page ne prend pas de commande.",
  horaires_illisibles: "Tes horaires n'ont pas pu être vérifiés.",
  infos_changees: "Ce que tu proposes a changé depuis le message.",
  controle: "Le contrôle des textes l'a refusé.",
  carte_illisible: "Ta carte n'a pas pu être lue.",
  plat_absent: "Un plat de l'article n'est plus proposé.",
  photo: "Un article avec une photo ne part pas tout seul : publie-le toi-même.",
  evenement_disparu: "L'événement n'est plus dans l'agenda à cette date et à cette heure.",
  evenement_annule: "L'événement est annulé.",
  agenda_perime: "L'agenda n'a pas pu être vérifié récemment.",
  match_change: "Le match est reporté, annulé ou déplacé.",
  meteo_change: "La prévision a changé.",
  meteo_indisponible: "La prévision n'a pas pu être vérifiée.",
  promo_finie: "La promo n'est plus active.",
  source_indisponible: "L'information n'a pas pu être vérifiée.",
  sans_adresse: "Aucune adresse e-mail pour te prévenir.",
  mail_non_parti: "Notre message pour te prévenir n'est pas parti.",
  mail_rebond: "Notre message pour te prévenir est revenu : l'adresse est en échec.",
  mail_non_confirme: "L'arrivée de notre message n'a pas été confirmée.",
  non_prevenu: "Tu n'as pas été prévenu la veille.",
  heure_passee: "L'heure de publication est passée.",
  brouillon_supprime: "L'article avait été supprimé.",
  masque: "Boosteats avait masqué cet article.",
  erreur: "Un souci de notre côté.",
} as const;

export type AutoReason = keyof typeof AUTO_REASONS;

export function reasonText(reason: string | null, detail: string | null): string {
  const base = reason && reason in AUTO_REASONS ? AUTO_REASONS[reason as AutoReason] : AUTO_REASONS.erreur;
  return detail ? `${base} ${detail}` : base;
}

/** La vérification n'a pas pu se faire : ce n'est pas un changement. */
export const UNVERIFIABLE: ReadonlySet<string> = new Set<AutoReason>(["source_indisponible", "meteo_indisponible", "horaires_inconnus", "horaires_illisibles"]);

/** Une occasion écartée pour ces raisons peut revenir si le restaurateur rallume, recoche ou rouvre avant son jour. */
export const REVIVABLE: ReadonlySet<string> = new Set<AutoReason>(["arret", "type_decoche", "ferme_ce_jour", "horaires_inconnus", "horaires_illisibles"]);
