import type { BlogArticle } from "../types";

export const article: BlogArticle = {
  slug: "publicite-tiktok-restaurant",
  category: "Publicité",
  title: "Publicité TikTok pour un restaurant : quand ça vaut le coup, et comment s'y prendre",
  metaTitle: "Publicité TikTok pour restaurant : le guide pratique",
  metaDescription:
    "Faut-il faire de la pub TikTok pour votre restaurant ? Les vidéos qui marchent, un budget de départ prudent, le ciblage local et comment mesurer qui vient.",
  excerpt:
    "TikTok peut remplir une salle, à condition d'avoir les bonnes vidéos et une façon de compter qui vient. Voici quand se lancer, quoi filmer, combien mettre au départ, et comment comparer avec Facebook et Instagram.",
  published: "2026-11-01",
  readingMinutes: 7,
  keywords: ["publicité tiktok restaurant", "pub tiktok restaurant", "tiktok restaurant", "marketing tiktok restauration"],
  blocks: [
    {
      type: "p",
      text: "Un samedi, un smash burger d'Etterbeek publie une vidéo de quinze secondes : la viande écrasée sur la plaque, le fromage qui coule, la file devant la porte. Le lundi, des clients arrivent en montrant la vidéo sur leur téléphone. Ce scénario arrive, mais il ne se commande pas. La publicité TikTok sert justement à ne pas dépendre du hasard : vous payez pour montrer vos meilleures vidéos aux gens qui vivent autour de chez vous.",
    },
    { type: "h2", id: "ca-vaut-le-coup", text: "TikTok vaut-il le coup pour votre restaurant ?" },
    {
      type: "p",
      text: "TikTok marche bien pour les restaurants qui ont quelque chose à montrer en mouvement et une clientèle plutôt jeune. Il marche moins pour un restaurant dont la clientèle principale ne l'utilise pas, ou dont les plats ne se filment pas bien.",
    },
    {
      type: "compare",
      badTitle: "TikTok risque de vous décevoir si",
      bad: [
        "Votre clientèle est surtout composée de familles et de seniors du quartier",
        "Vous n'avez personne pour filmer régulièrement",
        "Votre fiche Google est incomplète ou mal notée",
        "Vous ne savez pas comment compter les clients venus par la pub",
      ],
      goodTitle: "TikTok a de bonnes chances de marcher si",
      good: [
        "Vos clients ont entre 16 et 35 ans : étudiants, bureaux, sorties du soir",
        "Vos plats sont visuels : fromage qui coule, préparation devant le client, portions généreuses",
        "Vous pouvez tourner deux ou trois vidéos courtes par mois",
        "Vous avez une offre simple à donner avec un mot clé à dire au comptoir",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Commencez par votre fiche Google",
      text: "Quelqu'un qui voit votre vidéo va presque toujours vérifier votre fiche Google avant de venir. Si elle a des horaires faux ou des avis sans réponse, la pub paie pour envoyer des gens vers une vitrine qui les fait repartir.",
    },
    { type: "h2", id: "videos-qui-marchent", text: "Les vidéos qui marchent en restauration" },
    {
      type: "p",
      text: "Sur TikTok, une pub qui ressemble à une pub est zappée en une seconde. Les vidéos qui marchent ressemblent à ce que publient les gens : filmées au téléphone, à la verticale, avec du son, et qui montrent quelque chose dans les deux premières secondes.",
    },
    {
      type: "table",
      head: ["Format", "Ce qu'on voit", "Pourquoi ça marche"],
      rows: [
        ["Le gros plan", "Le plat en préparation : la découpe, la sauce, le fromage", "La faim se déclenche à l'image"],
        ["Les coulisses", "La cuisine avant le service, la pâte du matin, l'arrivée des produits", "Ça montre le fait maison et l'équipe"],
        ["L'avant / après", "Le comptoir vide à 11 h 30, plein à 12 h 15", "Ça prouve que d'autres viennent déjà"],
        ["La réaction", "Un client qui goûte pour la première fois", "Le spectateur se projette à sa place"],
        ["L'offre", "Le plat, le prix, le mot clé à dire au comptoir", "Ça donne une raison de venir cette semaine"],
      ],
    },
    {
      type: "ul",
      items: [
        "Montrez le plat dans la première seconde, pas votre logo.",
        "Filmez à la verticale, en lumière du jour quand c'est possible.",
        "Écrivez le nom du quartier à l'écran : « Ixelles », « place Flagey ». Le spectateur sait que c'est près de chez lui.",
        "Gardez les vidéos courtes : 10 à 20 secondes suffisent.",
      ],
    },
    {
      type: "p",
      text: "Si vous n'avez ni le temps ni l'envie de filmer, un vidéaste habitué aux restaurants peut tourner en une matinée de quoi alimenter plusieurs semaines. Chez Boosteats, on peut vous mettre en relation avec des vidéastes et photographes : demandez-le sur WhatsApp.",
    },
    { type: "h2", id: "budget-depart", text: "Quel budget pour commencer ?" },
    {
      type: "p",
      text: "Commencez petit, sur une durée courte, avec une seule offre. Le but du premier essai n'est pas de remplir la salle : c'est de savoir si votre quartier réagit à vos vidéos.",
    },
    {
      type: "ol",
      items: [
        "Fixez une période de deux semaines, de préférence sur des jours où vous avez de la place en salle.",
        "Choisissez un budget total que vous acceptez de perdre si ça ne marche pas. TikTok impose un budget minimum par jour : vérifiez-le dans son gestionnaire de publicités avant de vous lancer.",
        "Faites tourner deux ou trois vidéos différentes, pas une seule.",
        "Au bout d'une semaine, coupez la vidéo qui fait le moins de vues complètes et gardez les autres.",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Une offre, un mot clé, une date de fin",
      text: "« Dites PLAGE au comptoir : la boisson est offerte avec votre menu, jusqu'au 21. » Une offre claire, limitée dans le temps, avec un mot qu'on ne dit pas par hasard : c'est ce qui vous permettra de compter les clients venus par la pub.",
    },
    { type: "h2", id: "ciblage-local", text: "Le ciblage local : viser les gens qui peuvent venir" },
    {
      type: "p",
      text: "Pour un restaurant, le seul ciblage qui compte vraiment, c'est la distance. Une vidéo vue par quelqu'un à Liège ne vous rapporte rien. Limitez la diffusion à la zone d'où viennent vos clients : votre commune et les communes voisines, ou un rayon de quelques kilomètres si l'outil le permet. Ajoutez ensuite une tranche d'âge qui correspond à votre clientèle, et c'est tout.",
    },
    {
      type: "p",
      text: "Évitez d'empiler les centres d'intérêt (cuisine, sorties, fast-food) : sur une petite zone, chaque filtre en plus réduit l'audience et fait monter le prix de chaque vue.",
    },
    { type: "h2", id: "mesurer", text: "Comment savoir qui vient grâce à la pub" },
    {
      type: "p",
      text: "Les vues et les likes ne remplissent pas une salle. Ce qui compte, ce sont les clients qui passent la porte. Trois façons simples de les compter :",
    },
    {
      type: "ul",
      items: [
        "Le mot clé : chaque client qui le dit au comptoir est venu par la pub. Votre équipe note un trait sur une feuille, ou le compte sur la caisse si elle le permet.",
        "La comparaison avec les semaines d'avant : votre chiffre des mêmes jours, sans pub, face aux jours avec pub.",
        "Les nouveaux clients inscrits à votre programme de fidélité pendant la période : ce sont des contacts que vous pourrez relancer ensuite, sans repayer de pub.",
      ],
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Avant la pub, vérifiez votre vitrine",
      text: "L'analyse gratuite note votre fiche Google, vos avis et votre place face à vos voisins. C'est ce que voient les gens qui découvrent votre restaurant par une vidéo.",
    },
    { type: "h2", id: "erreurs", text: "Les erreurs qu'on voit le plus souvent" },
    {
      type: "ul",
      items: [
        "Une vidéo de présentation du restaurant de 60 secondes avec musique libre de droits : personne ne la regarde jusqu'au bout.",
        "Une diffusion sur toute la Belgique « pour toucher plus de monde » : le budget part chez des gens qui ne viendront jamais.",
        "Une pub sans offre ni date de fin : le spectateur aime, puis oublie.",
        "Une pub lancée un samedi déjà complet : vous payez pour des clients que vous ne pouvez pas servir. Visez vos jours creux.",
        "Arrêter au bout de trois jours parce que rien ne bouge : laissez au moins une semaine avant de juger une vidéo.",
      ],
    },
    { type: "h2", id: "tiktok-ou-instagram", text: "TikTok, Instagram ou Facebook ?" },
    {
      type: "table",
      head: ["", "TikTok", "Instagram et Facebook"],
      rows: [
        ["Public", "Plutôt jeune, très local si on le cible bien", "Plus large, tous âges, très bon pour un quartier"],
        ["Ce qu'il faut", "Des vidéos verticales régulières, au ton naturel", "Une vidéo ou de belles photos suffisent pour démarrer"],
        ["Ciblage par distance", "Par zone géographique", "Par rayon précis autour de l'adresse"],
        ["Pour qui en premier", "Burgers, street food, desserts, bubble tea, concepts visuels", "Tous les restaurants de quartier"],
      ],
    },
    {
      type: "p",
      text: "Pour un premier essai, la plupart des restaurants de quartier ont intérêt à commencer par Facebook et Instagram : le ciblage par rayon autour du restaurant est précis, et une même vidéo sert sur les deux. TikTok devient intéressant quand vous avez déjà quelques vidéos qui plaisent et une clientèle jeune.",
    },
    {
      type: "p",
      text: "Aujourd'hui, Boosteats monte et gère pour vous la pub de quartier sur Facebook et Instagram, avec une estimation avant de payer et une offre avec mot clé. Pour TikTok, parlons-en sur WhatsApp : on regarde ensemble si votre restaurant s'y prête.",
    },
    { type: "h2", id: "apres-la-pub", text: "Après la pub : ne pas perdre les clients gagnés" },
    {
      type: "p",
      text: "Une pub amène un client une fois. Ce qui fait la différence sur votre chiffre, c'est de le revoir. Un client qui s'inscrit à votre programme de fidélité lors de sa première visite, vous pouvez lui écrire un mardi soir calme ou pour un nouveau plat, sans repayer de pub. C'est pour ça qu'on conseille de lancer la fidélité avant la pub, pas après.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "TikTok pour votre restaurant ?",
      text: "Dites-nous sur WhatsApp ce que vous servez et où vous êtes : on vous dit franchement si TikTok vaut le coup chez vous, ou s'il vaut mieux commencer par Instagram et Facebook.",
    },
  ],
  faq: [
    {
      q: "Faut-il un compte TikTok actif avant de faire de la pub ?",
      a: "C'est préférable. Quelqu'un qui aime votre pub va regarder votre compte : quelques vidéos publiées avant le lancement le rassurent.",
    },
    {
      q: "Combien de vidéos faut-il pour démarrer ?",
      a: "Deux ou trois vidéos courtes suffisent pour un premier essai. Vous gardez ensuite celle qui est le plus regardée jusqu'au bout.",
    },
    {
      q: "Peut-on cibler seulement les gens du quartier ?",
      a: "Oui, en limitant la diffusion à une zone géographique proche de votre restaurant. Plus la zone est juste, moins vous payez pour des gens qui ne viendront jamais.",
    },
    {
      q: "Boosteats gère-t-il la pub TikTok ?",
      a: "Aujourd'hui, nous gérons la pub de quartier sur Facebook et Instagram. Pour TikTok, écrivez-nous sur WhatsApp : on regarde avec vous si ça vaut le coup.",
    },
    {
      q: "Comment savoir si la pub a fait venir des clients ?",
      a: "Avec une offre et un mot clé à dire au comptoir, et en comparant vos ventes des mêmes jours avec et sans pub.",
    },
  ],
  related: ["publicite-restaurant", "blog/publicite-facebook-instagram-restaurant", "programme-fidelite-restaurant", "analyse-fiche-google-restaurant"],
};
