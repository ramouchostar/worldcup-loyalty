// Contenu des pages publiques de la stratégie SEO (docs/strategie/seo-et-pages.md,
// validée le 2026-11-01). Texte seulement : le gabarit rend ces données.
//
// Règles : vouvoiement, mots du comptoir, aucune technique, aucun chiffre ni nom
// de client (dépôt public), jamais « grâce à nous » (ADR 0064), jamais un
// pourcentage de hausse promis, jamais de calcul « X € = N tickets », et ce qui
// n'est pas livré se dit « en préparation » (ADR 0070).

export type Pillar = "revenir" | "venir" | "main";

export type MarketingPage = {
  slug: string;
  kind: "fonction" | "analyse";
  pillar?: Pillar;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  h1: string;
  lead: string;
  problem: { title: string; points: string[] };
  how: { title: string; steps: { title: string; body: string }[] };
  youDo: { title: string; items: string[] };
  youSee: { title: string; items: { title: string; body: string }[] };
  checklist?: { title: string; items: string[] };
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
  related: string[];
};

export const MARKETING_PAGES: MarketingPage[] = [
  // ─────────────────────────── Faire revenir ───────────────────────────
  {
    slug: "programme-fidelite-restaurant",
    kind: "fonction",
    pillar: "revenir",
    navLabel: "Programme de fidélité",
    metaTitle: "Programme de fidélité pour restaurant, sans rien brancher",
    metaDescription:
      "Vos clients prennent leur ticket de caisse en photo, gagnent des points et choisissent leur cadeau. Votre caisse ne change pas. Gratuit pour commencer.",
    keywords: ["programme fidélité restaurant", "carte de fidélité restaurant", "carte de fidélité digitale"],
    eyebrow: "Faire revenir",
    h1: "Une carte de fidélité qui marche avec votre caisse actuelle",
    lead:
      "Vos clients prennent leur ticket de caisse en photo avec leur téléphone. Ils gagnent des points, choisissent leur cadeau, et vous récupérez leur contact.",
    problem: {
      title: "Ce qui se passe aujourd'hui au comptoir",
      points: [
        "Un client vient une fois, il repart, et vous ne savez pas s'il reviendra.",
        "La carte à tampons se perd dans un portefeuille, et elle ne vous dit rien sur vos clients.",
        "Les solutions de fidélité qu'on vous propose demandent de changer de caisse ou de la faire brancher.",
        "Vous offrez des cadeaux sans savoir ce qu'ils vous coûtent à la fin du mois.",
      ],
    },
    how: {
      title: "Comment ça marche",
      steps: [
        {
          title: "Le client scanne le QR au comptoir",
          body: "Une affiche et un QR posés près de la caisse. Il s'inscrit en quelques secondes, sans application à télécharger.",
        },
        {
          title: "Il prend son ticket en photo",
          body: "Le ticket est lu tout seul. Chaque euro dépensé lui donne 10 points. N'importe quelle caisse convient : le ticket suffit.",
        },
        {
          title: "Il choisit son cadeau",
          body: "Un cadeau de bienvenue dès son premier ticket, puis un catalogue de cadeaux qu'il débloque avec ses points. Il le récupère au comptoir lors d'une prochaine visite.",
        },
        {
          title: "Vous savez qui revient",
          body: "Chaque client inscrit apparaît dans votre liste, avec ses visites. Vous pouvez lui écrire quand vous voulez.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Poser l'affiche et le QR au comptoir (on vous les donne prêts à imprimer).",
        "Choisir les cadeaux de votre carte et le taux que vous leur consacrez.",
        "Dire une phrase à vos clients : « Prenez votre ticket en photo ici, vous avez un cadeau de bienvenue. »",
      ],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "Vos clients inscrits", body: "Combien se sont inscrits cette semaine, et la liste de tous, qui reste chez vous." },
        { title: "Les tickets reçus", body: "Chaque ticket envoyé, le jour et le montant." },
        { title: "Les cadeaux remis", body: "Quel cadeau, à qui, quand. Le caissier valide la remise d'un geste." },
      ],
    },
    faq: [
      {
        q: "Est-ce que je dois changer de caisse ?",
        a: "Non. Le client prend en photo le ticket que votre caisse imprime déjà. Rien à brancher, rien à installer.",
      },
      {
        q: "Mes clients doivent-ils télécharger une application ?",
        a: "Non. Ils scannent le QR et s'inscrivent depuis leur téléphone, dans le navigateur.",
      },
      {
        q: "Et si un client essaie d'envoyer deux fois le même ticket ?",
        a: "Un même ticket ne compte qu'une fois. Les tickets douteux sont mis de côté et vous décidez.",
      },
      {
        q: "Combien ça coûte ?",
        a: "Le plan Gratuit suffit pour démarrer : jusqu'à 500 tickets par mois, sans carte bancaire ni engagement. Au-delà, vos clients ne sont jamais bloqués.",
      },
      {
        q: "Je peux garder ma carte à tampons ?",
        a: "Oui, si vous voulez. La différence : avec Boosteats, vous avez le contact de vos clients et vous pouvez leur écrire.",
      },
    ],
    ctaTitle: "Voyez d'abord où en est votre restaurant",
    ctaBody: "Analyse gratuite de votre fiche Google, de vos avis et de vos voisins. Une note sur 100 en moins d'une minute.",
    related: ["cadeaux-calcules-sur-vos-couts", "relancer-vos-clients", "food-cost-restaurant"],
  },
  {
    slug: "cadeaux-calcules-sur-vos-couts",
    kind: "fonction",
    pillar: "revenir",
    navLabel: "Cadeaux calculés sur vos coûts",
    metaTitle: "Fidélité restaurant rentable : cadeaux au prix de revient",
    metaDescription:
      "Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez entre 4 et 12 %. Le coût suit les ventes de vos clients.",
    keywords: ["programme de fidélité rentable", "coût programme fidélité restaurant", "cadeaux fidélité restaurant"],
    eyebrow: "Faire revenir",
    h1: "Des cadeaux dont vous connaissez le coût avant de les offrir",
    lead:
      "Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez. À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats.",
    problem: {
      title: "Le problème des cadeaux fixés au hasard",
      points: [
        "« Le 10e menu offert » : personne ne sait ce que ça coûte vraiment sur un mois.",
        "Les promos s'empilent et mangent la marge des bons jours.",
        "Le même cadeau coûte peu sur une boisson et cher sur un plat, mais il se gagne pareil.",
      ],
    },
    how: {
      title: "Comment le prix d'un cadeau est fixé",
      steps: [
        {
          title: "Vous notez le prix de revient",
          body: "Pour chaque article de votre carte, ce qu'il vous coûte à servir. Vous le modifiez quand vos prix d'achat changent.",
        },
        {
          title: "Vous choisissez votre taux",
          body: "La part de vos ventes que vous rendez en cadeaux, entre 4 et 12 %. Vous pouvez le changer quand vous voulez.",
        },
        {
          title: "Le prix en points se calcule tout seul",
          body: "Un cadeau qui vous coûte plus demande plus de points. Le client voit des points, jamais votre prix de revient.",
        },
        {
          title: "Le coût suit vos ventes",
          body: "Le coût des cadeaux suit les ventes faites par les clients du programme, au taux que vous avez choisi.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Renseigner le prix de revient des articles que vous voulez offrir.",
        "Choisir votre taux, entre 4 et 12 %.",
      ],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "Votre catalogue de cadeaux", body: "Chaque cadeau avec son coût pour vous et son prix en points pour le client." },
        { title: "Votre taux cadeaux", body: "Le taux choisi, et ce qu'il change sur le prix de chaque cadeau avant de le valider." },
        { title: "Les cadeaux remis", body: "Ce qui a été offert ce mois-ci, et à qui." },
      ],
    },
    faq: [
      {
        q: "Quel taux choisir pour commencer ?",
        a: "Beaucoup de restaurants démarrent autour de 8 %. Un taux plus bas rend les cadeaux plus chers en points, un taux plus haut les rend plus faciles à gagner.",
      },
      {
        q: "Mes clients voient-ils mes prix de revient ?",
        a: "Non. Ils voient des points et le nom des cadeaux. Votre coût reste dans votre espace.",
      },
      {
        q: "Que se passe-t-il si un client ne récupère pas son cadeau ?",
        a: "Le cadeau expire, et les points qu'il avait dépensés lui sont rendus.",
      },
      {
        q: "Je peux offrir un plat entier ?",
        a: "Oui. Il demandera simplement plus de points qu'une boisson, parce qu'il vous coûte plus.",
      },
    ],
    ctaTitle: "Commencez par l'analyse gratuite de votre restaurant",
    ctaBody: "Fiche Google, avis, concurrents à 600 m : une note sur 100 en moins d'une minute.",
    related: ["programme-fidelite-restaurant", "food-cost-restaurant", "relancer-vos-clients"],
  },
  {
    slug: "relancer-vos-clients",
    kind: "fonction",
    pillar: "revenir",
    navLabel: "Relancer vos clients",
    metaTitle: "Fidéliser les clients d'un restaurant par message",
    metaDescription:
      "Écrivez à vos clients inscrits un soir calme, laissez-les inviter leurs amis par WhatsApp, et donnez un QR à chaque employé pour inscrire plus de monde.",
    keywords: ["fidéliser clients restaurant", "message clients restaurant", "parrainage restaurant whatsapp"],
    eyebrow: "Faire revenir",
    h1: "Un mardi soir calme ? Écrivez à vos clients",
    lead:
      "Vos clients inscrits reçoivent vos annonces. Ils invitent leurs amis par WhatsApp. Et chaque employé a son QR pour inscrire plus de monde en salle.",
    problem: {
      title: "Pourquoi les clients ne reviennent pas",
      points: [
        "Ils vous aiment bien, mais ils oublient. Un autre restaurant passe devant eux sur Instagram.",
        "Vous n'avez aucun moyen de les prévenir d'une promo ou d'un nouveau plat.",
        "Le bouche-à-oreille marche, mais vous ne le voyez pas et vous ne pouvez pas le pousser.",
      ],
    },
    how: {
      title: "Trois façons de faire revenir du monde",
      steps: [
        {
          title: "Vos annonces",
          body: "Vous écrivez un message (offre du soir, nouveau plat, horaires de fête) et il part à vos clients inscrits.",
        },
        {
          title: "Le parrainage par WhatsApp",
          body: "Chaque client a son lien d'invitation à partager sur WhatsApp. Les amis qui s'inscrivent le rapprochent d'un cadeau.",
        },
        {
          title: "Le QR de chaque employé",
          body: "Chaque membre de l'équipe a son propre QR. Vous voyez qui inscrit le plus de clients, et vous pouvez le récompenser.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Écrire vos annonces quand vous en avez besoin, depuis votre téléphone.",
        "Créer un QR pour chaque employé qui parle aux clients.",
      ],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "Vos annonces envoyées", body: "Chaque message, la date, et à combien de clients il est parti." },
        { title: "Les parrainages", body: "Qui a invité qui, et combien d'amis se sont inscrits." },
        { title: "Le classement de l'équipe", body: "Le nombre de clients inscrits par chaque employé." },
      ],
    },
    faq: [
      {
        q: "Combien de messages puis-je envoyer ?",
        a: "Autant que vous voulez. Gardez-les utiles : une vraie offre, une vraie nouvelle. Un client qui reçoit trop de messages finit par ne plus les lire.",
      },
      {
        q: "Je dois écrire les messages moi-même ?",
        a: "Oui, vous gardez la main sur ce qui part. En plan Croissance, vous pouvez aussi les programmer à l'avance.",
      },
      {
        q: "Est-ce que mes clients ont accepté de recevoir mes messages ?",
        a: "Vos messages ne partent qu'aux clients qui ont accepté d'en recevoir, et ils peuvent arrêter quand ils veulent.",
      },
      {
        q: "Les relances automatiques des clients qui ne viennent plus, c'est possible ?",
        a: "C'est en préparation. Aujourd'hui, vous envoyez vos annonces vous-même.",
      },
    ],
    ctaTitle: "Voyez combien de clients votre restaurant pourrait inscrire",
    ctaBody: "L'analyse gratuite vous montre vos avis, vos voisins et votre fiche Google. Une note sur 100 en moins d'une minute.",
    related: ["programme-fidelite-restaurant", "publicite-restaurant", "cadeaux-calcules-sur-vos-couts"],
  },

  // ─────────────────────────── Faire venir ───────────────────────────
  {
    slug: "publicite-restaurant",
    kind: "fonction",
    pillar: "venir",
    navLabel: "Pub de quartier",
    metaTitle: "Publicité Facebook pour restaurant, dans votre quartier",
    metaDescription:
      "Une pub Facebook et Instagram autour de votre restaurant, montée pour vous. Estimation avant de payer, offre et mot clé à dire au comptoir.",
    keywords: ["publicité restaurant", "publicité facebook restaurant", "pub pour restaurant"],
    eyebrow: "Faire venir",
    h1: "Une pub dans votre quartier, montée pour vous",
    lead:
      "On diffuse votre offre sur Facebook et Instagram autour de votre restaurant. Vous voyez une estimation avant de payer, et un mot clé à dire au comptoir vous montre qui vient par la pub.",
    problem: {
      title: "Ce que les restaurateurs nous disent de la pub",
      points: [
        "« J'ai boosté une publication, j'ai eu des likes, mais personne n'est venu. »",
        "Les réglages de Facebook prennent une soirée entière, et on ne sait jamais si c'est bon.",
        "On dépense sans savoir ce que la pub a donné au comptoir.",
      ],
    },
    how: {
      title: "Comment on monte votre pub",
      steps: [
        {
          title: "Vous choisissez l'offre et la période",
          body: "Par exemple un menu partagé le week-end, sur deux semaines. Vous ajoutez un mot clé que le client dira au comptoir.",
        },
        {
          title: "Vous voyez l'estimation avant de payer",
          body: "Combien de personnes du quartier la pub peut toucher, sous forme de fourchette, selon votre budget. Un bon départ : 10 à 15 € par jour.",
        },
        {
          title: "Vous validez, on s'occupe du reste",
          body: "Le ciblage autour du restaurant (environ 3 km), la mise en ligne et le suivi.",
        },
        {
          title: "Vous comptez qui vient",
          body: "Chaque client qui dit le mot clé au comptoir est venu par la pub. Dans votre espace, vous voyez les personnes touchées et le budget dépensé.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Choisir l'offre, le budget et la période.",
        "Nous envoyer une photo ou une vidéo de vos plats, si vous en avez.",
        "Prévenir votre équipe du mot clé.",
      ],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "L'estimation", body: "La fourchette de personnes touchées pour votre budget, avant de payer." },
        { title: "Le suivi de la campagne", body: "Combien de personnes l'ont vue, et le budget dépensé jusqu'ici." },
      ],
    },
    faq: [
      {
        q: "Quel budget prévoir ?",
        a: "Un bon départ, c'est 10 à 15 € par jour pendant deux semaines. Vous voyez l'estimation avant de payer et vous ajustez.",
      },
      {
        q: "Combien vous prenez ?",
        a: "Des frais de service sur le budget, selon votre plan : 20 % en Gratuit, 15 % en Croissance, 5 % en Pro.",
      },
      {
        q: "Il me faut une page Facebook ou un compte Instagram ?",
        a: "Une page Facebook suffit. La pub peut aussi passer sur Instagram.",
      },
      {
        q: "J'ai déjà essayé la pub Facebook et ça n'a rien donné.",
        a: "Souvent, on ne sait pas ce qu'elle a donné. Ici, la pub vise votre quartier, porte une offre claire, et le mot clé vous dit qui est venu.",
      },
      {
        q: "Je peux arrêter en cours de route ?",
        a: "Oui. Vous mettez la pub en pause en un geste depuis votre espace, et vous voyez ce qui reste du budget.",
      },
    ],
    ctaTitle: "Avant la pub, regardez ce que voient vos futurs clients",
    ctaBody: "Une pub envoie du monde vers votre fiche Google. L'analyse gratuite vous dit si elle donne envie d'entrer.",
    related: ["fiche-google-restaurant", "visibilite-restaurant", "relancer-vos-clients"],
  },
  {
    slug: "fiche-google-restaurant",
    kind: "fonction",
    pillar: "venir",
    navLabel: "Fiche Google et avis",
    metaTitle: "Fiche d'établissement Google d'un restaurant : la soigner",
    metaDescription:
      "Horaires, photos, avis, réponses : ce qui compte sur la fiche Google d'un restaurant. Analyse gratuite, et une fiche tenue à jour en plan Pro.",
    keywords: ["fiche d'établissement google restaurant", "fiche google restaurant", "avis google restaurant"],
    eyebrow: "Faire venir",
    h1: "Votre fiche Google, c'est votre vitrine pour ceux qui ne vous connaissent pas",
    lead:
      "Avant de pousser votre porte, un nouveau client regarde vos photos, vos horaires et vos avis sur Google. On vous dit ce qui manque, et en plan Pro, on tient votre fiche à jour.",
    problem: {
      title: "Ce qu'on voit souvent sur les fiches de restaurants",
      points: [
        "Des horaires de fête jamais mis à jour, et des clients qui trouvent porte close.",
        "Trois vieilles photos prises au téléphone il y a deux ans.",
        "Des avis négatifs restés sans réponse, que tout le monde lit.",
        "Pas de lien vers la carte, alors que le client veut savoir ce qu'il va manger.",
      ],
    },
    how: {
      title: "Comment on s'y prend",
      steps: [
        {
          title: "On analyse votre fiche",
          body: "Une note sur 100, critère par critère : nom, catégorie, horaires, photos, liens, avis, réponses.",
        },
        {
          title: "On vous donne les priorités",
          body: "Ce qui compte le plus pour vos clients, dans l'ordre, avec ce qu'il faut faire.",
        },
        {
          title: "On la tient à jour avec vous (plan Pro)",
          body: "Vous nous invitez à gérer la fiche. On corrige ce qui manque et on la garde à jour, avec un rapport chaque mois.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Lancer l'analyse gratuite avec le nom de votre restaurant.",
        "En plan Pro : nous inviter comme gestionnaire de votre fiche, en quelques clics.",
      ],
    },
    youSee: {
      title: "Ce que vous recevez",
      items: [
        { title: "Votre note sur 100", body: "Et le détail de chaque point à corriger." },
        { title: "Vos voisins", body: "Les restaurants que Google montre à côté de vous, avec leur note et leur nombre d'avis." },
        { title: "Un rapport chaque mois (plan Pro)", body: "Ce qui a été fait sur la fiche, et un point avec nous." },
      ],
    },
    faq: [
      {
        q: "Je peux offrir un cadeau contre un avis Google ?",
        a: "Non. Google l'interdit et peut supprimer les avis concernés, voire suspendre la fiche. On demande des avis à tous les clients, sans contrepartie.",
      },
      {
        q: "Vous répondez aux avis à ma place ?",
        a: "Un espace pour suivre vos avis avec des réponses proposées est en préparation. Aujourd'hui, l'analyse vous dit quels avis attendent une réponse.",
      },
      {
        q: "Je garde la main sur ma fiche ?",
        a: "Oui. Vous restez propriétaire de la fiche. Vous nous invitez comme gestionnaire et vous pouvez nous retirer quand vous voulez.",
      },
      {
        q: "Combien ça coûte ?",
        a: "L'analyse est gratuite. La fiche tenue à jour fait partie du plan Pro, à 500 € par mois, 3 mois minimum.",
      },
    ],
    ctaTitle: "Votre fiche Google donne-t-elle envie d'entrer ?",
    ctaBody: "Tapez le nom de votre restaurant : une note sur 100 en moins d'une minute, gratuitement.",
    related: ["analyse-fiche-google-restaurant", "analyse-avis-google-restaurant", "publicite-restaurant"],
  },

  // ─────────────────────────── Garder la main ───────────────────────────
  {
    slug: "chiffre-affaires-restaurant",
    kind: "fonction",
    pillar: "main",
    navLabel: "Votre chiffre du jour",
    metaTitle: "Chiffre d'affaires d'un restaurant : le suivre chaque jour",
    metaDescription:
      "Notez votre chiffre du jour en un écran, caisse et plateformes à part. Comparez aux mêmes jours et voyez la part qui vient de vos clients inscrits.",
    keywords: ["chiffre d'affaires restaurant", "suivi chiffre d'affaires restaurant", "chiffre d'affaires journalier restaurant"],
    eyebrow: "Garder la main",
    h1: "Votre chiffre du jour, comparé au bon jour",
    lead:
      "Vous notez votre chiffre du jour en un écran : la caisse d'un côté, les plateformes de livraison de l'autre. Vous voyez tout de suite si ce mardi est meilleur que les mardis d'avant.",
    problem: {
      title: "Pourquoi le chiffre du jour ne dit rien tout seul",
      points: [
        "Un lundi se compare à un lundi, pas au samedi d'avant.",
        "Le chiffre est éparpillé : caisse, carte, cash, Uber Eats, Deliveroo, Takeaway.",
        "Vous sentez qu'un jour est faible, sans savoir de combien ni depuis quand.",
      ],
    },
    how: {
      title: "Comment ça marche",
      steps: [
        {
          title: "Vous notez le chiffre en fin de journée",
          body: "Un bloc caisse (carte, cash, commandes internet) et un bloc plateformes (Uber Eats, Deliveroo, Takeaway). Le total se calcule seul.",
        },
        {
          title: "Il est comparé aux mêmes jours",
          body: "Le jour noté face aux mêmes jours de la semaine précédents, et la semaine face à la même période d'avant.",
        },
        {
          title: "Vous voyez ce que pèsent vos clients inscrits",
          body: "La part de votre chiffre qui vient des clients du programme.",
        },
        {
          title: "Vous anticipez",
          body: "Des prévisions de fréquentation et vos ventes plat par plat, pour préparer les jours calmes à l'avance.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: ["Noter votre chiffre du jour en fin de service, depuis votre téléphone. Une minute."],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "Le dernier jour noté", body: "Face aux mêmes jours de la semaine, avec l'écart." },
        { title: "Les 14 derniers jours", body: "Jours notés, jours fermés et jours oubliés, bien séparés." },
        { title: "La part des clients du programme", body: "Ce que vos clients inscrits représentent dans votre chiffre." },
      ],
    },
    faq: [
      {
        q: "Je dois tout noter à la main ?",
        a: "Le total de la caisse et celui des plateformes, oui. Une minute par jour. Vous pouvez aussi importer un export de votre caisse.",
      },
      {
        q: "C'est dans le plan Gratuit ?",
        a: "Vous pouvez noter votre chiffre dès le plan Gratuit. Les comparaisons, la part des clients du programme et les prévisions sont dans le plan Croissance, à 150 € par mois.",
      },
      {
        q: "Qui voit mon chiffre d'affaires ?",
        a: "Vous, et l'équipe Boosteats qui vous accompagne. Vos clients ne voient jamais aucun chiffre.",
      },
      {
        q: "Et les ventes par plat ?",
        a: "Elles viennent de l'export de votre caisse ou des tickets envoyés par vos clients. Vous voyez ce qui se vend et ce qui dort.",
      },
    ],
    ctaTitle: "Commencez par voir votre restaurant comme vos clients le voient",
    ctaBody: "L'analyse gratuite : fiche Google, avis, concurrents à 600 m. Une note sur 100 en moins d'une minute.",
    related: ["food-cost-restaurant", "publicite-restaurant", "programme-fidelite-restaurant"],
  },
  {
    slug: "food-cost-restaurant",
    kind: "fonction",
    pillar: "main",
    navLabel: "Menu & coûts",
    metaTitle: "Food cost restaurant : le coût et la marge de chaque plat",
    metaDescription:
      "Le prix de vente et le prix de revient de chaque article de votre carte, ligne par ligne. Votre marge par plat, et des cadeaux calculés sur vos coûts.",
    keywords: ["food cost", "calcul food cost", "food cost restaurant", "marge par plat"],
    eyebrow: "Garder la main",
    h1: "Combien vous coûte vraiment chaque plat ?",
    lead:
      "Dans Menu & coûts, vous voyez pour chaque article de votre carte le prix de vente et ce qu'il vous coûte à servir. La marge de chaque plat se lit d'un coup d'œil.",
    problem: {
      title: "Quand on ne connaît pas son food cost",
      points: [
        "Les prix d'achat montent, les prix de la carte restent les mêmes, et la marge fond sans bruit.",
        "On pousse un plat qui se vend bien, alors qu'il rapporte peu.",
        "Les promos et les cadeaux se décident au feeling.",
      ],
    },
    how: {
      title: "Comment ça marche",
      steps: [
        {
          title: "Vous importez votre carte",
          body: "Les articles de votre carte arrivent dans votre espace à partir d'un simple fichier, avec leur prix de vente.",
        },
        {
          title: "Vous notez le prix de revient",
          body: "Ligne par ligne, ce que chaque article vous coûte à servir. Vous le corrigez quand vos achats changent.",
        },
        {
          title: "La marge apparaît",
          body: "Prix de vente et prix de revient côte à côte : vous repérez les plats qui rapportent et ceux qui coûtent.",
        },
        {
          title: "Vos cadeaux suivent vos coûts",
          body: "Les cadeaux de fidélité sont calculés sur ces prix de revient, au taux que vous choisissez.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: [
        "Renseigner le prix de revient de vos articles, en commençant par les plus vendus.",
        "Le mettre à jour quand un fournisseur change ses prix.",
      ],
    },
    youSee: {
      title: "Ce que vous voyez dans votre espace",
      items: [
        { title: "Votre carte, ligne par ligne", body: "Prix de vente, prix de revient, modifiables à tout moment." },
        { title: "Les cadeaux possibles", body: "Les articles que vous pouvez offrir sans dépasser votre taux cadeaux." },
      ],
    },
    faq: [
      {
        q: "C'est quoi, le food cost ?",
        a: "C'est ce que vous coûtent les ingrédients d'un plat, comparé à son prix de vente. Plus il est bas, plus le plat vous rapporte.",
      },
      {
        q: "Comment je calcule le prix de revient d'un plat ?",
        a: "Additionnez le coût de chaque ingrédient pour une portion : pain, viande, sauce, frites, emballage. C'est ce montant que vous notez.",
      },
      {
        q: "C'est payant ?",
        a: "Menu & coûts est inclus dès le plan Gratuit.",
      },
      {
        q: "Mes clients voient-ils mes coûts ?",
        a: "Jamais. Ils voient vos plats et des points, rien d'autre.",
      },
    ],
    ctaTitle: "Voyez où en est votre restaurant, gratuitement",
    ctaBody: "Fiche Google, avis, concurrents à 600 m : une note sur 100 en moins d'une minute.",
    related: ["cadeaux-calcules-sur-vos-couts", "chiffre-affaires-restaurant", "programme-fidelite-restaurant"],
  },

  // ─────────────────────────── Analyse gratuite ───────────────────────────
  {
    slug: "analyse-fiche-google-restaurant",
    kind: "analyse",
    navLabel: "Analyse de fiche Google",
    metaTitle: "Fiche d'établissement Google : analyse gratuite restaurant",
    metaDescription:
      "Votre fiche Google notée sur 100 en moins d'une minute : nom, catégorie, horaires, photos, liens, avis. Gratuit, pour les restaurants de Bruxelles.",
    keywords: ["fiche d'établissement google", "fiche google my business", "fiche google business restaurant"],
    eyebrow: "Analyse gratuite",
    h1: "Votre fiche Google donne-t-elle envie d'entrer ?",
    lead:
      "Tapez le nom de votre restaurant. Vous recevez une note sur 100 de votre fiche d'établissement Google, et la liste de ce qui manque.",
    problem: {
      title: "Pourquoi la fiche compte autant",
      points: [
        "C'est souvent la première chose qu'un nouveau client voit de vous, avant même votre porte.",
        "Google montre d'autres restaurants juste en dessous de la vôtre.",
        "Une fiche incomplète fait douter : est-ce ouvert ? Qu'est-ce qu'on y mange ?",
      ],
    },
    how: {
      title: "Comment se passe l'analyse",
      steps: [
        { title: "Vous cherchez votre restaurant", body: "Par son nom, tel qu'il apparaît sur Google Maps." },
        { title: "La note tombe en moins d'une minute", body: "Une note sur 100, critère par critère." },
        {
          title: "Le rapport complet arrive sur WhatsApp",
          body: "Relu par notre équipe : le détail de chaque point et vos cinq priorités.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: ["Taper le nom de votre restaurant.", "Laisser votre numéro pour recevoir le rapport complet."],
    },
    youSee: {
      title: "Ce que vous recevez",
      items: [
        { title: "Votre note sur 100", body: "Et ce que vaut chaque critère." },
        { title: "Vos cinq priorités", body: "Classées par effet attendu, avec quoi faire." },
      ],
    },
    checklist: {
      title: "Ce que l'analyse vérifie sur votre fiche",
      items: [
        "Un nom de fiche propre, sans mots-clés ajoutés (« meilleur », « halal », « livraison »…).",
        "Une catégorie principale précise, et des catégories secondaires.",
        "Téléphone, adresse complète et site web renseignés.",
        "Des horaires réguliers, mais aussi les horaires de fête et ceux de la livraison ou de l'emporter.",
        "Assez de photos, dont une photo récente de l'établissement.",
        "Une fiche revendiquée par le restaurant lui-même.",
        "Les attributs remplis (sur place, à emporter, accès…) et une description rédigée.",
        "Un lien vers la carte, vers la commande en ligne et, si vous en faites, vers la réservation.",
        "La note moyenne et le nombre d'avis face aux restaurants voisins.",
        "Les réponses du propriétaire aux avis, et le temps qu'il met à répondre.",
      ],
    },
    faq: [
      {
        q: "C'est vraiment gratuit ?",
        a: "Oui. La note et le rapport complet sont gratuits, sans engagement.",
      },
      {
        q: "Pourquoi vous demandez mon numéro ?",
        a: "Pour vous envoyer le rapport complet sur WhatsApp, relu par notre équipe. On ne le transmet à personne.",
      },
      {
        q: "Ma fiche n'est pas à mon nom. Ça marche quand même ?",
        a: "Oui, l'analyse lit ce que voient vos clients. Elle vous dira d'ailleurs si la fiche est revendiquée.",
      },
      {
        q: "Mon restaurant n'est pas à Bruxelles.",
        a: "L'analyse couvre pour l'instant les 19 communes de Bruxelles. Laissez votre numéro : on vous écrit dès qu'elle couvre votre commune.",
      },
      {
        q: "Combien de temps pour corriger ma fiche ?",
        a: "La plupart des points se corrigent en une heure : horaires, photos, liens, description. Le rapport vous dit par où commencer.",
      },
    ],
    ctaTitle: "Lancez l'analyse de votre fiche",
    ctaBody: "Tapez le nom de votre restaurant ci-dessus. Résultat en moins d'une minute.",
    related: ["analyse-avis-google-restaurant", "visibilite-restaurant", "fiche-google-restaurant"],
  },
  {
    slug: "analyse-avis-google-restaurant",
    kind: "analyse",
    navLabel: "Analyse de vos avis",
    metaTitle: "Avis Google de votre restaurant : l'analyse gratuite",
    metaDescription:
      "Ce que vos clients répètent dans leurs avis Google, votre note sur 24 mois, vos réponses et votre délai de réponse. Analyse gratuite pour restaurant.",
    keywords: ["avis google restaurant", "google avis clients", "avis clients restaurant", "répondre aux avis google"],
    eyebrow: "Analyse gratuite",
    h1: "Ce que vos avis Google disent de votre restaurant",
    lead:
      "Vos clients écrivent chaque semaine ce qu'ils aiment et ce qui les agace. L'analyse lit vos avis et vous dit ce qui revient, en bien et en mal.",
    problem: {
      title: "Ce qu'on rate en lisant ses avis un par un",
      points: [
        "Le même reproche revient tous les vendredis soir, et on ne le voit pas.",
        "La note baisse doucement depuis six mois, sans qu'on s'en rende compte.",
        "Les avis à 1 ou 2 étoiles restent sans réponse, et les futurs clients les lisent en premier.",
      ],
    },
    how: {
      title: "Comment se passe l'analyse",
      steps: [
        { title: "Vous cherchez votre restaurant", body: "Par son nom, tel qu'il apparaît sur Google Maps." },
        { title: "Vous voyez un premier aperçu", body: "Votre note, votre nombre d'avis et ceux de vos voisins, en moins d'une minute." },
        {
          title: "Le rapport complet arrive sur WhatsApp",
          body: "Les thèmes de vos avis, comment régler ce qui revient, et vos cinq priorités, relus par notre équipe.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: ["Taper le nom de votre restaurant.", "Laisser votre numéro pour recevoir le rapport complet."],
    },
    youSee: {
      title: "Ce que vous recevez",
      items: [
        { title: "Ce que vos clients citent le plus", body: "Les thèmes qui reviennent dans les avis positifs et négatifs." },
        { title: "Votre note dans le temps", body: "La note moyenne glissante sur trois mois, sur les 24 derniers mois." },
        { title: "Vos réponses", body: "La part d'avis qui ont reçu une réponse, et votre délai moyen." },
      ],
    },
    checklist: {
      title: "Ce que l'analyse regarde dans vos avis",
      items: [
        "Votre note moyenne, et son évolution sur les 24 derniers mois.",
        "Votre nombre d'avis face à celui des restaurants à moins de 600 m.",
        "Les thèmes qui reviennent dans les avis négatifs : attente, accueil, propreté, quantité…",
        "Ce que les clients citent le plus quand ils sont contents.",
        "La part des avis qui ont reçu une réponse du propriétaire sur les 12 derniers mois.",
        "Les réponses aux avis à 1 et 2 étoiles.",
        "Le délai de réponse du propriétaire.",
        "Le dernier avis négatif, et s'il attend encore une réponse.",
      ],
    },
    faq: [
      {
        q: "Je peux supprimer un avis négatif ?",
        a: "Seulement s'il ne respecte pas les règles de Google (faux, insultant, hors sujet), en le signalant. Sinon, la meilleure réponse est une réponse : courte, polie, avec ce que vous avez changé.",
      },
      {
        q: "Je peux offrir quelque chose contre un avis ?",
        a: "Non. Google l'interdit et peut supprimer les avis concernés, voire suspendre la fiche. Demandez un avis à tous vos clients, sans contrepartie.",
      },
      {
        q: "Combien d'avis faut-il avoir ?",
        a: "L'analyse compare votre nombre d'avis à celui des restaurants autour de vous : c'est ce que le client compare aussi.",
      },
      {
        q: "Vous répondez aux avis pour moi ?",
        a: "Un espace pour suivre vos avis avec des réponses proposées est en préparation. Le rapport vous dit déjà quels avis attendent une réponse.",
      },
    ],
    ctaTitle: "Lancez l'analyse de vos avis",
    ctaBody: "Tapez le nom de votre restaurant ci-dessus. Premier aperçu en moins d'une minute.",
    related: ["analyse-fiche-google-restaurant", "visibilite-restaurant", "fiche-google-restaurant"],
  },
  {
    slug: "visibilite-restaurant",
    kind: "analyse",
    navLabel: "Test de visibilité",
    metaTitle: "Visibilité de votre restaurant sur Google Maps : le test",
    metaDescription:
      "Votre place sur Google Maps autour de votre restaurant, face à vos concurrents à 600 m. Test gratuit pour les restaurants de Bruxelles.",
    keywords: ["visibilité restaurant", "notoriété restaurant", "restaurant google maps", "classement google maps restaurant"],
    eyebrow: "Analyse gratuite",
    h1: "Votre restaurant est-il visible dans votre quartier ?",
    lead:
      "Quand quelqu'un cherche où manger près de chez vous, Google lui montre une liste. L'analyse vous dit à quelle place vous êtes, et qui passe devant vous.",
    problem: {
      title: "Ce que vous ne voyez pas de votre comptoir",
      points: [
        "Votre place sur Google Maps change d'une rue à l'autre.",
        "Un concurrent ouvert depuis six mois peut apparaître avant vous.",
        "Vos clients voient vos voisins juste en dessous de votre fiche, avec leur note et leurs photos.",
      ],
    },
    how: {
      title: "Comment se passe l'analyse",
      steps: [
        { title: "Vous cherchez votre restaurant", body: "Par son nom, tel qu'il apparaît sur Google Maps." },
        { title: "Vous voyez vos voisins", body: "Les restaurants à moins de 600 m, avec leur note et leur nombre d'avis, en moins d'une minute." },
        {
          title: "Le rapport complet arrive sur WhatsApp",
          body: "Votre rang sur Google Maps depuis neuf points autour du restaurant, votre concurrent n° 1, et comment le dépasser.",
        },
      ],
    },
    youDo: {
      title: "Ce que vous avez à faire",
      items: ["Taper le nom de votre restaurant.", "Laisser votre numéro pour recevoir le rapport complet."],
    },
    youSee: {
      title: "Ce que vous recevez",
      items: [
        { title: "Le classement vu depuis votre porte", body: "Votre rang sur Google Maps depuis neuf points autour de vous." },
        { title: "Votre concurrent n° 1", body: "Ce que ses clients lui reprochent, et comment le dépasser." },
        { title: "Les fiches que Google propose à vos clients", body: "Les établissements montrés juste sous votre fiche." },
      ],
    },
    checklist: {
      title: "Ce que l'analyse mesure autour de vous",
      items: [
        "Les restaurants à moins de 600 m, leur note et leur nombre d'avis.",
        "Votre rang sur Google Maps depuis neuf points autour du restaurant.",
        "Le concurrent qui vous devance le plus souvent.",
        "Ce que ses clients lui reprochent dans leurs avis.",
        "Les fiches que Google affiche sous la vôtre.",
        "Votre site : s'il répond, et s'il s'affiche bien sur un téléphone.",
      ],
    },
    faq: [
      {
        q: "Pourquoi mon rang change selon l'endroit ?",
        a: "Google montre d'abord les restaurants proches de la personne qui cherche. C'est pour ça que l'analyse mesure votre place depuis plusieurs points autour de vous.",
      },
      {
        q: "Comment passer devant un concurrent ?",
        a: "Une fiche plus complète, plus d'avis récents, des réponses à vos avis et des photos à jour. Le rapport vous dit ce qui compte le plus dans votre cas.",
      },
      {
        q: "La pub peut-elle m'aider à être plus visible ?",
        a: "Une pub de quartier sur Facebook et Instagram fait connaître votre restaurant aux gens autour de vous. Elle ne change pas votre place sur Google Maps, mais elle amène du monde.",
      },
      {
        q: "Combien de temps pour avoir le rapport ?",
        a: "Le premier aperçu arrive en moins d'une minute. Le rapport complet, relu par notre équipe, arrive ensuite sur WhatsApp.",
      },
    ],
    ctaTitle: "Lancez le test de visibilité",
    ctaBody: "Tapez le nom de votre restaurant ci-dessus. Vos voisins en moins d'une minute.",
    related: ["analyse-fiche-google-restaurant", "analyse-avis-google-restaurant", "publicite-restaurant"],
  },
];

export const PILLAR_LABEL: Record<Pillar, string> = {
  revenir: "Faire revenir",
  venir: "Faire venir",
  main: "Garder la main",
};

export const getMarketingPage = (slug: string) => MARKETING_PAGES.find((p) => p.slug === slug);
