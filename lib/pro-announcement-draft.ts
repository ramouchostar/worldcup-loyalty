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
  subject: "Ton établissement passe au plan Croissance",
  title: "Bienvenue dans le plan Croissance",
  body: `Bonjour,

À partir d'aujourd'hui, ton établissement est au plan **Croissance**. Tu gardes tout ce que tu utilises déjà dans ta console.

## Ce que tu as avec Croissance
- **Tickets illimités** pour tes clients.
- **Ton CA du jour** comparé jour par jour, avec la part qui vient des clients du programme.
- **Les ventes par plat** et **les prévisions**.
- **Les annonces programmées** vers tes clients.
- **Ta pub** : frais de service à **10 %** du budget, un tarif négocié pour toi.

## Le prix
- **150 € HTVA par mois**, sans engagement.
- **Ta facture arrive dans la semaine** : ton account manager te l'envoie.

## Le plus utile cette semaine
**Note ton CA chaque soir** (deux blocs, 30 secondes). C'est ce qui rend les comparaisons et les prévisions justes.

Une question ? Réponds simplement à cet e-mail.

L'équipe Boosteats`,
  buttonLabel: "Noter mon CA",
  path: "",
};
