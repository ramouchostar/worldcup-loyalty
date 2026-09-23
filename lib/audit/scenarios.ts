// ADR 0068 §3 — la bibliothèque de solutions de l'audit.
//
// Chaque scénario = une situation précise (une combinaison de signaux) et la
// solution écrite pour ELLE, pas une solution générique recopiée. Ils sont
// calculés par combinaison de familles × contextes : ajouter un thème, un
// manque de fiche ou un état de réseau social ajoute d'un coup toutes ses
// variantes. `SCENARIOS.length` est vérifié ≥ 250 par le test.
//
// Règle d'écriture : chaque solution se termine par un geste que le gérant
// peut faire lui-même cette semaine, et un chiffre à suivre (kpi) qui dira si
// ça a marché.

import {
  FICHE_GAPS,
  NEGATIVE_THEMES,
  type AuditSignals,
  type ChannelMix,
  type CompetitivePosition,
  type FicheGap,
  type Level,
  type NegativeTheme,
  type PriceLevel,
  type RatingBand,
  type SocialState,
  type Trend,
} from "./signals";

export type Family =
  | "avis_theme"
  | "reputation"
  | "fiche"
  | "instagram"
  | "tiktok"
  | "canaux"
  | "reponse_avis"
  | "concurrence"
  | "fidelisation";

export type Horizon = "7 jours" | "30 jours" | "90 jours";
type Score = 1 | 2 | 3 | 4 | 5;

export interface Scenario {
  id: string;
  family: Family;
  title: string;
  /** Ce qu'on a constaté, formulé pour le gérant. */
  diagnostic: string;
  steps: string[];
  kpi: string;
  impact: Score;
  effort: Score;
  horizon: Horizon;
  /** Comment Boosteats aide sur ce point, quand c'est vrai — jamais forcé. */
  boosteats?: string;
  /** À présenter après une solution de cette famille quand l'audit en a une :
   *  on ne propose pas de « récupérer les clients déçus » avant d'avoir dit
   *  comment régler ce qui les a déçus. */
  after?: Family;
  when: (s: AuditSignals) => boolean;
}

const clamp = (n: number): Score => Math.max(1, Math.min(5, Math.round(n))) as Score;

// ─── A. Avis : un thème négatif × niveau de réponse × tendance ─────────────

