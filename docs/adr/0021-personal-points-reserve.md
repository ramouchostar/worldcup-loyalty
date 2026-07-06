# ADR 0021 — Réserve de points personnelle : « Mettre de côté »

**Date** : 2026-07-06
**Statut** : Accepté

## Contexte

Le système 3 couches (ADR 0006) pousse un petit cadeau à chaque commande validée, avec un slot unique « un seul cadeau actif » (ADR 0011) et 48h pour le récupérer. Un membre régulier reçoit donc toujours le même type de petit cadeau — aucun moyen de viser plus gros. Demande produit : laisser le membre **choisir** entre récupérer son petit cadeau et cumuler pour un gros cadeau plus tard.

Décisions produit actées avec l'utilisateur : le choix se fait **dans l'onglet récompenses** (pas à la soumission du ticket), les points valent **le montant de la commande** (€25 → 25 pts), et le **score communautaire reste crédité à la validation du ticket quel que soit le choix** — mettre de côté est un choix strictement personnel.

## Décision

### 1. Le choix au moment de la récupération — « Mettre de côté »

Le cadeau est généré comme aujourd'hui. Sur « Mes récompenses », à côté de « Récupérer », un bouton **« Mettre de côté »** convertit le cadeau disponible en points de réserve : nouveau statut `banked` (échappe à l'index partiel un-seul-actif → slot libéré), crédit de `floor(montant de la commande)` points. Le membre voit ce qu'il abandonne avant de choisir. La conversion couvre **tout le cadeau** (les 3 couches, une seule ligne `pending_rewards`) : un demi-état casserait le modèle du slot, et la valeur créditée ne dépend pas des couches 2/3 — aucune incitation à farmer le score d'équipe pour banker plus.

### 2. Ledger append-only, pas de colonne solde

Table `point_transactions` (m33) : `delta`, `reason` (`bank_reward`/`exchange_gift`/`admin_adjust`), refs `reward_id`/`order_id`, **`UNIQUE(reward_id, reason)`**. Idempotence structurelle (un cadeau crédité/débité une seule fois, même en double-clic ou replay), audit anti-fraude complet, pas de course sur un UPDATE de solde ; volumétrie minuscule → `SUM` instantané (`get_points_balance`). RLS own-read (deltas en points, jamais d'euros), écritures via RPC `SECURITY DEFINER` uniquement.

### 3. Gros cadeaux : couche `saver` des `reward_tiers`, plafond ADR 0017

`layer='saver'`, `min_threshold` en **points**. Comme 1 point = 1 € dépensé, le plafond existant s'applique tel quel : `cost_price ≤ seuil × budget %` (`soloCostCap`) — le gros cadeau est financé par 8 % des dépenses cumulées qui l'ont déclenché, exactement le principe ADR 0017. Enforcement au `PUT /api/admin/reward-tiers` **et** re-vérifié dans le RPC d'échange sur le `cost_price` réel. Grille par défaut déterministe à l'onboarding (`suggestSaverBands` : ~4/8/12 paniers moyens, `pickGenerousGift` sous plafond), non-destructive.

### 4. Échange transactionnel qui rentre dans le cycle existant

RPC `exchange_points_for_gift` : advisory lock par (membre, resto) → vérifie palier + solde → crée un `pending_rewards` **`available` standard** (`source='saver'`, `order_id NULL`) → débite le ledger. Le cadeau suit ensuite le cycle coupon 10 min / validation cashier inchangé (ADR 0011). Un 23505 sur l'index un-seul-actif fait rollback **toute** la transaction — pas de débit orphelin ; message membre : « Récupère ou mets de côté ton cadeau actuel d'abord ». Un cadeau `saver` n'est **pas** re-bankable (garde SQL `order_id IS NOT NULL` + bouton masqué) — pas de boucle points → cadeau → points.

### 5. Cohérence budget (ADR 0012)

Au bank, le coût du cadeau non distribué est **re-crédité** au budget du mois (`increment_reward_budget` avec coût négatif — upsert additif, m21) ; à l'échange, le coût du gros cadeau est débité. Pas de double comptage.

### 6. Expiration 48h : statu quo (cadeau perdu)

Pas d'auto-conversion en points à l'expiration : l'urgence des 48h est le moteur du retour au restaurant, et « Mettre de côté » offre déjà l'échappatoire *active*. Constat technique : il n'existe aucun mécanisme serveur d'expiration (le countdown est cosmétique) — une auto-conversion exigerait d'abord un cron fiable. Piste rejetée pour l'instant : conversion à 50 % via cron.

### 7. Terminologie (ADR 0007)

Le solde s'appelle **« Ma réserve »** côté UI — jamais « points » seuls (réservés au score communautaire), jamais « cagnotte ». Le solde est une donnée personnelle affichable (comme « Mes stats ») ; les seuils sont en points, les articles par leur nom — jamais de `cost_price`/`menu_price` sur une surface membre (`/api/saver-tiers` ne renvoie que `id`, `min_threshold`, `item_name`).

## Alternatives rejetées

- **Toggle « mode épargne » persistant** : choix abstrait, risque d'oubli du mode actif, et le membre ne voit pas ce qu'il abandonne.
- **Choix à la soumission du ticket** : le membre décide avant de connaître son cadeau, et alourdit l'écran de scan.
- **Points = valeur carte du cadeau renoncé** : moins lisible, les petits paniers sous le 1er palier ne cumuleraient rien, et rapprocherait dangereusement l'UI des données prix (ADR 0007).
- **Colonne solde sur `profiles`/`memberships`** : perd l'audit et l'idempotence structurelle du ledger pour un gain nul à cette volumétrie.
- **Banker seulement la couche solo** (couches 2/3 restant récupérables) : demi-état incompatible avec le slot unique ADR 0011, illisible côté membre.
- **Auto-conversion à l'expiration** : tue l'incitation à revenir sous 48h (cf. §6).

## Conséquences

### Schéma (m33)
- `pending_rewards` : statut `banked`, `banked_at`, `source` (`order`/`saver`), `order_id` nullable.
- `reward_tiers` : layer `saver`.
- `point_transactions` + RPC `get_points_balance`, `bank_reward`, `exchange_points_for_gift`.

### Code
- `lib/points.ts` (nouveau) : wrappers RPC.
- `lib/reward-sizing.ts` : `suggestSaverBands` ; `lib/reward-defaults.ts` : bloc `saver`.
- `app/api/points` (GET), `app/api/points/bank` (POST), `app/api/points/exchange` (POST), `app/api/saver-tiers` (GET) ; `app/api/admin/reward-tiers` : layer `saver` + plafond.
- `app/r/[restaurantId]/my-rewards` : `BankButton`, section « Mises de côté » ; `app/r/[restaurantId]/reserve` (nouveau) : solde, gros cadeaux, mouvements ; dashboard : tuile « Ma réserve ».
- CONTEXT.md : entrée « Réserve ».
