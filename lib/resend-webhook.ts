import { createHmac, timingSafeEqual } from "node:crypto";

// Vérification des webhooks Resend (signés par Svix) sans dépendance :
//   contenu signé  = `${svix-id}.${svix-timestamp}.${corps brut}`
//   clé            = base64 de la partie après « whsec_ » du secret
//   svix-signature = « v1,<base64> » (plusieurs, séparées par des espaces,
//                    pendant une rotation de secret)
// Un horodatage de plus de 5 minutes est refusé (rejeu).

export type ResendEventType = "delivered" | "bounced" | "complained";

const TOLERANCE_SECONDS = 5 * 60;

export function signPayload(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifyResendWebhook(opts: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = opts;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(signPayload(secret, id, timestamp, body));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Type d'événement Resend → état du journal. Les autres (envoyé, retardé,
// ouvert, cliqué chez Resend) ne changent rien : on ne suit ni l'ouverture
// ni les clics chez le fournisseur (ADR 0063 §6).
export function journalEvent(type: string): ResendEventType | null {
  switch (type) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    default:
      return null;
  }
}
