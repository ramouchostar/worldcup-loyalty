// ADR 0107 §10 — le secours WhatsApp : quand la commande ne peut pas partir (imprimante hors ligne, panne, pas de réseau), le
// client GARDE son panier et l'envoie lui-même au restaurateur par un message WhatsApp ordinaire. Logique PURE et testée.
//
// Rien n'est enregistré chez nous dans ce cas : pas de numéro de commande, donc aucun doublon possible si l'imprimante revient.
// Le texte est écrit par le MÊME code que le ticket de cuisine (`textOf`) : « SANS SALADE » et « + 2× FRITES » se lisent pareil
// sur le papier et dans le message. Le total est celui que la page a affiché : le message le dit (le serveur n'a rien recalculé).
//
// Pas d'API WhatsApp Business : un lien `wa.me` ouvre WhatsApp sur le téléphone du client, qui appuie lui-même sur « Envoyer ».

import { cleanFirstName, textOf, type TicketLine } from "../menu-options/tickets";
import { cartTotal, euro, type Cart } from "./cart";

/** Les mots du message. Une seule langue aujourd'hui (la page de commande n'existe qu'en français) ; une autre s'ajoute ici. */
export type Labels = {
  title: string;
  name: string;
  total: string;
  totalNote: string;
  payAtCounter: string;
  doNotRedo: string;
};

export const LABELS_FR: Labels = {
  title: "Commande à emporter (faite sur le site)",
  name: "Prénom",
  total: "À payer au comptoir",
  totalNote: "total calculé par le site, à vérifier au comptoir",
  payAtCounter: "Retrait au comptoir, paiement au comptoir.",
  doNotRedo: "Cette commande n'a pas été enregistrée sur le site : elle ne sort pas sur l'imprimante.",
};

/** Au-delà, un lien `wa.me` risque d'être coupé par le navigateur : on propose de copier le message à la place. */
export const MAX_LINK_CHARS = 4000;

const toTicketLine = (l: Cart[number]): TicketLine => ({ name: l.name, qty: l.qty, zone: null, cents: l.unitCents * l.qty, details: l.details });

/** Le message, ligne par ligne, tel que le restaurateur le lira dans WhatsApp. Le nom du plat reste celui de sa carte, jamais traduit. */
export function buildWhatsAppText(cart: Cart, firstName: string, labels: Labels = LABELS_FR): string {
  const out: string[] = [labels.title, `${labels.name} : ${cleanFirstName(firstName)}`, ""];
  for (const l of cart) {
    const t = textOf(toTicketLine(l));
    out.push(`${t.qty} × ${l.name.trim()}`);
    for (const d of t.details) out.push(`   ${d}`);
    for (const w of t.without) out.push(`   ${w}`);
  }
  out.push("", `${labels.total} : ${euro(cartTotal(cart))} (${labels.totalNote})`, labels.payAtCounter, labels.doNotRedo);
  return out.join("\n");
}

/**
 * Un numéro WhatsApp tel que `wa.me` l'attend : chiffres seuls, indicatif du pays compris, sans « + » ni « 00 ». Un numéro qui
 * commence par un seul « 0 » est belge (le programme n'existe qu'en Belgique). `null` si le numéro n'est pas lisible.
 */
export function cleanWhatsAppNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t === "") return null;
  let digits = t.replace(/\D/g, "");
  if (digits.startsWith("00") && !t.startsWith("+")) digits = digits.slice(2);
  else if (digits.startsWith("0") && !t.startsWith("+")) digits = `32${digits.slice(1)}`;
  else if (!t.startsWith("+")) return null; // sans « + », « 00 » ni « 0 » de tête : l'indicatif du pays est inconnu, on ne devine pas
  return isWhatsAppNumber(digits) ? digits : null;
}

/** Un numéro tel qu'on le garde en base : chiffres seuls, indicatif compris, 9 à 15 chiffres, sans « 0 » de tête. */
export const isWhatsAppNumber = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{8,14}$/.test(v);

/** Le numéro tel qu'on le montre au restaurateur : « +32 470 12 34 56 » pour un mobile belge, « +chiffres » sinon. */
export function formatWhatsApp(number: string): string {
  const m = /^32(4\d{2})(\d{2})(\d{2})(\d{2})$/.exec(number);
  return m ? `+32 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${number}`;
}

/** Le message d'essai du bouton « Tester » : il part vers le numéro lui-même, pour vérifier que WhatsApp s'y ouvre. */
export const TEST_MESSAGE = "Essai : ce numéro reçoit les commandes de secours du site.";

/** Le lien qui ouvre WhatsApp avec le message prêt ; `null` si le numéro n'est pas valide ou si le lien serait trop long. */
export function whatsAppLink(number: string | null, text: string): string | null {
  if (!isWhatsAppNumber(number)) return null;
  const link = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  return link.length <= MAX_LINK_CHARS ? link : null;
}

/** Le lien sans message, pour le cas où le texte est trop long et que le client le colle lui-même. */
export const whatsAppChatLink = (number: string | null): string | null => (isWhatsAppNumber(number) ? `https://wa.me/${number}` : null);
