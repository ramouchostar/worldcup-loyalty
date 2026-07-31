# Mission — Seed à l'échelle + audit fonctionnel exhaustif (3 rôles)

**Statut** : prompt de mission (à exécuter). **Environnement** : Option B — seed **en prod**, namespacé, avec démontage (phase pré-lancement, aucun utilisateur réel à impacter). **Cible** : ~50 restaurants, 500+ clients, 1000+ commandes.

---

## 0. Objectif & critère de réussite

Peupler la base d'un jeu de données **réaliste et à l'échelle**, puis **exercer chaque surface de l'app** dans les 3 rôles (membre / admin restaurateur / super-admin plateforme) pour prouver deux choses :

1. **C'est entièrement fonctionnel** — aucune route ne crashe, aucun écran n'affiche un état vide alors que la donnée existe, aucun cul-de-sac, chaque action interactive aboutit.
2. **Un humain s'y retrouve** — navigation claire, retours en arrière possibles, états vides compréhensibles, pas de jargon technique, cohérent sur mobile.

**Réussite** = un rapport structuré qui (a) liste tout défaut trouvé classé par sévérité avec reproduction, (b) fournit une **matrice de couverture au niveau fonctionnalité** prouvant que *chaque fonctionnalité* de *chaque rôle* a été **exercée** (pas seulement chaque page visitée), (c) rend un **verdict de navigabilité humaine**, puis (d) la prod est **remise à son état réel** (démontage vérifié). Objectif : **100 % des fonctionnalités exercées** — toute feature non-exerçable faute de donnée est un défaut du **seed** à corriger, pas une feature à sauter.

---

## 1. Garde-fous absolus (Option B)

1. **Namespace strict.**
   - Restaurants de test : id préfixé **`zz-test-`** (ex. `zz-test-tacos-ixelles`). Le préfixe `zz-` les envoie en fin de tri partout.
   - Membres de test : email en **`@seed.boosteats.test`** (domaine dédié, jamais utilisé en vrai).
   - Aucune autre convention implicite : tout ce qui est de test est identifiable par le préfixe resto **ou** le domaine email.
2. **On ne touche JAMAIS l'existant réel.** Interdiction de modifier/supprimer : `kraainem` (resto legacy réel), tout compte hors `@seed.boosteats.test`, la table globale `reference_calendar`, tout resto sans préfixe `zz-test-`. Le seed **ajoute** uniquement.
3. **Démontage chirurgical garanti** (voir §7) — par préfixe resto + domaine email, dans le bon ordre (cascades vérifiées).
4. **Zéro envoi externe réel.** Pendant le test, `RESEND_API_KEY` / `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` **non configurés** (les envois échouent silencieusement — best-effort, non bloquant). Aucun email/WhatsApp ne doit partir vers un vrai numéro/adresse. Les 500 membres ont des emails et téléphones fictifs.
5. **ADR 0007 / 0028 = assertion de test, pas décor.** Toute apparition d'euro / CA / « chiffre d'affaires » sur une **surface membre** est un **défaut critique** à consigner (pas un détail).

---

## 2. Partie A — Le seed

### 2.1 Volumes & distributions (chaque distribution existe pour « allumer » une surface précise)

**Restaurants (~50)**
| Dimension | Distribution | Surface visée |
|---|---|---|
| **Plan** (m48 `restaurant_subscriptions`) | ~35 `gratuit`, ~10 `croissance`, ~5 `pro` | Console super-admin, flip de plan, futur paywall (Phase 2), repères secteur (Pro) |
| **Statut** | ~44 `active`, ~5 `pending`, 1 `disabled` | `/platform` (liste des approbations), onboarding, garde middleware |
| **Secteur** | 3–4 secteurs denses (≥5 restos) + plusieurs à 1–2 restos | `/secteurs` public, seuil plancher N des futurs repères |
| **school_calendar** | mix FR / NL / DE | Forecast (facteur vacances) |
| **cuisine_types** | variés (burger, tacos, pizza, kebab, sushi…) | `/secteurs`, réglages |
| **owner_id** | chaque resto a un propriétaire (membre de test) | Accès admin par owner |
| **Données forecast** | **~10 restos** avec ≥ 4 semaines de `restaurant_sales` quotidiennes ; les autres sans | Forecast « prêt » vs état « pas assez de données » |

