# WORLD CUP LOYALTY — PROMPT COMPLET POUR CLAUDE CODE
# MVP à construire de A à Z

---

## CONTEXTE DU PROJET

Tu vas construire un **MVP complet** d'un programme de fidélité communautaire lié à la Coupe du Monde 2026 pour un restaurant fast-food belge (Belchicken, Bruxelles).

L'objectif est triple :
1. **Augmenter le chiffre d'affaires en salle** pendant la période de la Coupe du Monde
2. **Fidéliser les clients** pour qu'ils commandent directement au restaurant (pas via Uber Eats / Takeaway / Deliveroo)
3. **Construire la notoriété** via les avis Google et les réseaux sociaux

---

## RÈGLES MÉTIER FONDAMENTALES — LIS-LES AVANT DE CODER

### 1. Pas de plateformes de livraison
**Les commandes Uber Eats, Takeaway et Deliveroo ne comptent PAS.**
Uniquement les commandes passées directement au restaurant (sur place ou par téléphone/WhatsApp).
Raison : les commissions des plateformes (25-30%) détruisent la marge.

### 2. Le restaurant doit gagner quelque chose avant que les clients reçoivent les cadeaux
**Les récompenses ne se débloquent QUE si le restaurant atteint un seuil de CA collectif.**
Ce n'est pas une récompense individuelle automatique — c'est une récompense communautaire conditionnelle.
Logique : si le programme ne rapporte pas au restaurant, il ne distribue rien.

### 3. Deux types de cadeaux selon le comportement
- **Petits cadeaux à faible coût** : pour les actions gratuites (avis Google, abonnement réseaux sociaux, partage)
- **Grandes récompenses** : uniquement pour les clients qui ont dépensé de l'argent au restaurant

### 4. Le score communautaire combine DEUX facteurs
`Score = Nombre de membres × Total euros dépensés par la communauté`
Les deux sont nécessaires : une grande communauté qui ne dépense rien = score faible.

---

## DONNÉES ÉCONOMIQUES DU RESTAURANT (BELCHICKEN)

Voici les marges réelles extraites du fichier d'analyse. Utilise ces données pour calibrer les seuils de récompenses et les cadeaux offerts.

### Produits à HAUTE marge (coefficient > 5) — bons cadeaux à offrir
```
Frites Medium      : Prix vente 2,50€  | Coût 0,24€  | Marge 90% | Coeff 10,2x
Frites Large       : Prix vente 3,00€  | Coût 0,37€  | Marge 87% | Coeff 8,0x
Churros (6)        : Prix vente 2,90€  | Coût 0,31€  | Marge 89% | Coeff 9,2x
Churros (12)       : Prix vente 4,60€  | Coût 0,63€  | Marge 86% | Coeff 7,3x
Nugget (1)         : Prix vente 1,20€  | Coût 0,13€  | Marge 89% | Coeff 9,2x
Nugget (4)         : Prix vente 4,40€  | Coût 0,52€  | Marge 88% | Coeff 8,5x
Hot stripes (1)    : Prix vente 1,20€  | Coût 0,15€  | Marge 88% | Coeff 8,0x
Chef's Combo       : Prix vente 13,90€ | Coût 1,92€  | Marge 86% | Coeff 7,2x
Tenders (4)        : Prix vente 7,40€  | Coût 1,10€  | Marge 85% | Coeff 6,7x
Finest (burger)    : Prix vente 6,40€  | Coût 0,94€  | Marge 85% | Coeff 6,8x
```

### Produits à marge MOYENNE (coefficient 4-5) — cœur de l'offre
```
Finest Menu        : Prix vente 9,40€  | Coût 1,78€  | Marge 81% | Coeff 5,3x
Grill Menu         : Prix vente 9,90€  | Coût 1,75€  | Marge 82% | Coeff 5,7x
4 Tenders Menu     : Prix vente 10,90€ | Coût 1,93€  | Marge 82% | Coeff 5,7x
8 Nuggets Menu     : Prix vente 9,90€  | Coût 1,87€  | Marge 81% | Coeff 5,3x
```

