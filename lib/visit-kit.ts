// Kit de visite des associés (/platform/kit) — prospection des restaurants
// indépendants de Bruxelles. Base : .claude/product-marketing.md,
// docs/strategie/prospection-bruxelles.md, audit gratuit (ADR 0069 / 0071).
//
// Le dépôt est PUBLIC : ce fichier ne contient aucun chiffre ni nom de client.
// Le cas client (Kraainem) vit en base, table `platform_documents`
// (migration 20261101-2024), et n'est lu que par le serveur.
//
// Règles de texte : vouvoiement, mots du comptoir, aucune technique, jamais
// « grâce à nous » (ADR 0064), jamais un pourcentage de hausse promis, jamais
// de calcul « X € = N tickets » (décision du 2026-11-01), et ce qui n'est pas
// livré se dit « en préparation » (ADR 0070).

export const CASE_STUDY_SLUG = "cas-kraainem";

export const VISIT_RULES = [
  "On vient montrer SON restaurant, pas notre logiciel.",
  "Un chiffre vérifiable plutôt qu'un superlatif. Jamais « faire exploser vos ventes », jamais un pourcentage de hausse promis, jamais « grâce à nous ».",
  "On ne parle pas de technique : le client prend son ticket en photo, point. C'est notre secret de fabrication.",
  "Ce qui n'est pas livré se dit « en préparation » : copilote du lundi, centre des avis, relance automatique, site de commande, référencement.",
  "On vouvoie, on parle comme au comptoir, une idée par phrase.",
];

export const PREP_STEPS: { title: string; body: string }[] = [
  {
    title: "Lancer l'audit",
    body: "Depuis la fiche du prospect dans l'onglet Outbound : « Relier la fiche Google », puis l'audit. Imprimer le rapport en deux exemplaires : un pour la discussion, un à laisser.",
  },
  {
    title: "Noter trois constats vrais sur son restaurant",
    body: "Ce qui va bien (on commence toujours par là), ce qui manque, les voisins. Plus, si l'audit le montre, un thème qui revient dans les avis (par exemple l'attente du vendredi soir).",
  },
  {
    title: "Choisir le départ à proposer",
    body: "Voir le cadre « Quel départ proposer » ci-dessous. Relire la stratégie suggérée par le CRM et la corriger si on sait mieux.",
  },
  {
    title: "Préparer le matériel",
    body: "Téléphone chargé avec la console de démonstration ouverte, l'audit imprimé, la page à laisser, une affiche et un QR d'exemple. Passer entre 14 h et 17 h, jamais pendant le coup de feu.",
  },
];

export const FINDINGS_EXAMPLES: { box: string; where: string; example: string }[] = [
  { box: "Ce qui va bien", where: "« Où vous en êtes »", example: "« Vous avez 4,5 sur Google avec plus de 600 avis : vos clients vous aiment. »" },
  { box: "Ce qui manque", where: "« Vos priorités », « Ce que Google voit de vous »", example: "« Votre fiche n'a pas d'horaires et pas de site relié. »" },
  { box: "Les voisins", where: "« Vous et vos concurrents sur Google Maps »", example: "« Trois restaurants à moins de 600 m apparaissent avant vous sur Maps. »" },
];

// Décision du 2026-11-01 : le départ se choisit au jugement, pas au profil.
export const OFFER_CHOICE = {
  pro: {
    label: "2 mois Pro offerts",
    when: "Le restaurant a déjà une bonne base : du monde en salle, du trafic, des visites, des résultats. Le but est de pousser son chiffre d'affaires encore plus loin.",
    signs: [
      "salle pleine ou file au comptoir aux heures de pointe",
      "beaucoup d'avis récents, une note solide",
      "il fait déjà de la pub ou des promos et veut mieux les mesurer",
      "plusieurs adresses, ou une forte part de plateformes à rapatrier en salle",
    ],
    then: "Place pilote. Au bout de 45 jours, on regarde les chiffres ensemble : Pro à 500 €/mois (3 mois minimum), ou retour au Gratuit, sans frais.",
  },
  free: {
    label: "Démarrer gratuitement",
    when: "Tous les autres. La base se construit d'abord : affiche, QR, premiers clients inscrits, premières annonces.",
    then: "On propose Croissance quand il veut suivre ses chiffres, ou une pub de quartier quand il veut du monde en plus.",
  },
  note: "Ça se sent à vue d'œil en entrant, et dans ses réponses aux questions de découverte.",
};

