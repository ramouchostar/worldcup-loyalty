# ADR 0006 — Système de récompenses en 3 couches

**Statut** : Accepté

## Contexte

Le programme doit récompenser deux comportements distincts : la dépense individuelle (inciter à revenir) et la participation communautaire (inciter à recruter et à dépenser ensemble). Une récompense purement individuelle ignore la dynamique de groupe. Une récompense purement collective déresponsabilise l'individu.

S'ajoute le contexte Coupe du Monde : l'avancement d'une équipe doit être récompensé sans ressembler à du pari sportif.

## Décision

Chaque commande directe validée génère une récompense en attente (`pending_rewards`) calculée en 3 couches cumulatives :

### Couche 1 — Palier solo (toujours présent)
Basé sur le montant de la commande validée. Non soumis au double verrou.

| Montant | Cadeau sur prochaine visite | Coût réel |
|---|---|---|
| < €15 | Aucune récompense solo | — |
| €15–24 | Churros 6 pcs | €0,31 |
| €25–39 | Finest burger | €0,94 |
| €40–59 | Menu 4 Tenders | €1,93 |
| €60+ | Chef's Combo | €1,92 |

Note : le minimum de validation automatique est €8 (ADR 0008). Les commandes entre €8 et €14 sont validées et comptent pour le score communautaire, mais ne génèrent pas de palier solo. Cette règle évite d'offrir une récompense sur un achat unitaire (sauce, boisson seule).

### Couche 2 — Bonus communautaire (soumis au double verrou)
Basé sur le score de l'équipe du membre au moment de la validation. S'ajoute au palier solo. Tombe à zéro si le double verrou n'est pas satisfait — sans explication visible côté client.

| Score équipe | Article ajouté | Coût réel |
|---|---|---|
| < 1 000 pts | Rien | — |
| 1 000–2 999 | +Frites Medium | €0,24 |
| 3 000–5 999 | +Churros 12 pcs | €0,63 |
| 6 000–9 999 | +Finest burger | €0,94 |
| 10 000+ | +Menu 4 Tenders | €1,93 |

### Couche 3 — Récompense d'avancement (non soumise au double verrou)
Active tant que l'équipe est encore en compétition. Permanente (pas de limite de 48h). Déclenchée quand l'admin valide un passage de tour — toujours après le match, jamais en prévision.

| Tour atteint | Article ajouté | Coût réel |
|---|---|---|
| Huitièmes | +Churros 6 pcs | €0,31 |
| Quarts | +Finest burger | €0,94 |
| Demi-finale | +Menu 4 Tenders | €1,93 |
| Finale | +Chef's Combo | €1,92 |

## Exemple chiffré

Ahmed commande €30. Belgique en quarts (score 7 500 pts). Double verrou satisfait.

```
Couche 1 : Finest burger         (€0,94)
Couche 2 : +Finest burger        (€0,94)   ← score 7 500 → tranche 6 000–9 999
Couche 3 : +Finest burger        (€0,94)   ← Belgique en quarts
─────────────────────────────────────────
Total perçu : 3× Finest burger   (~€19,20 de valeur perçue)
Coût réel restaurant : €2,82
Ahmed a dépensé €30 → coût programme : 9,4% du CA
Restaurant économise ~€7,50 vs commission Uber → net : +€4,68 vs Uber
```

## Pourquoi pas une récompense unique calculée globalement

Une valeur unique cachant les 3 composantes ne permet pas d'expliquer au client pourquoi son cadeau est meilleur ou moins bon qu'avant. Les 3 couches séparées dans `pending_rewards` permettent d'afficher : "Finest burger 🎁 + bonus Belgique 🇧🇪 + bonus quarts de finale ⚽" — chaque ligne explique son origine et renforce l'engagement sur chaque dimension.

## Conséquence sur le schéma

Table `pending_rewards` à créer :
```sql
CREATE TABLE pending_rewards (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) NOT NULL,
  restaurant_id     TEXT NOT NULL,
  order_id          UUID REFERENCES orders(id),
  solo_item         TEXT NOT NULL,
  solo_cost         NUMERIC(6,2) NOT NULL,
  community_item    TEXT,
  community_cost    NUMERIC(6,2),
  advancement_item  TEXT,
  advancement_cost  NUMERIC(6,2),
  status            TEXT DEFAULT 'available'
    CHECK (status IN ('available', 'redeemed', 'expired')),
  earned_at         TIMESTAMPTZ DEFAULT NOW(),
  redeemed_at       TIMESTAMPTZ
);
```

Trigger à ajouter sur `orders` après validation : calculer les 3 couches et insérer dans `pending_rewards`.

---

## Mise à jour 2026-06-24 — ADR 0013

Les articles et coûts des trois grilles ci-dessus ne sont plus codés en dur : ils proviennent du **catalogue menu** (`menu_items`) soumis par l'établissement (voir ADR 0013).

- La **structure** reste inchangée : 3 couches cumulatives, mêmes seuils (montant de commande, score communautaire, tour), même soumission au double verrou pour la couche 2.
- Seul le **cadeau** de chaque palier change de source : un `menu_items.id` assigné par l'admin (assisté par la suggestion), au lieu d'un couple `item`/`cost` figé dans `lib/rewards.ts`.
- Les coûts chiffrés des tableaux ci-dessus (€0,94, €0,31…) deviennent des **valeurs d'exemple Belchicken**, plus des constantes.
- `pending_rewards` continue de figer `*_item`/`*_cost` au moment de la validation (snapshot historique, insensible aux re-téléversements du catalogue).

---

## Mise à jour 2026-06-24 — ADR 0014 (pivot équipes)

La **couche 3 « Récompense d'avancement »** (grille liée aux tours de Coupe du Monde) est **remplacée** par les **paliers d'équipe** (ADR 0014) : seuils de dépense cumulée de l'équipe (`community_scores.total_spent`) → pourcentage borné ou article gratuit (catalogue, ADR 0013) débloqué pour **tous les membres** de l'équipe. Les couches 1 (palier solo) et 2 (bonus communautaire) sont inchangées. `getAdvancementBonus` et le bonus de tour ×1.5 sont retirés.
