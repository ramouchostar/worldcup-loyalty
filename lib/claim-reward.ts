// ADR 0049 — « le cadeau paie chaque demande » ne s'arrête pas à l'écran de
// gain. Qui choisit l'e-mail plutôt que Google quitte l'écran du ticket pour
// /signup, où plus rien ne parlait du cadeau : « Créer un compte · 10 secondes
// suffisent ». L'argument gagné à l'écran précédent s'évaporait au moment
// exact où il devait payer la demande. Le nom du cadeau voyage donc avec la
// personne.
//
// sessionStorage, pas un cookie : c'est une donnée d'AFFICHAGE, le serveur n'en
// a aucun usage, et elle ne doit pas survivre à l'onglet. Elle traverse aussi
// bien la navigation vers /signup que l'aller-retour OAuth — même onglet, même
// origine.
//
// Un NOM d'article, jamais un montant ni un seuil (ADR 0007/0028).
const CLE = "claim_reward";

/** Retenu au départ vers l'inscription, quand un cadeau est atteint. */
export function memoriserCadeauAReclamer(reward: string | null): void {
  try {
    if (reward) sessionStorage.setItem(CLE, reward);
    else sessionStorage.removeItem(CLE);
  } catch {
    // stockage indisponible → l'inscription retombe sur son titre neutre
  }
}

/** Lu par l'écran d'inscription pour titrer « Réclame ton cadeau ». */
export function lireCadeauAReclamer(): string | null {
  try {
    return sessionStorage.getItem(CLE);
  } catch {
    return null;
  }
}

/** Le compte existe : l'argument a fait son travail. */
export function oublierCadeauAReclamer(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {}
}
