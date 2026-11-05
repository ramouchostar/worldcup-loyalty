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
  restaurantIds: ["houba", "de-bue", "kraainem"],
  subject: "Ta brigade marketing est arrivée",
  title: "Sept assistants travaillent pour ton restaurant",
  body: `Bonjour,

Boosteats change de forme. Une **brigade de sept assistants** prépare désormais pour toi des idées toutes prêtes pour faire monter ton chiffre d'affaires. Toi, tu n'as qu'à dire **oui** ou **non**. Comme en cuisine : chacun son poste.

## Comment ça marche
- Ta console a un nouvel onglet, **Idées**. Chaque idée tient en trois lignes : quoi, pour qui, combien.
- Tu réponds **Oui**, **Non** ou **Plus tard**. Trois idées par jour au plus : **5 minutes suffisent**.
- **Rien ne part sans ton Oui**, et aucun euro n'est dépensé sans ton accord.
- Quand tes assistants ont une idée pour toi, tu reçois un message le matin vers 9 h. Les jours sans bonne idée, ils ne te dérangent pas.
- Quand tu dis Non, tu choisis la raison en un geste. Tes assistants s'en souviennent et s'adaptent à ton restaurant.

## Ta brigade
- **Léa** inscrit tes clients et gère les cadeaux : les tickets à vérifier, le cadeau qui manque à ton catalogue.
- **Hugo** relance tes clients : ceux qui ne sont plus revenus depuis trois semaines, la promo à annoncer.
- **Chloé** suit tes chiffres : ton CA du jour, ton jour le plus calme, les plats qui rapportent.
- **Emma** s'occupe de ta pub dans le quartier : elle te propose une pub toute prête, tu valides.
- **Louis** répond à tes avis Google. Pour commencer, notre équipe prépare les réponses avec lui et tu les relis.
- **Nina** crée ton site qui fait commander, et **Max** te fait trouver sur Google : ils sont dans le forfait Pro, en pilote.

Selon ton forfait, une partie ou toute la brigade travaille pour toi.

## Ce qui ne change pas
- Tes chiffres sont dans l'onglet **Stats**, juste à côté (c'est l'ancien Accueil).
- Ton programme de fidélité reste le même pour tes clients.

Ouvre tes **Idées** et réponds à la première : c'est tout ce qu'on te demande.

Une question ? Réponds simplement à cet e-mail.

L'équipe Boosteats`,
  buttonLabel: "Voir mes idées",
  path: "idees",
};
