# ADR 0080 — La photo d'un refus visiteur ne se garde que si le visiteur l'accepte

**Statut** : Proposé (2026-10-07) — décisions à valider par le porteur (§ « À trancher »). Précise l'[ADR 0036](0036-receipt-scan-retention.md) §1 (« toute image passée à Vision est conservée ») : cette règle ne vaut pas pour les visiteurs sans compte, et le texte ne le disait pas. S'appuie sur l'[ADR 0045](0045-preuve-scan-avant-compte.md) §3, l'[ADR 0025](0025-gdpr-data-governance.md) (minimisation) et l'[ADR 0079](0079-chaque-refus-a-sa-cause.md) (mesures). À passer au bouclier ([ADR 0065](0065-le-bouclier-scene-trace-echos.md)) avant de coder.

## Contexte

**Scène.** Sur `/platform/scans`, le porteur voit pour un ticket refusé ce que Vision a lu (numéro, montant, motif) mais **aucune photo**. Mesuré du 2026-09-30 au 2026-10-06 (ADR 0079) : 78 scans, 26 refusés, dont **16 refus de visiteurs sans compte** — leur image n'est jamais stockée. Les 10 refus de membres ont leur photo, et regardés un par un : 7 photos inutilisables, 1 ticket déjà utilisé, **1 vrai ticket valide refusé** (clé mal lue).

**Pourquoi la photo manque.** Ce n'est pas un bug : `storeScan` ne range l'image que si `userId` existe (`lib/receipt-scans.ts`), car `receipt_scans.user_id` était `NOT NULL` à l'origine (ADR 0045 §3) et que le visiteur n'a rien accepté (pas de compte, pas de conditions). La ligne visiteur existe depuis la migration 20260907-1930, sans image.

**Ce que ça coûte.** Les refus de visiteurs sont **62 % des refus** et ce sont eux qu'on ne peut pas juger : impossible de savoir si c'est le modèle qui a mal lu (comme le ticket T237/T238) ou si la photo était mauvaise. Or la première impression d'un client, c'est ce refus. À l'inverse, la photo d'un inconnu qui n'a rien signé n'est pas un détail : un ticket peut porter une heure, un montant, parfois une carte de fidélité ou les derniers chiffres d'une carte bancaire.

## Décision proposée

### 1. Opt-in : la photo ne part que si le visiteur la propose

Sur l'écran de refus du visiteur, un bouton secondaire : **« Envoyer cette photo à l'équipe pour qu'on comprenne »**, avec une phrase claire (qui la voit, combien de temps, à quoi elle sert). Rien n'est stocké avant ce geste. Sans clic, comportement actuel : lecture conservée, image jamais.

C'est le seul réglage qui tient sans débat devant l'APD : finalité unique (comprendre un refus et corriger la lecture), consentement par un geste actif, retrait sans objet puisque la photo est vite effacée et dissociée de toute identité.

### 2. Dissociée, courte, séparée des tickets de comptes

- Chemin dédié du bucket privé : `refus-visiteurs/<restaurant>/<uuid>.<ext>` — jamais de `user_id`, jamais d'adresse IP (l'IP n'est déjà conservée que hachée, ADR 0045).
- Rétention : **7 jours** (au lieu de 30 pour les tickets de membres, ADR 0036 §3) — assez pour une revue hebdomadaire des refus, trop peu pour devenir un fonds de photos. La purge quotidienne existante (`/api/cron/purge-receipts`) balaie ce préfixe avec son propre délai ; la ligne garde la lecture et porte `purged_at`.
- Seul le super-admin voit ces photos (`/platform/scans`). Le restaurateur n'y a pas accès (ADR 0036 §4).
- Pas d'effacement « sur demande » possible puisqu'aucune identité n'est liée ; c'est dit dans la phrase du bouton et dans la page de confidentialité.

### 3. Un seul envoi, rattaché au scan refusé

Le visiteur reçoit déjà un `scan_id` opaque quand la ligne visiteur est écrite ; le bouton rappelle ce jeton avec l'image. Le serveur vérifie que le scan est bien un **refus visiteur de moins de deux heures, sans image**, puis range le fichier. Jeton absent, forgé, périmé, ou déjà utilisé : on ignore, sans rien dire de plus au visiteur. Mêmes plafonds par IP que le scan lui-même (ADR 0079 : 60/h), pour qu'on ne puisse pas remplir le bucket.

### 4. Trace

Trois compteurs sur `/platform/scans`, côte à côte : refus visiteurs · proposition affichée · photos envoyées. Si le taux d'envoi est proche de zéro, la règle n'apporte rien et on la retire ; s'il est élevé, on saura que les visiteurs veulent qu'on les aide. Un échec d'envoi se voit au visiteur (« Pas envoyé, tu peux réessayer ») et dans les données (ligne sans image, motif d'échec) — jamais silencieux.

### 5. Échos à suivre avant de coder

Texte de l'écran de refus (visiteur et membre) · page de confidentialité · ADR 0036 §1 (précisé) et 0045 §3 · `CONTEXT.md` (terme « refus visiteur ») · libellés de `/platform/scans` (« aucune image » deviendrait « pas de photo envoyée ») · la purge (deux délais) · l'export et l'effacement RGPD (rien à faire : aucune identité) · les cinq chemins qui produisent un refus (aperçu visiteur, aperçu membre, soumission, relecture, bac à sable).

## À trancher par le porteur

1. **Opt-in ou rien** (recommandé), ou conservation automatique de tous les refus visiteurs ?
2. **7 jours** (recommandé) ou 72 h ?
3. **Mesurer d'abord** : deux semaines de compteurs (§4) sans photos, pour voir si les 16 refus par semaine justifient d'y toucher ? Moins risqué, mais on garde l'aveuglement sur le cas T237 pendant ce temps.

## Conséquences

- Sans clic du visiteur, rien ne change : pas de nouveau risque, pas de nouveau stockage.
- Les refus pour lesquels le visiteur accepte deviennent jugeables ; on pourra distinguer « le modèle s'est trompé » de « photo inutilisable », et mesurer la part de chaque cause (ADR 0079).
- Une nouvelle surface : un endpoint public qui reçoit une image. Il est borné (jeton à usage unique, plafond par IP, taille et type vérifiés comme pour le scan).
- Le message de refus devra, de toute façon, dire pourquoi la photo n'a pas marché (ADR 0079) ; le bouton s'ajoute à ce message, il ne le remplace pas.

## Alternatives rejetées

**Garder toutes les photos de visiteurs 72 h, sans leur demander.** Efficace mais indéfendable : un inconnu qui n'a rien accepté, des données qu'il ne sait pas partagées. Contraire à la minimisation (ADR 0025) et au principe « le gain avant le compte » (ADR 0048), qui veut que le visiteur ne paie rien avant d'avoir vu la valeur.

**Faire créer un compte avant le scan.** Règle l'image mais détruit le parcours que l'ADR 0040 a bâti ; on perd les visiteurs qu'on cherche à gagner.

**Se passer de la photo et améliorer la lecture « à l'aveugle ».** C'est ce qu'on fait depuis le début ; le cas T237 montre que ça ne suffit pas pour trancher entre modèle et photo.
