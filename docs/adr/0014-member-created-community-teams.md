# ADR 0014 — Pivot : équipes communautaires créées par les membres (remplace les équipes nationales Coupe du Monde)

**Statut** : Accepté (2026-06-24) — les quatre mécaniques ouvertes ont été confirmées (§ Décisions). Cet ADR **supersede l'ADR 0004** et **amende les ADR 0006 et 0009**.

## Contexte

Le programme est construit autour de la Coupe du Monde 2026 : les communautés sont des équipes nationales (`teams.country_code`, `flag_emoji`), les récompenses progressent au fil des tours (`round_reached`), et l'élimination structure le transfert (ADR 0004) ainsi que le bonus de tour ×1.5.

Constat : peu d'engouement pour la couche Coupe du Monde. Elle est de plus **éphémère** (un mois tous les quatre ans), **passive** (le membre subit le calendrier, il n'agit pas dessus) et **non renouvelable**.

CONTEXT.md anticipe déjà une « version hors Coupe du Monde » (bloc commenté « Équipes thématiques »), mais avec des équipes **créées par l'admin**. On va plus loin : les équipes sont **créées par les membres eux-mêmes** — c'est ce qui rend le mécanisme viral (chaque membre recrute son propre réseau).

## Décision

### 1. L'équipe communautaire remplace l'équipe nationale

Une **équipe** est un groupe créé par un membre et rejoint par d'autres : élèves d'une école, professeurs, salariés d'une entreprise, habitants d'une rue ou d'un quartier, chauffeurs de taxi, etc. Permanente (aucune élimination). Règles déjà arrêtées (tours précédents) :

