// ADR 0112 — le jeton du lien « Ne pas publier » écrit dans l'e-mail : signé, limité à l'heure de publication, et qui
// n'autorise QUE ce refus, pour CETTE occasion. Lire ou modifier demandent la connexion. Serveur uniquement.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Séparation d'usage : ce jeton ne vaut rien ailleurs, même signé avec le même secret. */
const PURPOSE = "article-auto:refus";
const SHAPE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;

export function refusalSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.POST_REFUSAL_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Aucun secret pour signer le lien de refus.");
  return secret;
}

const sign = (occasionId: string, exp: number, secret: string) =>
  createHmac("sha256", secret).update(`${PURPOSE}:${occasionId}:${exp}`).digest("base64url");

/** `expiresAt` : l'heure de publication. Après elle, il n'y a plus rien à refuser. */
export function refusalToken(occasionId: string, expiresAt: string, secret: string = refusalSecret()): string {
  const exp = Math.floor(Date.parse(expiresAt) / 1000);
  return `${occasionId}.${exp}.${sign(occasionId, exp, secret)}`;
}

/** `null` : lien faux ou abîmé. `expired` : vrai lien, mais trop tard pour refuser. */
export function readRefusalToken(token: unknown, now: Date, secret: string = refusalSecret()): { occasionId: string; expired: boolean } | null {
  if (typeof token !== "string") return null;
  const m = SHAPE.exec(token);
  if (!m) return null;
  const [, occasionId, rawExp, given] = m;
  const exp = Number(rawExp);
  const expected = sign(occasionId, exp, secret);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  return { occasionId, expired: now.getTime() >= exp * 1000 };
}
