# ADR 0060 — La réserve en points courbés

**Statut** : Accepté (2026-09-14) — amende l'[ADR 0021](0021-personal-points-reserve.md)
(§1 crédit, §3 seuils et plafond : plus de « 1 point = 1 € ») et achève le suivi ouvert par
l'[ADR 0028](0028-points-decoupled-from-euros.md). Ne change rien au cycle « mettre de
côté / échanger » (ADR 0021 §4), ni au budget cadeaux (ADR 0012).

## Contexte

La réserve créditait le montant du ticket arrondi (`FLOOR(montant)`, ADR 0021) : un cadeau
d'un ticket de 25 € mis de côté affichait « +25 ». Le client lisait ses euros. C'est contraire
à l'ADR 0028 — zéro euro côté client, points non-inversibles — qui avait noté ce suivi dès la
migration m47. La refonte de l'accueil (ADR 0059) a rendu la réserve visible partout : il
fallait la corriger avant qu'un établissement active ses gros cadeaux.

Le plafond de coût d'un gros cadeau reposait sur la même équivalence : `coût ≤ seuil × 8 %`,
un point valant un euro dépensé.

Constat en production au 2026-09-14 : 2 cadeaux mis de côté à Kraainem (15 et 29 points),
aucun échange, aucun gros cadeau actif dans un établissement réel.

## Décision

### 1. Crédit en points courbés

« Mettre de côté » crédite `points_for_order(montant)` — la formule de l'ADR 0028, déjà source
du score d'équipe. Un ticket de 25 € rapporte 48 points, un ticket de 50 € en rapporte 62 : le
taux varie, les euros ne se déduisent plus.

### 2. Seuils en points courbés, plafond par les tickets moyens

Un gros cadeau arrive après ≈ 4, 8 et 12 **tickets moyens** mis de côté :
`seuil = N × points_for_order(panier moyen)`, arrondi à 5.

Le plafond de coût (ADR 0017) ne peut plus multiplier le seuil par 8 % : on estime la dépense
qui l'a alimenté par le nombre de tickets moyens qu'il représente —
`coût ≤ seuil ÷ points d'un ticket moyen × panier moyen × 8 %`. Même calcul en TypeScript
(`saverCostCap`, génération par défaut et contrôle console) et en SQL (`saver_cost_cap`,
re-vérifié à l'échange). Le panier moyen reste une donnée en euros : fonctions réservées au
serveur.

### 3. Conversion de l'existant

- **Soldes** : une écriture de compensation par cadeau déjà mis de côté (ledger append-only,
  jamais de modification). Kraainem : 15 → 40 et 29 → 50.
- **Seuils existants** convertis par établissement.
- **Kraainem**, sans gros cadeau actif, reçoit trois gros cadeaux par défaut (décision du
  porteur) : 170, 345 et 515 points avec un panier moyen de 18,86 €.

Migration **`docs/migrations/20260914-2010-reserve-points-courbes-correctif.sql`**, rejouable
(marqueur). Elle remplace `20260914-1932-reserve-points-courbes.sql`, qui n'a jamais été
appliquée : sa conversion des seuils, écrite en une seule instruction, heurtait la contrainte
d'unicité (seuil 150 converti en 400 alors que le seuil 400 n'était pas encore converti,
établissement de démonstration) et la transaction a tout annulé. La version corrigée convertit
les seuils un par un, dans l'ordre qui ne croise jamais un seuil non converti.

## Alternatives rejetées

- **Garder 1 point = 1 € et masquer le « +N »** : le solde de la réserve, lui, restait en euros.
- **Un taux fixe arbitraire (1 € = 2 points)** : un taux constant se retrouve en une division ;
  la courbe ne s'inverse pas.

## Conséquences

- Le restaurateur ne voit toujours pas ses gros cadeaux dans l'écran Menu : PR suivante
  (décision du 2026-09-14).
- Le crédit sans commande d'un compte de démonstration n'est pas recalculable et reste tel quel.

### À surveiller

- **Un panier moyen qui dérive** change le plafond d'un gros cadeau déjà configuré : un article
  accepté aujourd'hui peut être refusé à l'échange si le panier moyen baisse fortement. Le
  message reste « palier invalide » ; à reprendre si le cas se présente.