const THEME: Record<NegativeTheme, { label: string; fix: string[]; kpi: string; impact: number; effort: number }> = {
  attente: {
    label: "l'attente",
    fix: [
      "Mesurer l'attente réelle aux heures de pointe pendant une semaine (heure de commande notée sur le ticket, heure de remise).",
      "Préparer à l'avance les trois produits les plus vendus entre 11 h 45 et 13 h 30.",
      "Afficher un délai honnête au comptoir (« 10 à 15 min ») : une attente annoncée irrite moins qu'une attente subie.",
    ],
    kpi: "part des avis qui citent l'attente, mois par mois",
    impact: 5,
    effort: 3,
  },
  livraison_froide: {
    label: "les plats froids ou ramollis en livraison",
    fix: [
      "Passer aux emballages ventilés pour les frites et le pané, et séparer chaud et froid dans le sac.",
      "Ne lancer la friture qu'à l'arrivée annoncée du livreur, pas à la commande.",
      "Retirer de la carte livraison les produits qui ne tiennent pas 20 minutes.",
    ],
    kpi: "note moyenne des avis qui mentionnent la livraison",
    impact: 4,
    effort: 2,
  },
  accueil: {
    label: "l'accueil",
    fix: [
      "Écrire trois phrases d'accueil et de départ communes à toute l'équipe.",
      "Nommer un responsable de salle par service, dont c'est la seule mission aux heures de pointe.",
      "Faire relire à l'équipe, chaque lundi, les avis de la semaine qui parlent d'elle, positifs compris.",
    ],
    kpi: "part des avis qui citent l'accueil, positifs contre négatifs",
    impact: 4,
    effort: 2,
  },
  prix: {
    label: "le prix jugé trop élevé",
    fix: [
      "Créer une formule midi lisible (plat, boisson, prix rond) qui devienne le produit d'appel.",
      "Afficher le grammage ou la taille des portions à côté des prix qui choquent.",
      "Déplacer la hausse de prix sur les suppléments plutôt que sur le produit phare.",
    ],
    kpi: "part des avis qui citent le prix ; ticket moyen",
    impact: 3,
    effort: 3,
  },
  proprete: {
    label: "la propreté",
    fix: [
      "Mettre une fiche de nettoyage horodatée en salle et aux toilettes, signée toutes les deux heures.",
      "Traiter en priorité ce que le client voit : tables, sol sous les tables, poubelles, toilettes.",
      "Prendre et publier une photo de la salle propre à l'ouverture : elle remplace sur la fiche les photos de clients prises en fin de service.",
    ],
    kpi: "part des avis qui citent la propreté",
    impact: 5,
    effort: 2,
  },
  qualite_irreguliere: {
    label: "une qualité qui varie d'une visite à l'autre",
    fix: [
      "Écrire une fiche technique photo par produit phare (grammage, cuisson, dressage) affichée en cuisine.",
      "Goûter un produit au hasard à chaque service, et noter l'écart.",
      "Repérer dans les avis les jours ou les services qui décrochent : c'est souvent une équipe précise.",
    ],
    kpi: "écart-type des notes mois par mois",
    impact: 5,
    effort: 3,
  },
  erreurs_commande: {
    label: "les erreurs de commande",
    fix: [
      "Relire la commande à voix haute au client avant l'encaissement.",
      "Ajouter une étape de contrôle du sac avant remise (étiquette cochée par une deuxième personne).",
      "Pour la livraison, coller le ticket à l'extérieur du sac pour que le client vérifie sans ouvrir.",
    ],
    kpi: "part des avis qui citent un oubli ou une erreur",
    impact: 4,
    effort: 1,
  },
  portions: {
    label: "des portions jugées trop petites",
    fix: [
      "Peser les portions pendant une semaine : l'écart vient souvent d'une personne ou d'un service.",
      "Servir dans un contenant plus ajusté : la même quantité paraît plus généreuse.",
      "Proposer une option « maxi » à petit supplément pour ceux qui ont faim.",
    ],
    kpi: "part des avis qui citent les portions",
    impact: 3,
    effort: 2,
  },
};

const RESPONSE_VARIANT: Record<Level, { note: string; step: string; impact: number }> = {
  faible: {
    note: "et presque aucun de ces avis n'a reçu de réponse",
    step: "Répondre à chaque avis qui en parle, en nommant le problème et ce qui a changé ; commencer par les 20 plus récents.",
    impact: 1,
  },
  moyen: {
    note: "et une partie seulement de ces avis a reçu une réponse",
    step: "Répondre à tous les avis qui en parlent, pas seulement les plus durs, avec la même phrase de correction.",
    impact: 0.5,
  },
  fort: {
    note: "alors que l'établissement répond déjà aux avis",
    step: "Les réponses ne suffisent plus : annoncer dans la réponse la mesure prise et la date, puis s'y tenir.",
    impact: 0,
  },
};

const TREND_VARIANT: Record<Trend, { note: string; horizon: Horizon; impact: number }> = {
  baisse: { note: "La note baisse depuis que ce thème monte : c'est la priorité.", horizon: "7 jours", impact: 1 },
  stable: { note: "La note tient, mais ce thème l'empêche de monter.", horizon: "30 jours", impact: 0 },
  hausse: { note: "La note remonte : corriger ce point consolide la reprise.", horizon: "30 jours", impact: -0.5 },
};

function themeScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const theme of NEGATIVE_THEMES) {
    const t = THEME[theme];
    for (const resp of ["faible", "moyen", "fort"] as const) {
      const r = RESPONSE_VARIANT[resp];
      for (const trend of ["baisse", "stable", "hausse"] as const) {
        const tr = TREND_VARIANT[trend];
        out.push({
          id: `avis_theme.${theme}.${resp}.${trend}`,
          family: "avis_theme",
          title: `Régler ${t.label}`,
          diagnostic: `Les avis négatifs reviennent sur ${t.label}, ${r.note}. ${tr.note}`,
          steps: [...t.fix, r.step],
          kpi: t.kpi,
          impact: clamp(t.impact + r.impact + tr.impact - 0.5),
          effort: clamp(t.effort),
          horizon: tr.horizon,
          when: (s) => s.negativeThemes[0] === theme && s.responseRate === resp && s.trend === trend,
        });
      }
    }
  }
  return out;
}

