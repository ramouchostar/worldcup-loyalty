# ADR 0022 — Moteur de stratégies terrain (page Opportunités)

**Date** : 2026-07-21
**Statut** : Accepté

## Contexte

Le fondateur conseille les restaurateurs sur le terrain : il regarde le menu et
les coûts d'un établissement, puis propose des stratégies de pricing qui font
gagner de l'argent. Son constat empirique récurrent : **plus un produit a une
valeur perçue élevée, plus le client est réceptif à la promo** — la remise
s'applique au prix perçu, pas à la marge, qui peut rester protégée si l'offre
est bien construite.

Objectif produit : **digitaliser ce conseil**. L'app détient déjà tout ce que
le conseil exige sur le terrain : le catalogue avec prix de vente et prix de
revient (ADR 0013), les ventes réelles par article via l'OCR des tickets
(ADR 0020, `order_items`), les créneaux jour/heure (`order_date`,
`order_time`). La page admin « Opportunités » (`/admin/[id]/insights`,
`lib/insights.ts`) exploite déjà ces données pour les jours/heures creux, les
promos sûres et les combos.

Les stratégies terrain s'ajoutent au fil de sessions de travail avec le
fondateur : il décrit une stratégie et sa logique, elle est encodée dans le
moteur. Cet ADR fixe le cadre pour que cet ajout itératif reste sain.

## Décision

### 1. `lib/insights.ts` est LE moteur de stratégies — déterministe et pur

Chaque stratégie terrain est une **fonction pure** dans `lib/insights.ts` :
données de ventes + catalogue en entrée, suggestion chiffrée en sortie, zéro
appel réseau ou IA à l'exécution. Deux raisons :

- **Explicabilité** : chaque suggestion doit pouvoir dire *pourquoi* avec les
  chiffres qui l'ont produite (« vendu 42×, coût €1, ratio 7 »). C'est le même
  principe que ADR 0013/0017 : l'app propose avec des chiffres, l'admin décide.
- **Testabilité** : une fonction pure se vérifie sur des cas de calibrage
  connus avant d'être mise devant un restaurateur.

L'IA (`@anthropic-ai/sdk`) reste cantonnée à la mise en forme quand elle
existe déjà (ADR 0013 §3) — jamais au calcul d'une recommandation chiffrée.

### 2. Chaque stratégie respecte trois invariants

1. **La marge est protégée unité par unité** : aucune suggestion ne vend quoi
   que ce soit sous son coût matière plus une marge minimale explicite
   (constante nommée et commentée). Une offre qui « pousse au volume » en
   sacrifiant la marge marginale est un bug, pas une stratégie.
2. **Seuil de données** : aucune suggestion sous `MIN_ITEMS_FOR_INSIGHTS`
   articles scannés — en dessous, les patterns sont du bruit.
3. **ADR 0007** : les euros (prix, coûts, marges) ne sortent que sur des
   surfaces admin. Le message broadcast proposé au restaurateur ne contient
   que des prix publics, jamais de coûts ni de marges.

### 3. Processus d'ajout d'une stratégie (session de travail → code)

1. Le fondateur décrit la stratégie, sa logique, et un **exemple chiffré de
   calibrage** (ex. crêpe : unité €7/coût €1 → 2 pour €10, 3 pour €12).
2. La stratégie est formalisée : critère de sélection du produit cible,
   formule de l'offre, garde-fous de marge — les constantes de calibrage sont
   dérivées de l'exemple et commentées.
3. Encodée comme fonction pure + carte sur la page Opportunités (rationale
   chiffrée, message broadcast pré-rempli, conseil opérationnel éventuel).
4. L'ADR 0022 n'est pas ré-amendé à chaque stratégie — la liste ci-dessous
   suffit, le code commenté fait foi.

### 4. Stratégie n° 1 encodée — la formule dégressive

Constat terrain : sur un article à forte valeur perçue, une échelle
« 1 pour €7 · 2 pour €10 · 3 pour €12 · 4 pour €13,50 » fait grimper le panier
d'un client venu pour une unité, tout en gardant chaque unité rentable.

Encodage (`suggestDegressiveBundle`, `buildBundleLadder`) :

- **Cible** : article le mieux vendu parmi ceux dont `prix carte ≥ 3× coût`
  (`BUNDLE_MIN_RATIO`) — forte valeur perçue ET vente prouvée.
- **Échelle** : prix marginal des 2e/3e/4e unités = fractions du prix carte
  (`0.45 / 0.30 / 0.15`, calibrées sur l'exemple crêpe), arrondi aux 50
  centimes.
- **Garde-fou** : le prix marginal est relevé si nécessaire pour que chaque
  unité ajoutée rapporte au moins `BUNDLE_MIN_MARGINAL_MARGIN` (€0,50) de
  marge — la dernière unité n'est jamais un cadeau. Si aucune dégressivité
  n'est possible (coût trop proche du prix), pas de suggestion.
- **Conseil opérationnel** (texte, non calculé) : alléger la garniture des
  unités supplémentaires réduit leur coût sans toucher à la valeur perçue ;
  présenter l'offre comme une montée en gamme individuelle, pas une réduction
  de groupe (risque de cannibalisation par le partage).

## Alternatives rejetées

- **Générer les conseils par LLM à l'exécution** : non déterministe, non
  garanti côté marge, coût par affichage, et inexplicable chiffre par chiffre.
  Le modèle peut assister l'encodage en session, pas remplacer le moteur.
- **Stratégies configurables en base (règles génériques paramétrées)** :
  sur-conception tant que les stratégies se comptent sur une main ; une
  fonction pure par stratégie est plus lisible et plus sûre.
- **Appliquer automatiquement les offres (prix en caisse, paliers)** : l'app
  n'a pas la main sur la caisse, et le principe ADR 0013 (« l'app propose,
  l'admin décide ») s'applique à plus forte raison à une décision de pricing.

## Conséquences

- `lib/insights.ts` : section « Formule dégressive » (`BundleTier`,
  `buildBundleLadder`, `suggestDegressiveBundle`).
- `app/admin/[restaurantId]/insights/page.tsx` : carte 🪜 avec échelle,
  marges marginales et message broadcast pré-rempli.
- Les futures stratégies terrain suivent le processus §3 dans les mêmes
  fichiers.
- `CONTEXT.md` : entrée « Opportunité ».
