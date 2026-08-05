# ADR 0010 — Design du dashboard : gamification et lisibilité de la mécanique

**Statut** : Accepté — **amendé par l'ADR 0030** (2026-08-05) : le dashboard devient le hub membre. Le hero et la progression communautaire restent tels quels ; s'y ajoutent la carte gérant (position 0), la carte Actions (ADR 0024, position 2) et une rangée de tuiles d'accès permanentes à micro-états (position 4). Ordre complet dans l'ADR 0030 §4.

## Contexte

Le programme repose sur 3 couches de récompenses simultanées (solo, communautaire, avancement). Sans visualisation claire, le membre ne comprend pas pourquoi son cadeau est ce qu'il est, ne voit pas l'impact de ses actions, et perd l'intérêt. La gamification doit répondre à une seule question en moins de 3 secondes : **"Qu'est-ce que je gagne si je commande ce soir ?"**

## Décision

### Principe directeur : conséquences, pas chiffres

Chaque élément du dashboard doit afficher une **conséquence concrète**, pas une valeur abstraite.

| ❌ À éviter | ✅ À privilégier |
|---|---|
| "Score communauté : 8 500" | "À 1 500 pts du prochain bonus : +Menu 4 Tenders" |
| "Bonus actif" | "+Finest burger grâce à Belgique en quarts" |
| "Tu as 3 commandes" | "3 commandes validées · €200 dépensés" |
| "Ta communauté progresse" | "Ta communauté a travaillé pour toi. Profites-en ce soir." |

### Hiérarchie des 4 sections

**Section 1 — Hero card : aperçu prochaine commande** (priorité maximale)

La récompense totale calculée en temps réel (couches 1+2+3) pour une commande type du membre. Chaque ligne est étiquetée pour expliquer son origine :

```
🎁 TA PROCHAINE COMMANDE
Pour une commande de €25+ :

🍔 Finest burger          ← ton cadeau de base
🍔 + Finest burger        ← 🇧🇪 force de ta communauté
🍔 + Finest burger        ← ⚽ Belgique en quarts
────────────────────────
3 cadeaux t'attendent au comptoir
```

La mécanique des 3 couches s'explique d'elle-même par les labels — aucun texte pédagogique supplémentaire nécessaire.

**Section 2 — Community progress card**

Score actuel + barre de progression + conséquence du prochain palier (pas juste le score cible) :

```
🇧🇪 Communauté Belgique
8 500 pts  ▓▓▓▓▓▓▓▓▓░  vers 10 000 pts

À 1 500 pts du prochain bonus :
┌─────────────────────────────┐
│ + Menu 4 Tenders            │
│   sur chaque commande       │
└─────────────────────────────┘
💡 Chaque commande directe de ta communauté vous rapproche.
```

**Section 3 — World Cup card**

Chemin du tournoi avec position actuelle. La phrase clé utilise "tant que" (état permanent) et non "si elle gagne" (pari) :

```
⚽ Belgique dans le tournoi
Groupes → 1/8 → 1/4 → 1/2 → ★
  ✅       ✅    📍

Tant que la Belgique avance,
ton bonus d'avancement reste actif sur chaque commande.
```

**Section 4 — Stats personnelles** (bas de page, discret)

```
3 commandes validées  ·  €200 dépensés  ·  2 cadeaux récupérés
```

### États spéciaux

**Communauté faible (score < premier seuil) :**
Remplacer la progress card par un message d'activation :
```
🇧🇪 Belgique — 800 pts
▓░░░░░░░░░  vers 1 000 pts

À 200 pts du 1er bonus communautaire.
Invite des amis à rejoindre Belgique →
chaque commande qu'ils passent
vous rapproche du bonus.
[Partager mon lien WhatsApp]
```

**Équipe éliminée :**
La hero card masque le bonus d'avancement. Une alerte remplace la World Cup card :
```
🇧🇪 Belgique est éliminée.
Ton bonus d'avancement n'est plus actif.

[Changer de communauté →]
Rejoins une équipe encore en lice
et continue à profiter des bonus.
```

### Source de données unique

Toutes les sections sont alimentées par une seule fonction serveur calculée à chaque chargement du dashboard. Aucune donnée de récompense n'est stockée à l'affichage — tout est recalculé en temps réel à partir de `community_scores`, `teams.round_reached`, `teams.eliminated_at` et `orders` du membre.

```typescript
async function getDashboardData(userId: string, restaurantId: string) {
  // Pour la hero card, on prévisualise pour un montant de commande typique.
  // Si le membre a un historique → moyenne de ses commandes validées.
  // Si aucun historique (premier accès) → défaut à €25 (ticket moyen bas de la grille).
  const previewAmount = memberAvgOrderAmount ?? 25

  return {
    // Section 1 — hero card
    nextOrderPreview: {
      baseReward:        getBaseReward(previewAmount),
      communityBonus:    getCommunityBonus(teamScore, doubleVerrouSatisfied),
      advancementBonus:  getAdvancementBonus(team.round_reached, team.eliminated_at),
    },
    // Section 2 — community
    community: {
      score:           teamScore,
      nextTierScore:   getNextTier(teamScore).threshold,
      nextTierReward:  getNextTier(teamScore).item,
      progress:        teamScore / getNextTier(teamScore).threshold,
      isWeak:          teamScore < FIRST_TIER_THRESHOLD,
    },
    // Section 3 — tournament
    tournament: {
      roundReached:    team.round_reached,
      isEliminated:    !!team.eliminated_at,
    },
    // Section 4 — stats
    stats: {
      orderCount:      validatedOrderCount,
      totalSpent:      totalSpent,
      rewardsRedeemed: redeemedCount,
    }
  }
}
```

## Pourquoi la hero card est la section 1 et non le score communautaire

Le score communautaire est un **moyen**, pas une fin. Ce qui motive le membre à revenir c'est de savoir qu'un cadeau concret l'attend. Mettre le score en premier force le membre à faire le calcul lui-même ("8 500 pts → qu'est-ce que ça veut dire pour moi ?"). La hero card fait ce calcul à sa place et lui présente directement la valeur.

## Conséquences

- Le composant `DashboardHeroCard` est le composant le plus testé de l'app — toute régression dans le calcul des 3 couches est visible immédiatement par le membre.
- Les textes de la hero card doivent rester sous 5 mots par ligne — lisibilité mobile en 2 secondes.
- La route `/api/dashboard` ne doit jamais exposer les données brutes de `restaurant_thresholds` (voir ADR 0007).
- SWR rafraîchit la hero card toutes les 30 secondes — le score communautaire peut changer en temps réel si d'autres membres commandent.
