# ADR 0062 — La vitrine dit ce que le ticket rapporte vraiment

**Statut** : Accepté (2026-09-18). Remplace l'[ADR 0042](0042-landing-price-category-preview.md)
et l'[ADR 0043](0043-landing-nom-produit-aleatoire.md) pour la carte de la vitrine publique.
Découle de l'[ADR 0061](0061-les-cadeaux-se-choisissent-avec-ses-points.md).

## Contexte

La vitrine (`/r/[id]`, cible des QR) montrait « Ce que ce ticket peut débloquer » : pour
chaque couche de cadeaux (solo, équipe, réserve), un article **tiré au hasard** dans la
même tranche de prix que le palier d'entrée. L'ADR 0042 refusait de nommer le vrai
cadeau, qui pouvait être bloqué par des verrous invisibles (double verrou, budget,
couverture) ; l'ADR 0043 a accepté un article réel mais aléatoire.

Depuis l'ADR 0061, ces couches n'existent plus : un ticket rapporte des **points**, le
premier ticket offre un **cadeau d'accueil**, le client **choisit** au catalogue, et
l'équipe offre un cadeau par palier franchi. La carte ne décrivait plus le programme, et
son bas de page promettait « des points à gagner » sans ticket.

## Décision

La carte devient **« Ce que ton ticket te rapporte »** (`lib/landing-offer.ts`) et ne
montre que ce qui est vrai pour tout nouveau client :

1. **Le cadeau d'accueil, nommé** : « {article} offert — pour ton premier ticket ». C'est
   le premier palier de la grille solo (`welcomeReward`). Aucun verrou ne s'y applique : la
   seule condition est que le ticket soit accepté. Photo du catalogue si elle existe.
2. **Des points à chaque ticket** et **trois articles du catalogue**, avec photo et prix
   en points : le plus beau cadeau à portée d'environ 1, 3 et 6 tickets moyens
   (`landingShowcase`, pur et testé ; les articles avec photo passent devant). Le panier
   moyen sert à choisir côté serveur, il ne s'affiche pas.
3. **Des cadeaux d'équipe**, là où l'établissement a des paliers d'équipe : « à chaque
   palier franchi, chaque membre reçoit un cadeau ». Affiché même quand la compétition est
   masquée (ADR 0059 §4).

Le bas de page « Pas encore de ticket ? » annonce le cadeau d'accueil au lieu de points
qu'on ne gagne qu'avec un ticket.

Toujours **aucun euro** et **aucun taux de points** (ADR 0007, ADR 0061 §1). Les prix en
points du catalogue sont ceux que le membre verra dans l'app.

## Conséquences

- La question d'équipe (`TeamRecognitionPrompt`) ne promet plus un cadeau « qui double » :
  « quand ton équipe franchit un palier, chaque membre reçoit un cadeau en plus de ses
  points ».
- Retirés : `lib/reward-tier-preview.ts` (tirage par tranche de prix) et le composant
  inutilisé `RewardProgressBar`.
- Mesure : les affiches de Kraainem en place n'envoient pas le marqueur
  `utm_source=qr_code` (430 arrivées anonymes « directes », 0 « QR » depuis le
  2026-09-04). Les affiches générées aujourd'hui le portent ; tant que les anciennes
  restent au mur, l'entonnoir QR de Kraainem ne distingue pas un scan d'un lien partagé.
