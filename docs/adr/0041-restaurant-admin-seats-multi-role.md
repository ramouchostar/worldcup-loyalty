# ADR 0041 — Sièges d'admin établissement multi-rôles (gérant / manager / équipe)

**Statut** : Accepté (2026-08-19). Complète l'**ADR 0015 §7** (rôles admin à deux niveaux) et l'**ADR 0032** (lien d'invitation restaurateur). Amende **CONTEXT.md** § Établissements et § Administration.

## Contexte

ADR 0015 §7 limite un établissement à un seul admin (`restaurants.owner_id`) : *« Un seul admin par établissement pour l'instant — pas de co-admins/gérants »*. ADR 0032 avait déjà anticipé la levée de cette limite dans ses alternatives écartées, à propos d'une table de co-gérants :

> « Le jour où elle existe, l'invitation attribuera un rôle au lieu d'écrire owner_id. »

Ce jour est arrivé : un restaurant est en réalité tenu par plusieurs personnes, et le lien d'invitation (ADR 0032) évince aujourd'hui le restaurateur précédent à chaque acceptation — y compris quand l'intention est d'AJOUTER quelqu'un, pas de le remplacer. Le message de confirmation « X a déjà un restaurateur rattaché… » (`app/platform/InviteOwnerForm.tsx`, `RestaurantList.tsx`) était le symptôme direct de cette limite : personne ne peut dire à l'avance si générer un nouveau lien va ajouter ou évincer.

## Décision

1. **Trois rôles, table `restaurant_admins`** (`restaurant_id, user_id, role, invited_by, created_at`) — plusieurs sièges par établissement, plutôt qu'un `owner_id` unique.

2. **Rôles ASCII, quotas tenus en base** : `gerant`, `manager`, `equipe`. Maximum 2 gérants, 2 managers ; équipe illimité. Le plafond est appliqué par un **trigger** (`enforce_restaurant_admin_seat_quota`), jamais par du code applicatif — un index unique partiel ne peut exprimer qu'« au plus une » ligne (cf. `uq_owner_invites_active`, ADR 0032), jamais « au plus deux », et ne peut pas réécrire une ligne. Au-delà du plafond, le trigger **force** le rôle en `equipe` plutôt que de rejeter l'écriture : c'est la règle produit (« tout siège au-delà du plafond est forcé en équipe »), pas une erreur.

3. **`restaurants.owner_id` reste, devient dérivé** : un second trigger (`sync_restaurant_owner_id`) pose `owner_id` sur le **premier** gérant inséré (`WHERE owner_id IS NULL`), jamais réécrit ensuite. Aucune migration destructive — tout le code qui lit déjà `owner_id` continue de fonctionner sans modification. Le **transfert de gérance** (changer QUI est `owner_id`, remplacer un siège existant) est explicitement hors périmètre de cet ADR ; il ferait resurgir une forme d'avertissement d'éviction, sous une autre action, dédiée.

4. **`owner_invites.role`** : le rôle est **proposé** par l'inviteur, **confirmé** — jamais librement choisi — par l'invité à l'activation (`app/invite/[token]/page.tsx`). Le rôle réellement persisté peut différer du rôle proposé si le quota a été atteint entre-temps (course entre deux invitations concurrentes) ; la console affiche alors un bandeau ponctuel plutôt que de rétrograder quelqu'un en silence total.

5. **Qui peut inviter** : super-admin plateforme, gérant, manager. Équipe ne peut pas inviter (sinon n'importe qui se clone l'accès). Le pont legacy `is_admin`/`owner_id` est traité comme un inviteur légitime par défense en profondeur (`canInviteFromAccess`, `lib/admin-guard.ts`) — sans coût réel puisque le backfill (§8) rend `isOwner` redondant avec `seatRole === "gerant"`.

6. **V1 = parité d'accès entre les trois rôles, sauf trois surfaces financières/réglages.** Le rôle conditionne le droit d'inviter (`canInviteFromAccess`) ET l'accès à trois pages considérées sensibles : **Seuils CA** (`/thresholds`), **Paliers d'équipe** (`/team-tiers`) et **Réglages établissement** (`/settings`) — réservées à gérant, manager, et le pont legacy (super-admin, `is_admin`, `owner_id`) ; un siège équipe ne les voit pas (page bloquée côté serveur, pas seulement le lien caché) et n'a pas accès à leurs routes API. Cette limite est volontairement une **liste fermée de trois pages** (`canManageEstablishment`, `lib/admin-guard.ts`), pas une matrice de droits par rôle × surface généralisée — le reste de la console (dashboard, commandes, cadeaux, clients, équipes, broadcasts, actions, parrainages, ventes, prévisions, opportunités, baromètre, repères secteur, menu & coûts, QR, lecture de `/access`) reste identique quel que soit le rôle, même principe que le mode plateforme (ADR 0030 §3). Une matrice complète par rôle × surface reste un chantier d'un tout autre ordre, explicitement **différé** (voir § Évolutions hors périmètre).

7. **Point d'entrée d'invitation dans la console elle-même** (`/admin/[id]/access`), pas seulement `/platform`. Un gérant ou un manager peut inviter pour SON établissement sans passer par la console plateforme (réservée au super-admin, portée sur tout le réseau).

8. **Backfill** : chaque `restaurants.owner_id` existant devient une ligne `restaurant_admins` de rôle `gerant` — sans quoi la bascule casserait le droit d'inviter de tous les restaurateurs déjà en place.

9. **Le message d'éviction disparaît pour une invitation ordinaire.** `app/platform/owner-reassign-warning.ts` est supprimé : inviter n'évince plus jamais personne (ça ajoute un siège, ou c'est forcé en équipe). Il ne resurgira que le jour d'une action « transfert de gérance » dédiée (hors périmètre ici).

10. **Retrait d'un siège, avec plancher d'un gérant.** `/admin/[id]/access` permet à quiconque peut inviter (gérant, manager, super-admin, pont legacy) de retirer n'importe quel siège — y compris un autre gérant ou soi-même : même ensemble de rôles que l'invitation, par symétrie, pas de hiérarchie manager < gérant introduite ici. Le seul garde-fou est un **plancher d'un gérant par établissement**, tenu par un trigger `BEFORE DELETE` (`enforce_restaurant_admin_min_gerant`) — jamais par du code applicatif, même raisonnement qu'au §2 : un accès SQL direct doit rester protégé. Si le gérant retiré était `restaurants.owner_id`, un trigger `AFTER DELETE` (`resync_restaurant_owner_id_after_removal`) le fait reprendre par un gérant restant (le plus ancien) — sinon `owner_id` pointerait vers un compte sans plus aucun siège. Ce n'est pas un « transfert de gérance » au sens du §9/hors périmètre (pas de UI pour choisir explicitement qui devient `owner_id` : c'est une simple réparation automatique pour ne jamais laisser la colonne dérivée orpheline).

## Conséquences

- `lib/restaurant.ts::isRestaurantOwner` — élargi à tout siège (`isRestaurantAdminSeat`), pas seulement `owner_id`. C'est le point de lecture le plus large de tout le code (pont membre → admin sur `/r/[id]`, onboarding self-service `become-a-partner/[id]/{menu,receipt,social}`, garde coupon `admin/coupon/[token]` et `api/redemption/[token]/redeem`) — plus large que `lib/admin-guard.ts` lui-même.
- `lib/admin-guard.ts::getAdminAccess` gagne `seatRole` ; `isEstablishmentAdmin`, `canInviteFromAccess` et `canManageEstablishment` (les deux dernières couvrant le même ensemble de rôles en V1 — deux noms parce que ce sont deux permissions distinctes qui pourraient diverger) en découlent. `requireEstablishmentManager` (nouveau, à côté de `requireAdmin`) garde les routes API des trois pages restreintes.
- `/thresholds` et `/team-tiers` passent de page 100 % client à un wrapper serveur (`page.tsx`) qui vérifie `canManageEstablishment` avant de rendre le composant client existant (`ThresholdsClient`/`TeamTiersClient`) — même défense en profondeur que le layout admin (CVE-2025-29927) : la garde ne peut pas reposer sur le seul lien caché dans la nav.
- `lib/post-login.ts`, `app/admin/page.tsx` (sélecteur multi-établissements), `app/r/[restaurantId]/layout.tsx` (carte gérant) — tous lisaient `owner_id` seul pour savoir « quels établissements cet utilisateur administre-t-il » ; tous lisent désormais `getAdminRestaurantIds` (owner_id ∪ sièges).
- **`middleware.ts` duplique délibérément une partie de cette logique** (le fichier ne peut pas embarquer la clé service-role) : sa garde de route `/admin/[id]/**` et son routage post-login (`hasConsole`) doivent aussi devenir seat-aware. Comme `owner_invites`, `restaurant_admins` a RLS activée ; contrairement à `owner_invites` (AUCUNE policy — un jeton EST le droit, sa lecture seule suffit à l'exploiter), `restaurant_admins` gagne une policy `SELECT USING (auth.uid() = user_id)` (même précédent que `profiles_own_read`, m2) : une ligne n'expose que la propre appartenance de son titulaire, jamais celle des autres.
- `restaurants.owner_id` devient un champ à un seul écrivain (le trigger de synchro) : les inserts directs dans `createRestaurantAsSuperAdmin` (`app/platform/actions.ts`) et `createPartnerRestaurant` (`app/become-a-partner/actions.ts`) ne l'écrivent plus — ils posent le siège gérant correspondant, et laissent le trigger dériver `owner_id`.
- `assignOwner` change de sémantique : d'un `UPDATE owner_id` (remplace) à un `upsertRestaurantAdmin(role: "gerant")` (ajoute un siège, soumis au même plafond).

## Alternatives écartées

- **Index unique partiel pour le plafond** — rejeté : n'exprime que « au plus une » ligne (cf. `uq_owner_invites_active`), jamais « au plus deux », et ne peut pas rediriger une écriture vers `equipe`.
- **Matrice de permissions par rôle dès maintenant** — rejetée : sur-conception avant besoin validé, chantier d'un tout autre ordre (chaque page `/admin/**`, chaque route API, RLS). Décision explicitement tranchée avec le porteur produit avant de coder.
- **Renommer `owner_id`/`owner_invites`** — rejeté : churn inutile, contredit le principe « aucune migration destructive, tout le code existant continue de fonctionner ».

## Évolutions hors périmètre

- **Transfert de gérance explicite** : choisir délibérément QUI devient `owner_id` sans retirer personne — distinct de la réparation automatique du §10 (qui ne fait que suivre un retrait). Ferait resurgir une forme de l'avertissement d'éviction supprimé au §9, sous une action dédiée.
- **Rétrogradation d'un siège existant** (changer le rôle d'un titulaire en place) — seul le retrait pur (§10) est construit, pas un changement de rôle in place.
- **Matrice de droits par rôle × surface généralisée**, au-delà des trois pages listées au §6 (ex. distinguer aussi `/menu` — coûts de revient ADR 0017 —, ou les actions de validation de commandes suspectes) — voir §6.
- **Écran de gestion des sièges au-delà de la liste + retrait** sur `/admin/[id]/access` (pas d'historique des retraits, pas de notification à la personne retirée).
