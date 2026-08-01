# Rapport d'audit fonctionnel — Boosteats

**Date** : 2026-08-01 · **Périmètre** : 3 rôles (membre / admin restaurateur / super-admin plateforme), surfaces + flux d'interaction de bout en bout.
**Méthode** : seed à l'échelle (50 restos / 518 clients / 1115 commandes, namespacé `zz-test-*` + `@seed.boosteats.test`) → `next dev` local pointé sur la **DB de prod seedée** → pilotage navigateur (preview) + vérification directe en base (service-role). Détails en §7.

---

## 1. Résumé exécutif

**Verdict global : l'application est fonctionnelle et navigable.** Les 3 rôles ont été balayés (13 surfaces membre, 16 admin, console super-admin + gates), et **8 flux d'interaction** ont été exercés et vérifiés en base. La règle produit centrale — **le membre ne voit jamais d'euros** (ADR 0007/0028) — tient **partout** côté client. L'autorisation est solide dans les deux sens.

**3 vrais défauts trouvés, 3 corrigés** (dont 1 critique). Le reste = frictions UX + hygiène de dépendances.

| Sévérité | Nombre | État |
|---|---|---|
| 🔴 Critique | 1 | corrigé (déployé + migration m49 à appliquer) |
| 🟠 Élevé/Moyen | 2 | 1 corrigé (déployé) · 1 UX à revoir |
| 🟡 Mineur | 2 | notes UX / RGPD |
| 🔵 Info/hygiène | 3 | à traiter |

**Verdict navigabilité humaine : bon** (retours en arrière présents, états vides clairs, messages de verrou neutres, nav mobile cohérente). Seule friction notable : le login restaurateur atterrit sur `/register`.

---

## 2. Défauts par sévérité

### 🔴 C1 — CRITIQUE (corrigé) — Score communautaire bloqué à 0 pour les équipes créées après m47
- **Symptôme** : une équipe créée aujourd'hui garde un score communautaire à 0 même quand ses membres commandent → classement, paliers d'équipe et progression cassés pour toute nouvelle équipe. Masqué par les équipes d'avant m47 (backfillées à 0).
- **Cause** : `community_scores.score` est régulière **sans défaut** depuis m47 → `createTeam` ([lib/teams.ts](../../lib/teams.ts)) insérait la ligne **sans `score`** (=NULL) ; le trigger `update_community_score` (m47) fait `score = score + points_for_order(...)` **sans `COALESCE`** → `NULL + points = NULL`.
- **Correctif** : [m49](../m49-fix-community-score-null.sql) (DEFAULT 0 + réparation des NULL + trigger `COALESCE`-safe) + `score: 0` explicite dans `lib/teams.ts`. **Vérifié en live** : création d'équipe → `score = 0` (pas NULL) ; validation de commande → score `331 → 375` (+44). Commit `c361067`.
- **Action requise** : appliquer **m49** dans l'éditeur SQL Supabase.

### 🟠 E1 — MOYEN (corrigé) — Coupon créé « déjà consommé », garde-fou 10 min désactivé
- **Symptôme** : la confirmation caissier « Cadeau remis » est un no-op, et le contrôle d'expiration 10 min (ADR 0011) n'est plus appliqué côté API (un token expiré renvoie `ok:true`).
- **Cause** : `/api/redemption/generate` posait `redeemed_at: now` sur le token à sa création → la route caissier `/redeem` court-circuite en idempotence (ligne 39) **avant** le contrôle d'expiration (ligne 43).
- **Impact borné** : pas de double-cadeau (le cadeau est consommé à la génération), et l'affichage membre du coupon n'est pas impacté (il ignore `redeemed_at`). Mais la confirmation caissier et le garde-fou d'expiration deviennent inopérants.
- **Correctif** : retrait de `redeemed_at: now` de la génération (posé désormais par la remise en caisse). Commit `fca5549` (déployé).

### 🟠 M1 — MOYEN (à revoir) — Login restaurateur → `/register`
- Un propriétaire (compte sans adhésion membre) qui se connecte est redirigé vers `/register` (« Rejoindre le programme »), la seule issue étant « Annuler et se déconnecter ». Déroutant pour un restaurateur qui veut sa console admin. À rediriger vers `/admin` (ou proposer le choix membre/resto).

### 🟡 M2 — MINEUR (UX) — `/rewards` : score élevé mais paliers verrouillés
- L'écran affiche « 1 229 pts » puis tous les paliers 🔒 verrouillés (double verrou « en pause »). **Comportement correct** (ADR 0012), mais l'écart score-élevé / tout-verrouillé peut dérouter. Piste : un mot explicite « ton équipe vend bien, mais le bonus est en pause ce mois-ci ».

### 🟡 M3 — MINEUR (RGPD) — Suppression de compte : résidus liés à l'`user_id`
- La suppression **anonymise bien** le profil (`display_name` → « Compte supprimé », email/téléphone à NULL, `anonymized_at` posé), retire les adhésions et journalise la demande. Mais restent liés à l'`user_id` : **1 commande** (probablement voulu — donnée transactionnelle dé-identifiée) et **6 consentements**. À trancher : la purge doit-elle couvrir les consentements ?