export type ScriptStep = { time: string; title: string; lines: string[]; say?: string[] };

export const SCRIPT: ScriptStep[] = [
  {
    time: "0:00 – 2:00",
    title: "L'accroche au comptoir",
    say: [
      "Bonjour, je suis [votre prénom], de Boosteats, à Bruxelles. On aide les restaurants du quartier à faire revenir leurs clients et à en faire venir de nouveaux. J'ai regardé votre restaurant comme un client le voit sur Google, et j'ai trois choses à vous montrer. Vous avez vingt minutes maintenant, ou je repasse à l'heure qui vous arrange ?",
    ],
    lines: [
      "Si c'est non : laisser l'audit imprimé et la page à laisser, noter « visite, absent ou occupé » dans le CRM, envoyer le message « Gérant absent » le jour même.",
    ],
  },
  {
    time: "2:00 – 7:00",
    title: "Les questions de découverte",
    lines: [
      "On écoute plus qu'on ne parle. On note ses mots exacts : ils serviront pour nos textes. Choisir 5 questions sur 7 :",
      "« Quels sont vos jours les plus calmes ? Qu'est-ce que vous faites ces jours-là ? »",
      "« Vos clients, vous les connaissez ? Vous savez qui revient et qui ne revient plus ? »",
      "« Aujourd'hui, comment vous faites pour qu'un client revienne ? Carte à tampons, promos, rien ? »",
      "« Vous avez déjà fait de la pub, sur Facebook ou Instagram ? Qu'est-ce que ça a donné ? »",
      "« Combien vous coûtent vos promos et vos cadeaux en fin de mois ? Vous le savez ? »",
      "« Vous suivez votre chiffre du jour ? Où vous le notez ? »",
      "« Quelle part de vos ventes passe par Uber Eats, Deliveroo ou Takeaway ? »",
    ],
  },
  {
    time: "7:00 – 11:00",
    title: "Ses constats à lui",
    lines: [
      "On lit l'audit avec lui, dans l'ordre préparé : ce qui va bien, ce qui manque, les voisins. On ne vend rien à ce stade.",
    ],
    say: [
      "Regardez : [constat 1]. Par contre, [constat 2]. Et quand un client cherche un restaurant ici, Google lui montre d'abord [voisins].",
      "Parmi ces trois points, lequel vous parle le plus ?",
    ],
  },
  {
    time: "11:00 – 16:00",
    title: "Les trois piliers, un écran chacun",
    lines: [
      "On part de ce qu'il a répondu en découverte et on montre UN seul écran par pilier sur le téléphone.",
      "Faire revenir — écran : l'inscription d'un client et son cadeau de bienvenue.",
      "Faire venir — écran : une pub de quartier avec son estimation.",
      "Garder la main — écran : le CA du jour et Menu & coûts.",
      "Puis le cas Kraainem (cadre ci-dessous), en deux phrases.",
    ],
    say: [
      "Le client prend son ticket en photo, il gagne des points et il choisit son cadeau. Rien à brancher : le ticket de caisse suffit, votre caisse ne change pas. Vous, vous récupérez son contact, et vous pouvez lui écrire un mardi soir calme.",
      "Et les cadeaux, c'est vous qui décidez. Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez, entre 4 et 12 %. À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats.",
      "On monte une pub Facebook et Instagram dans un rayon de 3 km autour de chez vous. Vous voyez une estimation avant de payer. Un bon départ, c'est 10 à 15 € par jour pendant deux semaines. On ajoute une offre et un mot clé à dire au comptoir : vous voyez qui vient par la pub.",
      "Vous notez votre chiffre du jour en un écran : caisse d'un côté, plateformes de l'autre. Et pour chaque plat, vous voyez le prix de vente et ce qu'il vous coûte.",
    ],
  },
  {
    time: "16:00 – 18:30",
    title: "L'offre, toujours en commençant par le Gratuit",
    say: [
      "On commence gratuitement. Pas de carte bancaire, pas d'engagement.",
      "Au-delà de 500 tickets par mois, vos clients ne sont jamais bloqués : on vous prévient, c'est tout.",
    ],
    lines: [
      "Restaurant qui a déjà une bonne base : « Pour vous, je propose deux mois de Pro offerts, en place pilote. Au bout de 45 jours, on regarde les chiffres ensemble et vous décidez : Pro, ou retour au Gratuit, sans frais. »",
    ],
  },
  {
    time: "18:30 – 20:00",
    title: "La conclusion",
    say: [
      "On peut lancer maintenant : je crée votre compte, je pose l'affiche au comptoir et le QR à la caisse, et je montre à votre équipe la phrase à dire. Dix minutes.",
      "Vous préférez y réfléchir ? Je repasse jeudi à 15 h et on le lance ensemble. Ça vous va ?",
    ],
    lines: [
      "La phrase pour l'équipe : « Vous prenez votre ticket en photo ici, vous avez un cadeau de bienvenue. »",
      "Jamais « je vous rappelle » sans date. Noter dans le CRM le jour même.",
    ],
  },
];

