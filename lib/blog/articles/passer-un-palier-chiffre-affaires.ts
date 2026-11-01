import type { BlogArticle } from "../types";

export const article: BlogArticle = {
  slug: "passer-un-palier-chiffre-affaires",
  category: "Chiffre d'affaires",
  title: "Passer un palier de chiffre d'affaires dans son restaurant : la méthode",
  metaTitle: "Passer un palier de chiffre d'affaires au restaurant",
  metaDescription:
    "Noter son chiffre chaque jour, trouver son point de départ, se fixer des marches de 20 € qu'on peut tenir, et savoir quel levier tirer selon le jour.",
  excerpt:
    "On ne passe pas de 350 € à 450 € par jour d'un coup. On y monte par marches de 20 €, tenues semaine après semaine. Voici la méthode, du carnet de caisse aux leviers à tirer.",
  published: "2026-11-01",
  readingMinutes: 10,
  keywords: [
    "augmenter chiffre d'affaires restaurant",
    "chiffre d'affaires restaurant",
    "objectif chiffre d'affaires restaurant",
    "chiffre d'affaires moyen restaurant",
  ],
  blocks: [
    {
      type: "p",
      text: "« Je veux faire plus. » Tous les restaurateurs qu'on rencontre le disent, et presque aucun ne peut répondre à la question suivante : plus que quoi ? Combien faites-vous un mardi normal ? Et un samedi ? Est-ce que ce mois-ci est meilleur que le même mois l'an dernier, ou est-ce que vous avez juste eu deux bons week-ends ?",
    },
    {
      type: "p",
      text: "Passer un palier de chiffre d'affaires n'est pas une affaire de chance ni d'une grosse promo. C'est une méthode en quatre temps : noter, trouver son point de départ, se fixer des marches réalistes, et tirer le bon levier au bon moment. C'est celle qu'on applique avec les restaurants qu'on accompagne à Bruxelles.",
    },
    { type: "h2", id: "noter-chaque-jour", text: "1. Noter son chiffre chaque jour, en deux blocs" },
    {
      type: "p",
      text: "Tout commence par un chiffre noté chaque soir, au même moment, de la même façon. Sans ce chiffre, on pilote à l'impression, et l'impression ment : un samedi bondé fait oublier trois mardis vides.",
    },
    {
      type: "p",
      text: "Notez votre chiffre en deux blocs, parce qu'ils ne racontent pas la même histoire :",
    },
    {
      type: "ul",
      items: [
        "La caisse : la carte, le cash et vos propres commandes en ligne. C'est l'argent qui vient de vos clients à vous, sans commission.",
        "Les plateformes : Uber Eats, Deliveroo, Takeaway. C'est du chiffre, mais une partie part en commission, et ces clients-là appartiennent d'abord à la plateforme.",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Deux minutes, chaque soir, à la fermeture",
      text: "Le bon moment est quand vous faites la caisse. Vous lisez le total de votre caisse et ceux des tablettes des plateformes, vous les notez, c'est fini. Un jour fermé se note comme fermé : il ne doit pas faire baisser votre moyenne.",
    },
    { type: "h2", id: "point-de-depart", text: "2. Trouver son point de départ : 28 jours notés" },
    {
      type: "p",
      text: "Votre point de départ, c'est votre chiffre moyen par jour ouvert sur vos 28 premiers jours notés. Quatre semaines, parce qu'il faut voir chaque jour de la semaine au moins quatre fois pour que la moyenne tienne debout.",
    },
    {
      type: "p",
      text: "Ce chiffre ne bouge plus une fois calculé. C'est votre ligne de départ, la référence à laquelle tout sera comparé. Ne le choisissez pas sur un mois exceptionnel (décembre, ramadan, un festival à côté) : prenez quatre semaines normales.",
    },
    {
      type: "callout",
      tone: "attention",
      title: "Moins de 28 jours notés, pas de conclusion",
      text: "Avec dix jours de données, un seul samedi pluvieux fausse tout. Tant que vous n'avez pas vos 28 jours, notez sans tirer de conclusion, et travaillez déjà la base : faire inscrire vos clients, remplir votre fiche Google.",
    },
    { type: "h2", id: "marches", text: "3. Des marches de 5 % que l'on peut tenir" },
    {
      type: "p",
      text: "L'erreur classique : « je fais 350 € par jour, je vise 450 € ». L'objectif est loin, on ne le touche jamais, et au bout de trois semaines on arrête de regarder. Un objectif qu'on n'atteint pas décourage plus qu'il ne motive.",
    },
    {
      type: "p",
      text: "La méthode qui marche : découper la route en marches égales. Chaque marche vaut 5 % de votre point de départ, arrondie à 10 €. Cinq marches, et vous êtes arrivé au palier supérieur.",
    },
    {
      type: "table",
      head: ["Niveau", "Chiffre moyen par jour visé", "Ce que ça représente dans la journée"],
      rows: [
        ["Départ", "350 €", "Votre moyenne sur 28 jours notés"],
        ["Marche 1", "370 €", "Quelques clients de plus, ou un ticket moyen un peu plus haut"],
        ["Marche 2", "390 €", "Les jours creux commencent à se remplir"],
        ["Marche 3", "410 €", "Une partie des clients revient plus souvent"],
        ["Marche 4", "430 €", "Le quartier vous connaît"],
        ["Marche 5", "450 €", "Le palier supérieur, atteint marche par marche"],
      ],
    },
    {
      type: "p",
      text: "Exemple imaginaire : « Chez Lina », un snack de Schaerbeek, fait 350 € par jour en moyenne. La marche vaut 5 % de 350 €, soit 17,50 €, arrondie à 20 €. Son premier objectif est 370 €, pas 450 €. Vingt euros de plus par jour, c'est une famille de plus, ou deux menus de plus le midi. C'est concret, c'est atteignable, et ça se voit dès la première semaine.",
    },
    { type: "h3", text: "Quand considère-t-on une marche gagnée ?" },
    {
      type: "p",
      text: "Une marche est gagnée quand votre chiffre moyen par jour l'atteint trois semaines sur les quatre dernières. Une semaine compte si vous avez noté au moins trois jours. Trois semaines sur quatre, parce qu'un bon week-end isolé ne prouve rien, et qu'une seule mauvaise semaine (travaux dans la rue, vacances scolaires) ne doit pas tout effacer.",
    },
    {
      type: "p",
      text: "Et une marche gagnée l'est pour de bon. Une semaine difficile retarde la marche suivante, elle ne vous fait pas redescendre. C'est important pour garder le moral, et pour l'équipe à qui vous montrez le chiffre.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Votre point de départ commence aussi sur Google",
      text: "Avant de viser la marche suivante, voyez ce que les gens du quartier trouvent quand ils vous cherchent : note, avis, photos, horaires, et les voisins qui passent devant vous. Analyse gratuite en une minute.",
    },
    { type: "h2", id: "jours-forts-faibles", text: "4. Lire ses jours forts et ses jours faibles" },
    {
      type: "p",
      text: "Avec quatre semaines notées, regardez votre moyenne jour par jour : tous les lundis, tous les mardis, et ainsi de suite. Le portrait de votre semaine apparaît. Dans la plupart des restaurants de quartier, deux ou trois jours font la moitié du chiffre, et deux ou trois jours vivotent.",
    },
    {
      type: "p",
      text: "C'est là que se joue votre prochaine marche. Ajouter 20 € à un samedi déjà plein est difficile : la cuisine est au maximum. Ajouter 60 € à un mardi qui fait 200 € est beaucoup plus simple, et c'est le même gain sur la moyenne de la semaine.",
    },
    {
      type: "compare",
      badTitle: "Lire ses chiffres à l'envers",
      bad: [
        "Comparer ce mardi au samedi dernier.",
        "Juger le mois sur le chiffre d'un seul week-end.",
        "Mélanger caisse et plateformes dans un seul total.",
        "Lancer une promo le jour où la salle est déjà pleine.",
        "Changer d'objectif toutes les semaines.",
      ],
      goodTitle: "Lire ses chiffres à l'endroit",
      good: [
        "Comparer chaque jour aux mêmes jours des semaines d'avant.",
        "Raisonner en moyenne par jour ouvert sur quatre semaines.",
        "Suivre la caisse et les plateformes séparément.",
        "Mettre ses efforts sur les deux ou trois jours les plus faibles.",
        "Garder la même marche jusqu'à la tenir trois semaines sur quatre.",
      ],
    },
    { type: "h2", id: "leviers", text: "5. Les leviers à tirer, jour par jour" },
    {
      type: "p",
      text: "Une fois votre jour faible repéré, voici les leviers, du moins cher au plus cher.",
    },
    { type: "h3", text: "Faire revenir les clients qui vous connaissent déjà" },
    {
      type: "p",
      text: "C'est le levier le moins cher, de loin. Un client qui est déjà venu, qui a aimé, et dont vous avez le contact, revient sur un simple message. Un mardi à 16 h : « Ce soir, le dessert est offert avec un menu. » Ça ne coûte presque rien, parce que ces clients sont à vous. Encore faut-il avoir leur contact : c'est tout l'intérêt de les faire inscrire au comptoir dès leur première visite.",
    },
    { type: "h3", text: "Faire venir le quartier, au bon moment" },
    {
      type: "p",
      text: "Pour des nouveaux clients, une pub Facebook et Instagram dans un rayon de quelques kilomètres, sur les semaines creuses, avec une offre et un mot clé à dire au comptoir. Comptez 10 à 15 € par jour pendant deux semaines pour un premier essai. Le mot clé vous dit combien de clients la pub a amenés.",
    },
    { type: "h3", text: "Les promos au bon moment" },
    {
      type: "p",
      text: "Une promo sur un jour faible remplit. La même promo un samedi soir fait perdre de la marge sur des clients qui seraient venus de toute façon. Pensez aussi à ce qui se passe autour de vous : la pluie pousse vers l'emporter, un match du soir vide la salle mais remplit les commandes, les vacances scolaires changent le rythme du quartier.",
    },
    { type: "h3", text: "Le ticket moyen" },
    {
      type: "p",
      text: "Vingt euros de plus par jour peuvent aussi venir des clients déjà là : une boisson proposée systématiquement, un dessert mis en avant, un menu familial plus visible. Regardez quels plats se vendent le plus et lesquels vous rapportent le plus, ce ne sont pas toujours les mêmes.",
    },
    { type: "h3", text: "La salle face aux plateformes" },
    {
      type: "p",
      text: "Si les plateformes pèsent lourd dans votre chiffre, chaque client que vous ramenez au comptoir vous rapporte davantage, sans commission. Une petite carte glissée dans le sac de livraison, avec un cadeau à venir chercher sur place, transforme un client de plateforme en client à vous.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "Vous voulez qu'on regarde vos chiffres avec vous ?",
      text: "Envoyez-nous un message. On regarde ensemble votre point de départ, vos jours faibles, et le premier levier à tirer pour votre prochaine marche.",
    },
    { type: "h2", id: "exemple", text: "Un exemple sur huit semaines" },
    {
      type: "p",
      text: "Reprenons « Chez Lina », notre snack imaginaire de Schaerbeek. Son point de départ est de 350 € par jour. Ses quatre semaines notées montrent un samedi fort, autour de 520 €, un vendredi correct, et un lundi et un mardi qui tournent autour de 230 €. Sa première marche, 370 €, se jouera donc en semaine.",
    },
    {
      type: "table",
      head: ["Semaines", "Ce que fait Lina", "Ce qu'elle regarde"],
      rows: [
        ["1 et 2", "Elle fait inscrire chaque client au comptoir, avec un cadeau de bienvenue", "Le nombre de clients inscrits chaque jour"],
        ["3 et 4", "Un message aux clients inscrits le mardi à 16 h, dessert offert jusqu'à 21 h", "Ses mardis face aux mardis d'avant"],
        ["5 et 6", "Une pub de quartier de deux semaines, mot clé MARDI au comptoir", "Les mots clés comptés par l'équipe"],
        ["7 et 8", "Elle garde ce qui a marché et met un menu familial en avant le mercredi", "Sa moyenne par jour face à 370 €"],
      ],
    },
    {
      type: "p",
      text: "Lina ne lance qu'une action par quinzaine. Elle sait ainsi ce qui a fait bouger son mardi, et elle ne paie pas une pub les semaines où un simple message suffit. Si la moyenne tient 370 € trois semaines sur quatre, la marche est gagnée, et la suivante, 390 €, devient l'objectif. Sinon, elle garde la même marche et change d'action, pas d'objectif.",
    },
    {
      type: "callout",
      tone: "attention",
      title: "Ne touchez pas au prix en premier",
      text: "Augmenter les prix fait monter le chiffre d'un coup, mais c'est un levier qu'on ne tire qu'une fois et qui peut faire fuir les habitués. Remplissez d'abord vos jours faibles et travaillez le ticket moyen. Le prix se revoit plat par plat, quand vous connaissez le coût de chacun.",
    },
    { type: "h2", id: "rythme", text: "Le rythme : un point chaque lundi" },
    {
      type: "p",
      text: "La méthode tient en un rendez-vous de dix minutes, chaque lundi matin. Regardez la semaine passée face à la marche visée. Si elle est tenue, continuez. Si elle ne l'est pas, regardez quel jour a manqué, et choisissez une seule action pour la semaine : un message aux clients inscrits ce jour-là, une offre, une pub sur les deux semaines suivantes. Une action, pas cinq.",
    },
    {
      type: "p",
      text: "Montrez la marche à votre équipe. Un objectif de 370 € par jour se comprend et se partage. Il donne du sens à la phrase dite au comptoir pour faire inscrire un client, ou au dessert proposé en fin de repas.",
    },
    { type: "h2", id: "avec-boosteats", text: "Ce que Boosteats fait de cette méthode" },
    {
      type: "p",
      text: "Dans votre espace Boosteats, vous notez votre chiffre du jour en un écran, la caisse d'un côté et les plateformes de l'autre, et le total se calcule tout seul. Le point de départ se calcule sur vos 28 premiers jours notés, les marches s'affichent, et vous voyez la marche en cours. En plan Croissance (150 €/mois), vous voyez aussi chaque jour comparé aux mêmes jours des semaines précédentes, et la part de votre chiffre qui vient des clients inscrits au programme.",
    },
    {
      type: "p",
      text: "Avant les marches, il y a une première étape : lancer la machine. Faire inscrire vos clients au comptoir (ils prennent leur ticket de caisse en photo, rien à brancher sur votre caisse) et recevoir vos premiers tickets. Ce sont ces clients inscrits qui vous donneront ensuite le levier le moins cher de tous : pouvoir leur écrire.",
    },
  ],
  faq: [
    {
      q: "Comment calculer le chiffre d'affaires moyen par jour de mon restaurant ?",
      a: "Additionnez le chiffre de chaque jour ouvert sur quatre semaines, puis divisez par le nombre de jours ouverts. Les jours fermés ne comptent pas, sinon ils font baisser la moyenne à tort.",
    },
    {
      q: "Quel objectif de chiffre d'affaires me fixer ?",
      a: "Une marche à la fois : 5 % de votre point de départ, arrondie à 10 €. Si vous faites 350 € par jour, visez 370 €, pas 450 €.",
    },
    {
      q: "Faut-il compter Uber Eats et Deliveroo dans mon chiffre ?",
      a: "Oui, mais à part. Notez la caisse (carte, cash, vos commandes en ligne) d'un côté et les plateformes de l'autre : vous voyez ainsi ce qui vient de vos clients à vous.",
    },
    {
      q: "Pourquoi attendre 28 jours avant de conclure ?",
      a: "Pour voir chaque jour de la semaine au moins quatre fois. Avec moins de données, un seul samedi exceptionnel ou un soir de pluie fausse votre moyenne.",
    },
    {
      q: "Quel est le levier le moins cher pour augmenter son chiffre ?",
      a: "Faire revenir les clients qui vous connaissent déjà. Un message à vos clients inscrits un soir calme ne coûte presque rien, contrairement à une pub ou une commission de plateforme.",
    },
  ],
  related: ["chiffre-affaires-restaurant", "relancer-vos-clients", "blog/remplir-jours-creux-restaurant", "blog/publicite-facebook-instagram-restaurant"],
};