### Produits à marge FAIBLE (coefficient < 4) — à éviter comme cadeaux
```
Milkshakes         : Coeff 2,5x → NE PAS offrir
Boneless Bucket    : Coeff 1,8x → NE PAS offrir
Magnifique Beef    : Coeff 3,5x → éviter
```

### Panier moyen estimé
Basé sur les données : **8€ à 12€ par commande** (menu simple à menu XL).
Le programme doit pousser vers le haut du panier (menus, pas les articles seuls).

---

## STACK TECHNIQUE

```
Framework      : Next.js 14 (App Router)
Base de données: Supabase (PostgreSQL) — tier gratuit
Auth           : Supabase Auth (magic link par email ou SMS via Twilio optionnel)
Styles         : Tailwind CSS
Déploiement    : Docker-ready (serveur propre) OU Vercel
Language       : TypeScript strict
State          : React Context + SWR
```

**Pas de Redux. Pas de bibliothèques superflues. Code simple et maintenable.**

---

## SCHÉMA DE BASE DE DONNÉES

Crée ces tables dans cet ordre exact dans Supabase.

```sql
-- ÉQUIPES NATIONALES
CREATE TABLE teams (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  flag_emoji      TEXT NOT NULL,
  country_code    TEXT NOT NULL UNIQUE,
  is_active       BOOLEAN DEFAULT true,
  eliminated_at   TIMESTAMPTZ,
  round_reached   TEXT DEFAULT 'group_stage',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- MEMBRES (clients)
CREATE TABLE profiles (
  id              UUID REFERENCES auth.users(id) PRIMARY KEY,
  display_name    TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  team_id         UUID REFERENCES teams(id),
  is_admin        BOOLEAN DEFAULT false,
  joined_at       TIMESTAMPTZ DEFAULT NOW()
);

-- COMMANDES (seulement commandes directes au restaurant)
CREATE TABLE orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) NOT NULL,
  team_id           UUID REFERENCES teams(id) NOT NULL,
  amount            NUMERIC(8,2) NOT NULL CHECK (amount > 0 AND amount <= 500),
  order_date        DATE NOT NULL,
  order_time        TIME NOT NULL,
  -- Clé anti-doublon : impossible de soumettre deux fois le même ticket
  duplicate_key     TEXT NOT NULL UNIQUE,
  -- duplicate_key = DATE + HEURE(HH:MM) + MONTANT
  -- ex: "2026-06-15_19:32_24.50"
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  rejection_reason  TEXT,
  validated_at      TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SCORES COMMUNAUTAIRES (calculé automatiquement)
CREATE TABLE community_scores (
  team_id           UUID REFERENCES teams(id) PRIMARY KEY,
  member_count      INTEGER DEFAULT 0,
  total_spent       NUMERIC(10,2) DEFAULT 0,
  score             NUMERIC(14,2) GENERATED ALWAYS AS
                    (member_count * total_spent) STORED,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);

-- RÉCOMPENSES (100% configurables par l'admin)
CREATE TABLE rewards (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level             INTEGER NOT NULL UNIQUE,
  score_threshold   NUMERIC(14,2) NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  gift_details      TEXT,
  cost_euros        NUMERIC(6,2) DEFAULT 0,
  requires_purchase BOOLEAN DEFAULT true,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- PETITES RÉCOMPENSES (avis Google, partage, abonnement)
CREATE TABLE micro_rewards (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type              TEXT NOT NULL
    CHECK (type IN ('google_review', 'social_follow', 'social_share', 'referral')),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  gift_item         TEXT NOT NULL,
  gift_cost_euros   NUMERIC(6,2) NOT NULL,
  is_active         BOOLEAN DEFAULT true
);

-- MICRO-RÉCOMPENSES RÉCLAMÉES (une seule fois par type par user)
CREATE TABLE micro_reward_claims (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) NOT NULL,
  reward_type       TEXT NOT NULL,
  proof_url         TEXT,
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  claimed_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reward_type)
);

-- TRANSFERTS D'ÉQUIPE (quand une équipe est éliminée)
CREATE TABLE transfers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) NOT NULL,
  from_team_id      UUID REFERENCES teams(id),
  to_team_id        UUID REFERENCES teams(id) NOT NULL,
  transferred_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SEUIL CA RESTAURANT (le restaurant doit gagner avant de distribuer)
CREATE TABLE restaurant_thresholds (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_label      TEXT NOT NULL,
  target_revenue    NUMERIC(10,2) NOT NULL,
  current_revenue   NUMERIC(10,2) DEFAULT 0,
  is_unlocked       BOOLEAN DEFAULT false,
  unlocked_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### Triggers Supabase à créer

```sql
-- Trigger 1: mise à jour community_scores quand une commande est validée
CREATE OR REPLACE FUNCTION update_community_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'validated' AND OLD.status != 'validated' THEN
    UPDATE community_scores
    SET total_spent = total_spent + NEW.amount,
        last_updated = NOW()
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_validated
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_community_score();

