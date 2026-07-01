# ADR 0012 — Plafond de budget cadeaux + double verrou basé sur la croissance

**Statut** : Accepté

## Contexte

Le score communautaire = `membres × euros totaux`. Cette formule explose avec le volume : un restaurant comme Kraainem (€127k/mois) atteint des scores de plusieurs centaines de milliers de points dès les premiers jours. Avec des seuils fixes (10 000 pts max dans la grille initiale), toutes les couches de récompenses se débloquent immédiatement et restent débloquées en permanence.

Deux risques financiers en découlent :
1. **Explosion du coût** en cas de forte participation — le restaurant distribue sans plafond.
2. **CA non incrémental** — le restaurant récompense des clients qui dépensaient déjà autant avant le programme, sans gain réel.

La règle fondamentale du programme est : *le restaurant doit toujours rester bénéficiaire, quelle que soit la participation.*

## Décision

### Garde-fou 1 — Plafond de budget en % du CA généré par le programme

Le coût total des récompenses distribuées dans un mois ne peut jamais dépasser un pourcentage configurable du CA que le programme a lui-même généré ce mois-là.

```
budget_cadeaux_mois = CA_programme_mois × REWARD_BUDGET_PCT   (défaut : 8%)
cout_distribue_mois = SUM(cout réel des pending_rewards créées ce mois)

SI cout_distribue_mois < budget_cadeaux_mois :
   → Couches 1, 2, 3 actives normalement
SI cout_distribue_mois >= budget_cadeaux_mois :
   → Couche 1 (palier solo) RESTE active — la promesse de base est intouchable
   → Couches 2 et 3 désactivées jusqu'au mois suivant
   → Client voit "Bonus communautaire en pause" — jamais la vraie raison (ADR 0007)
```

Le budget grandit proportionnellement au CA : forte participation = plus de CA généré = plus de budget, mais toujours dans le même ratio. **Il est structurellement impossible de dépasser le ratio fixé.**

`CA_programme_mois` = somme des `amount` des commandes validées via le programme sur le mois en cours.

### Garde-fou 2 — Double verrou basé sur la croissance, pas un montant absolu

Le seuil CA du double verrou (ADR 0007) n'est plus un montant fixe (ex. "€3 000/semaine") mais une **croissance** par rapport à la moyenne des 4 semaines précédant la période.

```
ca_baseline = moyenne hebdomadaire du CA des 4 semaines avant la période
seuil_croissance = ca_baseline × (1 + GROWTH_TARGET_PCT)   (défaut : +10%)

double_verrou_ouvert = (ca_periode_actuelle >= seuil_croissance)
                       ET (score_communautaire >= seuil_palier)
```

Le restaurant ne débloque les bonus communautaires que s'il vend **plus** qu'avant le programme. Si le CA reste au niveau habituel, le programme n'a rien généré → couche 2 verrouillée. Le restaurant ne paie jamais pour un CA qu'il aurait eu de toute façon.

### Variables d'environnement / config admin

```bash
REWARD_BUDGET_PCT=0.08      # 8% du CA programme max en cadeaux
GROWTH_TARGET_PCT=0.10      # +10% vs baseline pour ouvrir le double verrou
```

Ces deux valeurs sont configurables par établissement depuis l'interface admin. Kraainem peut tourner à 6%, un petit restaurant à 10%, selon la marge tolérée.

## Exemple — Kraainem

```
CA programme juin : €40 000
Budget cadeaux max : €40 000 × 8% = €3 200

Baseline (4 semaines avant) : €30 000/semaine
Seuil croissance : €33 000/semaine
→ Si Kraainem fait €33k+/semaine pendant le programme, double verrou ouvert
→ Sinon, seules les couches 1 (solo) restent — le restaurant ne perd rien

Même avec 2 000 membres actifs :
coût cadeaux plafonné à €3 200, soit 8% du CA qu'ils ont eux-mêmes apporté.
Impossible de perdre.
```

## Pourquoi pas seulement recalibrer les seuils de score par restaurant

Recalibrer les seuils (50 000 pts pour Kraainem, 1 000 pts pour un petit) fonctionne mais reste fragile : il faut deviner les bons chiffres pour chaque restaurant, et une erreur fait saigner la marge. Le plafond en % est auto-régulant — aucune estimation requise, le système s'ajuste seul à la taille réelle du restaurant. Les deux approches sont complémentaires : seuils par restaurant pour le rythme de progression, plafond en % comme filet de sécurité absolu.

## Conséquences sur le schéma

```sql
-- Suivi du budget mensuel par établissement
CREATE TABLE reward_budget_tracking (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id       TEXT NOT NULL,
  period_month        DATE NOT NULL,          -- premier jour du mois
  program_revenue     NUMERIC(12,2) DEFAULT 0, -- CA généré via le programme
  rewards_cost        NUMERIC(10,2) DEFAULT 0, -- coût réel distribué
  budget_pct          NUMERIC(4,3) DEFAULT 0.08,
  community_bonus_active BOOLEAN DEFAULT true,  -- false si plafond atteint
  UNIQUE(restaurant_id, period_month)
);

-- Baseline CA pour le calcul de croissance
ALTER TABLE restaurant_thresholds
  ADD COLUMN baseline_weekly_revenue NUMERIC(10,2),
  ADD COLUMN growth_target_pct NUMERIC(4,3) DEFAULT 0.10;
```

## Conséquences sur le code

- Le calcul des couches 2 et 3 (`getCommunityBonus`, ADR 0006) doit vérifier `reward_budget_tracking.community_bonus_active` avant d'attribuer un bonus.
- À chaque création de `pending_reward`, incrémenter `rewards_cost` du mois en cours.
- À chaque commande validée, incrémenter `program_revenue` du mois en cours.
- Un job recalcule `community_bonus_active` quand `rewards_cost >= program_revenue × budget_pct`.
- Le double verrou (`isRestaurantThresholdUnlocked`) compare le CA de la période au seuil de croissance, pas à un montant fixe.
- Dashboard membre : si `community_bonus_active = false`, afficher "Bonus communautaire en pause" sans explication (ADR 0007).

---

## Mise à jour 2026-06-24 — ADR 0013

Le coût réel utilisé pour `rewards_cost` (et donc pour le calcul du plafond) provient désormais du **catalogue menu** (`menu_items.cost_price`, ADR 0013), saisi par l'établissement — non plus de constantes Belchicken codées en dur.

Conséquence : le plafond « coût récompenses ≤ `REWARD_BUDGET_PCT` × CA programme » devient **exact pour chaque établissement**, avec ses propres prix de revient. Aucune logique d'ADR 0012 ne change ; seule la source des coûts devient fiable et propre à chaque resto.
