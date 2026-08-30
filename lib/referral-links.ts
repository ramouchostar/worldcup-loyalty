// Lien de parrainage (/join?ref=CODE) + message WhatsApp — gabarit partagé
// entre la page Actions (parcours complet) et le CTA du dashboard, pour ne
// jamais laisser le message d'invitation diverger entre les deux surfaces.
export function buildJoinUrl(origin: string, code: string): string {
  return `${origin}/join?ref=${code}`;
}

export function buildWhatsappShareUrl(joinUrl: string, restaurantName: string): string {
  return `https://wa.me/?text=${encodeURIComponent(
    `Rejoins ma communauté ${restaurantName} 🎉 et commande directement — on gagne ensemble !\n${joinUrl}`
  )}`;
}
