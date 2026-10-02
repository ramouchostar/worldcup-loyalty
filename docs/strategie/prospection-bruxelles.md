# Prospection restaurateurs à Bruxelles — 4 stratégies, 5 signés par semaine

> Document de travail (2026-10-03), compagnon de l'[ADR 0076](../adr/0076-crm-de-prospection-dans-la-plateforme.md).
> Outil : onglet **CRM** de `/platform`. Positionnement et prix : [positionnement.md](positionnement.md),
> [ADR 0074](../adr/0074-boosteats-outil-marketing-pas-outil-d-exploitation.md).
> Les règles qui choisissent une stratégie sont dans `lib/crm-model.ts` : un changement ici se reporte là-bas.

## 1. La porte d'entrée : l'audit gratuit, jamais l'abonnement

On n'appelle pas un restaurateur pour lui vendre un logiciel. On lui propose de **regarder son
restaurant comme un client le voit** : fiche Google, avis, concurrents à 600 m, place sur Google Maps
(audit de l'[ADR 0069](../adr/0069-audit-restaurant-depuis-la-plateforme.md), lancé depuis la fiche CRM).
L'audit se présente **sur place, en 20 minutes, quand il veut** — de préférence entre 14 h et 17 h,
jamais pendant le coup de feu.

Ce qu'on ne dit jamais : « on va faire exploser vos ventes », « grâce à nous » (ADR 0064), un
pourcentage de hausse promis. On montre des constats, on propose un plan, on mesure ensuite.

## 2. Les quatre stratégies

| | Situation | Offre | Ce qu'on montre à l'audit | Ce qu'on fait signer |
|---|---|---|---|---|
| **1. Pilier du quartier** | 1 site, note ≥ 4,3, ≥ 300 avis, habitués | **Démarrer gratuitement** | « Vos habitués repartent sans laisser de contact » : nombre d'avis vs zéro client joignable | Plan Gratuit + kit en salle (affiche, QR équipe) |
| **2. Réputation à reprendre** | Note < 4,3, avis sans réponse, plaintes qui reviennent | **Démarrer gratuitement** | Les thèmes des avis négatifs, le point de bascule, les réponses manquantes | Plan Gratuit ; retour privé + demande d'avis à tous après visite (jamais contre récompense) |
| **3. Jeune adresse qui veut décoller** | Ouvert depuis < 2 ans ou < 300 avis, actif sur Instagram | **2 mois Pro offerts** | Sa place sur Google Maps vs les voisins, la fiche à compléter | Place pilote Pro 2 mois, puis Pro (3 mois min.) ou retour au Gratuit |
| **4. Enseigne en croissance** | 2 à 5 sites, ou ventes très dépendantes d'Uber Eats / Deliveroo | **2 mois Pro offerts** | Ce que coûtent les commissions, une base clients par site jamais réunie | Place pilote Pro 2 mois sur tous les sites, puis Pro |

**Ordre de priorité quand plusieurs s'appliquent** : enseigne → réputation → jeune → pilier. Une
enseigne reste une enseigne même mal notée (le décideur et l'offre changent) ; une réputation
abîmée passe avant la visibilité (on n'envoie pas de monde vers une fiche qui repousse).

### Pourquoi deux offres

- **Gratuit** pour les stratégies 1 et 2 : le plan Gratuit fait réellement le travail (inscrire les
  clients, cadeau d'accueil, annonces à la main, 500 tickets/mois). Le passage en Croissance se
  propose après deux mois au-dessus de 500 tickets (ADR 0070 §3) ou quand il veut relancer en un clic.
- **2 mois Pro offerts** pour les stratégies 3 et 4 : leur problème n'est pas la fidélité seule mais
  la visibilité et la dépendance aux plateformes — ce que vend le Pro. Le Pro n'est **pas entièrement
  livré dans le produit** (copilote, fiche Google gérée, référencement : ADR 0074 §7, à valider par
  l'associé) : les deux mois offerts sont une **place pilote**, livrée en partie à la main
  (optimisation de la fiche Google, rapport mensuel préparé par nous, point mensuel). On le dit tel
  quel au restaurateur — jamais une fonction présentée comme disponible si elle ne l'est pas (ADR 0070).
- **Garde-fou** : au plus **3 nouvelles places pilotes Pro par semaine** (temps humain ≈ 70 €/mois
  par restaurant, ADR 0070 §6). Au-delà, l'offre devient « Démarrer gratuitement » et la place Pro
  est proposée au mois suivant.
- **À J+45** d'un essai Pro : point avec les résultats mesurés (inscrits, clients revenus vs groupe
  témoin, avis) et décision : Pro à 500 €/mois (3 mois minimum) ou retour au Gratuit, sans pénalité.

## 3. Le message d'approche

Chaque fiche CRM porte un message court, prêt à partir (WhatsApp si le numéro est un mobile,
e-mail sinon, ou lu à voix haute au téléphone). Structure fixe :

1. **Bonjour + prénom** du gérant quand il est connu ;
2. **un constat vrai sur SON restaurant** (tiré des constats de la fiche : nombre d'avis, ancienneté,
   presse, dépendance à Takeaway…) ;
3. **la proposition d'audit gratuit**, « on en parle quand vous voulez » ; pour les stratégies 3 et 4,
   la mention des deux mois Pro offerts.

Le canal préféré reste **la visite en personne** (14 h–17 h) : on laisse l'audit imprimé si le
gérant n'est pas là, et on note la visite dans le CRM.

## 4. Le rythme : 5 signés par semaine

Hypothèses de départ (affichées « hypothèse » dans le CRM jusqu'à 10 prospects observés par étape,
remplacées ensuite par les taux mesurés) :

| Étape | Taux de départ | Par semaine |
|---|---|---|
| Contactés | — | **52** |
| → RDV audit pris | 25 % | 13 |
| → Audit présenté | 80 % | 10 |
| → **Signés** | 50 % | **5** |

Conséquences pratiques :

- La liste de départ (50 établissements) couvre **une semaine** de contacts. Le pipeline se remplit
  chaque lundi avec « Trouver sur Google Maps » (une recherche = jusqu'à 20 fiches, chaînes et
  fiches de moins de 50 avis écartées et comptées).
- Une journée type à deux : 10 contacts (appels/WhatsApp le matin), 2 visites d'audit l'après-midi.
- **Lundi** : regarder les quatre tuiles de la semaine passée et les taux mesurés. Si un taux réel
  est très sous l'hypothèse, on change le geste à cette étape (message, canal, audit), pas l'objectif.

## 5. Qualifier une fiche avant de contacter

Une fiche venue de Google Maps arrive « à qualifier ». Avant de la passer « à contacter » :

1. **Bonne fiche Google** (« Relier la fiche Google » : vérifier le nom et l'adresse).
2. **Gérant** : nom de l'administrateur dans la BCE (kbopub.economie.fgov.be, recherche par numéro
   de TVA affiché sur le site, Takeaway ou les mentions légales), sinon le demander au comptoir.
3. **Contact** : uniquement ce que l'établissement publie (téléphone de la fiche, e-mail du site ou
   de la page Facebook). On ne cherche **jamais** un numéro ou une adresse personnelle.
4. Stratégie suggérée relue : la changer si on sait mieux (nombre réel de sites, ouverture).

## 6. RGPD — ce qu'on garde, ce qu'on ne fait pas

- Prospection B2B sur **intérêt légitime** : coordonnées professionnelles publiées par
  l'établissement, nom du gérant publié au registre public des entreprises. Chaque contact garde sa
  **source** (lien) dans la fiche.
- Le premier message dit qui on est et pourquoi on écrit ; à la moindre demande, case **« Ne plus
  contacter »** (le prospect sort des relances et le reste).
- Les fiches vivent **uniquement en base** (table en RLS sans policy, console super-admin) : le dépôt
  GitHub est public, aucune donnée de prospect n'y est jamais écrite.
- Pas de séquence d'e-mails automatique vers les prospects : chaque message part à la main, un par un.

## 7. Objections fréquentes

| Objection | Réponse |
|---|---|
| « J'ai déjà Joyn / une carte à tampons » | « Gardez-la. La différence : avec Boosteats vous récupérez le contact et vous relancez ceux qui ne reviennent plus. » |
| « Pas le temps » | « Rien à installer, ça marche avec votre caisse. On pose l'affiche et le QR, votre équipe dit une phrase. » |
| « Ça coûte combien ? » | Stratégies 1–2 : « Rien. Le plan Gratuit suffit pour démarrer. » Stratégies 3–4 : « Deux mois offerts, puis vous décidez avec les chiffres. » |
| « Mes clients ne vont pas s'inscrire » | « On le mesure : au bout d'un mois vous voyez combien se sont inscrits et combien sont revenus. » |
| « Uber Eats m'apporte mes clients » | « Il vous les loue. Ceux qui reviennent au comptoir, c'est 0 % de commission. » |
