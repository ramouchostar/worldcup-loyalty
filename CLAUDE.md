# CLAUDE.md — WorldCup Loyalty Belchicken

## RÈGLE ABSOLUE — LIS CES FICHIERS AVANT DE TOUCHER AU CODE

Avant d'écrire ou modifier la moindre ligne, tu dois lire dans cet ordre :

1. `CONTEXT.md` — glossaire complet du domaine, terminologie exacte, règles UI
2. `docs/adr/0001` à `docs/adr/0010` — toutes les décisions architecturales

Ces fichiers **ont priorité sur tout le reste**, y compris `WorldCupLoyalty_Prompt_ClaudeCode.md` qui est le document source initial mais qui a été affiné par les ADRs.

---

## Règles critiques à ne jamais violer

### ADR 0007 — Le client ne voit jamais d'euros ni de seuil CA
- Score communautaire → toujours en **points** (jamais `€`, jamais `CA`, jamais `chiffre d'affaires`)
- "CA total", "objectif restaurant", "chiffre d'affaires" → **jamais visibles côté client**
- Dépenses personnelles du membre (`€200 dépensés`) → euros autorisés uniquement dans "Mes stats"
- Double verrou → invisible côté client, message neutre si palier verrouillé

### ADR 0006 — Système de récompenses en 3 couches
- Chaque commande validée génère une entrée dans `pending_rewards` avec 3 items séparés
- Couche 1 (palier solo) : toujours présente, non soumise au double verrou
- Couche 2 (bonus communautaire) : soumise au double verrou
- Couche 3 (récompense d'avancement) : non soumise au double verrou

### ADR 0008 — Validation automatique des tickets
- `duplicate_key` = **Bestelnummer** (`order_number`, format `YYYY-MM-DD/NNN/NNNNN`)
- L'ancien `DATE_HH:MM_MONTANT` est obsolète — ne jamais l'utiliser
- Délai artificiel 3–5s côté client avec message "Vérification en cours..."
- Jamais les mots "automatique" ou "instantané" côté client

### ADR 0010 — Dashboard : conséquences, pas chiffres
- Section 1 (hero) : aperçu prochaine commande avec 3 lignes étiquetées par couche
- Section 2 : progress bar communauté + conséquence concrète du prochain palier
- Section 3 : chemin World Cup avec position actuelle
- Fallback si aucun historique : prévisualiser pour €25

### Parrainage — lien WhatsApp, pas email
- Système d'invitation par **lien unique** (`/join?ref=CODE`) partagé via `wa.me/?text=...`
- Jeton crédité uniquement à l'**inscription** de l'ami, pas à la soumission de l'email
- Tables : `referral_links` + `referrals` (voir CONTEXT.md)
- L'ancien système "soumettre un email d'ami" est **obsolète**

---

## Stack technique

```
Framework   : Next.js 14 (App Router)
Database    : Supabase (PostgreSQL)
Auth        : Supabase Auth (magic link + Google OAuth)
Styles      : Tailwind CSS
Language    : TypeScript strict
State       : React Context + SWR (refresh 30s)
Deployment  : Vercel (ramouchostar/worldcup-loyalty)
```

## Variables d'environnement requises

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_RESTAURANT_NAME=        # ex. "Belchicken Houba"
NEXT_PUBLIC_RESTAURANT_ID=          # ex. "houba"
NEXT_PUBLIC_PROGRAM_START_DATE=2026-06-11
NEXT_PUBLIC_GOOGLE_MAPS_URL=
NEXT_PUBLIC_INSTAGRAM_URL=
NEXT_PUBLIC_TIKTOK_URL=
NEXT_PUBLIC_FACEBOOK_URL=
WHATSAPP_PHONE_NUMBER_ID=           # pour notifications proactives
WHATSAPP_TOKEN=                     # API Meta directe (pas Twilio)
AUTO_VALIDATE=false                 # true en dev uniquement
ADMIN_EMAILS=                       # emails bootstrappés comme admin
```

### ADR 0011 — Coupon de récupération anti-fraude
- **Un seul cadeau actif** par membre à la fois — Option B : si une récompense est `available`, aucune nouvelle n'est créée jusqu'à ce qu'elle soit `redeemed` ou `expired`
- **48h** pour récupérer avant expiration automatique
- **Coupon 10 minutes** avec timer actif (countdown + horloge live mise à jour chaque seconde) — anti-capture d'écran
- **€10 minimum** sur la commande de récupération — règle opérationnelle cashier, non technique
- **Cashier valide** depuis `/admin/coupon/[token]` → bouton "Cadeau remis" → idempotent
- Table `redemption_tokens` : `token TEXT UNIQUE`, `expires_at = NOW() + 10 min`, `redeemed_at`
- Index `UNIQUE` sur `pending_rewards (user_id, restaurant_id) WHERE status = 'available'`

## Issues GitHub actives

Repo : `ramouchostar/worldcup-loyalty`

| # | Titre | Priorité |
|---|---|---|
| #1 | Migrations schéma (ADRs 0001–0009) | 🔴 Fondation |
| #2 | Google OAuth | 🔴 |
| #3 | Auto-validation OCR + Bestelnummer | 🔴 |
| #4 | Récompenses 3 couches (pending_rewards) | 🔴 |
| #5 | Dashboard hero card + gamification | 🔴 |
| #6 | Parrainage WhatsApp (lien unique) | 🟡 |
| #7 | Notifications d'incitation | 🟡 |
| #8 | Interface admin commandes suspectes | 🟡 |
| #9 | PWA + polish mobile | 🟢 |

## Violations actuelles à corriger en priorité

Avant d'implémenter de nouvelles features, corriger ces violations ADR 0007 visibles dans l'app :

1. **Dashboard** : supprimer "CA total : 0 €" — ne jamais afficher le CA au client
2. **Dashboard** : remplacer "Bonus communautaire en attente de l'objectif CA" par un message neutre sans mentionner le CA
3. **Leaderboard** : supprimer "Score = Membres × CA total (€)" — reformuler sans euros ni CA
4. **/rewards** : supprimer la carte "Objectif restaurant" — invisible côté client
5. **/rewards** : réécrire le texte double verrou sans mentionner "chiffre d'affaires"
6. **Micro-rewards** : remplacer le système parrainage par email par le système lien WhatsApp

## Workflow

1. Lire CONTEXT.md + tous les ADRs
2. Corriger les violations ADR visibles dans le code existant
3. Implémenter les issues dans l'ordre de dépendance (#1 → #2/#3/#4 → #5/#6 → #7/#8 → #9)
4. Vérifier chaque acceptance criteria avant de passer à l'issue suivante