// ─── B. Réputation : note × volume d'avis × tendance ───────────────────────

const RATING_TEXT: Record<RatingBand, { label: string; goal: string; impact: number }> = {
  fragile: { label: "sous 3,8★", goal: "repasser au-dessus de 4,0★, le seuil sous lequel beaucoup de clients ne cliquent plus", impact: 5 },
  moyenne: { label: "entre 3,8 et 4,2★", goal: "franchir 4,2★ pour sortir du lot dans les résultats du quartier", impact: 4 },
  bonne: { label: "entre 4,2 et 4,5★", goal: "atteindre 4,5★, où la note devient un argument", impact: 3 },
  excellente: { label: "à 4,5★ ou plus", goal: "garder la note et en faire un message (vitrine, réseaux, sacs)", impact: 2 },
};

const VOLUME_TEXT: Record<Level, { label: string; step: string; impact: number }> = {
  faible: {
    label: "avec moins d'avis que les voisins",
    step: "Demander un avis à chaque client content, au moment où il le dit : QR code sur le comptoir et sur le ticket, lien direct vers la fiche.",
    impact: 1,
  },
  moyen: {
    label: "avec autant d'avis que les voisins",
    step: "Viser 10 avis de plus par mois avec un QR code au comptoir : la fraîcheur des avis compte autant que leur nombre.",
    impact: 0,
  },
  fort: {
    label: "avec plus d'avis que les voisins",
    step: "Le volume est acquis : mettre en avant les meilleurs avis récents (vitrine, réseaux, site).",
    impact: -1,
  },
};

const REP_TREND: Record<Trend, string> = {
  baisse: "La note des derniers mois tire la moyenne vers le bas.",
  stable: "La note est stable depuis un an.",
  hausse: "Les derniers mois sont meilleurs que la moyenne affichée.",
};

function reputationScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const rating of ["fragile", "moyenne", "bonne", "excellente"] as const) {
    const r = RATING_TEXT[rating];
    for (const vol of ["faible", "moyen", "fort"] as const) {
      const v = VOLUME_TEXT[vol];
      for (const trend of ["baisse", "stable", "hausse"] as const) {
        const steps = [v.step];
        if (trend === "baisse") steps.unshift("Lire les avis 1–2★ des 90 derniers jours et en tirer les trois causes, avant de chercher de nouveaux avis.");
        if (trend === "hausse") steps.push("Relancer les anciens clients déçus avec un message « on a changé » : la reprise se voit plus vite quand ils reviennent.");
        out.push({
          id: `reputation.${rating}.${vol}.${trend}`,
          family: "reputation",
          title: rating === "excellente" ? "Faire travailler une excellente note" : "Faire monter la note",
          diagnostic: `Note ${r.label}, ${v.label}. ${REP_TREND[trend]} Objectif : ${r.goal}.`,
          steps,
          kpi: "note moyenne des 90 derniers jours et nombre d'avis par mois",
          impact: clamp(r.impact + v.impact + (trend === "baisse" ? 1 : 0) - 1),
          effort: clamp(vol === "faible" ? 2 : 1),
          horizon: trend === "baisse" ? "7 jours" : "90 jours",
          boosteats: vol === "faible" ? "Le QR code Boosteats au comptoir sert aussi à demander l'avis au bon moment : après le cadeau." : undefined,
          when: (s) => s.rating === rating && s.reviewVolume === vol && s.trend === trend,
        });
      }
    }
  }
  return out;
}

// ─── C. Fiche Google : un manque × les concurrents l'ont-ils comblé ? ──────

