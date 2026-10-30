// Le brouillon proposé par le formulaire « Écrire aux restaurateurs » (/platform/messages) :
// la dernière annonce préparée. Le formulaire reste modifiable avant l'envoi.

export type AnnouncementDraft = {
  restaurantIds: string[];
  subject: string;
  title: string;
  body: string;
  buttonLabel: string;
  path: string;
};

export const ANNOUNCEMENT_DRAFT: AnnouncementDraft = {
  restaurantIds: ["houba", "de-bue"],
  subject: "Du nouveau dans ta console : la Pub et le CA du jour",
  title: "Deux nouveautés dans ta console",
  body: `Bonjour,

## Pub : vois ce que ton budget peut donner, avant de payer
- **Une estimation** : combien de personnes de ta zone verront ta pub, ou combien de clics vers ton restaurant.
- **Un repère de budget** : 10 à 15 € par jour donnent de bons résultats.
- **Des raccourcis de dates**, par exemple « Semaines 2 et 3 de novembre ».
- **Une offre et un mot clé** à dire au comptoir (ex. « Family Bucket = 5 Junior Burgers offerts ») : on te les rappelle pour que tu préviennes tes équipes.
- **Les vidéos jusqu'à 200 Mo** : envoie celles du tournage telles quelles, de préférence en wifi.

Pour essayer : Console → Pub → Nouvelle demande.

## CA du jour : deux blocs, le total se calcule tout seul
- **Caisse** : carte, cash, internet.
- **Plateformes** : Uber Eats, Deliveroo, Takeaway.
- Et le nombre de commandes.

Une question ? Réponds simplement à cet e-mail.

L'équipe Boosteats`,
  buttonLabel: "Essayer la Pub",
  path: "pub/nouvelle",
};