Pour chaque resto : `menu_items` (8–20 articles avec `cost_price`), `restaurant_receipt_config`, `reward_tiers` (3 couches solo/community/saver liées au menu), `restaurant_thresholds` (**mix `is_unlocked` true/false** → tester le double verrou), `reward_budget_tracking` (**quelques restos au-dessus du plafond 8 %** → état « bonus en pause »).

**Membres (500+)** — créés via **Auth Admin API** (`createUser`, email confirmé), domaine `@seed.boosteats.test`, téléphones fictifs.
- 1–3 `memberships` chacun (membres multi-restos).
- La plupart dans une équipe ; **certains sans équipe** (état vide « Créer une équipe »).
- Consentements variés (opt-in/opt-out marketing & insights), 1–3 `zones`.
- **1 mineur (<13)** avec `parental_email` → tester le contrôle d'âge à l'inscription.

**Comptes « focus » à identifiants connus** (mot de passe défini, pour login manuel dans chaque rôle) :
- `super@seed.boosteats.test` → `is_super_admin = true` (console `/platform`, flip de plan, accès cross-resto).
- `owner-a@seed.boosteats.test`, `owner-b@seed.boosteats.test`, `owner-c@seed.boosteats.test` → owners de 3 restos « focus » **volontairement bien garnis** (commandes, cadeaux, feedback, ventes 4 semaines, plans différents : un gratuit, un croissance, un pro).
- `member-a@seed.boosteats.test` → membre riche (historique de commandes, un cadeau `available`, un `banked`, dans une équipe active) pour l'audit membre en profondeur.
- `delete-me@seed.boosteats.test` → compte **jetable** dédié au test de suppression de compte RGPD (pour ne pas détruire `member-a`).

**Équipes** — par resto, 2–8 équipes de **types variés** (`ecole`/`entreprise`/`rue_quartier`/`taxis`/`autre`), avec `join_code`. Certaines pleines, certaines vides.

**Commandes (1000+)**
- Réparties sur restos/membres/équipes. Montants **couvrant la courbe de points** (de 8 € à ~199 €, plus quelques > 200 € pour déclencher le flag `high_amount`). Dates étalées sur **plusieurs semaines** (répartition par jour de semaine → nourrit dashboard, ventes, forecast).
- **Mix de statuts** : majorité `validated` (déclenche le trigger `on_order_validated` → score courbé), un lot `pending` **couvrant chaque `flag_reason`** (`no_order_key`, `high_amount`, `too_many_today`, `no_receipt`, `ocr_failed`, `low_confidence`, `amount_mismatch`, `no_restaurant_header`), quelques `rejected` avec raison.
- `duplicate_key` unique au format `restaurant_id:clé` (clé synthétique si pas de numéro fiable).
- Certaines avec `receipt_url` (image factice dans le bucket `receipts`), d'autres sans.
- **`order_items`** : ~60 % des commandes validées portent des **lignes d'articles** (liées à `menu_items`) — **indispensable**, sinon Ventes par plat, marge et Opportunités/insights (qui ont un seuil minimum d'articles) restent vides et **non testables**.

**Récompenses `pending_rewards`** (⚠️ **création manuelle** — plus de trigger depuis m20 ; répliquer la logique 3 couches de `lib/rewards.ts`)
- Couvrir tous les statuts : **`available`** (flux coupon — **une seule par membre/resto**, contrainte `idx_one_active_reward_per_member`), `redeemed`, `expired`, **`banked`** (réserve).
- Quelques-unes `source='saver'` (`order_id` NULL) pour le flux réserve/échange. `point_transactions` cohérents (solde de réserve).
- Peupler **les 3 couches** (solo + `community_item` + `advancement_item`) pour les membres dont l'équipe franchit des paliers — pas seulement le solo — sinon les couches communautaire/avancement ne sont **jamais visibles** à l'écran.