-- Trigger 2: mise à jour member_count quand un membre change d'équipe
CREATE OR REPLACE FUNCTION update_member_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NOT NULL THEN
    UPDATE community_scores
    SET member_count = member_count - 1
    WHERE team_id = OLD.team_id;
  END IF;
  IF NEW.team_id IS NOT NULL THEN
    UPDATE community_scores
    SET member_count = member_count + 1
    WHERE team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_team_change
AFTER UPDATE OF team_id ON profiles
FOR EACH ROW EXECUTE FUNCTION update_member_counts();

-- Trigger 3: création automatique du profil après inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## STRUCTURE DU PROJET

```
worldcup-loyalty/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                    ← Landing page
│   │   └── leaderboard/page.tsx        ← Classement public
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (member)/
│   │   ├── dashboard/page.tsx          ← Dashboard membre
│   │   ├── submit-order/page.tsx       ← Soumettre une commande
│   │   ├── my-team/page.tsx            ← Ma communauté
│   │   ├── rewards/page.tsx            ← Mes récompenses
│   │   ├── micro-rewards/page.tsx      ← Avis Google / réseaux sociaux
│   │   └── transfer/page.tsx           ← Changer d'équipe
│   ├── admin/
│   │   ├── page.tsx                    ← Dashboard admin
│   │   ├── orders/page.tsx             ← Valider/rejeter commandes
│   │   ├── rewards/page.tsx            ← Gérer les récompenses
│   │   ├── micro-rewards/page.tsx      ← Valider avis Google
│   │   ├── teams/page.tsx              ← Gérer les équipes
│   │   └── thresholds/page.tsx         ← Seuil CA restaurant
│   └── api/
│       ├── orders/route.ts
│       ├── rewards/route.ts
│       ├── micro-rewards/route.ts
│       ├── teams/route.ts
│       ├── transfer/route.ts
│       └── thresholds/route.ts
├── components/
│   ├── ui/                             ← Boutons, inputs, cards
│   ├── member/                         ← Composants membres
│   ├── admin/                          ← Composants admin
│   └── shared/                         ← Leaderboard, score, etc.
├── lib/
│   ├── supabase.ts                     ← Client + server
│   ├── score.ts                        ← Calcul des scores
│   ├── rewards.ts                      ← Logique des paliers
│   └── thresholds.ts                   ← Logique seuil restaurant
├── types/index.ts
├── middleware.ts
├── .env.local
└── docker-compose.yml
```

---

## LOGIQUE MÉTIER COMPLÈTE

### A. Soumission d'une commande

```typescript
// lib/orders.ts

export function buildDuplicateKey(date: string, time: string, amount: number): string {
  // Arrondi à l'heure:minute (pas les secondes)
  const timeHHMM = time.substring(0, 5);
  return `${date}_${timeHHMM}_${amount.toFixed(2)}`;
}

// Règles de validation côté serveur :
// 1. L'utilisateur doit avoir choisi une équipe
// 2. Le montant doit être entre 1€ et 500€
// 3. La date ne peut pas être dans le futur
// 4. La date ne peut pas être antérieure au lancement du programme
// 5. Le duplicate_key ne doit pas exister en base
// 6. Le statut initial est 'pending' → l'admin doit valider
```

### B. Calcul du score

