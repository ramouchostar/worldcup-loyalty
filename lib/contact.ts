// Contact commercial de Boosteats (décision du 2026-11-01) : WhatsApp en second
// appel à l'action de toutes les pages publiques et des articles, après
// l'analyse gratuite. Un seul endroit pour le numéro.
export const WHATSAPP_NUMBER_DISPLAY = "+32 490 11 31 67";
const WHATSAPP_NUMBER_E164 = "32490113167";

export function whatsappUrl(message = "Bonjour, je voudrais en savoir plus sur Boosteats pour mon restaurant."): string {
  return `https://wa.me/${WHATSAPP_NUMBER_E164}?text=${encodeURIComponent(message)}`;
}