const GAP: Record<FicheGap, { title: string; why: string; steps: string[]; impact: number; effort: number }> = {
  categorie_vague: {
    title: "Choisir une catégorie principale précise",
    why: "La catégorie « Restaurant » seule vous fait perdre les recherches précises (« grill », « burger », « libanais »).",
    steps: ["Remplacer la catégorie principale par la plus précise possible.", "Ajouter 2 à 4 catégories secondaires réellement servies."],
    impact: 4,
    effort: 1,
  },
  nom_surcharge: {
    title: "Nettoyer le nom de la fiche",
    why: "Des mots-clés ajoutés au nom (« meilleur burger Bruxelles ») exposent la fiche à une suspension par Google.",
    steps: ["Remettre le nom exact de l'enseigne, tel qu'il figure sur la façade."],
    impact: 3,
    effort: 1,
  },
  pas_de_site: {
    title: "Ajouter un site web",
    why: "Sans site, le client qui hésite n'a nulle part où voir la carte ni commander en direct.",
    steps: ["Créer une page simple : carte, horaires, adresse, lien de commande directe.", "L'indiquer comme site de la fiche."],
    impact: 3,
    effort: 3,
  },
  site_facebook: {
    title: "Remplacer le lien Facebook par un vrai site",
    why: "Une page Facebook comme site demande souvent un compte pour voir la carte, et ne permet pas de commander.",
    steps: ["Créer une page carte + commande directe et la mettre comme site de la fiche.", "Garder Facebook dans les liens sociaux de la fiche."],
    impact: 3,
    effort: 2,
  },
  pas_de_telephone: {
    title: "Ajouter un numéro de téléphone",
    why: "Le bouton « Appeler » est l'une des actions les plus utilisées sur mobile pour commander à emporter.",
    steps: ["Ajouter un numéro qui répond aux heures d'ouverture (ou un WhatsApp Business)."],
    impact: 4,
    effort: 1,
  },
  horaires_absents: {
    title: "Renseigner les horaires",
    why: "Sans horaires, Google n'affiche pas « Ouvert », et le client choisit celui d'à côté qui l'affiche.",
    steps: ["Renseigner les horaires de chaque jour, service du midi et du soir séparés."],
    impact: 5,
    effort: 1,
  },
  horaires_exceptionnels: {
    title: "Déclarer les horaires exceptionnels",
    why: "Un client qui trouve porte close un jour férié laisse souvent un avis 1★.",
    steps: ["Déclarer à l'avance fermetures et jours fériés de l'année.", "Mettre un rappel au calendrier un mois avant chaque congé."],
    impact: 3,
    effort: 1,
  },
  photos_peu_nombreuses: {
    title: "Publier plus de photos",
    why: "Les fiches bien fournies en photos reçoivent nettement plus de demandes d'itinéraire et de clics.",
    steps: ["Publier 20 photos : 10 plats phares, 4 salle, 3 façade (pour être reconnu dans la rue), 3 équipe."],
    impact: 4,
    effort: 2,
  },
  photos_anciennes: {
    title: "Rafraîchir les photos",
    why: "Des photos anciennes montrent une carte, des prix ou une salle qui n'existent plus.",
    steps: ["Publier une nouvelle photo de plat chaque semaine, à la lumière du jour, près d'une fenêtre."],
    impact: 3,
    effort: 1,
  },
  pas_de_photos_proprietaire: {
    title: "Publier ses propres photos",
    why: "Aujourd'hui, ce sont les photos des clients qui décident de l'image du restaurant, bonnes ou mauvaises.",
    steps: ["Publier une photo de couverture et un logo depuis le compte propriétaire.", "Ajouter 10 photos de plats soignées."],
    impact: 4,
    effort: 1,
  },
  pas_de_description: {
    title: "Écrire la description",
    why: "750 caractères pour dire ce qui vous rend différent, que Google lit aussi pour vous placer dans les recherches.",
    steps: ["Écrire la description : spécialité, quartier, service (sur place, emporter, livraison), ce qui vous distingue."],
    impact: 2,
    effort: 1,
  },
  pas_de_menu: {
    title: "Mettre la carte sur la fiche",
    why: "Le client veut voir la carte et les prix avant de se déplacer.",
    steps: ["Ajouter le lien de la carte et les plats phares avec photo et prix."],
    impact: 4,
    effort: 1,
  },
  pas_de_lien_commande: {
    title: "Ajouter un lien de commande directe",
    why: "Sans lien de commande, Google propose Uber Eats ou Deliveroo à la place : vous payez une commission sur un client qui vous cherchait vous.",
    steps: ["Ajouter un lien de commande directe (site, téléphone, WhatsApp) en premier.", "Vérifier que ce lien apparaît avant ceux des plateformes."],
    impact: 5,
    effort: 2,
  },
  pas_de_reservation: {
    title: "Permettre la réservation",
    why: "Pour un repas assis, le bouton « Réserver » évite l'appel que beaucoup de clients ne passent pas.",
    steps: ["Ajouter un lien de réservation (outil gratuit ou formulaire simple)."],
    impact: 2,
    effort: 2,
  },
  attributs_incomplets: {
    title: "Compléter les attributs",
    why: "Terrasse, halal, végétarien, paiement par carte, accès PMR : ces filtres écartent la fiche des recherches où ils ne sont pas cochés.",
    steps: ["Cocher tous les attributs vrais : services, paiements, accessibilité, options alimentaires."],
    impact: 3,
    effort: 1,
  },
};

function ficheScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const gap of FICHE_GAPS) {
    const g = GAP[gap];
    for (const covered of [true, false]) {
      out.push({
        id: `fiche.${gap}.${covered ? "concurrents_oui" : "concurrents_non"}`,
        family: "fiche",
        title: g.title,
        diagnostic: covered
          ? `${g.why} La plupart des concurrents à moins de 600 m l'ont déjà fait.`
          : `${g.why} Peu de concurrents du quartier l'ont fait : c'est une avance facile à prendre.`,
        steps: g.steps,
        kpi: "actions sur la fiche (appels, itinéraires, clics) dans Google Business Profile",
        impact: clamp(g.impact + (covered ? 0.5 : 0)),
        effort: clamp(g.effort),
        horizon: "7 jours",
        when: (s) => s.ficheGaps.includes(gap) && s.gapsCoveredByCompetitors.includes(gap) === covered,
      });
    }
  }
  return out;
}

// ─── D. Réseaux sociaux : état × gamme de prix ────────────────────────────

const PRICE_ANGLE: Record<PriceLevel, string> = {
  eco: "montrer la générosité (portions, prix du menu) et le rythme du comptoir",
  moyen: "montrer la préparation et les plats signature, en gros plan",
  premium: "montrer le produit, l'origine et le lieu : ce qui justifie le prix",
};

const SOCIAL: Record<SocialState, { title: string; diag: string; steps: (angle: string, net: string) => string[]; impact: number; effort: number; horizon: Horizon }> = {
  absent: {
    title: "Ouvrir le compte",
    diag: "Aucun compte trouvé.",
    steps: (angle, net) => [
      `Créer le compte ${net} au nom exact de l'enseigne, avec adresse, horaires et lien de commande dans la bio.`,
      `Publier 9 contenus avant d'en parler en caisse : ${angle}.`,
    ],
    impact: 3,
    effort: 3,
    horizon: "30 jours",
  },
  dormant: {
    title: "Réveiller le compte",
    diag: "Le compte existe mais n'a rien publié depuis plus de 30 jours : un client qui le visite pense que le restaurant a fermé.",
    steps: (angle, net) => [
      `Reprendre à 2 publications par semaine sur ${net}, fixées au calendrier (par exemple mardi et vendredi).`,
      `Thème principal : ${angle}.`,
      "Filmer en une seule session de 30 minutes de quoi publier pendant deux semaines.",
    ],
    impact: 3,
    effort: 2,
    horizon: "30 jours",
  },
  irregulier: {
    title: "Publier avec régularité",
    diag: "Les publications arrivent par à-coups : l'algorithme ne montre plus le compte entre deux vagues.",
    steps: (angle, net) => [
      `Passer à 3 publications par semaine sur ${net}, avec une série récurrente (« le plat du vendredi »).`,
      `Angle : ${angle}.`,
    ],
    impact: 3,
    effort: 2,
    horizon: "30 jours",
  },
  actif_peu_engage: {
    title: "Rendre les publications engageantes",
    diag: "Le compte publie mais peu de gens réagissent : le contenu ne donne pas faim ou ne montre personne.",
    steps: (angle, net) => [
      `Passer à la vidéo verticale sur ${net} : la première seconde montre le plat, pas le logo.`,
      "Montrer des visages : l'équipe, un client régulier (avec son accord).",
      `Angle : ${angle}.`,
      "Répondre à chaque commentaire dans l'heure.",
    ],
    impact: 3,
    effort: 2,
    horizon: "30 jours",
  },
  performant: {
    title: "Transformer l'audience en clients",
    diag: "Le compte fonctionne bien : il reste à faire venir cette audience au comptoir.",
    steps: (_angle, net) => [
      `Mettre dans la bio ${net} un lien de commande directe, pas un lien de plateforme.`,
      "Publier une fois par mois une offre réservée aux abonnés, à montrer en caisse.",
    ],
    impact: 2,
    effort: 1,
    horizon: "30 jours",
  },
};

