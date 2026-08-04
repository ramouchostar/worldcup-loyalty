// Valide qu'une chaîne est bien une URL http(s) exploitable (protocole
// autorisé) — sinon null. Partagé entre les réglages resto et l'onboarding.
export function parseHttpUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  try {
    const parsed = new URL(v);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return v;
  } catch {
    return null;
  }
}
