# ADR 0032 — Rattacher un restaurateur par lien d'invitation

**Statut** : Accepté (2026-08-15). Complète l'**ADR 0015 §7** (rôles admin à deux niveaux) et l'**ADR 0030 §1** (routage post-login par rôle). Aucun changement au modèle d'autorisation lui-même : `restaurants.owner_id` reste l'unique source de vérité de l'admin établissement.

## Contexte

Donner la console d'un établissement à son restaurateur passait par deux chemins, tous deux inadaptés au démarchage terrain :

1. **Self-service** (`/become-a-partner`) — le restaurateur crée lui-même l'établissement et en devient `owner_id`. Ne s'applique pas aux établissements créés par la plateforme (démarchage, reprise d'un resto historique comme `kraainem`, dont `owner_id` était resté `NULL`).
2. **Rattachement par email** (`/platform` → `assignOwner`) — exige que le restaurateur ait **déjà** un compte membre avec le bon email, sinon « Aucun compte membre avec l'email … ». Or l'ordre naturel sur le terrain est l'inverse : on rencontre le restaurateur, **puis** il s'inscrit.

Le pont legacy `profiles.is_admin` (`ADMIN_EMAILS`) n'est pas une solution : il n'est posé qu'au passage par `/auth/callback` (magic link / OAuth — une connexion par mot de passe ne le déclenche pas), il exige un déploiement pour changer une variable d'environnement, et il ne donne accès qu'au **restaurant par défaut** (`NEXT_PUBLIC_RESTAURANT_ID`) — inutilisable pour le 2ᵉ établissement du réseau.

## Décision

### 1. Le super-admin génère un lien, le clic du restaurateur pose `owner_id`

Nouvelle table `owner_invites` (m55) : un token URL-safe, borné dans le temps, consommable **une seule fois**. Même famille que `redemption_tokens` (ADR 0011) — un secret porteur d'un droit, jamais un identifiant devinable. Table **service-role only** (RLS activée, aucune policy) : un lien d'invitation est un privilège d'écriture sur `restaurants.owner_id`, il n'a rien à faire derrière la clé anon (m34).

L'invitation ne suppose **rien** du destinataire : pas de compte, pas d'email connu, pas d'adhésion. C'est le lien qui porte le droit, l'identité se règle après.

### 2. Durée de vie 14 jours, un seul lien actif par établissement

14 jours : un restaurateur démarché ne s'inscrit pas le soir même, mais un lien oublié dans une conversation WhatsApp ne doit pas rester une porte d'entrée indéfinie. Index unique partiel `uq_owner_invites_active` — générer un nouveau lien **révoque** le précédent. La console réaffiche le lien déjà en circulation plutôt que d'en générer un à chaque visite : le lien envoyé reste celui qui marche.

### 3. L'attribution est un POST, jamais le rendu de la page

`/invite/[token]` **affiche** ; c'est une Server Action (bouton « Activer mon espace restaurateur ») qui **attribue**. Un GET mutant serait déclenché par n'importe quelle prévisualisation de lien (WhatsApp, antivirus de messagerie, proxy) et grillerait l'invitation avant que le restaurateur ne l'ouvre — même raisonnement que le passage de `/api/auth/bootstrap-admin` en POST.

La consommation est un **compare-and-swap** (`UPDATE … WHERE accepted_at IS NULL`) avant l'écriture de `owner_id`, avec relâchement de la réservation si cette écriture échoue. Deux clics concurrents : un seul gagne.

### 4. Le token survit à l'inscription via un cookie httpOnly

Le middleware mémorise le token dans `pending_owner_invite` (httpOnly, 14 j) quand un visiteur **non connecté** ouvre `/invite/[token]`, puis laisse passer vers la page — le restaurateur voit d'abord de quoi il s'agit, il s'inscrit ensuite. Le cookie ramène ensuite sur l'invitation depuis les trois portes d'entrée : `/auth/callback` (magic link, OAuth, confirmation d'email), connexion par mot de passe, et fin d'inscription (`registerProfile`). Même mécanique que `belchicken_ref` (parrainage) et `pending_restaurant_id` (QR d'établissement).

L'invitation **prime sur le routage par rôle** (ADR 0030 §1) : le compte vient d'être créé pour ça. Le cookie n'est effacé qu'à l'acceptation ou sur « Pas maintenant » — un aller-retour raté (page fermée, mail ouvert sur un autre appareil) ne coûte rien : le lien reste valide.

### 5. L'email est un canal, pas une condition

Renseigner l'email à la génération envoie le lien par Resend (`owner_invite`) ; le laisser vide affiche simplement le lien à copier ou à partager via WhatsApp. Sans `RESEND_API_KEY`, l'envoi est un no-op silencieux (règle du module `lib/email.ts`) et le partage manuel reste la voie normale — la fonctionnalité ne dépend jamais de l'emailing.

### 6. `assignOwner` reste, en voie secondaire

Le rattachement direct par email d'un compte existant garde sa place (« Rattacher un compte existant », marqué *avancé*) : c'est le chemin le plus court quand le restaurateur est déjà membre. Le lien devient la voie affichée par défaut.

## Conséquences

- Un établissement sans `owner_id` (créé par la plateforme, ou historique) se dote d'un admin sans déploiement, sans variable d'environnement, sans que le restaurateur ait à préexister.
- Réassigner reste destructif par nature — `owner_id` est unique par établissement (ADR 0015 §7 : pas de co-admins). La console demande confirmation quand un restaurateur est déjà rattaché ; l'ancien perd l'accès à l'acceptation du nouveau, pas avant.
- Un lien en circulation est un privilège en circulation : il est révocable d'un clic depuis la console plateforme, et tracé (`created_by`, `accepted_by`, `accepted_at`).
- Rien de tout cela n'est visible côté membre — aucune surface client n'expose l'existence d'un lien d'invitation ni l'identité du restaurateur (ADR 0007 non concerné ; ADR 0025 : aucune donnée personnelle nouvelle hors l'email du destinataire, déjà traité comme contact restaurateur).

## Alternatives écartées

- **Magic link Supabase (`auth.admin.generateLink`)** — mêle deux problèmes distincts : prouver une identité (Supabase le fait déjà) et attribuer un établissement (métier). Le lien serait lié à une adresse email connue à l'avance, ce qui reproduit exactement la contrainte qu'on cherche à lever, et sa durée de vie (une heure) ne survit pas à un rendez-vous terrain.
- **Étendre `ADMIN_EMAILS`** — variable d'environnement, donc redéploiement ; bornée au restaurant par défaut ; posée uniquement au callback d'auth. Écarté comme dette legacy, pas comme modèle.
- **Table `restaurant_admins` (co-gérants)** — répond à une autre question (plusieurs personnes dans un même établissement), explicitement laissée hors périmètre par l'ADR 0015 §7. Le lien d'invitation ne la contredit pas : le jour où elle existe, l'invitation attribuera un rôle au lieu d'écrire `owner_id`.