export const PLANS: { name: string; tagline: string; price: string; content: string; adFee: string }[] = [
  {
    name: "Gratuit",
    tagline: "Inscrivez vos clients",
    price: "0 €, pour toujours",
    content: "Affiche, QR, cadeaux calculés sur vos coûts, liste de vos clients, messages, Menu & coûts, CA du jour, jusqu'à 500 tickets par mois",
    adFee: "20 % du budget",
  },
  {
    name: "Croissance",
    tagline: "Suivez vos chiffres",
    price: "150 €/mois, sans engagement",
    content: "Tickets illimités, CA comparé jour par jour et part qui vient des clients du programme, ventes par plat, prévisions, annonces programmées",
    adFee: "15 % du budget",
  },
  {
    name: "Pro",
    tagline: "On s'en occupe",
    price: "500 €/mois, 3 mois minimum",
    content: "Tout Croissance, plus une fiche Google tenue à jour, un rapport et un point chaque mois",
    adFee: "5 % du budget",
  },
];

export const LEAVE_BEHIND = {
  title: "Faites revenir vos clients. Faites-en venir de nouveaux.",
  subtitle: "Rien à brancher : le ticket de caisse suffit.",
  pillars: [
    { name: "Faire revenir", body: "Vos clients prennent leur ticket en photo, gagnent des points et choisissent leur cadeau. Vous récupérez leur contact et vous leur écrivez quand vous voulez." },
    { name: "Faire venir", body: "Une pub Facebook et Instagram dans votre quartier, montée pour vous. Estimation avant de payer, offre et mot clé à dire au comptoir." },
    { name: "Garder la main", body: "Votre chiffre du jour en un écran. Le prix de revient de chaque plat. La part de vos ventes qui vient de vos clients inscrits." },
  ],
  gifts: "Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez (4 à 12 %). Exemple à 8 % : une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats.",
  cta: "Votre restaurant vu par vos clients sur Google : analyse gratuite en moins d'une minute — boosteats.be/audit-gratuit",
};

