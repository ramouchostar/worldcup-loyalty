# ADR 0042 — Récap fondateurs quotidien et hebdomadaire par email

**Statut** : Accepté (2026-08-29).

## Contexte

Mehdi et Omar pilotent le produit à deux, à travers le backlog plateforme (ADR 0033 §3) et les commits sur `master`. Aucun des deux n'a de vue automatique sur ce que l'autre a en cours ni sur ce qui a bougé dans la journée/semaine — il faut ouvrir `/platform/backlog` et comparer avec `git log` à la main. Demande explicite de Mehdi (2026-08-29) : un email quotidien en fin de journée (tâches restantes chacun de son côté, commits et avancées du jour) et un récap hebdomadaire le vendredi soir (priorités accomplies, tâches terminées, bugs résolus).

## Décision

1. **Deux routes cron**, gardées par `CRON_SECRET` — même motif que `/api/cron/notifications`, `/api/cron/broadcasts`, `/api/cron/purge-receipts` (header `Authorization: Bearer`, fail-closed sans le secret) :
   - `app/api/cron/founder-digest-daily/route.ts` — tous les jours, `0 18 * * *` (`vercel.json`).
   - `app/api/cron/founder-digest-weekly/route.ts` — vendredi, `10 18 * * 5` (décalé de 10 min du quotidien pour que les deux emails n'arrivent pas confondus dans la boîte).

2. **Fenêtre glissante, pas de calcul calendaire.** « Depuis 24h » (quotidien) / « depuis 7 jours » (hebdomadaire), calculé à partir de l'heure d'exécution — pas « depuis minuit Bruxelles » ni « depuis lundi ». Le cron tourne toujours à la même heure UTC, donc « depuis le dernier envoi » est exactement « depuis 24h »/« depuis 7 jours » : aucun calcul de fuseau horaire, aucun trou ni recouvrement entre deux envois.

3. **Données backlog, sans rien ajouter en base.** `platform_backlog` a déjà tout : `owner` (texte libre, `BACKLOG_PEOPLE`) pour « qui », `done_at` (posé/effacé automatiquement au passage à « fait », `lib/backlog.ts`) pour « terminé cette période ». Le quotidien liste les tâches **ouvertes** par personne (`OPEN_STATUSES`) + ce qui est passé à « fait » dans les dernières 24h ; l'hebdomadaire liste tout ce qui est passé à « fait » dans les 7 derniers jours, groupé par personne.

4. **Commits via l'API GitHub REST** (`lib/github-activity.ts`), nouvelle dépendance externe — rien n'existait dans le repo pour ça. Lecture seule sur `master` uniquement (ce qui est réellement en production, pas les branches de travail), `per_page=100` sans pagination (largement suffisant à deux personnes sur une fenêtre d'un jour ou d'une semaine). **Catégorisation par préfixe conventionnel** (`fix:` / `feat:` / autre) : le repo suit déjà cette convention sur la quasi-totalité de ses commits, ça donne « bugs résolus » vs « avancées » pour le récap hebdo sans tenir de registre séparé ni ajouter de catégorie « bug » au backlog.

5. **Nouvelle variable d'environnement `GITHUB_TOKEN`** (PAT lecture seule, scope contenu, fine-grained scopé à ce repo) — **fail-open comme tout le reste du module email** : absent, le digest part quand même, juste sans la section commits (`console.warn`, jamais une erreur qui casse le cron).

6. **Envoi hors du système `EmailRecipientType` existant.** `lib/email.ts` structure tout envoi autour d'un destinataire `member`/`restaurant` avec journalisation `email_log` (audit d'une donnée utilisateur). Un récap interne aux deux fondateurs ne rentre dans aucune des deux cases : nouvelle fonction `sendFounderDigestEmail()` qui réutilise `dispatch()` (client Resend interne, no-op silencieux sans `RESEND_API_KEY`) mais **n'écrit jamais dans `email_log`** — ce n'est pas une donnée utilisateur à auditer. Destinataires en **nouvelle variable d'environnement `FOUNDER_DIGEST_EMAILS`** (liste séparée par des virgules), même motif que `ADMIN_EMAILS`/`SUPER_ADMIN_EMAILS` — jamais d'adresse en dur dans le code.

7. **Templates dans `lib/email-templates/founder-digest.ts`**, avec les mêmes helpers partagés que tous les autres emails (`lib/email-templates/layout.ts` — `emailShell`, `emailHeading`, etc.), plus un nouveau `emailList()` (liste à puces, absent jusqu'ici car aucun template n'en avait eu besoin). Wordmark Boosteats par défaut, pas de logo établissement — ce n'est l'email de personne en particulier.

## Conséquences

- Un nouvel appel réseau externe (GitHub) à chaque exécution des deux crons, en plus des lectures Supabase déjà en place ailleurs — pas de risque de credentials service-role exposés, le token GitHub est scopé lecture seule à ce seul repo.
- `GITHUB_TOKEN` et `FOUNDER_DIGEST_EMAILS` sont à provisionner sur Vercel (Production) en plus du local — sans ça, le digest tourne mais est vide de commits et/ou n'envoie à personne, jamais un cron qui échoue bruyamment.
- Si le vocabulaire des statuts/aires du backlog change (ADR 0033 §3), les templates du digest suivent automatiquement (`STATUS_LABEL`, `AREA_LABEL`, `priorityLabel` importés de `lib/backlog-model.ts`, pas dupliqués).

## Alternatives écartées

- **Étendre `EmailRecipientType` avec un troisième type `"founder"`** — écarté : `email_log.recipient_id` attend un UUID (membre ou établissement), un email de fondateur n'a pas de ligne applicative à référencer ; forcer une valeur bidon aurait pollué l'audit trail sans bénéfice réel (ce n'est pas une donnée utilisateur, il n'y a rien à auditer).
- **Catégorie « bug » dédiée dans `platform_backlog`** — écartée pour l'instant : le préfixe conventionnel des commits (`fix:`) donne le même signal sans migration ni changement d'habitude de saisie ; à revisiter si la convention de commit se relâche.
- **Semaine calendaire (lundi–vendredi) plutôt que fenêtre glissante de 7 jours** — écartée : demande un calcul de fuseau horaire (Bruxelles vs UTC du cron) pour un bénéfice marginal, alors qu'une fenêtre glissante ancrée sur l'heure d'exécution du cron est triviale et ne peut pas créer de trou/recouvrement.
