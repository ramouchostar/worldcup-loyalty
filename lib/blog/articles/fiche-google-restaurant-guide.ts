import type { BlogArticle } from "../types";

export const article: BlogArticle = {
  slug: "fiche-google-restaurant-guide",
  category: "Google",
  title: "Fiche Google d'un restaurant : le guide complet pour être choisi sur Google Maps",
  metaTitle: "Fiche Google restaurant : le guide complet (2026)",
  metaDescription:
    "Catégorie, horaires, photos, menu, avis, réponses : comment remplir la fiche Google de votre restaurant pour être choisi sur Google Maps. Guide pas à pas.",
  excerpt:
    "Avant de pousser votre porte, la plupart des clients ont déjà vu votre fiche Google. Voici comment la remplir, champ par champ, pour qu'elle donne envie d'entrer plutôt que d'aller chez le voisin.",
  published: "2026-11-01",
  readingMinutes: 10,
  keywords: [
    "fiche d'établissement google",
    "fiche google my business restaurant",
    "fiche google restaurant",
    "google maps restaurant",
    "créer fiche google restaurant",
  ],
  blocks: [
    {
      type: "p",
      text: "Un mardi, 12 h 10, rue du Bailli. Une employée de bureau a faim, sort son téléphone et tape « burger » dans Google Maps. Elle voit trois restaurants dans un rayon de 400 mètres. Elle regarde les photos, la note, l'heure de fermeture, et choisit en moins de vingt secondes. Le restaurant qu'elle n'a pas choisi ne saura jamais qu'il a perdu ce client.",
    },
    {
      type: "p",
      text: "Ce moment se répète des dizaines de fois par jour autour de votre restaurant. Votre fiche d'établissement Google, c'est votre vitrine pour tous ceux qui ne passent pas physiquement devant chez vous. Ce guide reprend chaque partie de la fiche, dans l'ordre où un client la lit, avec ce qu'il faut faire et les erreurs qu'on voit le plus souvent sur le terrain à Bruxelles.",
    },
    { type: "h2", id: "revendiquer-la-fiche", text: "1. Créer ou revendiquer votre fiche" },
    {
      type: "p",
      text: "Votre restaurant a très probablement déjà une fiche, même si vous ne l'avez jamais créée : Google en ouvre une dès que des clients signalent un lieu ou laissent un avis. La première étape est donc de vérifier si elle existe, puis d'en prendre le contrôle.",
    },
    {
      type: "ol",
      items: [
        "Cherchez le nom de votre restaurant dans Google Maps. Si la fiche apparaît avec la mention « Vous êtes le propriétaire de cet établissement ? », cliquez dessus.",
        "Connectez-vous avec un compte Google qui appartient au restaurant (et pas au neveu qui vous a fait le site il y a cinq ans).",
        "Suivez la validation demandée par Google : appel, SMS, e-mail, vidéo du lieu ou courrier selon les cas.",
        "Une fois validée, ajoutez une deuxième personne de confiance comme administrateur, pour ne jamais perdre l'accès.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Une fiche, un compte qui vous appartient",
      text: "La cause numéro un des fiches abandonnées, c'est un accès perdu : l'ancien gérant, un prestataire parti, une adresse e-mail que plus personne ne consulte. Gardez la propriété de la fiche sur un compte du restaurant et donnez des accès de gestion aux autres.",
    },
    { type: "h2", id: "categorie", text: "2. La catégorie : le champ le plus sous-estimé" },
    {
      type: "p",
      text: "La catégorie principale dit à Google pour quelles recherches vous montrer. « Restaurant » tout court est trop vague : un client qui cherche « pizzeria » ou « restaurant libanais » verra d'abord les établissements qui ont choisi cette catégorie précise.",
    },
    {
      type: "ul",
      items: [
        "Choisissez comme catégorie principale ce que vous vendez le plus : « Pizzeria », « Restaurant de hamburgers », « Restaurant de poulet frit », « Restaurant de sushis ».",
        "Ajoutez quelques catégories secondaires vraies : « Restauration rapide », « Vente à emporter », « Livraison de repas ».",
        "N'ajoutez pas une catégorie pour un plat que vous servez une fois par semaine : une fiche cohérente rassure plus qu'une fiche qui coche tout.",
      ],
    },
    { type: "h2", id: "horaires", text: "3. Des horaires justes, y compris les jours fériés" },
    {
      type: "p",
      text: "Un client qui se déplace pour trouver porte close ne revient pas, et il le dit souvent dans un avis. Les horaires sont la donnée la plus consultée de la fiche, juste après les photos et la note.",
    },
    {
      type: "ul",
      items: [
        "Indiquez les horaires réels du service, pas ceux de votre présence en cuisine.",
        "Renseignez les horaires spéciaux à l'avance : jours fériés belges, fermeture annuelle, soirées de match où vous restez ouvert plus tard.",
        "Si vous fermez exceptionnellement, mettez-le sur la fiche le jour même. Google signale aux clients les horaires « confirmés récemment ».",
        "Ajoutez si besoin des horaires séparés pour la livraison ou la vente à emporter.",
      ],
    },
    { type: "h2", id: "photos", text: "4. Les photos : ce que le client regarde en premier" },
    {
      type: "p",
      text: "Sur un téléphone, les photos prennent la moitié de l'écran de votre fiche. Un client affamé décide avec ses yeux. Une fiche avec trois photos sombres envoyées par des clients perd face au voisin qui montre ses plats en gros plan, sa salle et sa devanture.",
    },
    {
      type: "table",
      head: ["Photo", "Pourquoi", "Conseil"],
      rows: [
        ["Devanture de jour", "Le client reconnaît l'endroit en arrivant", "Prise depuis le trottoir d'en face, enseigne lisible"],
        ["Vos 5 plats les plus vendus", "C'est ce qu'il va commander", "Lumière du jour, assiette réelle, pas de photo de catalogue"],
        ["La salle", "Il sait s'il peut venir à quatre ou avec une poussette", "Salle propre et dressée, avant le service"],
        ["L'équipe ou la cuisine", "Ça humanise et rassure sur l'hygiène", "Une ou deux photos suffisent"],
        ["Le comptoir ou la vitrine", "Utile pour la vente à emporter", "Montrez ce qu'on voit en entrant"],
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Ajoutez des photos chaque mois",
      text: "Un nouveau plat, une salle décorée pour les fêtes, une vitrine du jour : quelques photos récentes chaque mois montrent que le restaurant est vivant. Les photos envoyées par vos clients resteront, mais les vôtres donnent le ton.",
    },
    { type: "h2", id: "menu-commander", text: "5. Le menu et le lien « Commander »" },
    {
      type: "p",
      text: "Beaucoup de clients veulent voir les prix avant de venir. Si votre menu n'est pas sur la fiche, ils iront le chercher ailleurs, ou chez un concurrent qui l'affiche.",
    },
    {
      type: "ul",
      items: [
        "Ajoutez votre menu avec les prix, ou au minimum une photo lisible de la carte à jour.",
        "Si vous prenez des commandes à emporter, ajoutez le lien de commande. Privilégiez votre propre lien quand vous en avez un : une commande passée chez vous ne paie pas la commission d'une plateforme.",
        "Vérifiez les liens de commande que Google ajoute tout seul : ils pointent parfois vers une plateforme de livraison plutôt que vers vous.",
      ],
    },
    { type: "h2", id: "attributs-description", text: "6. Attributs et description" },
    {
      type: "p",
      text: "Les attributs sont les petites cases que Google propose : terrasse, accès en fauteuil roulant, paiement par carte, options végétariennes, halal, wifi, adapté aux enfants. Chaque case cochée peut faire apparaître votre restaurant dans une recherche plus précise, comme « restaurant halal avec terrasse ».",
    },
    {
      type: "p",
      text: "La description, elle, doit dire en deux ou trois phrases ce qui vous rend différent : votre spécialité, votre quartier, ce que les habitués viennent chercher. Évitez les listes de mots-clés : écrivez pour un client, pas pour un robot.",
    },
    { type: "h2", id: "questions-posts", text: "7. Questions-réponses et posts" },
    {
      type: "p",
      text: "Sous votre fiche, n'importe qui peut poser une question, et n'importe qui peut y répondre. Si vous ne répondez pas, un inconnu le fera à votre place, parfois de travers. Jetez-y un œil chaque semaine, et répondez vous-même aux questions qui reviennent : livraison, réservation, parking, allergènes.",
    },
    {
      type: "p",
      text: "Les posts sont de petites publications visibles sur la fiche : un plat du mois, une offre du midi, un horaire spécial pour un match. Un post par semaine ou par quinzaine suffit à montrer une fiche active.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Votre fiche est-elle complète ?",
      text: "Tapez le nom de votre restaurant : vous obtenez une note sur 100 de votre fiche, champ par champ, et ce qui manque face à vos voisins. Gratuit, en moins d'une minute.",
    },
    { type: "h2", id: "avis", text: "8. Les avis : la note, le nombre et vos réponses" },
    {
      type: "p",
      text: "Trois choses comptent dans les avis : la note moyenne, le nombre d'avis, et leur fraîcheur. Un restaurant à 4,6 avec 40 avis dont le dernier date d'un an inspire moins confiance qu'un restaurant à 4,5 avec 600 avis dont plusieurs cette semaine.",
    },
    {
      type: "ul",
      items: [
        "Demandez un avis à vos clients satisfaits, à tous, sans trier et sans rien offrir en échange.",
        "Répondez aux avis, y compris aux bons : ça montre qu'il y a quelqu'un derrière la fiche.",
        "Répondez aux mauvais avis avec calme et avec une solution : le prochain client lit surtout votre réponse.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Un avis ne s'achète jamais",
      text: "Les règles de Google interdisent toute contrepartie à un avis : réduction, boisson offerte, points de fidélité, tirage au sort. Google peut supprimer ces avis et sanctionner la fiche. Demandez, remerciez, mais n'offrez rien en échange.",
    },
    {
      type: "p",
      text: "Pour savoir comment répondre, avec des exemples de réponses à des avis positifs, négatifs ou injustes, lisez notre guide dédié aux réponses aux avis Google.",
    },
    { type: "h2", id: "nom-adresse-telephone", text: "9. Nom, adresse, téléphone : la cohérence partout" },
    {
      type: "p",
      text: "Votre nom, votre adresse et votre numéro de téléphone doivent être écrits exactement de la même façon sur votre fiche Google, votre site, votre page Facebook, Instagram et les plateformes de livraison. Quand ces informations se contredisent, Google a moins confiance, et le client aussi.",
    },
    {
      type: "ul",
      items: [
        "Le nom de la fiche = le nom sur votre enseigne. N'y ajoutez pas « meilleur burger de Bruxelles » : c'est contraire aux règles et ça peut faire suspendre la fiche.",
        "Une adresse précise, avec le bon numéro et la bonne commune (Ixelles n'est pas Bruxelles-Ville pour un client qui cherche près de chez lui).",
        "Un numéro qui répond pendant les heures d'ouverture.",
      ],
    },
    { type: "h2", id: "place-sur-maps", text: "10. Ce qui joue sur votre place dans Google Maps" },
    {
      type: "p",
      text: "Google explique publiquement qu'il classe les résultats locaux selon trois critères : la pertinence (votre fiche correspond-elle à ce que le client cherche ?), la distance (êtes-vous près de lui ?) et la notoriété (votre restaurant est-il connu, cité, bien noté ?). Vous ne pouvez rien sur la distance. Vous pouvez beaucoup sur le reste.",
    },
    {
      type: "table",
      head: ["Ce que regarde Google", "Ce que vous pouvez faire"],
      rows: [
        ["Pertinence", "Bonne catégorie, description claire, menu, attributs cochés"],
        ["Distance", "Rien, sauf une adresse exacte et un repère sur la carte au bon endroit"],
        ["Notoriété", "Des avis réguliers, des réponses, des photos récentes, un site et des réseaux qui parlent de vous"],
      ],
    },
    {
      type: "p",
      text: "Votre place change aussi d'une rue à l'autre : un client à 200 mètres au nord ne voit pas le même classement qu'un client à 500 mètres au sud. C'est pour ça qu'un restaurant peut être premier devant sa porte et invisible deux rues plus loin.",
    },
    { type: "h2", id: "statistiques", text: "11. Suivre ce que votre fiche vous rapporte" },
    {
      type: "p",
      text: "Dans l'espace de gestion de votre fiche, Google affiche chaque mois combien de personnes ont vu votre restaurant, combien ont appelé, demandé l'itinéraire, cliqué vers votre site ou votre menu. Ces chiffres valent de l'or : ils vous disent si vos changements ont servi.",
    },
    {
      type: "ul",
      items: [
        "Notez les chiffres du mois avant de modifier votre fiche, puis comparez le mois suivant.",
        "Regardez les recherches qui mènent à vous : si personne ne vous trouve sur « pizzeria Ixelles », votre catégorie ou votre description sont à revoir.",
        "Une hausse des demandes d'itinéraire le week-end, c'est souvent des clients qui ne vous connaissaient pas encore.",
      ],
    },
    { type: "h2", id: "erreurs-frequentes", text: "Les erreurs qui font fuir, et ce qui fait entrer" },
    {
      type: "compare",
      badTitle: "Ce qui fait fuir",
      bad: [
        "Des horaires faux, surtout les jours fériés",
        "Trois photos floues envoyées par des clients",
        "Aucun menu ni prix visible",
        "Des avis négatifs restés sans réponse depuis des mois",
        "Une catégorie « Restaurant » trop vague",
        "Un nom de fiche bourré de mots-clés",
      ],
      goodTitle: "Ce qui fait entrer",
      good: [
        "Des horaires à jour, jours fériés compris",
        "Des photos nettes des plats les plus vendus et de la devanture",
        "Le menu avec les prix et un lien pour commander",
        "Une réponse calme et utile sous chaque avis",
        "Une catégorie précise et des attributs cochés",
        "Le nom exact de votre enseigne, rien de plus",
      ],
    },
    { type: "h2", id: "checklist", text: "La checklist à faire ce mois-ci" },
    {
      type: "ol",
      items: [
        "Vérifier que vous êtes propriétaire de la fiche et ajouter un deuxième administrateur.",
        "Choisir une catégorie principale précise et deux ou trois catégories secondaires vraies.",
        "Mettre à jour les horaires et ajouter les horaires spéciaux des trois prochains mois.",
        "Ajouter au moins dix photos récentes : devanture, plats phares, salle, équipe.",
        "Publier le menu avec les prix et vérifier le lien de commande.",
        "Cocher tous les attributs qui s'appliquent et écrire une description de deux ou trois phrases.",
        "Répondre aux questions de la section questions-réponses.",
        "Répondre à tous les avis des trois derniers mois.",
        "Vérifier que le nom, l'adresse et le téléphone sont identiques sur le site, Facebook, Instagram et les plateformes.",
        "Programmer un post toutes les deux semaines.",
      ],
    },
    {
      type: "p",
      text: "Une fiche remplie ne suffit pas toujours à faire revenir un client qui est venu une fois. C'est là que la fidélité prend le relais : un client inscrit, vous pouvez lui écrire un soir calme. Mais tout commence par cette première impression sur Google.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "Une question sur votre fiche ?",
      text: "Envoyez-nous le nom de votre restaurant sur WhatsApp : on regarde votre fiche avec vous et on vous dit par où commencer.",
    },
  ],
  faq: [
    {
      q: "Combien coûte une fiche Google pour un restaurant ?",
      a: "Rien. La fiche d'établissement Google est gratuite. Ce qui demande du temps, c'est de la tenir à jour : horaires, photos, réponses aux avis.",
    },
    {
      q: "Combien de temps faut-il pour voir un effet sur Google Maps ?",
      a: "Les changements visibles (horaires, photos, menu) apparaissent en général en quelques jours. Une meilleure place dans les résultats se construit sur plusieurs semaines, surtout avec des avis réguliers.",
    },
    {
      q: "Puis-je supprimer un avis négatif ?",
      a: "Non, sauf s'il enfreint les règles de Google (insulte, faux avis, contenu hors sujet) : dans ce cas, vous pouvez le signaler. Pour les autres, la meilleure réponse est une réponse publique calme et utile.",
    },
    {
      q: "Faut-il un site internet en plus de la fiche Google ?",
      a: "Ce n'est pas obligatoire, mais un site simple avec votre menu, vos horaires et un lien de commande renforce votre fiche et vous évite de dépendre d'une plateforme.",
    },
    {
      q: "Que faire si quelqu'un d'autre a pris le contrôle de ma fiche ?",
      a: "Demandez l'accès depuis la fiche dans Google Maps : le propriétaire actuel est prévenu. S'il ne répond pas, Google vous propose une procédure pour récupérer la fiche en prouvant que vous gérez l'établissement.",
    },
  ],
  related: ["analyse-fiche-google-restaurant", "fiche-google-restaurant", "blog/repondre-avis-google-restaurant", "visibilite-restaurant"],
};