export const MESSAGES: { id: string; title: string; when: string; text: string }[] = [
  {
    id: "msg-premier-contact",
    title: "Premier contact sur WhatsApp",
    when: "Si le numéro publié est un mobile ; sinon par e-mail.",
    text: "Bonjour [prénom], je suis [votre prénom], de Boosteats à Bruxelles. J'ai regardé [nom du restaurant] sur Google : [constat vrai, ex. « 4,6 sur plus de 500 avis, mais aucune réponse depuis l'été »]. Je vous propose une analyse gratuite de votre restaurant (fiche Google, avis, concurrents). On en parle 20 minutes sur place, quand vous voulez, entre 14 h et 17 h ?",
  },
  {
    id: "msg-apres-visite",
    title: "Après la visite, le jour même",
    when: "Le soir de la visite.",
    text: "Merci pour votre accueil aujourd'hui, [prénom]. Comme promis, votre analyse : [lien]. Les trois points dont on a parlé : [1], [2], [3]. [Si démarré : « Votre affiche est en place, vos premiers clients peuvent s'inscrire dès ce soir. »] [Sinon : « Je repasse [jour] à [heure] comme convenu. »]",
  },
  {
    id: "msg-relance-j3",
    title: "Relance à J+3",
    when: "Trois jours après, sans réponse.",
    text: "Bonjour [prénom], petite question après notre échange : [rappeler SA réponse, ex. « vous m'aviez dit que le mardi soir est calme »]. On pourrait commencer par là, gratuitement. Je passe [jour] à 15 h ?",
  },
  {
    id: "msg-relance-j7",
    title: "Relance à J+7, la dernière",
    when: "Sept jours après, sans réponse. Ensuite on arrête.",
    text: "Bonjour [prénom], je ne veux pas vous déranger plus. L'analyse de [nom du restaurant] reste ici : [lien]. Si un jour vous voulez faire revenir vos clients sans changer votre caisse, je suis à un message. Bonne continuation.",
  },
  {
    id: "msg-absent",
    title: "Gérant absent (analyse laissée au comptoir)",
    when: "Le jour même.",
    text: "Bonjour [prénom], je suis passé chez [nom du restaurant] aujourd'hui et j'ai laissé votre analyse au comptoir. Une chose m'a frappé : [constat vrai]. Je repasse quand ça vous arrange, 20 minutes, entre 14 h et 17 h. Quel jour ?",
  },
];

export const OBJECTIONS: { said: string; worry: string; answer: string; ask: string }[] = [
  { said: "« J'ai déjà une carte à tampons / Joyn. »", worry: "Changer ses habitudes pour rien", answer: "Gardez-la si vous voulez. La différence : avec Boosteats, vous récupérez le contact de vos clients et vous pouvez leur écrire.", ask: "Aujourd'hui, si un habitué ne revient plus, vous le savez ?" },
  { said: "« Pas le temps de gérer ça. »", worry: "Une tâche de plus", answer: "Rien à installer. On pose l'affiche et le QR, votre équipe dit une phrase. Les cadeaux se calculent tout seuls à partir de vos coûts.", ask: "Si je vous montre que ça prend dix minutes aujourd'hui et rien ensuite, on essaie ?" },
  { said: "« Mes employés ne vont pas suivre. »", worry: "Que ça tombe à l'eau", answer: "C'est la vraie question, vous avez raison. Chaque employé a son propre QR, et vous voyez qui inscrit le plus de clients. On forme l'équipe le jour du lancement.", ask: "Qui, dans votre équipe, parle le plus aux clients ? On commence avec lui." },
  { said: "« Ça va me coûter combien en cadeaux ? »", worry: "Perdre de la marge", answer: "Ce que vous décidez. Vous choisissez un taux entre 4 et 12 %, et chaque cadeau est calculé sur ce qu'il vous coûte. À 8 %, une boisson à 0,60 € se gagne après 7,50 € d'achats.", ask: "Quel taux vous semble raisonnable pour commencer ?" },
  { said: "« Ça coûte combien ? » / « Pas d'abonnement. »", worry: "Être lié", answer: "Rien pour commencer : le Gratuit n'a ni carte bancaire ni engagement. Vous passez à un plan payant seulement si vous voulez suivre vos chiffres ou qu'on s'occupe de la pub.", ask: "On démarre en Gratuit et on fait le point dans un mois ?" },
  { said: "« 150 €, c'est cher. »", worry: "Ne pas rentrer dans ses frais", answer: "Vous ne le prenez que quand le Gratuit vous a déjà montré des clients inscrits. Et c'est sans engagement : vous arrêtez quand vous voulez.", ask: "On démarre en Gratuit, et on en reparle quand vous aurez vos premiers chiffres ?" },
  { said: "« Mes clients ne vont pas s'inscrire. »", worry: "Que ce soit inutile", answer: "On le mesure : au bout d'un mois, vous voyez combien se sont inscrits et combien sont revenus. Si ça ne marche pas, vous arrêtez, ça ne vous a rien coûté.", ask: "On regarde ensemble dans un mois ?" },
  { said: "« J'ai déjà essayé la pub Facebook, ça ne marche pas. »", worry: "Jeter de l'argent", answer: "Souvent, on ne sait pas ce qu'elle a donné. Ici, vous voyez une estimation avant de payer, on cible 3 km autour de chez vous, et l'offre a un mot clé à dire au comptoir : vous comptez qui vient.", ask: "Qu'est-ce que vous aviez fait la dernière fois : quel budget, combien de temps ?" },
  { said: "« Uber Eats m'apporte mes clients. »", worry: "Perdre ce qui marche", answer: "Gardez-le. Mais il vous les loue. Ceux qui reviennent au comptoir, c'est 0 % de commission.", ask: "Quelle part de vos ventes part en commission chaque mois ?" },
  { said: "« Je dois en parler à mon associé. »", worry: "Décider seul", answer: "Bien sûr. Je vous laisse la page et l'analyse. Le Gratuit ne vous engage à rien.", ask: "On les voit ensemble ? Quel jour êtes-vous là tous les deux ?" },
];