function socialScenarios(net: "instagram" | "tiktok"): Scenario[] {
  const label = net === "instagram" ? "Instagram" : "TikTok";
  const out: Scenario[] = [];
  for (const state of ["absent", "dormant", "irregulier", "actif_peu_engage", "performant"] as const) {
    const st = SOCIAL[state];
    for (const price of ["eco", "moyen", "premium"] as const) {
      out.push({
        id: `${net}.${state}.${price}`,
        family: net,
        title: `${label} : ${st.title.toLowerCase()}`,
        diagnostic: st.diag,
        steps: st.steps(PRICE_ANGLE[price], label),
        kpi: state === "performant" ? "commandes directes venues des réseaux (code ou question en caisse)" : "publications par semaine et engagement médian",
        // TikTok pèse plus pour une cible jeune et un prix bas, Instagram pour le premium.
        impact: clamp(st.impact + (net === "tiktok" && price === "eco" ? 1 : 0) + (net === "instagram" && price === "premium" ? 1 : 0) - (net === "tiktok" && price === "premium" ? 1 : 0)),
        effort: clamp(st.effort),
        horizon: st.horizon,
        boosteats: state === "performant" ? "Boosteats transforme l'abonné en membre : un QR code, un cadeau, et on le revoit." : undefined,
        when: (s) => s[net] === state && s.price === price,
      });
    }
  }
  return out;
}

// ─── E. Canaux de vente : répartition × prix × position ────────────────────

const CHANNEL: Record<ChannelMix, { title: string; diag: string; steps: string[]; impact: number; effort: number; boosteats?: string }> = {
  plateformes_dominantes: {
    title: "Ramener les clients des plateformes en direct",
    diag: "Plus de la moitié du chiffre d'affaires passe par Uber Eats, Deliveroo ou Takeaway.com, qui prennent souvent 25 à 35 % de commission et gardent le contact du client.",
    steps: [
      "Glisser dans chaque sac livré une carte « commandez en direct la prochaine fois » avec un avantage.",
      "Mettre la commande directe en premier sur la fiche Google et dans la bio des réseaux.",
      "Garder les plateformes pour gagner de nouveaux clients, pas pour garder les habitués.",
    ],
    impact: 5,
    effort: 3,
    boosteats: "C'est le cœur de Boosteats : chaque ticket direct rapporte des points au client, qui revient en direct plutôt que par l'application.",
  },
  equilibre: {
    title: "Faire grossir la part directe",
    diag: "Le chiffre d'affaires se partage entre salle, emporter et plateformes : chaque point gagné en direct améliore la marge.",
    steps: [
      "Identifier les habitués qui commandent par plateforme (même nom, même adresse) et leur proposer le direct.",
      "Proposer en salle un avantage à la prochaine visite pour faire revenir plus souvent les clients sur place.",
    ],
    impact: 4,
    effort: 2,
    boosteats: "Boosteats récompense la visite directe et mesure la fréquence de retour, ticket par ticket.",
  },
  direct_dominant: {
    title: "Faire revenir plus souvent la clientèle directe",
    diag: "L'essentiel des ventes est déjà direct : le levier est la fréquence de visite, pas le canal.",
    steps: [
      "Donner une raison de revenir dans la semaine (plat du jour, cadeau à la visite suivante).",
      "Collecter un contact (WhatsApp) pour prévenir les habitués d'une nouveauté.",
    ],
    impact: 3,
    effort: 2,
    boosteats: "Boosteats : des points à chaque ticket, un cadeau choisi par le client, et un message aux membres quand il y a du nouveau.",
  },
};

const POSITION_NOTE: Record<CompetitivePosition, string> = {
  derriere: "Les concurrents proches sont mieux notés : il faut d'abord régler les points des avis avant d'attirer plus de monde.",
  au_niveau: "Les concurrents proches sont au même niveau : la différence se fera sur la fidélité.",
  devant: "L'établissement est mieux noté que ses voisins : c'est le bon moment pour capter leurs clients.",
};

