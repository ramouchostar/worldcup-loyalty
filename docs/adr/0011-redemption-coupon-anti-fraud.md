# ADR 0011 — Coupon de récupération : timer actif anti-fraude

**Statut** : Accepté

## Contexte

Les récompenses en attente (`pending_rewards`) doivent être récupérées physiquement au comptoir. Sans mécanisme de vérification, un client peut présenter une capture d'écran d'un coupon déjà utilisé ou partagé avec quelqu'un d'autre. La solution doit être à coût zéro et vérifiable visuellement par le cashier en 1 seconde.

## Décision

### Règle d'unicité — un seul cadeau actif à la fois (Option B)

Un membre ne peut avoir qu'**une seule récompense en attente** à la fois. Tant qu'une `pending_reward` est dans l'état `available`, aucune nouvelle récompense ne peut être créée pour ce membre — même si une nouvelle commande est validée.

- Si la récompense en attente **expire** (48h écoulées sans activation) → statut passe à `expired` → la prochaine commande validée génère une nouvelle récompense normalement
- Si la récompense est **récupérée** → statut passe à `redeemed` → la prochaine commande génère une nouvelle récompense
- Si une commande est validée **pendant qu'une récompense est active** → aucune nouvelle récompense créée, la commande compte quand même pour le score communautaire

### Fenêtre de 48h

La `pending_reward` expire automatiquement 48h après `earned_at`. Un job cron (toutes les heures) passe les récompenses expirées à `status = 'expired'`. Le membre voit un compte à rebours sur son dashboard.

### Minimum €10 sur la commande de récupération

Règle opérationnelle, non technique (pas d'intégration caisse). Le cashier sait que pour activer le coupon d'un client, celui-ci doit commander pour ≥ €10. Si le client dit "j'ai un cadeau à récupérer", le cashier traite d'abord la commande — si elle dépasse €10, il autorise le client à activer son coupon.

### Coupon actif — 10 minutes, timer anti-capture d'écran

Quand le membre tape "Récupérer mon cadeau" :
1. Serveur crée un `redemption_token` avec `expires_at = NOW() + 10 minutes`
2. Client est redirigé vers `/coupon/[token]`
3. La page affiche :
   - Nom + initiales du membre (vérification identité)
   - Liste des items à recevoir (solo + communautaire + avancement)
   - **Countdown animé** qui décompte en temps réel (MM:SS)
   - **Horloge live** "Il est 14:25:52" mise à jour chaque seconde
   - Barre de progression qui se vide visuellement

**Pourquoi c'est anti-capture d'écran** : une capture d'écran montre une heure figée. Le cashier compare l'heure affichée à sa montre — si l'horloge ne correspond pas ou ne bouge pas, c'est une capture d'écran.

Après 10 minutes, la page affiche "Coupon expiré — contacte le comptoir" (le token est invalidé côté serveur, pas seulement côté client).

### Validation cashier

L'admin (cashier) accède à `/admin/coupon/[token]` ou scanne un lien depuis `/admin/orders`. Il voit les mêmes informations que le client + un bouton **"✅ Cadeau remis"**. Ce bouton appelle `POST /api/redemption/[token]/redeem` qui :
1. Vérifie que `expires_at > NOW()` (anti-replay)
2. Vérifie que `redeemed_at IS NULL` (anti-double-usage)
3. Met à jour `redeemed_at = NOW()`
4. Passe `pending_rewards.status = 'redeemed'`

## Schéma

```sql
CREATE TABLE redemption_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) NOT NULL,
  reward_id     UUID REFERENCES pending_rewards(id) NOT NULL,
  restaurant_id TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,    -- nanoid(12), dans l'URL
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,    -- created_at + 10 minutes
  redeemed_at   TIMESTAMPTZ             -- NULL jusqu'à validation cashier
);

-- Index pour vérification rapide
CREATE INDEX idx_redemption_tokens_token ON redemption_tokens (token);
CREATE UNIQUE INDEX idx_one_active_reward_per_member
  ON pending_rewards (user_id, restaurant_id)
  WHERE status = 'available';
```

## Coût

Zéro. Uniquement :
- Supabase (déjà en place) pour stocker les tokens
- JavaScript natif pour le countdown (pas de librairie externe)
- Un cron job Supabase Edge Function (gratuit sur le tier Supabase)

## Conséquences

- La route `POST /api/orders/validate` doit vérifier l'unicité avant de créer une `pending_reward`
- La route `POST /api/redemption/[token]/redeem` doit être idempotente (double-tap du cashier → deuxième appel ignoré silencieusement)
- Le dashboard membre affiche un compte à rebours 48h visible dès qu'une récompense est en attente
- Le cashier n'a besoin que de son téléphone/tablette pour valider — pas d'accès caisse requis
