// ADR 0100 §9 — le ticket de cuisine : ce que le cuisinier lit, un ticket par coin de la cuisine. Logique PURE (rien n'est
// imprimé ici : il n'existe ni commande du site ni imprimante, ADR 0099 §5). Le même contenu servira à l'écran, au
// ticket papier et à l'export du jour.
//
// Règles qui ne bougent pas :
//  - le prénom du client est écrit EN GRAND sur chaque ticket : c'est ce qui évite de mélanger deux commandes ;
//  - un retrait se lit « SANS SALADE », jamais « SANS » seul (le cuisinier ne comprendrait pas) ;
//  - un plat sans coin choisi va au ticket « CUISINE » : jamais perdu ;
//  - le ticket de caisse montre tout et la somme à payer ; les tickets de coin n'ont pas de prix.

import type { Family } from "./families";
import type { SelectionLine } from "./types";

export const MAX_ZONE = 30;
export const MAX_ZONES = 8;
export const DEFAULT_ZONE = "Cuisine";

/** Un nom de coin de cuisine propre : espaces repliés, sans balise, 30 lettres au plus ; vide = pas de coin. */
export function cleanZone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_ZONE).trim();
  return t === "" ? null : t;
}

/**
 * Le coin que nous proposons d'après la famille du plat. Une proposition, jamais un fait : le restaurateur connaît sa
 * cuisine. Ce qui ne passe pas par la cuisine (boissons, desserts, sauces) va au comptoir ; une famille inconnue n'a pas de coin.
 */
const ZONE_OF: Partial<Record<Family, string>> = {
  pizza: "Pizza", pates: "Pâtes",
  mitraillette: "Grill", durum: "Grill", pain_turc: "Grill", kapsalon: "Grill", tacos: "Grill", burger: "Grill", panini: "Grill",
  sandwich: "Grill", wrap: "Grill", poulet_frit: "Grill", assiette: "Grill", snack_friture: "Grill", wok: "Grill", curry: "Grill",
  boisson: "Comptoir", dessert: "Comptoir", sauce: "Comptoir",
};

export const suggestZone = (family: Family): string | null => ZONE_OF[family] ?? null;

export function suggestZones(families: Record<string, Family>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(families).map(([id, f]) => [id, suggestZone(f)]));
}

/** Les coins distincts utilisés, dans l'ordre d'apparition (au plus MAX_ZONES). */
export function distinctZones(zones: Iterable<string | null>): string[] {
  const out: string[] = [];
  for (const z of zones) if (z !== null && !out.includes(z)) out.push(z);
  return out.slice(0, MAX_ZONES);
}

// ─── Le ticket ───────────────────────────────────────────────────────────────

/** Une ligne de commande. `cents` = prix de la ligne, suppléments et quantité compris. */
export type TicketLine = { name: string; qty: number; zone: string | null; cents: number; details: SelectionLine[] };
export type TicketOrder = { number: string; firstName: string; pickup: string; lines: TicketLine[] };
export type TicketOptions = { split: boolean; cashier: boolean };

export type TicketText = {
  qty: number;
  /** En capitales : lu de loin, au feu. */
  name: string;
  /** « Sauces : Samouraï, Ketchup », « + 2× FROMAGE »… */
  details: string[];
  /** « SANS SALADE » : toujours le mot ET l'ingrédient. */
  without: string[];
};

export type Ticket = {
  title: string;
  zone: string | null;
  /** Écrit en très grand. */
  firstName: string;
  meta: string;
  lines: TicketText[];
  /** `null` = pas de prix sur ce ticket (tickets de coin). */
  totalCents: number | null;
};

/** Le prénom tel qu'on l'imprime : sans balise ni caractère de commande, 24 lettres au plus, « CLIENT » à défaut. */
export function cleanFirstName(raw: unknown): string {
  const t = typeof raw === "string" ? raw.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 24).trim() : "";
  return t === "" ? "CLIENT" : t;
}

const caps = (s: string) => s.toLocaleUpperCase("fr-BE");

/**
 * Un supplément « Oui » (réponse à « Ajouter des frites ? ») ne se lit pas sur un ticket : on écrit ce qu'on ajoute, tiré de
 * la question (« FRITES »). Tout autre nom de choix est écrit tel quel.
 */
function extraLabel(d: SelectionLine): string {
  const name = d.name.trim();
  if (!/^oui$/i.test(name)) return name;
  const what = d.group.replace(/\s*\?\s*$/, "").replace(/^(?:ajouter\s+)?(?:des|du|de la|de l'|d'|un|une)\s+/i, "").replace(/^ajouter\s+/i, "").trim();
  return what === "" || /^ajouter$/i.test(what) ? name : what;
}

