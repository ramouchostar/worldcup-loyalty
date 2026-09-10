// Refus des photos de QR et d'affiche (backlog audit parcours, 2026-09-10).
//
// Une photo de l'affiche du programme passait le contrôle : l'affiche porte le
// nom du resto (en-tête « vraie ») et, depuis le scan indulgent (PR #143),
// l'en-tête seule suffit quand aucune clé n'est lisible. Deux verrous :
//   1. CLIENT (ici, pur + testable) : le QR de l'AFFICHE encode l'URL du
//      programme — signal certain, zéro faux positif. Le QR imprimé au bas des
//      TICKETS encode autre chose (avis client) : il ne matche jamais.
//      Consommé par SubmitOrderClient via BarcodeDetector (Android/Chrome) —
//      gratuit, avant tout appel Vision. Safari n'a pas BarcodeDetector : le
//      verrou serveur (champ `looks_like_qr_or_poster` du prompt) rattrape.
//   2. SERVEUR : lib/receipt-ocr.ts + parse-receipt (motif d'entonnoir
//      `qr_detected`, pré-déclaré dans lib/funnel.ts).

// Hôte de l'app — les QR imprimés pointent dessus (qr/page.tsx, print).
const APP_HOSTS = ["worldcup-loyalty.vercel.app", "boosteats"];

/**
 * Le contenu décodé d'un code-barres désigne-t-il NOTRE programme ?
 * Vrai pour les QR d'affiche (`/r/<resto>?utm_source=qr_code`), de vitrine et
 * de parrainage (`/join?ref=`). Faux pour le QR d'avis du ticket de caisse.
 */
export function isProgramQrPayload(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.toLowerCase();
  const isOurHost = APP_HOSTS.some((h) => v.includes(h));
  if (isOurHost && (v.includes("/r/") || v.includes("/join") || v.includes("utm_source=qr_code"))) {
    return true;
  }
  return false;
}

export const POSTER_MEMBER_MESSAGE =
  "Ça, c'est l'affiche du programme 😅 Photographie le ticket de caisse remis avec ta commande — le total et le numéro doivent être lisibles.";
