# ADR 0043 — Landing publique : nommer un article réel, tiré au hasard par tranche de prix

**Statut** : Accepté — amende [ADR 0042](0042-landing-price-category-preview.md)

## Contexte

L'ADR 0042 a délibérément choisi de n'afficher qu'une catégorie de prix
abstraite ("Produit catégorie 1/2/3") sur la carte "Ce que ce ticket peut
débloquer" de la landing publique pré-scan, pour ne jamais promettre un
article précis qui pourrait ne pas être couvert par le double verrou
(ADR 0007), le plafond budget (ADR 0012) ou la couverture d'équipe
(ADR 0017) — tous invisibles côté client.

Retour produit (2026-08-29) : "catégorie 1/2/3" ne parle pas au client et
reste trop abstrait pour donner envie. Décision assumée : accepter le
risque de sur-promesse identifié par l'ADR 0042 en échange d'un aperçu plus
concret et engageant — cohérent avec le tour de bienvenue visiteur
(`VisitorTour`, ADR 0040) qui nomme déjà de vrais cadeaux.

## Décision

### 1. Nommer un article réel, pas une catégorie

`lib/reward-tier-preview.ts::getLandingTierPreview(restaurantId)` renvoie
désormais `{ layer, productName }` au lieu de `{ layer, category }`. Pour
chaque couche configurée (solo → communautaire → réserve) :

1. On calcule, comme avant (ADR 0042), la tranche de prix (tertile de
   `menu_price` sur le catalogue actif et éligible aux récompenses) du
   palier d'entrée de la couche.
2. On tire au hasard, à chaque chargement de page, un article du
   catalogue appartenant à la MÊME tranche — pas nécessairement
   l'article réellement assigné au palier.

La tranche de prix reste l'unique critère de sélection, mais elle ne
s'affiche plus au client — c'est ce qui garantit que le produit teasé
reste crédible par rapport au palier réellement configuré, sans figer le
teasing sur un seul article ni révéler de mécanique de segmentation.

### 2. Toujours aucun euro, aucun seuil

Inchangé par rapport à l'ADR 0042 : jamais de montant, jamais de seuil
chiffré, jamais de CA (ADR 0007/0028). Seul le nom d'article change.

### 3. Risque assumé, pas neutralisé

Le tirage au hasard dans la même tranche de prix n'élimine pas le risque
identifié par l'ADR 0042 : le produit nommé peut ne pas être le cadeau
réellement délivré une fois le double verrou, le plafond budget ou la
couverture d'équipe appliqués. C'est une décision produit explicite
d'accepter ce risque plutôt que de le neutraliser par l'abstraction.

## Conséquences

### Code
- `lib/reward-tier-preview.ts` : `TierPreviewRow` passe de
  `{ layer, category }` à `{ layer, productName }` ; la fonction fait
  aussi la sélection aléatoire dans la tranche (plus seulement le calcul
  de tranche).
- `app/r/[restaurantId]/page.tsx` : la carte affiche `{row.productName}`
  au lieu de `Produit catégorie {row.category}`.
- `CONTEXT.md` : glossaire "Catégorie de prix (aperçu landing)" renommé
  "Aperçu produit (landing)" et mis à jour.

### À surveiller
- Le nom change à chaque chargement (pas de cache, pas de session) — un
  client qui recharge la page peut voir un article différent pour la
  même couche. Assumé pour cette itération ; à figer par session si le
  retour terrain montre une confusion.
- Si le décalage entre le produit teasé et le cadeau réellement délivré
  génère des réclamations client, revenir à l'abstraction de l'ADR 0042
  ou restreindre le tirage au seul article réellement assigné au palier.
