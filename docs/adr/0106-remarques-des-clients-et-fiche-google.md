# ADR 0106 — Les remarques des clients, les avis graves et la fiche Google par forfait

**Statut** : Accepté (2026-11-15, Mehdi, en session). Maquette validée le même jour :
https://claude.ai/artifact/XaCcUFtjUcGvPiU8Map2Jv (version 2). **Amende l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md)**
§1 (le grisé « Pro » est permis, dans les limites du §5 ci-dessous) et §9 (les réponses de Louis se copient,
l'équipe ne les publie plus). **Met en œuvre l'[ADR 0082](0082-fiche-google-geree-sur-invitation.md)**
(accès gestionnaire, jamais propriétaire) avec l'adresse `boosteats1@gmail.com`. Prolonge l'[ADR 0105](0105-la-barre-de-la-brigade.md)
(fiches de jeu, mesure). N'amende ni l'ADR 0007 ni l'ADR 0025.

## Contexte

Analyses de fiche du 2026-11-15 (Houba, De Bue, Kraainem) :

1. **Les points négatifs existent déjà, mal exploités.** L'analyse d'avis classe les reproches par thème
   (Houba : attente 19, articles oubliés 17, cuisson 10, accueil 10, propreté 4), mais seulement quand
   quelqu'un lance une analyse, et sa citation ne correspond pas toujours au thème (« personnel impoli »
   illustré par un avis sur l'hygiène).
2. **Louis se tait 7 jours après chaque analyse** : il ne lit que l'audit, faute de lecture régulière.
3. **Google Places ne suffit pas** : 5 avis au plus par fiche, et aucune réponse du propriétaire dans ce
   que notre code reçoit (`lib/audit/places.ts`). DataForSEO, déjà branché, rend les avis du plus récent
   au plus ancien avec la réponse du propriétaire (`postReviewsTask`, `owner_answer`).
4. **Un avis grave peut dormir des semaines** : Houba, dimanche 20/09 à 20 h 13, « la caissière se mouche
   et ne se lave pas les mains avant de plonger les poulets dans l'huile ». Personne n'a été prévenu.
5. **Les heures sont disponibles** : la caisse donne les commandes par heure pour les trois établissements
   (`pos_hourly_sales`). Chez Houba, 5 avis à 1 ★ sur 6 sont postés entre 19 h et 23 h ; la caisse est la
   plus chargée à midi (13 commandes/h contre 5,3 en moyenne).
6. **Nous ne savons pas encore publier une réponse** (pas d'API Business Profile, ADR 0082 § Prérequis).

## Décision

### 1. Lecture des avis chaque jour, chaque avis gardé une fois

- Une tâche de nuit lit les **40 derniers avis** de chaque établissement réel ayant une fiche Google
  (DataForSEO, `sort_by: newest`). Coût estimé : environ 1 centime par lecture (à mesurer, plafond visible).
- Chaque avis est gardé **une seule fois** (empreinte date + note + texte) : note, date et heure de
  publication, texte, réponse du propriétaire oui/non. **Jamais le nom ni le profil de l'auteur**
  (ADR 0025).
- Chaque nouvel avis à 3 ★ ou moins avec un texte est **classé par Claude** dans une liste fixe de thèmes
  (attente, commande incomplète, cuisson, qualité, accueil, propreté, hygiène, prix, livraison, autre),
  canal (sur place / livraison / inconnu) et gravité (§3). Une liste fixe, pas des thèmes inventés à chaque
  lecture : sinon rien ne se compte d'un mois à l'autre.

### 2. Le hub « Ce que tes clients reprochent » (onglet Stats)

- Par thème : nombre d'avis sur 90 jours, ce mois-ci contre le mois d'avant, canal dominant, une citation
  **tirée d'un avis de ce thème**, avec son jour et son heure.
- « C'est réglé » met le thème en suivi ; s'il revient dans les 30 jours, il remonte marqué « revenu ».
- Les heures des avis sont croisées avec les commandes par heure de la caisse. La carte dit ce que les
  données montrent et propose de vérifier ; elle n'affirme jamais qu'il manque quelqu'un. L'heure d'un avis
  n'est pas celle de la visite : c'est écrit.

### 3. Les avis graves : une alerte, pas une idée

- Grave = liste fixe : **hygiène et sécurité alimentaire** (mains, cheveux, cru, malade après le repas),
  **comportement** (insulte, impolitesse franche, discrimination, geste déplacé), **argent** (erreur de caisse,
  monnaie contestée).
- L'alerte part le jour même dans « À faire » et par e-mail au gérant (journalisé, `message_sends`) : la
  citation, le jour et l'heure de l'avis, « regarde qui était de service ». **Jamais le nom d'un employé ni
  du client.** Pas de « Non », pas de plafond de 3 : ce n'est pas une idée.
- Le gérant répond « J'ai vérifié » ou « Pas grave » (ce dernier sert de trace).

### 4. Louis

- Brouillons de réponse aux avis sans réponse, nourris par la lecture du jour (plus par l'audit seul).
- **Rien n'est publié par Boosteats** : le gérant modifie s'il veut, « Copier », puis « Ouvrir l'avis sur
  Google » pour coller. L'équipe ne publie plus à sa place (amende l'ADR 0089 §9).
- Nouvelle idée « un point revient » : un thème avec au moins 3 avis en 30 jours et en hausse, avec les
  heures de la caisse et un conseil concret. Fiche de jeu dans `PLAYS` ; réussite = moins d'avis sur ce
  thème dans les 30 jours suivants.

### 5. La fiche Google par forfait (Max)

| | Croissance | Pro |
|---|---|---|
| Ce que Max signale | Ce qui fait perdre des clients tout de suite : adresse fausse, téléphone absent, horaires faux ou manquants, horaires des jours fériés, site ou lien de commande cassé | Tout cela, plus l'optimisation : photos, description, catégories secondaires, attributs, carte |
| Qui corrige | Le gérant, avec un pas-à-pas sur la carte | L'équipe Boosteats, par l'accès gestionnaire, sur « Oui » |
| Analyse de la fiche | Une fois par mois | Chaque semaine, et après chaque modification |
| Place face aux voisins (grille, ADR 0088) | Non | Oui, chaque mois |
| Idées de fiche | 2 par mois au plus | Sans plafond propre (toujours 3 idées par jour) |

**Le grisé « Pro » est permis** (Mehdi, 2026-11-15), amendant l'ADR 0089 §1, avec trois limites :
1. dans Stats, le bloc « Ta fiche Google » montre les points d'optimisation en grisé, marqués « Inclus dans Pro » ;
2. sur une carte Croissance, une seule ligne grisée « Boosteats peut s'en occuper pour toi : Pro » ;
3. **jamais une idée entière grisée** : une idée Pro ne prend pas une des 3 places du jour d'un Croissance.

### 6. L'accès à la fiche à l'inscription (ADR 0082)

- L'étape « Donne-nous accès à ta fiche » (trois gestes, facultative, « Plus tard ») apparaît à
  l'inscription et dans « À faire » tant que l'accès n'est pas reçu.
- Adresse : **`boosteats1@gmail.com`** (`GOOGLE_BUSINESS_MANAGER_EMAIL`), rôle **Gestionnaire**. Validation
  en deux étapes obligatoire sur ce compte : il a la main sur les fiches de tous les clients.
- L'étape passe au vert quand l'invitation est reçue (acceptation manuelle tracée `source = 'manual'` tant
  que l'API n'est pas ouverte), jamais sur la seule déclaration du gérant.

## Conséquences

- **Données** : une table des avis lus (sans auteur), une table des alertes graves, la table des accès aux
  fiches de l'ADR 0082. Migrations horodatées, code tolérant à leur absence.
- **Ordre des PR** : (1) Max en Croissance avec les limites du §5 ; (2) lecture quotidienne des avis et
  hub ; (3) alertes graves ; (4) Louis à copier et « un point revient » ; (5) étape d'accès à la fiche.
- **Trace** (ADR 0065) :
  - coût réel des lectures par jour et par établissement ;
  - avis classés, part en « autre » (au-dessus de 20 %, la liste de thèmes est à revoir) ;
  - alertes envoyées, « J'ai vérifié » sous 48 h, part de « Pas grave » (au-dessus d'un tiers, la liste
    de gravité est trop large) ;
  - réponses copiées (clic « Copier ») puis réponse du propriétaire vue à la lecture suivante ;
  - invitations reçues sous 7 jours (seuil ADR 0082 : 50 %) ;
  - Croissance → Pro après une ligne grisée vue (à suivre, sans seuil fixé).
- **Échos** : ADR 0089 (statut), CONTEXT.md (Remarques des clients, Avis grave), CLAUDE.md, la politique de
  confidentialité (avis sans auteur), la landing et le kit (Max reste « Pro » pour l'optimisation, mais
  signale les erreurs graves dès Croissance), `.claude/product-marketing.md`.
