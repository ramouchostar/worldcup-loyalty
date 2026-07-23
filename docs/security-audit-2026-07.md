# Audit de sécurité — worldcup-loyalty (Boosteats) — 2026-07

**Méthode** : recherche des menaces récentes (2025-2026) ciblant la stack Next.js 14 + Supabase, puis audit **multi-agents** en 6 dimensions (IDOR routes membres, autorisation admin/actions, RLS table par table, injection/SSRF/XSS, exposition secrets & ADR 0007, auth/session/abus), **chaque finding vérifié de façon adversariale** avant d'être retenu. Phase 1 = correctifs critiques déjà appliqués. Phase 2 = ce rapport.

**Résultat phase 2** : 9 findings bruts → **8 problèmes distincts confirmés, 0 faux positif** — **4 HIGH · 3 MEDIUM · 1 LOW**.

**Posture globale : solide.** L'autorisation applicative est disciplinée (checks user + owner quasi partout), la **RLS est activée sur toutes les tables vivantes** (aucune table personnelle/financière ouverte), la surface XSS est faible, la clé service-role reste serveur-only. Les défauts trouvés sont des **écarts ponctuels** par rapport aux bons motifs déjà présents dans le code — pas une architecture non sécurisée.

---

## ✅ Déjà corrigé (phase 1, 2026-07)
- **CVE-2025-29927** (contournement du middleware) — Next.js 14.2.5 → **14.2.35**.
- **Défense en profondeur** — le layout `admin/[restaurantId]` re-vérifie `isEstablishmentAdmin` (ne se fie plus au seul middleware).
- **En-têtes de sécurité** — CSP (`'self'` + `*.supabase.co`), X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy, Permissions-Policy (`next.config.mjs`), vérifiés servis.
- **`/api/auth/bootstrap-admin`** GET → POST (anti-CSRF).
- **`npm audit fix`** (non-cassant) : `brace-expansion`, `js-yaml` corrigés.

---

## 🔴 HIGH

### F1 — IDOR cross-établissement : validation/rejet de commandes d'un autre resto
**`app/api/admin/orders/route.ts`** (l.99-105 batch, l.129-134 single).
`requireAdmin(restaurantId)` autorise l'appelant sur le `restaurantId` **qu'il fournit dans le body**, mais l'`UPDATE` filtre `.eq("id", id)` **sans** `.eq("restaurant_id", restaurantId)`. `createAdminClient()` bypasse la RLS → rien ne rattrape.
**Exploit** : l'owner du resto B envoie `{restaurantId:"B", id:"<uuid commande de A>", action:"validate"}`. La commande de A bascule `validated` ; pire, les effets de bord tournent sous B — `incrementProgramRevenue("B", montant)` gonfle le CA/budget de B (fausse l'ADR 0012), `createPendingReward(...,"B")` émet des cadeaux, `sendPush` notifie le membre de A. `action:"reject"` = sabotage ; `batch_validate` = pollution de masse.
**Correctif** : ajouter `.eq("restaurant_id", restaurantId)` aux **deux** UPDATE (single + batch) ; vérifier le nombre de lignes touchées.

### F2 — IDOR cross-établissement : validation/rejet de micro-récompenses d'un autre resto
**`app/api/admin/micro-rewards/route.ts`** (l.48-51). Même schéma exact que F1 : `.eq("id", id)` sans borne `restaurant_id`, alors que `micro_reward_claims.restaurant_id` existe (m11). Un owner pilote l'attribution/refus des jetons sociaux (avis Google, follows) d'un concurrent.
**Correctif** : `.eq("id", id).eq("restaurant_id", restaurantId)` + `.select()` → 404 si aucune ligne (aligner sur `pending-rewards`).

### F3 — Fuite du CA (total_spent) à tout client anonyme via RLS `USING(true)`
**`docs/m2-database.sql`** l.276 — `CREATE POLICY "scores_public_read" ON community_scores FOR SELECT USING (true)`, **jamais révoquée**.
`community_scores.total_spent` = **dépense cumulée réelle (euros)** par équipe et par établissement. La clé `NEXT_PUBLIC_SUPABASE_ANON_KEY` est dans le bundle → **n'importe quel visiteur non authentifié** lit le CA de toutes les équipes de tous les restos via PostgREST direct, **ou** via le canal realtime (`m8-realtime.sql` ajoute la table à la publication ; la trame WebSocket contient la ligne complète). La défense actuelle (`Omit<...,'total_spent'>`, lecture via service-role) est **applicative seulement** → contournée. **Violation directe de l'ADR 0007 au niveau base.** Précédent interne oublié : `restaurant_thresholds` a reçu ce durcissement en m6.
**Correctif** : `REVOKE SELECT ON community_scores FROM anon, authenticated` puis `GRANT SELECT (team_id, restaurant_id, member_count, score, last_updated)` (exclut `total_spent`), **ou** exposer une vue publique sans `total_spent`. Retirer la table de `supabase_realtime` (ou pousser via un canal service-role filtré).

