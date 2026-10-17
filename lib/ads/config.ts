// ADR 0086 — réglages de la Pub, lus dans l'environnement (Vercel + .env.local).
// Serveur uniquement : à ne jamais importer depuis un composant client.
// Le dépôt est public : adresse d'alerte, coordonnées bancaires et jeton Meta
// n'y figurent jamais. Une valeur manquante se dit (`missing`), elle ne se
// devine pas : l'écran qui en dépend l'affiche au lieu d'inventer.

export type PaymentDetails = { holder: string; iban: string; bic: string };

export type PubConfig = {
  alertEmail: string | null;
  /** Taux de TVA facturé, en % ; 0 tant que l'émetteur est en franchise. */
  vatRate: number;
  payment: PaymentDetails | null;
  meta: { token: string; adAccountId: string } | null;
  missing: string[];
};

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function pubConfig(): PubConfig {
  const missing: string[] = [];
  const need = (name: string) => {
    const v = env(name);
    if (!v) missing.push(name);
    return v;
  };

  const alertEmail = need("PUB_ALERT_EMAIL");
  const rawVat = need("INVOICE_VAT_RATE");
  const vat = rawVat === null ? NaN : Number(rawVat);
  const vatOk = Number.isFinite(vat) && vat >= 0 && vat <= 100;
  if (rawVat !== null && !vatOk) missing.push("INVOICE_VAT_RATE (invalide)");

  const holder = need("PUB_PAYMENT_HOLDER");
  const iban = need("PUB_PAYMENT_IBAN");
  const bic = need("PUB_PAYMENT_BIC");
  const token = need("META_ADS_SYSTEM_USER_TOKEN");
  const adAccountId = need("META_ADS_ACCOUNT_ID_BE");

  return {
    alertEmail,
    // Sans taux lisible, on ne facture pas au hasard : 0 seulement s'il est écrit.
    vatRate: vatOk ? vat : 0,
    payment: holder && iban && bic ? { holder, iban: iban.replace(/\s+/g, ""), bic } : null,
    meta: token && adAccountId ? { token, adAccountId } : null,
    missing,
  };
}
