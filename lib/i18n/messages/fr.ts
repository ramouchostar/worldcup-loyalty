// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — les textes en FRANÇAIS : la langue de référence.
//
// Une clé = un texte. Le néerlandais (nl.ts) et l'anglais (en.ts) sont typés `Messages` : une clé qui manque dans l'une des deux
// fait échouer `npm run type-check`. Le pluriel se fait avec deux clés `…​.one` et `…​.other` (voir `tp`). Les `{variables}` doivent être
// IDENTIQUES dans les trois langues (un test le vérifie). Tutoiement partout (« tu » / « je » / « you »).
// ============================================================

import { frMission } from "./fr-mission";

export const frBase = {
  // ── Coque de l'espace prestataire ──────────────────────────
  "shell.brand": "Boosteats · espace prestataire",
  "shell.logout": "Déconnexion",
  "shell.nav.label": "Espace prestataire",
  "nav.missions": "Missions",
  "nav.revenue": "Revenus",
  "nav.profile": "Profil",
  "nav.availability": "Disponibilités",
  "lang.label": "Langue",
  "lang.error": "Impossible de changer de langue pour le moment.",

  // ── Métiers ────────────────────────────────────────────────
  "metier.video": "Vidéo",
  "metier.photo": "Photo",
  "metier.design": "Design",
  "metier.impression": "Impression",

  // ── États d'une mission, vus par le prestataire ────────────
  "status.provider.brief": "Brouillon du restaurateur",
  "status.provider.envoye": "À chiffrer",
  "status.provider.devis": "Devis envoyé",
  "status.provider.accepte": "Devis accepté",
  "status.provider.date_bloquee": "Date réservée",
  "status.provider.production": "En cours",
  "status.provider.livre": "Livré",
  "status.provider.retouche": "Retouche à faire",
  "status.provider.valide": "Validé",
  "status.provider.verse": "Payé",
  "status.provider.annule": "Annulé",
  "status.provider.litige": "En médiation",
  "status.provider.suspendu": "En attente du paiement",

  // ── Boîte de réception ─────────────────────────────────────
  "inbox.title": "Mes missions",
  "inbox.subtitle": "Un brief complet, un devis ferme. Lis, chiffre, fixe ta date.",
  "inbox.availabilityButton": "Mes disponibilités",
  "inbox.notOpen.title": "Le service n'est pas encore ouvert",
  "inbox.notOpen.body": "Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.",
  "inbox.empty.title": "Aucun brief pour l'instant",
  "inbox.empty.body": "Dès qu'un restaurateur t'envoie un brief, il apparaît ici et tu reçois un e-mail.",
  "inbox.section.toQuote": "À chiffrer",
  "inbox.section.toQuote.empty": "Rien à chiffrer : tu es à jour.",
  "inbox.section.active": "En cours",
  "inbox.section.done": "Terminées",
  "inbox.unread.one": "{n} message",
  "inbox.unread.other": "{n} messages",

  // ── Revenus ────────────────────────────────────────────────
  "revenue.title": "Mes revenus",
  "revenue.back": "Mes missions",
  "revenue.note": "Tu es payé après la validation de ta livraison (par le restaurateur, ou automatiquement au bout de 7 jours). Pendant la phase pilote, Boosteats te verse le montant par virement.",
  "revenue.unavailable.title": "Tes revenus ne sont pas encore disponibles",
  "revenue.unavailable.body": "Rien ne cloche chez toi : on finit de mettre l'écran en place. Reviens bientôt.",
  "revenue.tile.toPay": "À verser",
  "revenue.tile.toPay.hint": "Livraison validée, virement à venir",
  "revenue.tile.paidMonth": "Versé ce mois-ci",
  "revenue.tile.paidMonth.hint": "{total} au total",
  "revenue.tile.upcoming": "À venir",
  "revenue.tile.upcoming.hint": "Missions en cours",
  "revenue.tile.hold": "En attente d'une décision",
  "revenue.tile.hold.hint": "Médiation ou annulation à régler",
  "revenue.detail": "Détail par mission",
  "revenue.empty.title": "Aucun revenu pour l'instant",
  "revenue.empty.body": "Dès qu'un devis est accepté, la mission apparaît ici avec ce que tu recevras.",
  "revenue.row.quote": "prix du devis {price}",
  "revenue.row.youReceive": "tu reçois",
  "revenue.bucket.upcoming": "À venir",
  "revenue.bucket.on_hold": "En médiation : rien n'est versé",
  "revenue.bucket.to_pay": "Validée : à verser",
  "revenue.bucket.paid": "Versé",
  "revenue.bucket.cancel_due": "Annulée : ta part est due",
  "revenue.bucket.cancel_paid": "Annulée : ta part est versée",

  // ── Disponibilités ─────────────────────────────────────────
  "avail.title": "Mes disponibilités",
  "avail.subtitle": "Touche les jours où tu n'es PAS libre. Les restaurateurs ne voient que tes jours libres, au moins 7 jours à l'avance.",
  "avail.back": "Mes missions",
  "avail.unavailable.title": "Le calendrier n'est pas encore disponible",
  "avail.unavailable.body": "Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.",
  "avail.calendar": "Calendrier",
  "avail.state.free": "libre",
  "avail.state.unavailable": "bloqué",
  "avail.state.booked": "déjà réservé par un restaurateur",
  "avail.state.past": "passé",
  "avail.legend": "Légende",
  "avail.legend.free": "libre",
  "avail.legend.blocked": "bloqué par toi",
  "avail.legend.booked": "réservé par un restaurateur (non modifiable)",
  "avail.saving": "Enregistrement…",
  "avail.nothing": "Rien à enregistrer",
  "avail.save": "Enregistrer ({blocked}, {freed})",
  "avail.blocked.one": "{n} bloqué",
  "avail.blocked.other": "{n} bloqués",
  "avail.freed.one": "{n} libéré",
  "avail.freed.other": "{n} libérés",
  "avail.saved": "Calendrier enregistré.",
  "avail.savedExcept.one": "Enregistré, sauf {n} jour déjà réservé par un restaurateur.",
  "avail.savedExcept.other": "Enregistré, sauf {n} jours déjà réservés par un restaurateur.",
} as const;

export const fr = { ...frBase, ...frMission } as const;

export type MessageKey = keyof typeof fr;
export type Messages = Record<MessageKey, string>;