### F4 — Coupon de récupération : double génération (non atomique, non idempotent)
**`app/api/redemption/generate/route.ts`** (l.16-47). SELECT de la récompense `available`, puis `Promise.all` [INSERT token + UPDATE reward→redeemed] **sans transaction ni compare-and-swap** ; l'UPDATE cible `.eq("id", reward.id)` **sans** `.eq("status","available")` ; `redemption_tokens` n'a **aucune contrainte unique sur `reward_id`**.
**Exploit** : deux POST concurrents (double-clic / 2 onglets / script) → **2 coupons de 10 min valides pour 1 seule récompense** → le membre se fait remettre le cadeau **2 fois**. Contourne l'ADR 0011 (« un seul cadeau actif ») et ronge le budget ADR 0012. Perte financière directe.
**Correctif** : rendre l'opération atomique/idempotente en base — soit `CREATE UNIQUE INDEX ON redemption_tokens (reward_id)` (le 2ᵉ INSERT échoue), soit un **RPC transactionnel** `SECURITY DEFINER` qui fait le compare-and-swap `UPDATE ... WHERE id=? AND user_id=? AND status='available' RETURNING id` et n'insère le token que si une ligne a été mise à jour (retourne le token existant sinon).

---

## 🟠 MEDIUM

### F5 — Fuite des coûts de revient (cost_euros / gift_cost_euros) à tout client anon
**`docs/m2-database.sql`** l.279 (`rewards`), l.282 (`micro_rewards`) — policies `USING(true)`. Les colonnes de coût matière (COGS) sont lisibles via PostgREST anon, alors que `/api/rewards` (l.61) et `/api/micro-rewards` les masquent volontairement. Même classe qu'ADR 0007 ; impact moindre (petit catalogue quasi-statique, pas de CA cumulé).
**Correctif** : même patron que F3 — `REVOKE SELECT` + `GRANT SELECT (…colonnes non-coût…)` sur `rewards` (exclut `cost_euros`) et `micro_rewards` (exclut `gift_cost_euros`), ou vues publiques sans coûts. C'est déjà ce qui est fait pour `menu_items.cost_price` (m22, service-role only).

### F6 — Injection de filtre PostgREST via `restaurantId` dans `.or()`
**`app/api/micro-rewards/route.ts`** l.27 — `restaurantId` (query, non validé) interpolé dans `.or(`restaurant_id.eq.${restaurantId},restaurant_id.is.null`)`. `.or()` de postgrest-js n'échappe pas la grammaire de filtre (`, . : ( )`). Seul filtre construit par template-string du dépôt. Client anon + RLS actives → pas de SQLi arbitraire, mais **oracle booléen aveugle** : en injectant `...,and(id.eq.<uuid>,gift_cost_euros.gte.X)` un membre peut lire par dichotomie le coût en euros d'un article (colonne non sélectionnée mais filtrable) — fuite ADR 0007.
**Correctif** : ne jamais interpoler dans `.or()`. Préférer scinder — `.eq("restaurant_id", restaurantId)` + une requête séparée pour les globales `restaurant_id IS NULL` fusionnées en mémoire (valeurs encodées, non injectables). À défaut, valider `restaurantId` contre `^[a-z0-9-]{1,40}$` et rejeter en 400.

### F7 — Flood de création d'équipes (pas d'adhésion requise, pas de limite, pas de FK)
**`app/api/teams/route.ts`** l.27 → `lib/teams.ts` `createTeam`. N'exige qu'une session ; le `restaurantId` (body) n'est **ni validé contre les restos existants** (pas de FK `teams.restaurant_id`) **ni** contraint à une adhésion de l'appelant. Aucun rate-limit.
**Exploit** : un compte quelconque scripte des milliers de `POST /api/teams` → équipes spam/pub actives dans la **liste de découverte** de n'importe quel resto, pollution en masse de `teams`/`community_scores`/`memberships`, données orphelines si `restaurantId` fabriqué. DoS applicatif + contenu abusif cross-tenant, sans coût.
**Correctif** : exiger une **membership existante** de l'appelant pour `restaurantId` + vérifier l'existence du resto avant écriture ; envelopper les INSERT dans une transaction (RPC) ; ajouter la FK `teams.restaurant_id → restaurants(id)` ; plafonner le nombre d'équipes par `created_by`/fenêtre ; modérer `name`.

