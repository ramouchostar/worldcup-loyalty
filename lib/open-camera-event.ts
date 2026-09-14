// ADR 0057 — le bouton photo de la barre du bas, tapé alors qu'on est DÉJÀ sur
// l'écran ticket : un lien vers la page courante ne fait rien. On rouvre donc
// la caméra par un événement, écouté par l'écran ticket.
//
// Émis dans le clic : si la caméra intégrée manque, l'écran ticket peut encore
// ouvrir l'appareil photo du téléphone (le navigateur exige un geste).

export const OPEN_RECEIPT_CAMERA_EVENT = "boosteats:open-receipt-camera";

export function requestReceiptCamera(): void {
  window.dispatchEvent(new Event(OPEN_RECEIPT_CAMERA_EVENT));
}