export const DONT_INSIST =
  "Pas de ticket imprimé, restaurant gastronomique centré sur la réservation, grande chaîne qui exige une intégration à la caisse, gérant jamais présent. On note « Perdu » avec la raison, et on remercie.";

export const AFTER_VISIT_FIELDS: { field: string; fill: string }[] = [
  { field: "Date et type de contact", fill: "visite / appel / WhatsApp / e-mail" },
  { field: "Personne rencontrée", fill: "prénom, rôle — uniquement ce qu'il nous a dit ou ce que publie le registre" },
  { field: "Nouveau statut", fill: "contacté / RDV audit / audit présenté / signé / perdu" },
  { field: "Stratégie confirmée", fill: "pilier / réputation / jeune / enseigne" },
  { field: "Départ proposé", fill: "Démarrer gratuitement / 2 mois Pro offerts (bonne base constatée)" },
  { field: "Ses jours calmes", fill: "ses mots" },
  { field: "Ce qu'il fait pour faire revenir", fill: "rien / carte à tampons / Joyn / autre" },
  { field: "Pub déjà faite ?", fill: "non / oui, budget, résultat dans ses mots" },
  { field: "Part des plateformes", fill: "son estimation" },
  { field: "Ses phrases exactes", fill: "2 ou 3 citations, pour nos textes et la fiche marketing" },
  { field: "Objection principale", fill: "dans ses mots" },
  { field: "Prochaine étape", fill: "action + date et heure (jamais vide)" },
  { field: "Lancement fait ?", fill: "affiche posée / QR caisse / QR employés" },
  { field: "Ne plus contacter", fill: "case cochée si demandé" },
];

export const WEEKLY_REVIEW =
  "Chaque lundi : comparer les taux mesurés du CRM aux hypothèses de départ (25 % de rendez-vous, 80 % d'audits présentés, 50 % de signés). Si une étape est très en dessous, on change le geste à cette étape (message, canal, script), pas l'objectif.";

/** Découpe un texte de la base en blocs : paragraphes, et listes pour les lignes « - ». */
export function textBlocks(body: string): ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] {
  return body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => l.startsWith("- "))) return { kind: "ul" as const, items: lines.map((l) => l.slice(2)) };
      return { kind: "p" as const, text: lines.join(" ") };
    });
}