---

## 🟡 LOW

### F8 — Endpoint OCR (Claude Vision) sans anti-abus
**`app/api/orders/parse-receipt/route.ts`** l.13. N'exige qu'une session ; seuls garde-fous = taille 5 Mo + type MIME. Pas de rate-limit → un compte peut boucler des appels **Claude Vision facturés** (DoS économique). Rétrogradé **LOW** par la vérification : le modèle est Haiku (coût faible), pas de fuite de données, hors chemin anti-fraude.
**Correctif** : rate-limit par `user_id`/IP sur `parse-receipt` (et secondairement `/api/orders`) ; idéalement exiger une membership avant de dépenser un appel Vision.

---

## Bonne posture confirmée (positifs)
- **RLS activée sur toutes les tables vivantes** ; les tables sensibles non-catalogue sont own-read (`auth.uid()`) ou service-role only. Seule `wc2026_matches` n'avait pas de RLS mais elle est `DROP` en m36 (données non sensibles).
- **Autorisation applicative disciplinée** : `pending-rewards`, `rewards`, `thresholds`, `reward-tiers`, `team-tiers`, `jetons-gift`, `referrals`, `sandbox` scopent tous par `restaurant_id` (F1/F2 sont les 2 exceptions). Routes membres (`points/bank`, `redemption/redeem`, `become-a-partner`) : checks user/owner corrects, pas d'IDOR.
- **Cron** `notifications` protégé par `CRON_SECRET` (échoue fermé). **m34** verrouille l'escalade de privilèges sur `profiles`.
- **XSS faible** : `dangerouslySetInnerHTML` uniquement sur le SVG QR (généré par la lib) + CSS d'impression statique ; le rendu markdown est du JSX échappé.
- **Secrets** : `createAdminClient` (service-role) jamais importé côté client ; pas de secret en `NEXT_PUBLIC_*`.
- **Canal qualité (ADR 0023)** : `getEstablishmentFeedback` expose bien le contexte grossi (jour+créneau) sans identité/commande sur les incidents anonymes — pas de fuite.

---

## Migration Next.js 16 (cadrage — bonne nouvelle : l'essentiel est déjà fait)
Ferme les 12 CVE Next/React de mai 2026 (7 vulns npm résiduelles). **Déjà absorbé** : `cookies()` déjà `await`, la plupart des `params` déjà `Promise`, `next.config` minimal (rien à migrer), `ImageResponse` depuis `next/og`, pas de `next/font`/`legacyBehavior`/`next/head`.

**Reste à faire (checklist) :**
- **Bloc A (requis)** — `@supabase/ssr` 0.3 → 0.12 : réécrire 5 adaptateurs cookies `get/set/remove` → `getAll/setAll` : `lib/supabase.ts`, `middleware.ts` (le plus délicat — préserver la ré-assignation de la réponse, tester login/session), `app/auth/callback/route.ts`, `login/actions.ts`, `register/actions.ts`.
- **Bloc B (requis)** — 7 fichiers encore en `params`/`searchParams` synchrones à passer en `Promise` + `await` : `api/admin/feedback/[id]/reply`, `api/feedback/[id]/reply`, `api/icons/[size]`, `(public)/invite/page` (+ `generateMetadata`), `admin/[restaurantId]/sales/page` (searchParams).
- **Bloc C (requis)** — React 18 → 19 (dépendance dure de Next 16) + passe `tsc --noEmit`.
- **Bloc D (faible)** — `eslint-config-next` 16 (flat config), aligner Node ≥ 20.9.

**Effort estimé** : ~½ à 1 journée. Faire A + B **avant** de bumper `next` (sinon build cassé).

---

## Plan d'action recommandé
1. **Correctifs code (rapides, sûrs)** : F1, F2, F6 — ajout de `.eq("restaurant_id", …)` / validation de slug. Build à revérifier.
2. **Migration SQL (m39, à appliquer dans Supabase)** : F3 + F5 (REVOKE/GRANT colonnes ou vues + retrait realtime), F4 (index unique ou RPC coupon), F7 (FK teams).
3. **Durcissements** : F7 (membership + rate-limit création équipes), F8 (rate-limit OCR).
4. **Chantier séparé** : migration Next 16 (checklist ci-dessus).