```typescript
// lib/score.ts

export function calculateScore(memberCount: number, totalSpent: number): number {
  return memberCount * totalSpent;
}

// Bonus World Cup : si l'équipe passe un tour, multiplicateur x1.5 pendant 48h
export function calculateScoreWithBonus(
  memberCount: number,
  totalSpent: number,
  passedRound: boolean,
  hoursElapsed: number
): number {
  const base = memberCount * totalSpent;
  if (passedRound && hoursElapsed < 48) {
    return base * 1.5;
  }
  return base;
}
```

### C. Paliers de récompenses — RÈGLE CRITIQUE

```typescript
// lib/rewards.ts

// Les récompenses ne se débloquent QUE SI :
// 1. Le score de la communauté dépasse le seuil
// 2. ET le seuil CA du restaurant est atteint (is_unlocked = true)
// Un membre ne reçoit une récompense QUE s'il a au moins une commande validée

export async function getUnlockedRewards(
  teamScore: number,
  restaurantThresholdUnlocked: boolean
): Promise<Reward[]> {
  if (!restaurantThresholdUnlocked) return []; // Restaurant n'a pas encore gagné assez

  const { data } = await supabase
    .from('rewards')
    .select('*')
    .eq('is_active', true)
    .lte('score_threshold', teamScore)
    .order('level', { ascending: true });

  return data ?? [];
}

// Un membre est "actif" = il a au moins 1 commande validée
export async function isMemberActive(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'validated');

  return (count ?? 0) > 0;
}
```

### D. Micro-récompenses (avis Google, réseaux sociaux)

```typescript
// Règles :
// - Une seule fois par type par utilisateur (UNIQUE sur user_id + reward_type)
// - Le membre soumet une preuve (capture d'écran ou lien)
// - L'admin valide manuellement
// - Cadeau : produit à faible coût (churros, frites, nugget)
// - PAS conditionné au seuil du restaurant (c'est du marketing, pas une récompense)

const MICRO_REWARDS_DEFAULT = [
  {
    type: 'google_review',
    title: 'Avis Google 5 étoiles',
    description: 'Laissez un avis 5 étoiles sur Google',
    gift_item: 'Portion de Churros (6 pcs)',
    gift_cost_euros: 0.31  // coût réel selon analyse des marges
  },
  {
    type: 'social_follow',
    title: 'Abonnement Instagram/Facebook',
    description: 'Suivez nos comptes Instagram et Facebook',
    gift_item: 'Nugget (4 pcs)',
    gift_cost_euros: 0.52
  },
  {
    type: 'social_share',
    title: 'Partage de la campagne',
    description: 'Partagez notre campagne World Cup sur vos réseaux',
    gift_item: 'Frites Medium',
    gift_cost_euros: 0.24
  },
  {
    type: 'referral',
    title: 'Parrainage',
    description: 'Invitez un ami à rejoindre votre communauté',
    gift_item: 'Sauce XXL au choix',
    gift_cost_euros: 0.58
  }
];
```

### E. Seuil CA restaurant — La règle "le restaurant gagne en premier"

```typescript
// lib/thresholds.ts

// L'admin crée des paliers de CA par semaine ou par période
// Exemple :
// Semaine 1 (phase de groupes) : objectif 3 000€ → si atteint, paliers 1 et 2 débloqués
// Semaine 2 : objectif 5 000€ → palier 3 débloqué
// Demi-finales : objectif 8 000€ → palier 4 (grande récompense) débloqué

// L'admin valide manuellement quand le CA est atteint
// (en croisant avec la caisse du restaurant)

export async function getCurrentThreshold() {
  const { data } = await supabase
    .from('restaurant_thresholds')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function isRestaurantThresholdUnlocked(): Promise<boolean> {
  const threshold = await getCurrentThreshold();
  return threshold?.is_unlocked ?? false;
}
```

### F. Paliers de récompenses recommandés (basés sur les marges)

