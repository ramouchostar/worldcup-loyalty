// ============================================================
// Réserver un prestataire (ADR 0084) — la messagerie d'une mission.
//
// Restaurateur et prestataire s'écrivent DANS la mission : la question sur un brief, la précision sur un horaire, une photo de
// plat envoyée par lien. Tout est gardé (c'est la pièce d'un litige). Tant que le travail n'a pas commencé, les numéros de
// téléphone, les adresses e-mail et les liens de messagerie sont MASQUÉS : la relation reste sur la plateforme. Le contact sur
// place du jour J reste, lui, affiché dans la mission. Fonctions PURES : l'accès aux données est dans lib/missions-messages.ts.
// ============================================================

export const MAX_BODY = 1_500;
export const MAX_PER_HOUR = 30;
/** Un e-mail de notification au plus toutes les 30 minutes, et seulement si le message n'a pas été lu. */
export const NOTIFY_EVERY_MINUTES = 30;

export type Sender = "restaurant" | "provider" | "platform";

/** On peut écrire de l'envoi du brief à la fin de la mission ; une mission annulée ou versée se lit, elle ne s'écrit plus. */
const WRITABLE: readonly string[] = ["envoye", "devis", "accepte", "date_bloquee", "production", "livre", "retouche", "valide", "litige", "suspendu"];

export function canWrite(status: string): boolean {
  return WRITABLE.includes(status);
}

/** Les contacts se révèlent quand le travail a commencé (le tournage, l'épreuve, la création) : jusque-là, ils sont masqués. */
const UNLOCKED: readonly string[] = ["production", "livre", "retouche", "valide", "verse", "litige"];

export function contactsUnlocked(status: string): boolean {
  return UNLOCKED.includes(status);
}

// ── Le masquage ──────────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[A-Za-z0-9-]+(?:\s?(?:\.|\(dot\)|\[dot\])\s?[A-Za-z0-9-]+)*\s?(?:\.|\(dot\)|\[dot\])\s?[A-Za-z]{2,}/gi;
const MESSAGING_LINK = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|t\.me|telegram\.me|m\.me|signal\.me|signal\.group|discord\.gg|snapchat\.com\/add)\/?\S*/gi;
/** Une suite de chiffres qui ressemble à un numéro : 8 à 15 chiffres, séparés par des espaces, points, tirets, barres ou parenthèses. */
const PHONE_CANDIDATE = /(?:\+|00)?\(?\d[\d ().\-/ ]{6,}\d/g;
/** Ce qui a l'air d'un numéro mais n'en est pas : une date. */
const DATE_LIKE = /^\d{4}[-/. ]\d{1,2}[-/. ]\d{1,2}$|^\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}$/;

export type Masked = { text: string; masked: boolean; found: { emails: number; phones: number; links: number } };

/** Remplace e-mails, numéros et liens de messagerie. Le reste du message ne bouge pas. */
export function maskContacts(input: string): Masked {
  const found = { emails: 0, phones: 0, links: 0 };
  let text = input.replace(EMAIL, () => {
    found.emails++;
    return "[e-mail masqué]";
  });
  text = text.replace(MESSAGING_LINK, () => {
    found.links++;
    return "[lien de messagerie masqué]";
  });
  text = text.replace(PHONE_CANDIDATE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return m;
    if (DATE_LIKE.test(m.trim())) return m;
    found.phones++;
    return "[numéro masqué]";
  });
  return { text, masked: found.emails + found.phones + found.links > 0, found };
}

// ── Écrire ───────────────────────────────────────────────────

export type BodyIssue = "empty" | "too_long";

export function sanitizeBody(raw: unknown): string {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return typeof o.body === "string" ? o.body.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY + 1) : "";
}

export function validateBody(body: string): BodyIssue | null {
  if (body.length === 0) return "empty";
  if (body.length > MAX_BODY) return "too_long";
  return null;
}

export const BODY_ISSUE_TEXT: Record<BodyIssue, string> = {
  empty: "Écris ton message.",
  too_long: "Ton message est trop long (1 500 caractères au plus).",
};

export type SendVerdict = "ok" | "closed" | "rate_limited";

/** Peut-on écrire maintenant ? `recentCount` : les messages de cet expéditeur dans la dernière heure. */
export function judgeSend(status: string, recentCount: number): SendVerdict {
  if (!canWrite(status)) return "closed";
  if (recentCount >= MAX_PER_HOUR) return "rate_limited";
  return "ok";
}

export const SEND_VERDICT_TEXT: Record<Exclude<SendVerdict, "ok">, string> = {
  closed: "Cette mission est terminée ou annulée : on ne peut plus écrire. Si besoin, écris à Boosteats.",
  rate_limited: "Tu as envoyé beaucoup de messages : réessaie dans un moment.",
};

// ── Prévenir l'autre ─────────────────────────────────────────

/**
 * Faut-il prévenir par e-mail ? Seulement si l'autre n'a pas lu depuis ce message, et pas plus d'un e-mail par tranche de
 * 30 minutes : une conversation vive ne remplit pas une boîte.
 */
export function shouldNotify(o: { lastReadAt: string | null; lastNotifiedAt: string | null; messageAt: string; now: Date }): boolean {
  if (o.lastReadAt && o.lastReadAt >= o.messageAt) return false;
  if (!o.lastNotifiedAt) return true;
  return o.now.getTime() - new Date(o.lastNotifiedAt).getTime() >= NOTIFY_EVERY_MINUTES * 60_000;
}

export const SENDER_LABEL: Record<Sender, string> = { restaurant: "Le restaurateur", provider: "Le prestataire", platform: "Boosteats" };

export const LOCKED_NOTICE = "Les numéros de téléphone et les adresses e-mail sont masqués tant que le travail n'a pas commencé : tout passe ici. Le contact sur place du tournage s'affiche à la réservation de la date.";