/** Les lignes lisibles d'une sélection → ce que le cuisinier lit. Les groupes « inclus » se regroupent par liste de choix. */
export function textOf(line: TicketLine): TicketText {
  const without: string[] = [];
  const extras: string[] = [];
  const groups: { title: string; names: string[] }[] = [];
  for (const d of line.details) {
    const label = d.qty > 1 ? `${d.name} ×${d.qty}` : d.name;
    if (d.kind === "sans") {
      if (d.name.trim() !== "") without.push(`SANS ${caps(d.name.trim())}`);
    } else if (d.kind === "extra") {
      extras.push(`+ ${d.qty > 1 ? `${d.qty}× ` : ""}${caps(extraLabel(d))}`);
    } else {
      const g = groups.find((x) => x.title === d.group);
      if (g) g.names.push(label);
      else groups.push({ title: d.group, names: [label] });
    }
  }
  return {
    qty: Math.max(1, Math.floor(line.qty) || 1),
    name: caps(line.name),
    details: [...groups.map((g) => `${g.title} : ${g.names.join(", ")}`), ...extras],
    without,
  };
}

const sum = (lines: TicketLine[]) => lines.reduce((n, l) => n + Math.max(0, Math.round(l.cents)), 0);

/**
 * Les tickets d'une commande. Sans découpage : un seul ticket « CUISINE » avec la somme à payer. Avec découpage : un
 * ticket par coin utilisé (sans prix), « TICKET 1/3 · PIZZA »…, et si on le veut un ticket « CAISSE · TOUT » avec le prix.
 * Un plat sans coin va au ticket « CUISINE » : il n'est jamais perdu.
 */
export function buildTickets(order: TicketOrder, opts: TicketOptions): Ticket[] {
  const firstName = cleanFirstName(order.firstName);
  const number = order.number.replace(/[<>\u0000-\u001f]/g, "").trim() || "—";
  const pickup = order.pickup.replace(/[<>\u0000-\u001f]/g, "").trim();
  const meta = `N° ${number}${pickup ? ` · retrait ${pickup}` : ""}`;
  const make = (title: string, zone: string | null, lines: TicketLine[], withPrice: boolean): Ticket => ({
    title, zone, firstName, meta, lines: lines.map(textOf), totalCents: withPrice ? sum(lines) : null,
  });

  if (order.lines.length === 0) return [];
  if (!opts.split) return [make(DEFAULT_ZONE.toUpperCase(), null, order.lines, true)];

  const zoneOf = (l: TicketLine) => l.zone ?? DEFAULT_ZONE;
  const zones = distinctZones(order.lines.map(zoneOf));
  const out = zones.map((z, i) => make(`TICKET ${i + 1}/${zones.length} · ${caps(z)}`, z, order.lines.filter((l) => zoneOf(l) === z), false));
  // Plus de MAX_ZONES coins : les plats du reste vont au dernier ticket plutôt que de disparaître.
  const known = new Set(zones);
  const rest = order.lines.filter((l) => !known.has(zoneOf(l)));
  if (rest.length > 0 && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, lines: [...last.lines, ...rest.map(textOf)] };
  }
  if (opts.cashier) out.push(make("CAISSE · TOUT", null, order.lines, true));
  return out;
}

// ─── L'exemple de l'écran : bâti sur les vrais choix du restaurateur ────────

/** Ce qu'il faut d'un groupe du brouillon pour en tirer un exemple : rien d'autre que ce que l'éditeur sait déjà. */
export type SampleGroup = { title: string; kind: "inclus" | "variante" | "extra" | "retrait"; choices: { name: string; isDefault: boolean; keep: boolean }[] };

/**
 * Un exemple de choix d'après les groupes réglés du plat : le premier choix d'une liste obligatoire ou gratuite, le
 * premier supplément, et un « sans » (le premier retrait, ou le premier choix coché d'office qu'on décoche). Jamais
 * un choix que le restaurateur a décoché. Sert l'aperçu « Ce que le cuisinier reçoit », rien d'autre.
 */
export function sampleSelection(groups: SampleGroup[]): SelectionLine[] {
  const lines: SelectionLine[] = [];
  let sans = false;
  for (const g of groups) {
    const kept = g.choices.filter((c) => c.keep && c.name.trim() !== "");
    if (kept.length === 0) continue;
    if (g.kind === "retrait") {
      if (!sans) { lines.push({ kind: "sans", group: g.title, name: kept[0].name, qty: 1, cents: 0 }); sans = true; }
    } else if (g.kind === "extra") {
      lines.push({ kind: "extra", group: g.title, name: kept[0].name, qty: 1, cents: 0 });
    } else if (g.kind === "inclus" && kept.some((c) => c.isDefault)) {
      const first = kept.find((c) => c.isDefault)!;
      if (!sans) { lines.push({ kind: "sans", group: g.title, name: first.name, qty: 1, cents: 0 }); sans = true; }
    } else {
      lines.push({ kind: "inclus", group: g.title, name: kept[0].name, qty: 1, cents: 0 });
    }
  }
  return lines;
}
