# ADR 0030 — Cohérence de navigation et parcours par rôle

**Statut** : Accepté (2026-08-05) — **décisions validées par le porteur (session de grill), PAS encore implémentées**. Périmètre : navigation, points d'entrée, retours arrière, parcours post-action, et deux écrans à créer (« Membres » plateforme / « Mes clients » resto). Aucun changement au modèle de données hors ces deux écrans.

## Contexte

Un audit de navigation exhaustif (2026-08-05) a montré que l'app expose mal ses propres fonctionnalités :

- **Pages sans sortie** : `/r/[id]/feedback`, `/r/[id]/rewards`, `/r/[id]/leaderboard` (cul-de-sac total pour un visiteur anonyme), `/platform` (aucun lien sortant, pas même une déconnexion), l'écran de config reçu (`become-a-partner/[id]/receipt`), le sandbox admin.
- **Pages orphelines** : un membre **sans équipe** ne peut jamais atteindre `/rewards` ni `/leaderboard` (leurs seuls liens vivent dans la branche « a une équipe » du dashboard), alors que `/rewards` contient précisément un écran dédié aux sans-équipe. `/feedback` n'a qu'un lien conditionnel (≥ 3 commandes). `/reserve` est doublement conditionnelle. Le sélecteur `/admin` n'a aucun lien entrant.
- **Ponts entre rôles cassés** : aucun lien membre → admin (un restaurateur doit taper l'URL de sa console) ; aucun lien admin → plateforme ; `/platform` n'est atteignable que depuis une page membre (un super-admin sans adhésion est bloqué) ; `app/admin/page.tsx` ignore `is_super_admin`.
- **Refus silencieux** : tous les refus d'autorisation redirigent vers `/join` sans message. Les CTA de la landing publique pointent vers `/join` (route protégée) → double saut vers `/login`.
- **Incohérence de garde** : `/admin/coupon/[token]` est la seule surface admin qui rejette le super-admin (ne lit que `is_admin` + owner).
- **Écran manquant** : aucune vue « clients/membres d'un resto » n'existe nulle part (le compteur du dashboard admin est explicitement non cliquable).
- **Moments sans suite** : après un scan de ticket réussi, le seul CTA est « Soumettre une autre commande » (cas rare) — rien vers « qu'est-ce que ça m'a rapporté ? ».

## Décision

### 1. Connexion : login unique, routage post-login par rôle

- **Un seul formulaire** de login (pas de duplication d'auth). Après connexion, destination = **le rôle le plus puissant** : super-admin → `/platform` ; owner/admin d'au moins un établissement → `/admin` (sa console) ; sinon → dashboard membre (comportement actuel).
- **Habillage par paramètre** : `/login?as=resto` (lié depuis la landing restaurateurs) affiche le même formulaire avec un habillage « Espace restaurateur » et force la destination admin. Extensible (`?as=platform`).
- Corrige au passage le bug connu « login restaurateur redirigé vers `/register` ».

### 2. Circulation entre les trois mondes (membre ⇄ admin ⇄ plateforme)

On **complète les headers existants** (pas de nouveau composant de sélection de rôle) :

| Surface | Ajout |
|---|---|
| `UserNav` (membre) | « 🍽️ Ma console » si owner/admin d'au moins un resto (à côté du « 🛠️ Plateforme » super-admin existant) |
| Dashboard membre | **Carte gérant** en position 0 : « Vous êtes le gérant de ce restaurant → Console » (owner du resto courant seulement) |
| Header admin | « 🛠️ Plateforme » (super-admin seulement) + « Mes établissements » → `/admin` (si plusieurs restos administrés) — le sélecteur `/admin` cesse d'être orphelin |
| `/platform` | Vrai header de sortie : retour vers l'app + **déconnexion** |

### 3. Super-admin dans la console d'un resto : mode plateforme

- Le super-admin voit **exactement la même console** que le gérant et peut **tout faire** (broadcasts, validations… — c'est l'outil de support). Pas de version spéciale.
- **Bandeau « Mode plateforme »** en haut de la console, visible seulement quand le viewer n'est pas owner : « 🛠️ Mode plateforme — vous consultez [Nom du resto] · ← Retour à la plateforme ». Sert aussi de pont admin → plateforme.
- **Correction de garde** : `/admin/coupon/[token]` accepte le super-admin (aligné sur `isEstablishmentAdmin`).

### 4. Dashboard membre = hub permanent à états progressifs

Principe : **on ne cache jamais une fonctionnalité, on montre ce qui manque pour l'utiliser.** Les liens conditionnels deviennent des entrées permanentes à état.

Ordre du dashboard (compatible ADR 0010 — le hero et la progression restent) :

| Position | Contenu |
|---|---|
| 0 | Carte gérant (owner seulement) |
| 1 | Hero « aperçu prochaine commande » (ADR 0010, inchangé) |
| 2 | Carte Actions séquentielle (existante, PR #34) |
| 3 | Progression équipe + prochain palier (ADR 0010, inchangé) |
| 4 | **Rangée de tuiles d'accès compactes** (grille 2×2) : Récompenses · Classement · Avis · Réserve |
| 5 | Historique / stats perso (existant) |

- **Tuile d'accès** = petite tuile permanente : icône + label + **micro-état** (« 2 paliers atteints », « 3ᵉ/12 », « Encore 2 commandes pour donner ton avis », solde réserve). Jamais de grande carte empilée — c'est ce qui évite le mur de cartes.
- États progressifs : sans équipe, la tuile Récompenses mène à `/rewards` qui affiche son écran « rejoins une équipe » (aujourd'hui inatteignable) ; avant 3 commandes, la tuile Avis affiche le compteur restant (motivation) au lieu de disparaître.
- **Classement** : accessible aussi depuis `/my-team` (son parent logique — « mon équipe → son classement »).

### 5. Retour arrière : règle unique, pas de breadcrumb

> **Toute page qui n'est PAS un onglet de la BottomNav (membre) ou une entrée de la sidebar (admin) DOIT avoir un header avec `←` vers son parent logique.**

Parents logiques : `/rewards` → dashboard ; `/leaderboard` → `/my-team` (membre) ou `/r/[id]` landing (visiteur anonyme) ; `/feedback` → dashboard ; `become-a-partner/[id]/receipt` → console admin ; sandbox → dashboard admin. Pas de breadcrumb (profondeur max 2, PWA mobile).

### 6. Suites de parcours post-action

1. **Succès scan de ticket** : CTA principal « Voir mes cadeaux → » (`/my-rewards`) + secondaire « Retour à l'accueil » ; « Soumettre une autre commande » passe en lien discret. Libellé neutre (la validation est différée — ADR 0008 : jamais révéler le mécanisme).
2. **Coupon consommé** : retour `/my-rewards` existant — inchangé.
3. **Équipe créée/rejointe** : encart de succès « Tu fais partie de [équipe] ! Voir le classement → ».
4. **Micro-récompense accomplie** : « Voir mes cadeaux → » si un jeton/cadeau a été crédité.
5. **Réglages compte** : confirmation inline, pas de redirection.

### 7. Deux écrans « clients » — séparation stricte par rôle (conformité ADR 0025)

L'ADR 0025 impose : le restaurateur **ne reçoit jamais** de données brutes/nominatives (coordonnées) ; il agit via le ciblage-service. Donc **deux écrans distincts** :

| Écran | Rôle | Contenu | Interdits |
|---|---|---|---|
| **« Membres »** | Super-admin (plateforme = responsable de traitement) | Liste nominative complète : nom, email, inscription, équipe, points, dernière activité, nb commandes ; recherche + tri. Accessible depuis `/platform` et depuis la console d'un resto en mode plateforme | — |
| **« Mes clients »** | Restaurateur (entrée dédiée en sidebar, section Fidélisation) | Liste d'activité **pseudonymisée** : prénom/pseudo affiché, équipe, points, nb commandes, dernière visite | **Jamais** email/téléphone, **jamais** d'export. Pour agir : ciblage broadcast existant |

Ligne directrice : le nom d'affichage oui (nécessité opérationnelle, déjà le cas sur commandes/cadeaux), les **coordonnées jamais**. Donner le fichier client tuerait l'argument de monétisation (ADR 0029 : le resto paie le ciblage et les insights, pas la possession du fichier).

### 8. Refus d'accès parlants

1. **Bandeaux contextuels** : les refus redirigent avec `?reason=…` (`admin-required`, `approval-pending`, `login-required`…) et la page d'atterrissage affiche un bandeau clair. Pas de nouvelle page d'erreur.
2. **Restaurateur en attente** : après `become-a-partner`, un retour sur l'app affiche « Ta demande pour [resto] est en cours d'examen » (l'info existe déjà — statut `pending`, file d'approbation plateforme).
3. **CTA landing publique** → directement `/signup` (suppression du double saut `/join` → `/login`).

### 9. Sidebar admin : 4 sections, hamburger mobile

16 entrées à plat ne sont pas extensibles. Regroupement :

| Section | Entrées |
|---|---|
| **📍 Au quotidien** | Dashboard · Commandes · Cadeaux à remettre |
| **📣 Fidélisation** | Broadcasts · Actions · Parrainages · Paliers d'équipe · **Mes clients** (nouveau) |
| **📊 Pilotage** | Ventes · Prévisions · Opportunités · Baromètre |
| **⚙️ Configuration** | Menu & coûts · Seuils CA · QR code · Réglages |

Desktop : sidebar avec intertitres. Mobile : **menu hamburger** déroulant les 4 sections (remplace la barre horizontale scrollable de 16 icônes). Toute future fonctionnalité rejoint une section sans allonger de liste plate.

## Conséquences

- ADR 0010 (structure dashboard) : **amendé** par §4 — le hero et la progression restent, les tuiles d'accès et la carte gérant s'y ajoutent ; la carte Actions (ADR 0024) s'y insère en position 2.
- ADR 0025 / 0029 : la séparation « Membres » / « Mes clients » (§7) en est l'application UI directe.
- ADR 0015 §7 : le routage post-login par rôle (§1) et le mode plateforme (§3) complètent le modèle multi-établissements.
- La règle du `←` (§5) et le principe « on ne cache jamais, on montre ce qui manque » (§4) s'appliquent à **toute nouvelle vue** — vérifier à chaque PR.

## Lots d'implémentation (ordre validé)

1. **Ponts & headers** : routage post-login par rôle + `?as=resto`, UserNav « Ma console », carte gérant, header admin (Plateforme, Mes établissements), header de sortie `/platform`, bandeau mode plateforme, fix garde coupon super-admin.
2. **Hub membre** : réordonnancement dashboard + rangée de tuiles d'accès à micro-états + classement depuis `/my-team`.
3. **Retours & parcours** : `←` systématique (règle §5) + les 5 suites post-action (§6).
4. **Refus parlants** : `?reason=…` + bandeaux + écran « demande en cours » + CTA landing → `/signup`.
5. **Sidebar 4 sections** : desktop intertitres + hamburger mobile.
6. **Écrans clients** : « Membres » (plateforme) puis « Mes clients » (resto, pseudonymisé) — le seul lot avec de nouvelles requêtes de données.