**Divers pour allumer les dernières surfaces**
- `redemption_tokens` : **quelques-uns actifs (non expirés)** → tester `/coupon/[token]` (membre) et `/admin/coupon/[token]` (caisse) sans devoir en générer un live.
- `quality_feedback` + `feedback_messages` : encouragements **et** incidents (avec dimensions), certains avec réponse admin, d'autres non résolus → baromètre + fil de réponse.
- `referral_links` + `referrals` : quelques liens avec conversions → parrainages (admin + invite membre).
- `micro_reward_definitions` + `micro_reward_claims` : quelques-uns (dont des `pending`) → micro-récompenses membre + validation admin.

### 2.2 Contrat de complétude fonctionnelle (chaque feature a la donnée pour tourner)

**Règle dure** : *aucune fonctionnalité ne doit rester non-testable faute de données.* Si une précondition manque au moment d'exécuter une feature, on **étend le seed** — on ne saute **jamais** la fonctionnalité. Le seed doit produire au minimum, pour **chaque** feature de **chaque** rôle, la donnée qui la débloque :

**Membre**
| Fonctionnalité | Donnée requise | Garantie du seed |
|---|---|---|
| Dashboard hero 3 couches | ≥1 commande validée + pending_reward + équipe + seuil | `member-a` complet |
| Soumettre une commande | — (formulaire) | toujours |
| Mes cadeaux (4 états) | pending_rewards `available`/`redeemed`/`expired`/`banked` | seedés pour `member-a` |
| Récupérer → coupon | 1 pending_reward `available` | `member-a` en a 1 |
| Écran coupon `/coupon/[token]` | 1 `redemption_token` non expiré | tokens actifs seedés |
| Mettre de côté (réserve) | 1 `available` avec `order_id` non NULL | `member-a` |
| Échanger des points | solde réserve ≥ seuil saver + `reward_tier` saver | point_transactions + tier saver seedés |
| Mon équipe + paliers | équipe avec score franchissant des paliers + `team_tiers` | équipes garnies + tiers |
| Récompenses (3 couches + double verrou) | resto au seuil **verrouillé** ET resto **déverrouillé** | seuils mixtes |
| Micro-récompenses | `micro_reward_definitions` actives (+1 claim) | seedées |
| Feedback (encouragement/incident) | ≥1 commande validée (éligibilité) | `member-a` éligible |
| Parrainage | `referral_link` + `referrals` (conversions) | seedés pour `member-a` |
| Leaderboard | ≥1 équipe avec commandes validées | garanti |
| Compte : consentements | profil avec consentements | variés |
| Export RGPD | membre avec données | `member-a` |
| Suppression de compte | compte **jetable** | `delete-me` |
| Contrôle d'âge (<13) | membre <13 + `parental_email` | 1 mineur seedé |
| Multi-resto | membre à 2–3 memberships | `member-a` |

