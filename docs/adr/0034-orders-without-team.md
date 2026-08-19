# ADR 0034 — Envoyer un ticket sans équipe

**Statut** : Accepté (2026-08-19). Amende l'**ADR 0014 §1** (l'équipe conditionnait la participation) et complète l'**ADR 0031** (communautés déclarées). Ne change rien aux **ADR 0006** (3 couches), **0007** (pas d'euros côté client), **0012** et **0017** (protections financières).

## Contexte

Le programme est en test à Belchicken Kraainem. Sur les 18-19/08/2026, la base montre : **6 membres inscrits, 6 scans OCR facturés, 0 commande enregistrée**. Neuf membres sur treize n'ont aucune équipe.

L'enchaînement était le suivant :

1. L'établissement n'a déclaré **aucune communauté** (`team_suggestions` vide, m54) ;
2. sans suggestion, l'onboarding ne pose jamais la question d'équipe (`hasTeamPrompt` est faux quand la liste est vide) ;
3. sans équipe, `POST /api/orders` refusait la soumission — « Tu dois choisir une équipe avant de soumettre une commande » ;
4. ce refus intervenait **après** l'appel Claude Vision (facturé) et **avant** l'upload : aucune trace nulle part. Ni commande, ni fichier, ni ligne dans la file de validation.

Le restaurateur voyait ses clients scanner et concluait que les tickets attendaient d'être validés ; la console était vide, et elle disait vrai.

Le défaut de fond n'est pas l'oubli de déclarer des communautés — c'est qu'**une configuration absente côté restaurateur coupait entièrement le parcours client**, silencieusement. Le ticket est l'acte central du programme ; il ne peut pas dépendre d'un préalable social.

## Décision

### 1. L'équipe n'est plus un préalable à l'envoi d'un ticket

`orders.team_id` devient nullable (m57). Le membre doit avoir **rejoint l'établissement** (l'adhésion `memberships` porte le lien membre ↔ resto, et reste exigée) mais plus une équipe.

### 2. Sans équipe : la couche 1 seule

Le palier solo (ADR 0006 couche 1) est dû à tout membre — c'est sa dépense qui le déclenche, personne d'autre. Les couches 2 (bonus communautaire) et 3 (palier d'équipe) sont des cadeaux **d'équipe** : elles supposent un score à comparer et une dépense collective à qui les facturer (couverture d'équipe, ADR 0017). Sans équipe, elles ne sont pas servies — pas par punition, par absence d'objet.

Elles reprennent au premier « oui » sur une communauté, sans rien de particulier à faire.

### 3. Chaque commande compte une fois, pour l'équipe du moment

Trois règles, complémentaires (m57) :

| Situation | Effet sur le score d'équipe |
|---|---|
| Validée alors que le membre a une équipe | Créditée à cette équipe |
| Validée alors qu'il n'en a pas | Créditée à personne |
| Le membre rejoint sa première équipe | Ses commandes **déjà validées** suivent |

L'équipe est résolue **à la validation**, pas à la soumission : un ticket envoyé sans équipe, puis validé depuis la file admin après que le membre en a rejoint une, compte pour cette équipe — sinon il ne compterait nulle part. La reprise d'historique à la première adhésion aligne ce chemin sur celui du **changement** d'équipe, qui transférait déjà toute la dépense du membre depuis m27.

Les trois règles ne se recouvrent jamais : la reprise ne voit que les commandes déjà validées, la résolution à la validation ne concerne que celles qui ne l'étaient pas encore.

### 4. Le membre est invité à rejoindre une équipe, jamais bloqué

L'écran de succès d'une soumission sans équipe ne promet pas de score communautaire (il n'y en a pas) et propose « Rejoindre une équipe ». La question d'équipe de l'ADR 0031 reste le canal principal ; elle redevient ce qu'elle aurait toujours dû être : une **incitation**, pas un péage.

## Conséquences

- Un établissement qui n'a pas déclaré ses communautés encaisse quand même les tickets de ses clients. Le programme démarre dégradé (couche 1 seule) au lieu de ne pas démarrer.
- Déclarer ses communautés reste fortement rentable pour le restaurateur : c'est ce qui active les couches 2 et 3, donc l'effet d'entraînement collectif. L'incitation passe de la contrainte à la valeur.
- Un cadeau de couche 1 est distribué à des membres sans équipe : le plafond de budget (ADR 0012) et le plafond par palier (ADR 0017) s'appliquent inchangés — c'est déjà une dépense individuelle bornée par le seuil.
- Le classement (ADR 0010) ignore ces commandes tant que le membre n'a pas d'équipe. C'est cohérent avec l'affichage : on ne montre pas un score qui n'existe pas.
- Côté console, une commande sans équipe s'affiche avec un avatar neutre. Aucune donnée nouvelle n'est exposée (ADR 0025).

## Alternatives écartées

- **Créer une équipe « Sans équipe » par établissement** — un fourre-tout qui prendrait la tête du classement par le nombre, viderait les couches 2 et 3 de leur sens (`membres × dépense` sur un agrégat qui n'est pas une communauté) et rendrait le premier « oui » moins attractif.
- **Rattacher la commande à l'équipe seulement plus tard, sans reprise d'historique** — le membre qui a scanné trois tickets avant de rejoindre verrait sa dépense disparaître au moment même où il s'engage. Exactement le contraire du signal recherché.
- **Bloquer plus tôt (garde sur la page de soumission)** — corrige la perte d'OCR facturé mais laisse le parcours coupé : le client ne peut toujours pas participer. Ce n'était le bon correctif que si l'équipe restait obligatoire.
- **Rendre obligatoire la déclaration de communautés à l'onboarding restaurateur** — déplace le point de rupture sans le supprimer (un resto peut déclarer n'importe quoi pour passer l'étape), et ne répare pas les établissements déjà en ligne.
