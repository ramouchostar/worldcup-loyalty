# WorldCup Loyalty — Belchicken

Programme de fidélité communautaire lié à la Coupe du Monde 2026. Les clients forment des communautés autour d'équipes nationales et débloquent des récompenses collectives en commandant directement au restaurant.

**Live** → [worldcup-loyalty.vercel.app](https://worldcup-loyalty.vercel.app)

---

## Concept

Chaque commande directe (en salle ou par téléphone) génère automatiquement une **récompense en attente** composée de 3 couches :

| Couche | Condition | Exemple |
|--------|-----------|---------|
| **Palier solo** | Montant de la commande | €25–39 → Finest burger |
| **Bonus communautaire** | Score de l'équipe + seuil CA restaurant | Score ≥ 3 000 pts → +Churros 12 pcs |
| **Récompense d'avancement** | Équipe encore en compétition | Quarts de finale → +Finest burger |

Le membre récupère ses cadeaux au comptoir Belchicken à sa prochaine visite.

---

## Stack

- **Frontend** — Next.js 14 App Router (Server Components + Client Components)
- **Backend** — Supabase (PostgreSQL, RLS, SECURITY DEFINER triggers, Storage)
- **Auth** — Supabase Auth (email/password, Google OAuth)
- **Deploy** — Vercel (un déploiement par établissement)
- **OCR** — Claude Vision API (validation automatique des tickets de caisse)

---

## Architecture

```
app/
  (auth)/          — login, signup, register (choix équipe)
  (member)/        — dashboard, récompenses, micro-rewards, soumission commande
  (public)/        — leaderboard, page d'accueil
  admin/           — gestion commandes, équipes, seuils CA, cadeaux en attente
  api/             — routes API REST

lib/               — supabase client, helpers rewards/thresholds/score
components/        — ScoreCard (realtime), RewardProgressBar, LoginForm
types/             — TypeScript types partagés
docs/
  adr/             — 10 ADRs (décisions d'architecture)
  m2–m5-*.sql      — migrations Supabase
  create-issues.sh — script de création des issues GitHub
```

### Score communautaire

```
score = nombre_de_membres × total_euros_dépensés
```

Calculé via trigger PostgreSQL à chaque validation de commande. Affiché en **points** côté client — jamais en euros.

### Double verrou

Les bonus communautaires ne se débloquent que si :
1. Le score de l'équipe dépasse le seuil du palier
2. Le seuil CA restaurant de la période est atteint (validé manuellement par l'admin)

### Multi-établissement

Le même codebase est déployé plusieurs fois. Chaque établissement dispose de sa propre URL Vercel et de ses propres variables d'environnement. L'isolation est assurée par `restaurant_id` sur toutes les tables.

---

## Lancer en local

```bash
npm install
cp .env.local.example .env.local
# Remplir les variables dans .env.local
npm run dev
```

### Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx

# Établissement
NEXT_PUBLIC_RESTAURANT_ID=molenbeek
NEXT_PUBLIC_RESTAURANT_NAME=Belchicken

# Liens sociaux (micro-récompenses)
NEXT_PUBLIC_GOOGLE_MAPS_URL=
NEXT_PUBLIC_INSTAGRAM_URL=
NEXT_PUBLIC_TIKTOK_URL=
NEXT_PUBLIC_FACEBOOK_URL=

# Programme
NEXT_PUBLIC_PROGRAM_START_DATE=2026-06-01
NEXT_PUBLIC_AUTO_VALIDATE=false
```

### Migrations Supabase

Exécuter dans l'ordre dans le SQL Editor Supabase :

```
docs/m2-database.sql               — schéma initial
docs/m3-micro-rewards-redesign.sql — jetons sociaux + multi-établissement
docs/m4-rewards-redesign.sql       — paliers communautaires
docs/m5-pending-rewards.sql        — récompenses 3 couches (pending_rewards + trigger)
docs/m6-schema-cibles.sql          — schéma cibles ADRs 0001–0009 (manques M2–M5)
docs/m7-referral-links.sql         — liens de parrainage WhatsApp (referral_links + referrals)
```

---

## Roadmap

Voir les [issues ouvertes](https://github.com/ramouchostar/worldcup-loyalty/issues) :

| # | Slice | Priorité |
|---|-------|----------|
| [#10](../../issues/10) | Migrations schéma cibles (ADRs 0001–0009) | Fondation |
| [#11](../../issues/11) | Google OAuth | Immédiat |
| [#12](../../issues/12) | Auto-validation OCR + Bestelnummer | Haute |
| [#13](../../issues/13) | Récompenses 3 couches (refonte trigger) | Haute |
| [#14](../../issues/14) | Dashboard hero card + gamification | Moyenne |
| [#15](../../issues/15) | Liens de parrainage WhatsApp | Moyenne |
| [#16](../../issues/16) | Notifications d'incitation communautaire | Moyenne |
| [#17](../../issues/17) | Interface admin commandes suspectes | Moyenne |
| [#18](../../issues/18) | PWA + polish mobile | Finale |