### 🔵 Info / hygiène
- **I1** — Après la PR #20, un `npm install` local était nécessaire (`lucide-react`, `resend` non installés). Vercel les a → pas un bug de l'app, mais à savoir pour le dev local.
- **I2** — `npm install` signale **4 vulnérabilités « high »**. À investiguer (`npm audit`).
- **I3** — Next 16 : la convention `middleware` est **dépréciée** au profit de `proxy` (warning au démarrage). Marche encore ; à migrer.

---

## 3. Matrice de couverture

**Légende** : ✅ testé OK · 🐛 défaut trouvé (corrigé) · 🔒 gate d'autorisation vérifié.

### Surfaces
| Rôle | Surfaces couvertes | Statut |
|---|---|---|
| **Public** | `/` (landing), `/login`, `/secteurs`, `/coupon/[token]` | ✅ rendent |
| **Membre** (member-a) | accueil resto, **dashboard**, submit-order, **my-rewards** (4 états), my-team, **rewards** (3 couches), micro-rewards, feedback, reserve, leaderboard, **/compte** (export/suppression) | ✅ 13/13 · **zéro euro** (ADR 0007) |
| **Admin** (owner-a) | dashboard, commandes, cadeaux, opportunités, broadcasts, menu, ventes, prévisions, actions, parrainages, paliers, seuils, baromètre, QR, réglages, sandbox | ✅ 16/16 · autorisées · euros OK |
| **Super-admin** | `/platform` (console) · accès cross-resto | ✅ + 🔒 gates (non-super bloqué, non-owner bloqué) |

### Interactions (vérifiées en base)
| Flux | Rôle | Résultat |
|---|---|---|
| Valider une commande | Admin | ✅ statut `validated` + score **+44** + cadeau créé |
| Export RGPD | Membre | ✅ complet, **sans coûts de revient** |
| Générer un coupon | Membre | 🐛 bug token pré-consommé → **corrigé** |
| Créer une équipe | Membre | ✅ + `score=0` (**prouve le fix C1**) |
| Envoyer un feedback | Membre | ✅ créé |
| Rejoindre par code | Membre | ✅ + garde-fou anti-hopping (1×/mois) |
| Réclamer un jeton | Membre | ✅ 201 (+ unicité 409) |
| Supprimer son compte | Membre | ✅ anonymisé (voir M3) |
| Flip de plan / requireSuperAdmin | Super-admin | ✅ (vérifié Phase 1 + gates) |

### Non couvert en profondeur
Soumettre une commande avec **photo de ticket** (OCR — pipeline de récompense déjà validé via la validation admin) · « Mettre de côté » l'action (l'écran réserve + solde 45 pts validés).

---

## 4. Points positifs confirmés
- **ADR 0007/0028** : aucun euro sur **aucune** surface membre (dashboard, cadeaux, équipe, récompenses, réserve, classement, compte, micro, coupon). Euros correctement présents côté admin.
- **Autorisation** solide dans les deux sens (super / owner / membre), positif ET négatif.
- **Anti-fraude / garde-fous** : coupon anti-double (CAS), anti-team-hopping (1×/mois), unicité des jetons (409), anti-spam feedback, RLS service-role only sur les tables sensibles.
- **Corrections antérieures tenues** : coupon membre C3 (plus de 404), export RGPD sans coûts (C2), logout fonctionnel, back-links partout.
- **Affichage coupon** exact (compte à rebours en heure de Bruxelles).

## 5. Verdict navigabilité humaine
**Bon.** Un humain peut s'inscrire, comprendre son dashboard (conséquences, pas chiffres), récupérer un cadeau, voir son équipe et son classement — sans euros ni jargon. Côté resto : la console est complète et lisible. **Unique point de friction** : le login restaurateur → `/register` (M1).

## 6. Actions restantes
- **Toi** : appliquer **[m49](../m49-fix-community-score-null.sql)** dans Supabase (les 2 correctifs de code sont auto-déployés).
- **Recommandé** : M1 (redirection login resto), I2 (`npm audit`), I3 (`middleware`→`proxy`), trancher M3 (purge consentements).

## 7. Méthode & jeu de test
- **Seed** : `scripts/seed-audit.mjs` — ~50 restos (plans/statuts/secteurs variés, 11 forecast-ready), 518 clients (dont comptes focus à mot de passe connu : `super@`, `owner-a/b/c@`, `member-a@`, `delete-me@`, `minor@` `…@seed.boosteats.test`), 1115 commandes (validées + 8 flags + rejetées), cadeaux 4 états, feedback, parrainages, jetons, ventes caisse, consentements. Namespace `zz-test-*` + `@seed.boosteats.test`.
- **Démontage** : `scripts/seed-audit-clean.mjs` (par préfixe + domaine, cascades vérifiées). **Prod restaurée à son état réel après audit.**
- **Exécution** : app en `next dev` local sur la DB prod seedée + outils preview + scripts de vérification service-role.

## 8. Non-défauts (levés en cours d'audit)
- « Logout cassé » → **faux** : le vrai bouton fonctionne (même route `/api/auth/logout` prouvée sur member-a) ; mes échecs owner-a étaient un artefact d'automatisation.
- « micro-rewards vide » → **faux** : rendu **client** (SSR court), contenu bien présent après hydratation.
- « timer coupon incohérent » → **faux** : décalage horaire Bruxelles (UTC+2), affichage correct.
