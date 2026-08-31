# CLAUDE.md — WorldCup Loyalty Belchicken

## RÈGLE ABSOLUE — LIS CES FICHIERS AVANT DE TOUCHER AU CODE

Avant d'écrire ou modifier la moindre ligne, tu dois lire dans cet ordre :

1. `CONTEXT.md` — glossaire complet du domaine, terminologie exacte, règles UI
2. **Tous** les fichiers de `docs/adr/` (le dernier numéro change chaque semaine — ne te fie pas à une borne écrite ici) — toutes les décisions architecturales

Ces fichiers **ont priorité sur tout le reste**, y compris `WorldCupLoyalty_Prompt_ClaudeCode.md` qui est le document source initial mais qui a été affiné par les ADRs.

---

## Collaboration — deux associés, plusieurs agents, un seul `master`

Ces règles s'appliquent aux humains **et** à chaque session Claude (locale, Remote Control, cloud). Elles existent parce qu'on a constaté 8 collisions de numéros de migration, des ADR renumérotés deux fois, des rebases cassés par deux sessions dans le même checkout et des builds rouges faute de `npm install`.

1. **Jamais de push direct sur `master`.** Une branche par chantier (`claude/<sujet>` pour un agent, `<prénom>/<sujet>` pour un humain), une PR, fusion via GitHub (`gh pr create` → `gh pr merge --merge --delete-branch`). `master` est protégé : PR + check CI `build` vert obligatoires. Petites PR, fusionnées vite.
2. **Une session Claude = un worktree** (`claude -w` ou case « worktree » de l'app Desktop). Jamais deux sessions dans le même dossier : l'autre bouge `master` sous tes pieds en plein rebase.
3. **Avant d'agir : `git fetch origin` puis `git pull --ff-only`, puis `npm install`** (une dépendance ajoutée par l'autre casse le build sinon).
4. **Numéros d'ADR** : prends le suivant de **`origin/master`** (pas du local), et ouvre la PR tout de suite avec le fichier pour réserver le numéro. `scripts/check-naming.mjs` (CI) refuse les doublons.
5. **Migrations SQL** : la numérotation `docs/mNN-*.sql` est **figée à m60**. Toute nouvelle migration va dans **`docs/migrations/YYYYMMDD-HHMM-slug.sql`** (horodatée, idempotente — voir `docs/migrations/README.md`). L'auteur de la PR l'applique en prod dès la fusion et le note dans la PR ; le code reste tolérant à son absence (fail-open).
6. **Un chantier = une PR**, pas de mélange de sujets. Réclame le chantier dans le backlog plateforme (ADR 0033) avant de commencer — on évite de toucher le même fichier le même jour.
7. Après un pull ou une fusion : `npm run check:naming && npm run type-check` avant de pousser.

**Outillage partagé (dans le repo, identique chez tout le monde)** : skills `/ship` (branche → PR → CI → merge), `/new-migration <slug>`, `/new-adr <slug>` ; hooks `.claude/hooks/guard-git.mjs` (bloque push master / force / destructif) et `session-start.mjs` (fetch + rappels) ; règles scopées `.claude/rules/{migrations,adr}.md`.

---

## Règles critiques à ne jamais violer

### ADR 0007 — Le client ne voit jamais d'euros ni de seuil CA
- Score communautaire → toujours en **points** (jamais `€`, jamais `CA`, jamais `chiffre d'affaires`)
- "CA total", "objectif restaurant", "chiffre d'affaires" → **jamais visibles côté client**
- Dépenses personnelles du membre → **en points aussi** (plus AUCUN euro côté client, même perso) — **amendé par ADR 0028**. Seule exception : la saisie du montant du ticket à la soumission (ingestion, pas affichage)
- Score d'équipe = **somme de points courbés** (non-linéaires), plus `membres × euros` (ADR 0028) → `score ÷ membres` ne redonne pas d'euros ; points **non-convertibles** en euros
- Double verrou → invisible côté client, message neutre si palier verrouillé