```
PALIER 1 — Score 500 + CA restaurant > 3 000€/semaine
Cadeau : Frites Medium offertes (coût 0,24€)
Conditions : avoir au moins 1 commande validée

PALIER 2 — Score 1 500 + CA restaurant > 5 000€/semaine
Cadeau : Portion Nuggets (4 pcs) offertes (coût 0,52€)
Conditions : avoir au moins 2 commandes validées

PALIER 3 — Score 3 000 + CA restaurant > 7 000€
Cadeau : Menu au choix parmi les menus à coefficient > 5 (coût ~1,80€)
(Finest Menu, Grill Menu, 4 Tenders Menu, 8 Nuggets Menu)
Conditions : avoir dépensé au minimum 20€ au restaurant

PALIER 4 — Score 6 000 + CA restaurant > 10 000€ + équipe en demi-finale
Cadeau : Repas complet offert (burger + frites + boisson) (coût ~2,30€)
Conditions : avoir dépensé au minimum 50€ au restaurant

NB : Ces paliers sont 100% configurables par l'admin depuis l'interface.
     Ces valeurs sont les valeurs par défaut à insérer au démarrage.
```

---

## PAGES ET COMPOSANTS À CONSTRUIRE

### Landing page (/)
- Présentation du concept en 3 étapes : "Choisis ton équipe", "Mange au resto", "Gagnez ensemble"
- Leaderboard public top 5
- CTA : "Rejoindre maintenant"
- Message clair : "Commandes directes uniquement — pas de livraison"
- Bannière : "Pourquoi commander directement ? Économisez 20% vs les apps de livraison"

### Dashboard membre (/dashboard)
- Score de sa communauté (temps réel via SWR toutes les 30s)
- Prochaine récompense à débloquer + barre de progression
- Statut du seuil restaurant (débloqué ou pas)
- Ses commandes soumises et leur statut
- Ses micro-récompenses réclamées
- Si équipe éliminée : alerte + bouton transfert

### Soumettre une commande (/submit-order)
- Formulaire : date, heure (HH:MM), montant (€)
- Message clair : "Cette commande doit avoir été passée directement au restaurant"
- Case à cocher obligatoire : "Je confirme que cette commande n'a pas été passée via une plateforme de livraison"
- Feedback immédiat : succès (en attente de validation) ou erreur doublon

### Micro-récompenses (/micro-rewards)
- 4 actions disponibles : Avis Google, Follow Instagram/Facebook, Partage, Parrainage
- Pour chaque action : instructions + formulaire de soumission de preuve
- Statut de chaque demande (en attente / validée / rejetée)
- Badge cadeau associé à chaque action

### Leaderboard (/leaderboard)
- Classement temps réel de toutes les communautés
- Colonnes : Rang, Équipe + drapeau, Membres, CA total, Score
- Indicateur : équipes encore en course vs éliminées
- Supabase Realtime pour la mise à jour en direct

### Interface admin

**/admin/orders** — Validation des commandes
- Liste des commandes en attente
- Boutons Valider / Rejeter avec raison obligatoire
- Filtre par date, par équipe, par montant
- Mode bulk : valider plusieurs commandes d'un coup

**/admin/rewards** — Gestion des récompenses
- CRUD complet des paliers
- Champs : niveau, score requis, titre, description, détails cadeau, coût (€), nécessite achat (oui/non)
- Indicateur : combien de communautés ont atteint ce palier

**/admin/micro-rewards** — Validation des micro-récompenses
- Liste des demandes d'avis Google / abonnements en attente
- Lien vers la preuve soumise
- Boutons Valider / Rejeter

**/admin/teams** — Gestion des équipes
- Toggle "équipe encore en course / éliminée"
- Quand une équipe est éliminée → notification automatique à ses membres
- Champ "tour atteint" pour le multiplicateur de score

**/admin/thresholds** — Seuil CA restaurant
- Créer une nouvelle période avec objectif CA
- Bouton "Objectif atteint → Débloquer les récompenses"
- Historique des périodes précédentes

---

## VARIABLES D'ENVIRONNEMENT

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx

# Nom du restaurant
NEXT_PUBLIC_RESTAURANT_NAME=Belchicken

# Date de lancement du programme (pas de commandes avant cette date)
NEXT_PUBLIC_PROGRAM_START_DATE=2026-06-01