const PRICE_CHANNEL: Record<PriceLevel, string> = {
  eco: "Avec un petit ticket, la commission des plateformes mange une grosse partie de la marge : chaque commande rapatriée compte double.",
  moyen: "Chaque commande rapatriée en direct garde la commission dans la caisse, à chaque visite du même client.",
  premium: "Au ticket élevé, un habitué perdu coûte cher : la relation directe prime sur le volume.",
};

function channelScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const mix of ["plateformes_dominantes", "equilibre", "direct_dominant"] as const) {
    const c = CHANNEL[mix];
    for (const price of ["eco", "moyen", "premium"] as const) {
      for (const pos of ["derriere", "au_niveau", "devant"] as const) {
        const steps = pos === "derriere" ? ["D'abord : les deux premières priorités des avis ci-dessus.", ...c.steps] : c.steps;
        out.push({
          id: `canaux.${mix}.${price}.${pos}`,
          family: "canaux",
          title: c.title,
          diagnostic: `${c.diag} ${mix === "plateformes_dominantes" ? PRICE_CHANNEL[price] + " " : ""}${POSITION_NOTE[pos]}`,
          steps,
          kpi: "part du chiffre d'affaires en direct, déclarée au prochain audit",
          impact: clamp(c.impact + (price === "eco" && mix === "plateformes_dominantes" ? 0.5 : 0) - (pos === "derriere" ? 1 : 0)),
          effort: clamp(c.effort),
          horizon: "90 jours",
          boosteats: c.boosteats,
          after: pos === "derriere" ? "avis_theme" : undefined,
          when: (s) => s.channelMix === mix && s.price === price && s.position === pos,
        });
      }
    }
  }
  return out;
}

// ─── F. Réponse aux avis : niveau de réponse × note ────────────────────────

function responseScenarios(): Scenario[] {
  const out: Scenario[] = [];
  const RESP: Record<Level, { title: string; diag: string; steps: string[]; impact: number }> = {
    faible: {
      title: "Répondre aux avis",
      diag: "Moins d'un avis sur cinq reçoit une réponse : les clients qui lisent les avis voient un restaurant qui n'écoute pas.",
      steps: [
        "Bloquer 15 minutes deux fois par semaine pour répondre à tous les nouveaux avis.",
        "Pour un avis négatif : remercier, nommer le problème, dire ce qui change, inviter à revenir. Jamais d'argument.",
      ],
      impact: 4,
    },
    moyen: {
      title: "Répondre à tous les avis",
      diag: "Une partie des avis reçoit une réponse, souvent les plus positifs.",
      steps: ["Répondre aussi aux avis sans texte et aux 3★ : ce sont les clients les plus faciles à récupérer."],
      impact: 2,
    },
    fort: {
      title: "Faire de vos réponses une vitrine",
      diag: "L'établissement répond déjà à presque tous les avis.",
      steps: ["Personnaliser chaque réponse (le plat commandé, le prénom de l'équipier) : un copier-coller se voit."],
      impact: 1,
    },
  };
  for (const level of ["faible", "moyen", "fort"] as const) {
    for (const rating of ["fragile", "moyenne", "bonne", "excellente"] as const) {
      const r = RESP[level];
      out.push({
        id: `reponse_avis.${level}.${rating}`,
        family: "reponse_avis",
        title: r.title,
        diagnostic: `${r.diag} ${rating === "fragile" || rating === "moyenne" ? "Avec cette note, chaque réponse à un avis négatif est lue par les clients qui hésitent." : "La note est bonne : les réponses la protègent."}`,
        steps: r.steps,
        kpi: "part des avis des 30 derniers jours avec une réponse",
        impact: clamp(r.impact + (rating === "fragile" ? 1 : 0)),
        effort: 1,
        horizon: "7 jours",
        when: (s) => s.responseRate === level && s.rating === rating,
      });
    }
  }
  return out;
}

// ─── G. Concurrence : position × prix × volume d'avis ──────────────────────

