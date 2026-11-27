// ADR 0108 §6 — les alertes de Nina sur l'espace de commande : ce qui ne peut pas attendre, dit le jour même, avec ce qu'il y a à
// faire. Logique PURE et testée ; les lectures (commandes, refus) sont faites par la route, l'affichage par la console.
//
// Une alerte n'est PAS une idée (ADR 0105) : elle ne se « valide » pas, elle se règle. Chacune est fondée sur ce que le code
// enregistre déjà, jamais sur une supposition :
//  - une commande « reçue » que personne n'a passée à « prête » (le serveur ne sait pas qui l'a VUE : il sait qu'elle attend) ;
//  - une commande « prête » jamais retirée ni annulée (le client n'est pas venu, ou on a oublié de le dire : ses points en dépendent) ;
//  - des envois qui ont échoué et ouvert le secours WhatsApp (ADR 0107 §10) : ces commandes ne sont PAS enregistrées ;
//  - des refus en série : une panne de notre côté, ou des clients qui butent sur la carte (plat disparu, choix impossible) ;
//  - aucun horaire lisible (ADR 0109 §3) : la page ne prend alors aucune commande.
// Les seuils sont des défauts de produit, à recalibrer avec les premières commandes réelles (ADR 0065).

import type { HoursCause } from "./hours-source";
import { brusselsDay } from "./order";
import type { OrderView } from "./service";

/** Une commande « reçue » depuis plus de ce délai, sans être « prête », devient une alerte. */
export const WAITING_MINUTES = 10;
/** Une commande « prête » depuis plus de ce délai, sans être retirée ni annulée, devient une alerte. */
export const READY_FORGOTTEN_MINUTES = 120;
/** Les refus se comptent sur cette fenêtre glissante (pas « aujourd'hui » : un service finit après minuit). */
export const REFUSAL_WINDOW_HOURS = 12;
/** À partir de combien de refus de la même famille on prévient. */
export const REFUSAL_THRESHOLD = 3;

/** Les motifs de refus qui disent « le site a eu un souci » (panne, base, réseau de notre côté). */
export const OUTAGE_REASONS = ["indisponible"] as const;
/** Les motifs de refus qui disent « le client a buté sur la carte » (plat disparu, choix impossible, plafond). */
export const CARD_REASONS = ["plat_inconnu", "plat_indisponible", "choix_invalide", "plafond"] as const;
/** Le motif tracé quand la page propose le secours WhatsApp (lib/site-orders/rescue.ts). */
export const RESCUE_REASON = "secours_propose";

/** Le dernier client à ouvrir la page compte sur cette fenêtre : au-delà, on ne sait plus ce que la page montre. */
export const HOURS_VIEW_WINDOW_HOURS = 12;

const HOURS_CAUSES: readonly HoursCause[] = ["pas_de_fiche", "places_absent", "lecture_impossible", "sans_horaires"];
const UNKNOWN_VIEW = "fiche_vue_inconnu:";

/**
 * Pourquoi la page ne peut lire aucun horaire ; `null` si elle le peut, ou si rien ne le prouve. Sans appel à Google : la
 * console est relue toutes les trente secondes.
 */
export function hoursProblem(input: {
  /** Le restaurant a saisi une semaine : la page a toujours quelque chose à lire. */
  hasOwnHours: boolean;
  /** Ce qui se sait sans interroger Google : aucune fiche reliée, ou pas de clé. */
  staticCause: "pas_de_fiche" | "places_absent" | null;
  /** Le dernier compteur `fiche_vue_…` de la fenêtre. */
  lastView: string | null;
}): HoursCause | null {
  if (input.hasOwnHours) return null;
  if (input.staticCause) return input.staticCause;
  const cause = input.lastView?.startsWith(UNKNOWN_VIEW) ? input.lastView.slice(UNKNOWN_VIEW.length) : null;
  return HOURS_CAUSES.find((c) => c === cause) ?? null;
}

const HOURS_DETAIL: Record<HoursCause, string> = {
  pas_de_fiche: "Aucune fiche Google n'est reliée à ton restaurant.",
  places_absent: "La lecture de Google n'est pas branchée de notre côté.",
  lecture_impossible: "Google n'a pas répondu à la dernière visite.",
  sans_horaires: "Google ne donne pas d'horaires pour ton restaurant.",
};

export type AlertId = "horaires_illisibles" | "commande_en_attente" | "panne" | "commande_oubliee" | "secours_whatsapp" | "clients_bloques";

export type NinaAlert = {
  id: AlertId;
  /** « danger » = quelque chose est cassé ou un client attend ; « warn » = à regarder dans l'heure. */
  tone: "danger" | "warn";
  title: string;
  detail: string;
  /** Change quand l'alerte s'aggrave ou change d'objet : un « J'ai vu » ne vaut que pour la signature qu'il a vue. */
  signature: string;
  /** Là où l'alerte se règle, quand ce n'est pas sur la page des commandes. */
  link?: { href: string; label: string };
};

export type AlertInput = {
  orders: readonly OrderView[];
  /** Les refus des `REFUSAL_WINDOW_HOURS` dernières heures, comptés par motif (`site_order_refusals`). */
  refusals: Readonly<Record<string, number>>;
  /** Millisecondes. */
  now: number;
  /** Aucun horaire lisible (`hoursProblem`) et où le régler ; absent pour qui ne peut pas le régler. */
  hours?: { cause: HoursCause; href: string } | null;
};

