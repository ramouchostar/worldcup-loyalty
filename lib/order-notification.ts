import { pointsForOrder } from "./points-model";

// Le message envoyé au membre quand son ticket est validé — et sa variante
// « rattrapé ».
//
// DEUX RAISONS D'EXISTER, et la première est une correction.
//
// 1. ZÉRO EURO (ADR 0028 §5). Les trois messages de validation existants
//    disaient « ✅ Ta commande de 36,10 € a été validée ». Une notification
//    push est une surface CLIENT : l'ADR 0028 y interdit l'euro sans réserve,
//    la seule exception étant la saisie du montant à la soumission et sa
//    relecture à l'aperçu (ADR 0048 §3). C'était donc une régression, au même
//    titre qu'un `target_revenue` renvoyé par une API publique — d'autant que
//    le montant en euros face à un nombre de points laisse déduire le taux,
//    ce que l'ADR 0028 §4 cherche précisément à empêcher.
//
// 2. LA CONSÉQUENCE, PAS LE CHIFFRE (ADR 0010). Ce qui ramène quelqu'un au
//    comptoir n'est pas le montant qu'il a déjà dépensé — c'est le cadeau qui
//    l'attend. Même principe que l'ADR 0048/0049 : le cadeau, nommé, porte le
//    message.
//
// Fonction pure et testée : c'est du texte envoyé à des gens, et une
// régression euro n'y ferait planter aucun test d'intégration.

export type OrderValidatedNotice = {
  /** Montant du ticket, en euros — carburant : il ne sort JAMAIS d'ici. */
  amountEur: number;
  /**
   * Cadeau que CE ticket vient de créer (couche 1). Null quand rien n'est
   * atteint, quand la grille n'est pas configurée, ou quand un cadeau était
   * déjà en attente (ADR 0011) : dans ce dernier cas on n'en nomme pas un
   * nouveau, parce qu'il n'y en a pas de nouveau.
   */
  reward?: string | null;
  /**
   * Le ticket n'est pas passé par le parcours normal : il a été rattrapé à la
   * main (file d'arbitrage, ou rattrapage plateforme depuis /platform/scans).
   * C'est une information de service au sens de l'ADR 0039 §2 — l'exemple
   * qu'il donne est littéralement « ton ticket du 18 n'est pas passé, c'est
   * réparé ». Le taire serait se taire au mauvais moment.
   */
  rescued?: boolean;
};

export function orderValidatedMessage({
  amountEur,
  reward = null,
  rescued = false,
}: OrderValidatedNotice): string {
  const points = pointsForOrder(amountEur);
  const gain = `+${points} points`;
  // Le nom d'un article, rien d'autre — jamais son coût ni son prix (ADR 0017).
  const cadeau = reward ? `, et ton ${reward} t'attend au comptoir` : "";

  if (rescued) {
    // On nomme la friction avant de l'effacer : un membre dont le ticket
    // avait disparu sait qu'il avait disparu. Le même message que la
    // validation normale lui donnerait l'impression qu'on n'a rien vu.
    return `🔧 Ton ticket n'était pas passé du premier coup — c'est réparé : ${gain}${cadeau}.`;
  }
  return `✅ Ton ticket est validé — ${gain}${cadeau}.`;
}
