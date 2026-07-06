# ADR 0020 — OCR enrichi : lignes d'articles et heure de commande

**Date** : 2026-07-06
**Statut** : Accepté

## Contexte

Le scan du ticket (ADR 0008) n'extrait que trois champs : le Bestelnummer, le montant total et la présence du nom du restaurant. La commande ne stocke que le montant global — aucun détail de ce que le membre a réellement commandé, et `orders.order_time` (nullable depuis m13) n'est jamais rempli. Le restaurant n'a donc aucune visibilité sur les articles qui font venir les membres du programme, ni sur les créneaux horaires de ces commandes.

## Décision

### 1. L'OCR extrait aussi les articles et l'heure

`analyzeReceipt` (`lib/receipt-ocr.ts`) demande deux champs supplémentaires au même appel Claude Vision : `order_time` (HH:MM 24h) et `items[]` (nom tel qu'imprimé, quantité, prix unitaire si lisible, max 30 lignes, totaux/taxes/paiement exclus). `max_tokens` passe de 256 à 1024.

### 2. Best effort strict — jamais bloquant

Validation défensive post-parse (regex heure, noms tronqués à 120 caractères, quantités 0 < q ≤ 99, prix 0–500 €) : toute anomalie est écartée silencieusement. La `confidence` reste calculée uniquement sur clé + montant ; **ni les articles ni l'heure n'entrent dans le flagging ou l'auto-validation**. Un échec d'insertion des lignes est loggé, jamais remonté au membre (`insertOrderItems` ne throw pas).

### 3. Table `order_items`, rapprochée du catalogue par nom normalisé

Nouvelle table `order_items` (m31) : `order_id`, `line_index` (UNIQUE ensemble → idempotence), `raw_name`, `quantity`, `unit_price`, `menu_item_id` nullable. Le rapprochement vers `menu_items` (ADR 0013) se fait par **égalité stricte sur nom normalisé** (minuscules, sans accents, ponctuation aplatie — `lib/menu-match.ts`) : un raté laisse `menu_item_id` NULL, un faux positif polluerait les stats.

### 4. RLS : lecture par le propriétaire, écriture service-role

Les lignes du ticket sont les données personnelles du membre : lecture own-read (via jointure `orders.user_id`), euros autorisés comme dans « Mes stats » (ADR 0007). Aucune surface ne les agrège côté client pour le collectif.

## Alternatives rejetées

- **Colonne JSONB sur `orders`** : non requêtable proprement pour les stats resto futures (top articles programme, créneaux) ; une table dédiée coûte une migration de plus mais reste triviale.
- **Matching fuzzy (Levenshtein, embeddings)** : sur-ingénierie au MVP ; les tickets impriment généralement le nom exact du catalogue. `raw_name` est conservé pour re-matcher plus tard si besoin.
- **Second appel OCR dédié aux articles** : double le coût et la latence par scan pour rien — le même appel Vision lit tout le ticket.
- **Faire participer les articles à la confidence** : un ticket aux articles illisibles mais avec clé + montant nets serait pénalisé à tort ; l'anti-fraude ne gagne rien.

## Conséquences

### Schéma (m31)
- Table `order_items` + RLS own-read + index `(order_id)` et partiel `(menu_item_id)`.
- `orders.order_time` : simplement rempli désormais (`serverOcr.order_time`).

### Code
- `lib/receipt-ocr.ts` : prompt étendu, `ReceiptAnalysis` += `order_time`, `items`, sanitisation.
- `lib/menu-match.ts` (nouveau) : `normalizeItemName`, `buildMenuMatcher`.
- `lib/order-items.ts` (nouveau) : `insertOrderItems` best effort.
- `app/api/orders/route.ts` : `order_time` inséré, `insertOrderItems` appelé après le chemin critique commande + récompense.

### Usage futur (non construit ici)
Stats admin « top articles du programme » et « créneaux horaires », personnalisation des incitations (ADR 0009). La table est prête, aucune UI ajoutée dans cette itération.