# Mode auto-validation (true en dev uniquement)
NEXT_PUBLIC_AUTO_VALIDATE=false
```

---

## ORDRE DE DÉVELOPPEMENT

**Construis dans cet ordre. Attends ma validation avant de passer au module suivant.**

| # | Module | Livrable |
|---|--------|----------|
| M1 | Setup | Next.js 14 + Supabase + Tailwind + Docker. Structure des dossiers. |
| M2 | BDD | Toutes les tables SQL. Triggers. 32 équipes de la Coupe du Monde insérées. Paliers par défaut + micro-récompenses insérées. |
| M3 | Auth | Inscription magic link. Profil auto-créé. Choix d'équipe obligatoire. Middleware protection routes. |
| M4 | Soumission commande | Formulaire. Anti-doublon. Case "pas de livraison". Statut pending. |
| M5 | Score & seuils | Calcul score. Triggers BDD. Logique seuil restaurant. getUnlockedRewards(). |
| M6 | Dashboard membre | Score temps réel. Barres de progression. Liste commandes. Alerte équipe éliminée. |
| M7 | Micro-récompenses | 4 actions. Formulaire preuve. Statut. |
| M8 | Leaderboard | Classement Realtime. Page communauté publique. |
| M9 | Transfert | Quand équipe éliminée → flow de transfert. Historique. |
| M10 | Interface admin | Tous les écrans admin dans l'ordre : orders → rewards → micro-rewards → teams → thresholds. |
| M11 | Landing page | Page publique. Pitch du concept. Leaderboard. CTAs. |
| M12 | PWA + polish | Manifest. Meta tags. Responsive mobile. Tests finaux. |

---

## DONNÉES DE TEST À INSÉRER

Équipes pour les tests (à insérer en M2) :
```sql
INSERT INTO teams (name, flag_emoji, country_code) VALUES
('Belgique', '🇧🇪', 'BE'),
('Maroc', '🇲🇦', 'MA'),
('Algérie', '🇩🇿', 'DZ'),
('France', '🇫🇷', 'FR'),
('Brésil', '🇧🇷', 'BR'),
('Argentine', '🇦🇷', 'AR'),
('Espagne', '🇪🇸', 'ES'),
('Portugal', '🇵🇹', 'PT');
-- + les autres équipes qualifiées (32 au total)

-- Community scores initiaux
INSERT INTO community_scores (team_id, member_count, total_spent)
SELECT id, 0, 0 FROM teams;

-- Seuil restaurant initial
INSERT INTO restaurant_thresholds (period_label, target_revenue)
VALUES ('Phase de groupes — Semaine 1', 3000.00);
```

---

## RÈGLES DE SÉCURITÉ

1. **Toutes les mutations passent par les API routes Next.js** — jamais directement depuis le client Supabase
2. **is_admin** ne peut être modifié qu'avec la clé service_role
3. **La validation des commandes** est réservée aux admins — vérification côté serveur obligatoire
4. **Le duplicate_key** est construit et vérifié côté serveur uniquement
5. **RLS Supabase** :
   - Un membre ne voit que ses propres commandes et micro-récompenses
   - Les scores des communautés sont publics (SELECT pour tous)
   - INSERT sur orders : uniquement le membre authentifié, pour son propre user_id
   - UPDATE sur orders : uniquement les admins (via service_role)

---

## COMMANDES DE DÉMARRAGE

```bash
# Création du projet
npx create-next-app@latest worldcup-loyalty --typescript --tailwind --app --src-dir no
cd worldcup-loyalty

# Dépendances
npm install @supabase/supabase-js @supabase/ssr swr

# Développement
npm run dev

# Build production
npm run build && npm start

# Docker
docker-compose up --build
```

---

## NOTE FINALE POUR CLAUDE CODE

**Priorité absolue** : fonctionner simplement et sans bug. Pas d'over-engineering.

Le point le plus critique de tout ce projet est **la règle du double verrou** :
- Les récompenses ne se débloquent QUE SI le score communautaire dépasse le seuil
- ET QUE le restaurant a lui-même atteint son objectif de CA

Sans ce double verrou, le programme distribue des cadeaux même si le restaurant ne gagne rien. C'est la logique inverse de ce qu'on veut.

**Les micro-récompenses (avis Google, abonnements)** n'ont pas ce verrou — elles se distribuent librement car leur coût est marginal (0,24€ à 0,60€) et elles rapportent de la notoriété même sans CA.

Commence par M1. Liste les fichiers créés à la fin de chaque module.