function competitionScenarios(): Scenario[] {
  const out: Scenario[] = [];
  const POS: Record<CompetitivePosition, { title: string; diag: string; impact: number }> = {
    derriere: { title: "Rattraper les voisins mieux notés", diag: "Les concurrents à moins de 600 m sont mieux notés.", impact: 4 },
    au_niveau: { title: "Se démarquer des voisins", diag: "Les concurrents à moins de 600 m ont une note proche.", impact: 3 },
    devant: { title: "Faire savoir que vous êtes le mieux noté du quartier", diag: "L'établissement est mieux noté que ses voisins directs.", impact: 2 },
  };
  const PRICE_MOVE: Record<PriceLevel, string> = {
    eco: "Se battre sur la formule midi la plus lisible du quartier, affichée en vitrine et sur la fiche.",
    moyen: "Choisir un plat signature que personne d'autre ne fait dans la rue, et le mettre partout en photo.",
    premium: "Mettre en avant ce que les voisins n'ont pas : produit, lieu, accueil — et le prouver en photos.",
  };
  const VOL_MOVE: Record<Level, string> = {
    faible: "Combler l'écart de volume d'avis : c'est le premier critère visible quand deux fiches se suivent.",
    moyen: "Tenir le rythme d'avis des voisins, sans le laisser retomber.",
    fort: "Citer le nombre d'avis dans la communication (« 1 200 avis, 4,5★ »).",
  };
  for (const pos of ["derriere", "au_niveau", "devant"] as const) {
    for (const price of ["eco", "moyen", "premium"] as const) {
      for (const vol of ["faible", "moyen", "fort"] as const) {
        const p = POS[pos];
        out.push({
          id: `concurrence.${pos}.${price}.${vol}`,
          family: "concurrence",
          title: p.title,
          diagnostic: p.diag,
          steps: [PRICE_MOVE[price], VOL_MOVE[vol], "Relire le tableau des concurrents : copier ce qu'ils font mieux sur la fiche (liens, photos, horaires)."],
          kpi: "rang parmi les concurrents à moins de 600 m (note × volume d'avis)",
          impact: clamp(p.impact + (vol === "faible" ? 0.5 : 0)),
          effort: 2,
          horizon: "90 jours",
          after: pos === "derriere" ? "avis_theme" : undefined,
          when: (s) => s.position === pos && s.price === price && s.reviewVolume === vol,
        });
      }
    }
  }
  return out;
}

// ─── H. Fidélisation : thème négatif × répartition des canaux ─────────────

const LOYALTY_ANGLE: Record<ChannelMix, string> = {
  plateformes_dominantes: "les clients livrés, que la plateforme garde pour elle",
  equilibre: "les clients qui alternent salle, emporter et plateformes",
  direct_dominant: "les habitués qui viennent déjà en direct",
};

function loyaltyScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const theme of NEGATIVE_THEMES) {
    for (const mix of ["plateformes_dominantes", "equilibre", "direct_dominant"] as const) {
      const t = THEME[theme];
      out.push({
        id: `fidelisation.${theme}.${mix}`,
        family: "fidelisation",
        title: `Récupérer les clients déçus par ${t.label}`,
        diagnostic: `Un client déçu par ${t.label} ne revient pas, et le plus souvent ne le dit pas. Ici, cela touche surtout ${LOYALTY_ANGLE[mix]}.`,
        steps: [
          "Une fois le problème corrigé, le faire savoir : réponse aux avis, publication, message aux habitués.",
          "Offrir une raison concrète de revenir essayer (un cadeau à la prochaine visite, pas une remise immédiate).",
          mix === "plateformes_dominantes"
            ? "Ajouter dans les sacs livrés une invitation à commander en direct, avec cet avantage."
            : "Prévenir les habitués par un message court quand le problème est réglé.",
        ],
        kpi: "clients qui reviennent dans les 30 jours",
        impact: clamp(t.impact - 1 + (mix === "plateformes_dominantes" ? 1 : 0)),
        effort: 2,
        horizon: "30 jours",
        after: "avis_theme",
        boosteats: "Boosteats fait exactement ce geste : un cadeau choisi par le client, à la visite suivante, et un message aux membres.",
        when: (s) => s.negativeThemes.slice(0, 2).includes(theme) && s.channelMix === mix,
      });
    }
  }
  return out;
}

export const SCENARIOS: readonly Scenario[] = [
  ...themeScenarios(),
  ...reputationScenarios(),
  ...ficheScenarios(),
  ...socialScenarios("instagram"),
  ...socialScenarios("tiktok"),
  ...channelScenarios(),
  ...responseScenarios(),
  ...competitionScenarios(),
  ...loyaltyScenarios(),
];