const minutesSince = (iso: string, now: number): number => Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
const count = (refusals: Readonly<Record<string, number>>, reasons: readonly string[]): number => reasons.reduce((n, r) => n + Math.max(0, refusals[r] ?? 0), 0);

/** « N° 0147 (Amina), N° 0148 (Sofia) et 2 autres » : les trois plus anciennes, jamais une liste interminable. */
function nameOrders(orders: readonly OrderView[]): string {
  const shown = orders.slice(0, 3).map((o) => `N° ${o.number} (${o.firstName})`);
  const rest = orders.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}` : shown.join(", ");
}

/** Les alertes à montrer maintenant, les plus graves d'abord. Aucune alerte = rien à dire : la liste est vide, jamais un « tout va bien » inventé. */
export function computeAlerts({ orders, refusals, now, hours }: AlertInput): NinaAlert[] {
  const out: NinaAlert[] = [];

  if (hours) {
    out.push({
      id: "horaires_illisibles",
      tone: "danger",
      title: "Tes clients ne peuvent pas commander : horaires introuvables",
      detail: `${HOURS_DETAIL[hours.cause]} Saisis tes horaires dans « Infos de ma page ».`,
      // La page reste fermée tant que rien ne change : un « J'ai vu » ne vaut que pour la journée.
      signature: `${hours.cause}:${brusselsDay(new Date(now))}`,
      link: { href: hours.href, label: "Saisir mes horaires" },
    });
  }

  const waiting = orders.filter((o) => o.status === "recue" && minutesSince(o.createdAt, now) >= WAITING_MINUTES).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (waiting.length > 0) {
    const oldest = minutesSince(waiting[0].createdAt, now);
    out.push({
      id: "commande_en_attente",
      tone: "danger",
      title: waiting.length === 1 ? `Une commande attend depuis ${oldest} minutes` : `${waiting.length} commandes attendent depuis plus de ${WAITING_MINUTES} minutes`,
      detail: `${nameOrders(waiting)}. ${waiting.length === 1 ? "Le client attend" : "Les clients attendent"}. Passe ${waiting.length === 1 ? "la commande" : "les commandes"} en « prête », ou appelle ${waiting.length === 1 ? "le client" : "les clients"}.`,
      signature: waiting.map((o) => o.id).sort().join(","),
    });
  }

  const outages = count(refusals, OUTAGE_REASONS);
  if (outages >= REFUSAL_THRESHOLD) {
    out.push({
      id: "panne",
      tone: "danger",
      title: `${outages} commandes n'ont pas pu partir ces ${REFUSAL_WINDOW_HOURS} dernières heures`,
      detail: "Un souci de notre côté (base de données ou réseau) a empêché l'envoi. Si ça continue, préviens-nous.",
      signature: String(outages),
    });
  }

  const forgotten = orders
    .filter((o) => o.status === "prete" && minutesSince(o.readyAt ?? o.createdAt, now) >= READY_FORGOTTEN_MINUTES)
    .sort((a, b) => Date.parse(a.readyAt ?? a.createdAt) - Date.parse(b.readyAt ?? b.createdAt));
  if (forgotten.length > 0) {
    const one = forgotten.length === 1;
    out.push({
      id: "commande_oubliee",
      tone: "warn",
      title: one ? "Une commande est prête depuis plus de 2 heures" : `${forgotten.length} commandes sont prêtes depuis plus de 2 heures`,
      detail: `${nameOrders(forgotten)}. Le client est-il venu ? Marque-${one ? "la" : "les"} « retirée${one ? "" : "s"} » s'il a payé (ses points en dépendent), ou annule-${one ? "la" : "les"}.`,
      signature: forgotten.map((o) => o.id).sort().join(","),
    });
  }

  const rescues = count(refusals, [RESCUE_REASON]);
  if (rescues >= 1) {
    out.push({
      id: "secours_whatsapp",
      tone: "warn",
      title: rescues === 1 ? "Un envoi a échoué : le client a été invité à t'écrire sur WhatsApp" : `${rescues} envois ont échoué : les clients ont été invités à t'écrire sur WhatsApp`,
      detail: "Dans ce cas, rien n'est enregistré sur le site : ces commandes ne sont ni dans la liste ni dans les points. Regarde tes messages WhatsApp.",
      signature: String(rescues),
    });
  }

  const blocked = count(refusals, CARD_REASONS);
  if (blocked >= REFUSAL_THRESHOLD) {
    out.push({
      id: "clients_bloques",
      tone: "warn",
      title: `${blocked} commandes ont été refusées ces ${REFUSAL_WINDOW_HOURS} dernières heures`,
      detail: "Un plat n'est plus proposé, un choix est impossible ou la commande dépasse le plafond. Vérifie ta carte et tes options.",
      signature: String(blocked),
    });
  }

  // Les plus graves d'abord ; à gravité égale, l'ordre de déclaration ci-dessus (ce qui fait attendre un client avant le reste).
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));
}

/** La fenêtre de lecture des refus, en ISO, pour la requête. */
export const refusalsSince = (now: Date): string => new Date(now.getTime() - REFUSAL_WINDOW_HOURS * 3600 * 1000).toISOString();
