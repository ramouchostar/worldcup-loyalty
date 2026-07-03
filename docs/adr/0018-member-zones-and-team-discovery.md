# ADR 0018 — Zones du membre & découverte d'équipes (fin de l'équipe forcée)

**Statut** : Accepté

## Contexte

Trois frictions d'onboarding :

1. **Piège de la page équipe** : le middleware redirige toute route `/r/[id]/*` vers `my-team` tant que le membre n'a pas de `team_id`. Un nouveau membre ne peut ni voir le dashboard, ni soumettre une commande, ni explorer l'app sans créer ou rejoindre une équipe — alors que le dashboard gère déjà l'état « pas encore d'équipe » et que la couche solo (ADR 0006) fonctionne sans équipe.

2. **Aucune découverte d'équipes** : on ne rejoint une équipe que par code d'invitation à 6 caractères (ADR 0014). Un client sans collègue déjà inscrit n'a aucun moyen de trouver les équipes actives autour de lui — il ne peut que créer la sienne, souvent une équipe fantôme de 1 membre.

3. **Le membre n'a pas de localité** : les établissements ont un `sector` (ADR 0016) mais les membres n'ont rien. Impossible de proposer « les équipes de ta zone ».

## Décision

### 1. L'équipe devient optionnelle — l'adhésion à l'établissement suffit

- Middleware : une route `/r/[id]/*` exige une **adhésion** (`memberships`) pour cet établissement ; sans adhésion → redirection vers la landing `/r/[id]` (bouton « Rejoindre »). Avec adhésion mais **sans équipe → accès normal** ; chaque page gère son état vide (le dashboard le fait déjà, la page récompenses remplace sa redirection par une invitation douce).
- `joinRestaurant` redirige vers le **dashboard** (aperçu de la valeur) au lieu de `my-team`.
- La couche solo reste acquise sans équipe ; seuls le bonus communautaire et les paliers d'équipe demandent une équipe — c'est l'incitation, pas un barrage.

### 2. Le membre déclare sa ou ses zones à l'inscription

- `profiles.zones TEXT[]` (m29) : **1 à 3 zones** en texte libre — même maille ville/quartier que le `sector` des établissements (ADR 0016). Exemples : la zone où il vit, celle où il travaille, celle de l'école.
- Saisie sur le formulaire **signup** (email) — transmises via les métadonnées d'inscription, copiées par le trigger `handle_new_user` (m29 met aussi enfin `phone` et `birth_date` dans le profil, jusqu'ici perdus) — et sur **register** (complétion de profil OAuth).
- Modifiables ensuite depuis la page équipe (`/api/profile/zones`, RLS ligne propre). Les membres existants (zones vides) y voient une invitation à les renseigner.
- Normalisation à la saisie (`lib/zones.ts`) : trim, espaces réduits, 2–40 caractères ; la correspondance est insensible à la casse et aux accents.

### 3. Les équipes portent une zone, la page équipe devient une page de découverte

- `teams.zone TEXT` (m29) : à la création, le créateur choisit une de ses zones (ou en saisit une autre). Les équipes existantes (zone NULL) restent joignables par code.
- Page `my-team` sans équipe : section « **Équipes dans ta zone** » — équipes actives de l'établissement dont la zone correspond à une zone du membre, avec taille et score, bouton **Rejoindre** en un clic (`joinTeamById`, même garde-fou 1 changement/30 jours que le code, ADR 0014).
- Le code d'invitation reste le canal des équipes privées/invitations WhatsApp ; la zone est un canal de découverte, pas une frontière de sécurité (le classement expose déjà toutes les équipes).

### 4. Formulaire d'inscription : plus aucun héritage Coupe du Monde

Vérifié : le formulaire ne demande plus ni pays ni équipe nationale (héritage ADR 0014 déjà purgé). Restaient des textes obsolètes, corrigés : « Rejoins le programme de fidélité **Belchicken** » (branding en dur, contraire à ADR 0015) et « choisir ton équipe » dans l'email de confirmation (l'équipe n'est plus une étape obligatoire).

## Alternatives rejetées

- **Zones en liste fermée (référentiel de communes)** : plus propre pour la correspondance mais demande un référentiel à maintenir dès le MVP ; le texte libre est déjà le choix de l'ADR 0016 pour les secteurs restos. Une consolidation (autocomplétion sur zones existantes) pourra venir après.
- **Zone obligatoire sur les équipes existantes** : migration de données impossible à deviner ; NULL = « pas de zone déclarée », joignable par code uniquement.
- **Géolocalisation** : hors de proportion pour le besoin (déclaratif suffit), et friction de permission navigateur.
- **Supprimer complètement le code d'invitation** : il reste le canal naturel du partage WhatsApp (ADR 0014) et des équipes qui ne veulent pas être trouvées.

## Conséquences

### Schéma (m29)
- `profiles.zones TEXT[] NOT NULL DEFAULT '{}'` ; `teams.zone TEXT` + index `(restaurant_id, zone) WHERE is_active`.
- `handle_new_user` recopie `zones`, `phone`, `birth_date` depuis les métadonnées.

### Code
- `middleware.ts` : adhésion requise, équipe optionnelle.
- `app/join/actions.ts` : redirection dashboard.
- `app/r/[restaurantId]/rewards/page.tsx` : état vide au lieu de redirect.
- `lib/zones.ts` (pur) : normalisation/validation ; `lib/teams.ts` : `joinTeamById`, `createTeam(..., zone)`.
- `app/(auth)/signup` + `app/(auth)/register` : champ zones, textes neutralisés.
- `app/r/[restaurantId]/my-team` + `TeamManager` : découverte par zone, éditeur de zones, création avec zone.
- `app/api/teams` (zone), `app/api/teams/join` (`teamId` ou `code`), `app/api/profile/zones` (PUT).

### Documentation
- CONTEXT.md : entrée « Zone » (distincte de « Secteur » resto, ADR 0016).