**Admin (restaurateur)**
| Fonctionnalité | Donnée requise | Garantie du seed |
|---|---|---|
| Dashboard KPIs | commandes pending+validées, claims, membres, seuils, budget | restos owner garnis |
| Commandes : valider/rejeter/lot | commandes `pending` | présentes |
| Commandes : **chaque** flag | pending couvrant **chaque `flag_reason`** | lot dédié |
| Cadeaux à distribuer | pending_rewards `available` | présents |
| Opportunités/insights | commandes + **order_items** + menu (seuil min d'articles) | order_items seedés |
| Broadcast immédiat/programmé/ciblé | équipes de **types variés** + membres | garanti |
| Menu & coûts | `menu_items` | seedés |
| Ventes par plat | commandes validées **+ order_items** + `cost_price` | garanti |
| Prévisions (forecast) | ≥4 semaines de `restaurant_sales` | restos owner dans le sous-ensemble « 4 sem. » |
| Micro-récompenses (admin) | définitions + claims `pending` | seedés |
| Parrainages | `referral_links` + `referrals` | seedés |
| Paliers d'équipe | `team_tiers` | seedés |
| Seuils CA / double verrou | `restaurant_thresholds` (verrouillé + déverrouillé) + baseline | mixtes |
| Baromètre + réponse | `quality_feedback` (incidents) + `feedback_messages` | seedés |
| « Bonus en pause » | `reward_budget_tracking` au-dessus du plafond 8 % | quelques restos au-dessus |
| Coupon caisse `/admin/coupon/[token]` | token actif dans un resto owner | seedé |
| QR / Réglages / branding | resto + branding | seedés |

**Super-admin**
| Fonctionnalité | Donnée requise | Garantie du seed |
|---|---|---|
| Console `/platform` | restos (pending+active) + owners + compteurs | seedés |
| Flip de plan | restos sur **chaque** plan | gratuit/croissance/pro |
| Accès cross-resto | n'importe quel `/admin/[id]` | garanti |
| Owner ≠ flip (403) | owner de test + resto | `owner-a` |

Si, à l'exécution, une feature reste bloquée par une donnée manquante non listée ici → **compléter le seed puis re-tester**, et documenter l'ajout.

### 2.3 Méthode de seed

- **Étendre `scripts/tmp-loadtest-seed.mjs`** (fait déjà restos/users/teams/memberships/orders/community_scores/budget) plutôt que repartir de zéro. Ajouter : plans m48, `menu_items`, `receipt_config`, `reward_tiers`, seuils (verrouillés/déverrouillés), `pending_rewards` (3 couches, manuel, contrainte respectée), tokens, feedback, referrals, micro-rewards, `restaurant_sales` (4 sem. pour le sous-ensemble), events, et les **comptes focus à mot de passe connu**.
- **Client service-role** (`SUPABASE_SERVICE_ROLE_KEY`). Vérifier que `supabase-js` fonctionne sur Node 22 (le script existant l'utilise, sans realtime) ; sinon, repli `fetch` PostgREST.
- **Ordre d'insertion (16 étapes, cf. inventaire modèle)** : restaurants → receipt_config → menu_items → **auth.users (API Admin)** → [profiles auto] → teams → memberships → community_scores → thresholds → reward_tiers → budget → **orders (validated → trigger)** → **pending_rewards (manuel)** → tokens → point_transactions → [referrals, feedback, micro].
- **Invariants à ne pas violer** : `amount ∈ ]0,500]` ; `duplicate_key` unique ; **une seule `pending_rewards` `available` par (user, resto)** ; profils **jamais** insérés à la main (trigger `handle_new_user`) ; ne compter sur aucune formule pour `score` (régulier depuis m47, = somme de `points_for_order`).
- **Reproductible** : PRNG seedé (déjà le cas), ré-exécutable, et un **script de démontage jumeau** (§7).

### 2.4 Vérification du seed (avant de tester l'app)
Script de contrôle service-role : compte par table, distribution des plans/statuts/flags, confirmation qu'aucune contrainte n'a sauté, et **échantillon lisible** (1 resto focus : ses commandes, cadeaux, équipes, ventes). Objectif : garantir que les écrans auront de quoi s'allumer avant de lancer le test UI.

---

## 3. Partie B — Le test exhaustif

### 3.1 Méthode
- **App sous test** : `next dev` **en local**, pointé sur la **Supabase de prod** (via `.env.local` existant) — même code que la prod (on vient de déployer), même base (désormais seedée). Plus simple à instrumenter (console, réseau) que l'URL Vercel, comportement identique.
- **Pilotage** : outils **preview MCP** (`preview_start`, `preview_snapshot`, `preview_click`, `preview_fill`, `preview_screenshot`, `preview_console_logs`, `preview_network`, `preview_resize`).
- **Connexions par rôle** : se logger successivement avec les **comptes focus** (`member-a`, `owner-a/b/c`, `super`). Vérifier au passage le **middleware** (redirections, gating).
- **Env de test** : `RESEND_API_KEY` / `WHATSAPP_*` **non configurés** ; `AUTO_VALIDATE` selon le cas testé (false pour exercer la validation manuelle admin, true pour l'auto-validation membre).

### 3.2 Ce qu'on vérifie sur **chaque** écran
Pour toute route : (1) **rend sans crash** (console/réseau propres), (2) **données présentes** quand elles existent (pas d'état vide indu), (3) **état vide compréhensible** quand c'est légitime, (4) **conformité ADR 0007/0028** (zéro euro côté membre), (5) **sorties/retours** présents (pas de cul-de-sac), (6) **liens de nav cohérents**, (7) **mobile** (nav 5 onglets, sidebar).

### 3.3 Checklist par rôle (surfaces à visiter)

**PUBLIC / non-auth** — `/`, `/restaurateurs`, `/secteurs` (doit lister les restos de test actifs par secteur), `/privacy`, `/terms`, `/invite`, `/offline`, `/login`, `/signup`, `/register`, `/forgot-password`, `/reset-password`, `/r/[id]/leaderboard` (public), `/coupon/[token]` (token seedé actif), `/join?ref=CODE`.

**MEMBRE** (`member-a`) — `/r/[id]` (rejoindre/membre), `/r/[id]/dashboard` (hero 3 couches + progression + parcours), `/r/[id]/submit-order` (upload ticket + montant → soumission ; délai « Vérification en cours… »), `/r/[id]/my-rewards` (available/redeemed/expired/banked ; **Récupérer** → coupon 10 min → `/coupon/[token]`), `/r/[id]/my-team` (roster, invite WhatsApp, paliers), `/r/[id]/rewards` (3 couches + double verrou), `/r/[id]/micro-rewards`, `/r/[id]/feedback` (encouragement/incident), `/r/[id]/reserve`, `/compte` (consentements, export RGPD, suppression). **Flux** : soumettre une commande, récupérer un cadeau (coupon), mettre de côté (réserve), échanger des points, générer un lien de parrainage, déposer un feedback, créer/rejoindre une équipe, exporter ses données.

**ADMIN** (`owner-a/b/c`) — sidebar 15 liens : `/admin/[id]` (dashboard KPIs), `orders` (valider/rejeter/lot ; **tester chaque flag**), `pending-rewards`, `insights`, `broadcast` (**immédiat vs programmé** + promo J-1/J-2), `menu` (upload CSV + coûts), `sales`, `forecast` (import ventes + événement local ; resto avec 4 sem. → prévision, resto sans → « pas assez de données »), `micro-rewards`, `referrals`, `team-tiers`, `thresholds` (baseline + croissance + verrou), `quality` (baromètre + réponse), `qr` (+ `qr/print`), `settings` (infos + branding logo/couleurs), `sandbox` (URL-only). Plus `/admin/coupon/[token]` (vue caisse). **Flux** : valider une commande pending → vérifier que le cadeau/score/budget bougent ; configurer un palier (test du plafond de coût qui rejette) ; programmer un broadcast ; importer un CSV de ventes ; répondre à un incident.

**SUPER-ADMIN** (`super`) — `/platform` (tous les restos, pending/active, owners, compteurs ; `CreateRestaurantForm`, `AssignOwnerForm`) ; flip de plan via `/api/admin/subscription` (gratuit↔croissance↔pro) puis relecture ; **accès à n'importe quel `/admin/[id]`** (bypass ownership). Vérifier qu'un **owner ne peut PAS** flipper son propre plan (403).

**FLUX TRANSITOIRES** — coupon membre (`/coupon/[token]`), coupon caisse (`/admin/coupon/[token]`, timer 10 min, « Cadeau remis » idempotent), capture parrainage (`/join?ref=` → cookie → signup → crédit), onboarding partenaire (`/become-a-partner/[id]/menu`).

### 3.4 Assertions transverses (à traquer partout)
- **Zéro euro côté membre** (ADR 0007/0028) — score/équipe en **points** uniquement ; dépense perso en points ; jamais « CA »/« objectif »/« chiffre d'affaires ». (Euros **autorisés** côté admin/caisse.)
- **Pas de cul-de-sac** — chaque écran a un retour/sortie (le bug historique « Réglages sans sortie » ne doit pas réapparaître).
- **États vides cohérents** — message + CTA, jamais une page blanche ou un spinner infini.
- **Pas de jargon** technique exposé au membre ; wording neutre sur les verrous (« Bonus en pause », jamais la vraie raison budgétaire).
- **Mobile** — nav 5 onglets, sidebar repliable, pas de débordement horizontal.

### 3.5 Gaps connus (à NE PAS reporter comme bugs — les noter « gap connu »)
« Quitter une équipe » (pas d'endpoint), workflow de consentement parental (statut posé, acceptation non codée), validation de preuve des micro-récompenses, filtre temporel du leaderboard, activation resto `pending→active` (manuelle). Les rencontrer ≠ crash.

---

## 4. Dépendances externes (comportement attendu en test)
| Service | En test | Attendu |
|---|---|---|
| Anthropic OCR (`analyzeReceipt`) | clé selon dispo | best-effort ; si absente → flags OCR (`ocr_failed`/`low_confidence`), commande en `pending` |
| Resend (email bienvenue) | **non configuré** | skip silencieux, aucun envoi |
| WhatsApp (push/broadcast) | **non configuré** | skip silencieux, aucun envoi |
| Web-push | pas d'abonnement en test | échoue proprement, non bloquant |
| Cron (`/api/cron/*`) | déclenché par Vercel | vérifier logique via appel manuel gardé par `CRON_SECRET` si besoin |

---

## 5. Format du rapport
1. **Résumé exécutif** — verdict global + nb de défauts par sévérité + verdict **navigabilité humaine**.
2. **Défauts classés** — `Critique` / `Élevé` / `Moyen` / `Mineur` / `UX` / `🚨 ADR 0007`. Chacun : titre, rôle, écran/route, repro pas-à-pas, résultat vs attendu, `fichier:ligne` probable.
3. **Matrice de couverture (niveau fonctionnalité)** — tableau *fonctionnalité × rôle* (pas seulement route × rôle) avec statut (✅ exercée OK / 🔴 cassée / 🟠 confuse / ⚠️ vide indu / ⛔ non-exerçable faute de donnée / — non applicable). **Toute case ⛔ est un défaut du SEED à corriger** (étendre la donnée puis re-tester), jamais une fonctionnalité à sauter. Prouve qu'aucune fonctionnalité n'a été omise.
4. **Verdict navigabilité** — un humain non-technique peut-il s'inscrire, comprendre son dashboard, récupérer un cadeau, et (côté resto) valider une commande, sans aide ? Points de friction listés.
5. **Preuves** — screenshots des écrans clés + états limites.

---

## 6. Démontage (retour à l'état réel)
Script jumeau (étendre `scripts/tmp-loadtest-clean.mjs`), **ordre impératif** :
```
1. DELETE orders        WHERE restaurant_id LIKE 'zz-test-%'   -- cascade order_items, pending_rewards, tokens…
2. DELETE memberships   WHERE restaurant_id LIKE 'zz-test-%'
3. DELETE teams         WHERE restaurant_id LIKE 'zz-test-%'   -- ⚠️ PAS de cascade depuis restaurants
4. DELETE restaurants   WHERE id LIKE 'zz-test-%'              -- cascade thresholds, budget, config, sales, events, feedback, subscriptions, community_scores
5. DELETE auth.users    WHERE email LIKE '%@seed.boosteats.test'  -- cascade profiles + tout le reste par user_id
```
Puis **vérification** : comptes par table filtrés sur le namespace = 0 ; `kraainem` et les comptes réels intacts ; `/secteurs` ne montre plus les restos fictifs. Ne lancer le démontage qu'**après** rapport rendu et validation.

---

## 7. Livrables
1. `scripts/seed-audit.mjs` (seed) + `scripts/seed-audit-clean.mjs` (démontage) — namespacés, ré-exécutables.
2. Sortie de vérification du seed (comptes + distributions).
3. **Rapport d'audit** (format §5) avec matrice de couverture et verdict de navigabilité.
4. Confirmation du démontage (prod = état réel).

---

## 8. Séquence d'exécution
`Seed → vérif seed → test membre → test admin → test super-admin → flux transitoires → rapport → (validation) → démontage → vérif démontage.`