### ADR 0006 — Système de récompenses en 3 couches
- Chaque commande validée génère une entrée dans `pending_rewards` avec 3 items séparés
- Couche 1 (palier solo) : toujours présente, non soumise au double verrou
- Couche 2 (bonus communautaire) : soumise au double verrou
- Couche 3 (récompense d'avancement) : non soumise au double verrou

### ADR 0008 + 0019 — Validation automatique des tickets
- `duplicate_key` = **`restaurant_id:clé de commande`** — la clé est définie par `restaurant_receipt_config` (découverte à l'onboarding, ADR 0019), fallback Bestelnummer legacy si aucune config
- Le Bestelnummer `YYYY-MM-DD/NNN/NNNNN` n'est plus codé en dur — ne jamais le réintroduire dans le prompt OCR ou la validation
- Délai artificiel 3–5s côté client avec message "Vérification en cours..."
- Jamais les mots "automatique" ou "instantané" côté client

### ADR 0021 — Réserve de points personnelle
- « Mettre de côté » (onglet récompenses) : cadeau `available` → `banked`, crédit `floor(montant commande)` points dans le ledger `point_transactions` (jamais de colonne solde)
- Le score communautaire n'est **jamais** affecté par ce choix (crédité à la validation du ticket)
- Gros cadeaux : `reward_tiers` layer `saver`, seuils en points, plafond ADR 0017 (`cost_price ≤ seuil × 8%`)
- Échange via RPC transactionnel → `pending_rewards` standard (cycle coupon inchangé) ; un cadeau `saver` n'est pas re-bankable
- Budget ADR 0012 : coût re-crédité au bank, débité à l'échange
- UI : « Ma réserve » — jamais « points » seuls (réservés au score communautaire), jamais de coûts sur `/api/saver-tiers`

### ADR 0034 — Un ticket ne dépend jamais d'une équipe
- `orders.team_id` est **nullable** (m57) : un membre sans équipe envoie ses tickets comme les autres, seule l'adhésion à l'établissement est exigée
- Sans équipe → **couche 1 (palier solo) seule** ; couches 2 et 3 = cadeaux d'équipe, servies dès qu'il en rejoint une
- L'équipe d'une commande est résolue **à la validation**, jamais à la soumission ; à la première adhésion, les commandes déjà validées du membre sont reprises dans le score de l'équipe
- Ne jamais réintroduire de préalable social à la soumission : une config absente côté restaurateur ne doit pas couper le parcours client

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
ADMIN_EMAILS=                       # emails bootstrappés comme admin établissement (is_admin)
SUPER_ADMIN_EMAILS=                 # emails bootstrappés comme super-admin plateforme (is_super_admin, ADR 0015 §7)
RESEND_API_KEY=                     # emailing (lib/email.ts) — non configuré = envoi désactivé silencieusement
EMAIL_FROM=                         # ex. "Boosteats <onboarding@resend.dev>"
NEXT_PUBLIC_APP_URL=                # liens absolus (emails, QR codes) — ex. https://worldcup-loyalty.vercel.app
ANTHROPIC_API_KEY=                  # vision : OCR ticket, découverte clé ticket, suggestions menu, détection de design (m48)
NEXT_PUBLIC_GA_MEASUREMENT_ID=      # GA4 (format G-XXXXXXXXXX) — vide = aucun script Google, aucune bannière cookies, CSP fermée
GITHUB_TOKEN=                       # PAT lecture seule — commits master pour le récap fondateurs (lib/github-activity.ts), non configuré = section commits vide
FOUNDER_DIGEST_EMAILS=              # destinataires du récap fondateurs, séparés par des virgules — même motif que ADMIN_EMAILS
```

### Mesure d'audience — voir `docs/tracking-plan.md`
- Tout passe par `track()` (`lib/analytics.ts`) — jamais d'appel `gtag()` direct
- **Aucun euro dans un événement client** (ADR 0007/0028) : les montants partent en tranches (`amount_band`), jamais en `value`
- **Aucun identifiant de membre envoyé à Google** (ADR 0025) : pas de `user_id`, seulement `member_status`
- Consent Mode v2, tout refusé par défaut ; les signaux publicitaires restent refusés en dur

### ADR 0033 — Console plateforme : comptes démo, chiffres, backlog
- `restaurants.is_demo` — établissement **fictif de démonstration**, pas un « mode démo » : même table, même code, aucune branche conditionnelle. Seule sa visibilité change.
- Exclu de l'accueil, `/secteurs`, `/join` et des chiffres réseau ; son URL directe `/r/[id]` reste accessible
- **Toute surface publique qui liste ou compte des établissements passe par `listLiveRestaurants()` (`lib/demo.ts`)** — `status = 'active' AND is_demo = false`. L'oublier est une régression au même titre qu'exposer `target_revenue` côté client
- Depuis m56 : tous les établissements sauf `kraainem` sont des comptes démo
- `restaurants.activated_at` ≠ `created_at` — maille de la courbe d'activation, première activation uniquement
- `/platform` est un espace à quatre onglets (Réseau · Chiffres · Backlog · Membres), navigation portée par `app/platform/layout.tsx` ; chaque page garde son propre contrôle `is_super_admin`
- Le CA réseau ne figure QUE sur `/platform/stats` — jamais côté membre (ADR 0007), jamais chez un restaurateur pour un autre établissement (ADR 0015 §7)
- Backlog (`platform_backlog`) : priorité **calculée** (`impact ÷ effort`), jamais saisie

### ADR 0011 — Coupon de récupération anti-fraude
- **Un seul cadeau actif** par membre à la fois — Option B : si une récompense est `available`, aucune nouvelle n'est créée jusqu'à ce qu'elle soit `redeemed` ou `expired`
- **48h** pour récupérer avant expiration automatique
- **Coupon 10 minutes** avec timer actif (countdown + horloge live mise à jour chaque seconde) — anti-capture d'écran
- **€10 minimum** sur la commande de récupération — règle opérationnelle cashier, non technique
- **Cashier valide** depuis `/admin/coupon/[token]` → bouton "Cadeau remis" → idempotent
- Table `redemption_tokens` : `token TEXT UNIQUE`, `expires_at = NOW() + 10 min`, `redeemed_at`
- Index `UNIQUE` sur `pending_rewards (user_id, restaurant_id) WHERE status = 'available'`

### ADR 0017 — Dimensionnement des récompenses par les coûts de revient
- Principe : coût réel d'un cadeau ≤ `REWARD_BUDGET_PCT` (8 %) × dépenses qui l'ont déclenché — calculs dans `lib/reward-sizing.ts`
- **Palier solo** : `cost_price ≤ seuil × pct`, rejet dur au `PUT /api/admin/reward-tiers` ; paliers suggérés par établissement (panier moyen, `suggestSoloBands`)
- **Cadeau 4 jetons** : article du catalogue (`restaurants.jetons_gift_menu_item_id`, m28), plafond `panier moyen × pct`, seul le **nom** sort côté membre
- **Couverture communautaire** (3e verrou, couches 2 et 3) : `membres × coût ≤ dépense cumulée équipe × pct`, cascade vers le palier couvert — invisible côté client (ADR 0007)

### ADR 0012 — Protection financière (CRITIQUE pour la rentabilité)
- **Plafond budget cadeaux** : coût mensuel des récompenses ≤ `CA_programme_mois × 8%` (`REWARD_BUDGET_PCT`)
- Plafond atteint → couche 1 (solo) reste, couches 2 et 3 désactivées jusqu'au mois suivant
- **Double verrou basé sur la croissance** : le seuil CA n'est PAS un montant fixe mais `baseline_4_semaines × (1 + 10%)` (`GROWTH_TARGET_PCT`)
- Le restaurant ne débloque les bonus que s'il vend PLUS qu'avant le programme
- Table `reward_budget_tracking` + colonnes `baseline_weekly_revenue`, `growth_target_pct` sur `restaurant_thresholds`
- `resolveCommunityBonus()` doit vérifier `community_bonus_active` avant d'attribuer ; les grilles héritées Belchicken ne s'appliquent qu'au resto legacy (`LEGACY_RESTAURANT_ID`)
- Côté client : "Bonus communautaire en pause" si plafond atteint — jamais la vraie raison (ADR 0007)

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

## Conformité ADR 0007

**Audité conforme le 2026-06-19.** Toutes les violations historiques (CA total au dashboard, message double verrou mentionnant le CA, "Score = Membres × CA" au leaderboard, carte "Objectif restaurant" sur /rewards, parrainage par email) sont corrigées. Les surfaces client n'affichent que des points pour le score communautaire et des euros uniquement pour les dépenses personnelles du membre. Vérifier cette conformité à chaque nouvelle surface client (toute API publique renvoyant `target_revenue`/`current_revenue`/`is_unlocked` est une régression).

## Workflow

1. Lire CONTEXT.md + tous les ADRs
2. Corriger les violations ADR visibles dans le code existant
3. Implémenter les issues dans l'ordre de dépendance (#1 → #2/#3/#4 → #5/#6 → #7/#8 → #9)
4. Vérifier chaque acceptance criteria avant de passer à l'issue suivante