- Une équipe **appartient à un seul établissement**. Même nom dans deux établissements = deux équipes indépendantes (membres, score et dépense cumulée distincts).
- Un membre appartient à **au plus une équipe par établissement** — *(amendé par [ADR 0015](0015-multi-restaurant-platform-pivot.md) : un membre n'est plus limité à un seul établissement au total, il peut être membre de plusieurs établissements simultanément, une équipe max par établissement)*.
- Chaque équipe porte un **type** (école / entreprise / rue-quartier / taxis / autre) — c'est lui qui rend possible le ciblage des notifications (§5).

### 2. Création & adhésion

- N'importe quel **membre actif** peut créer une équipe ; il en devient le **capitaine**.
- On rejoint via un **lien/QR partageable** : on réutilise l'infrastructure de parrainage existante (`referral_links`, schéma `/join?ref=CODE`) déclinée en `/join-team?code=`.
- Adhésion **ouverte par défaut** (le lien suffit). Le capitaine peut renommer l'équipe ; l'**admin établissement** garde un droit de regard (renommer, fusionner, désactiver une équipe, corriger un type) — modération nécessaire (noms inappropriés, doublons).

### 3. Score & récompenses — ce qui reste, ce qui change

| Couche | Aujourd'hui (Coupe du Monde) | Après le pivot |
|---|---|---|
| **1 — Palier solo** | Montant de la commande → cadeau | **Inchangé** |
| **2 — Bonus communautaire** | Score équipe (`membres × euros`) → article ajouté, sous double verrou | **Inchangé** (le score d'une équipe communautaire se calcule pareil) |
| **3 — Récompense d'avancement** | Tour de Coupe du Monde atteint → article | **Remplacée** par les **paliers d'équipe** |

**Paliers d'équipe** (nouvelle couche 3) : l'admin établissement définit des seuils de **dépense cumulée de l'équipe** (`community_scores.total_spent`) ; quand l'équipe les franchit, **tous ses membres** débloquent une récompense — un **pourcentage** de remise ou un **article gratuit** (choisi dans le catalogue menu, ADR 0013). C'est la mécanique métier : *« plus une équipe commande, plus elle débloque de cadeaux »*.

Rétro-financée **par construction** : le plafond de budget cadeaux (ADR 0012, ≤ 8 % du CA généré) et le double verrou basé sur la croissance garantissent que le restaurant a déjà encaissé la marge avant d'accorder la remise. Le restaurateur déclenche une promo *parce qu'il a fait du chiffre*, pas pour en faire.

Notes de conception :
- Le **pourcentage** est **borné** (prochaine commande, ou fenêtre de N jours) — un −X % permanent grignoterait la marge sur toutes les commandes futures et casserait la logique rétro-financée. L'article gratuit est borné par nature.
- Paliers en **échelle** sur la dépense cumulée à vie de l'équipe ; une variante **récurrente** (remise à zéro après chaque palier) est possible — à trancher.
- Distribution via le flux existant **récompense en attente → coupon** (ADR 0011) ; un pourcentage est validé au comptoir.
- Le **bonus de tour ×1.5** (`lib/score.ts`, `applyRoundBonus`) disparaît — pas de tours.

### 4. Transfert → changement d'équipe encadré (supersede ADR 0004)

Sans élimination, le déclencheur de l'ADR 0004 n'existe plus. Nouveau régime :

- Le changement d'équipe devient **volontaire mais limité à une fois par mois** (anti score-surfing : empêche de sauter sur une équipe juste avant qu'elle ne franchisse un palier) — *(amendé par [ADR 0015](0015-multi-restaurant-platform-pivot.md) : ce cooldown devient scopé par établissement, changer d'équipe chez un restaurant n'affecte pas le droit d'en changer chez un autre)*.
- **Distinction clé** : *rejoindre* une équipe pour la faire grandir reste libre et encouragé (un nouveau membre qui aide l'équipe à franchir un seuil, c'est voulu — c'est le moteur de recrutement) ; c'est *sauter d'une équipe à l'autre* qui est limité.
- L'historique de dépenses du membre le suit (principe ADR 0001 « money follows member » conservé).

### 5. Notifications ciblées par équipe / par type (étend ADR 0009)

Deux mécaniques distinctes coexistent :

- **Automatiques (ADR 0009, conservées)** : les triggers 1-3 (franchissement de palier, membre inactif, proximité du seuil) restent valables avec les équipes communautaires. Le **trigger 4 (avancement Coupe du Monde) est supprimé**.
- **Broadcast admin (nouveau — la demande métier)** : le restaurateur compose et envoie une notification à **une équipe, plusieurs équipes, ou tout un type** — ex. « menu étudiant » → toutes les équipes de type *école* ; « service de nuit » → type *taxis*. Canal PWA push (gratuit) → WhatsApp en fallback (ADR 0009). Journalisé dans `notification_log` avec `trigger_type = 'admin_broadcast'`, sous une enveloppe anti-spam **distincte** des triggers automatiques (§ Décisions).

## Modèle de données (changements)

```sql
-- teams : retirer le footballistique, ajouter le communautaire
ALTER TABLE teams
  DROP COLUMN flag_emoji,
  DROP COLUMN country_code,
  DROP COLUMN round_reached,
  DROP COLUMN eliminated_at,
  ADD COLUMN type TEXT NOT NULL DEFAULT 'autre'
    CHECK (type IN ('ecole','entreprise','rue_quartier','taxis','autre')),
  ADD COLUMN created_by UUID REFERENCES profiles(id),
  ADD COLUMN join_code TEXT UNIQUE;
-- is_active : ne signifie plus « encore en lice » mais « équipe active / non désactivée »

-- Paliers d'équipe (couche 3, remplace la grille d'avancement)
CREATE TABLE team_tiers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  threshold_spent NUMERIC(12,2) NOT NULL,         -- dépense cumulée d'équipe
  reward_kind     TEXT NOT NULL CHECK (reward_kind IN ('percent','free_item')),
  percent_value   NUMERIC(4,1),                   -- si percent
  menu_item_id    UUID REFERENCES menu_items(id), -- si free_item (ADR 0013)
  is_active       BOOLEAN DEFAULT true
);
```

`community_scores.total_spent` existe déjà → la dépense cumulée d'équipe est disponible sans nouveau calcul. `lib/score.ts` perd `calculateScoreWithBonus` / `applyRoundBonus`.

## Conséquences sur les autres ADR / docs (à appliquer une fois cet ADR accepté)

- **ADR 0004** — superseded (transfert lié à l'élimination → changement encadré, §4).
- **ADR 0006** — amender la couche 3 (avancement → paliers d'équipe).
- **ADR 0009** — amender : trigger 4 retiré, ajout du broadcast admin ciblé.
- **CONTEXT.md** — réécrire « Communautés & Équipes » (Communauté/Transfert, basculer « Équipes thématiques » en version définitive) ; retirer/ajuster « Récompense d'avancement », « Bonus de tour », les termes liés aux tours ; corriger la ligne d'intro (« lié à la Coupe du Monde 2026 ») ; ajouter « Équipe », « Capitaine », « Type d'équipe », « Palier d'équipe », « Broadcast admin ».
- **`types/index.ts`** — réécrire `Team` (retirer `flag_emoji`/`country_code`/`round_reached`/`eliminated_at` ; ajouter `type`/`created_by`/`join_code`) ; ajouter `TeamTier`.
- **Code Coupe du Monde à retirer** : `lib/football-data.ts`, `app/api/admin/sync-wc2026/route.ts`, `app/api/cron/sync-wc2026/route.ts`, `getAdvancementBonus` (`lib/rewards.ts`), et une migration de retrait des tables `m15`–`m18`.

## Décisions (confirmées le 2026-06-24)

1. **Modèle de récompense d'équipe** — **garder la couche 2** (bonus communautaire par commande, basé sur le score) **et ajouter les paliers d'équipe** en couche 3.
2. **Adhésion** — **ouverte** (le lien suffit), modération admin a posteriori.
3. **Fréquence de changement d'équipe** — **1×/mois**.
4. **Anti-spam des broadcasts admin** — **enveloppe dédiée** (≈ 2/semaine/membre max), séparée du quota des triggers automatiques.

## Alternatives rejetées

- **Garder la couche Coupe du Monde** : éphémère et peu engageante — c'est le motif du pivot.
- **Équipes créées par l'admin** (version « Équipes thématiques » documentée) : prive le programme de sa viralité ; l'intérêt des équipes communautaires est que chaque membre recrute son propre réseau (école, entreprise, quartier).
- **Transfert totalement libre** : rouvre le score-surfing que l'ADR 0004 visait à empêcher.

## Évolutions (hors périmètre)

- **Une seule app pour tous les établissements** (révision de l'ADR 0005) : un membre verrait toutes ses équipes, dans tous les restos, au même endroit. C'est l'objectif produit de fond, mais c'est un chantier multi-tenant distinct.
