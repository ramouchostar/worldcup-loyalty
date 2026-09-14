# ADR 0057 — L'écran ticket s'ouvre sur la caméra, et une photo incomplète se reprend

**Statut** : Accepté (2026-09-14) — amende [ADR 0055](0055-le-ticket-part-tout-seul.md) §2
(une photo incomplète se reprend avant tout récap) et
[ADR 0056](0056-la-photo-se-prend-dans-l-app.md) §1 (la caméra s'ouvre sans bouton
intermédiaire). Ne change rien à l'OCR, à la validation ni au délai artificiel
(**ADR 0008**). §3 et §4 amendés par [ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) :
plus de saisie à la main, et l'année réparée se reprend en photo.

## Contexte

Après l'ADR 0056, le parcours d'un membre était : bouton photo de la barre du bas →
écran ticket (logo, titre, spécimen, grand bouton « Prendre le ticket en photo ») →
caméra → photo → envoi. L'écran du milieu ne fait qu'une chose : faire taper un
second bouton photo. Retour du porteur, le 2026-09-14 : un tap sur le logo photo doit
ouvrir la caméra, directement.

Deuxième friction : quand l'OCR ne lit pas le total ou le numéro de commande, le récap
s'ouvre avec un champ vide et la consigne « entre le numéro manuellement ou laisse
vide ». La personne tape à la main ce qu'une meilleure photo aurait lu, ou envoie un
ticket incomplet qui part en revue manuelle.

Enfin, le grand bouton de la vitrine portait encore l'appareil photo du téléphone —
le chemin qu'Android ferme (ADR 0056).

## Décision

### 1. Tous les boutons ticket ouvrent la caméra

L'écran ticket s'ouvre directement sur la vue caméra : bouton rond de la barre du bas,
carte « Prendre mon ticket en photo » de l'accueil, « + Ajouter », « Soumettre ma
première commande », liens de Mon équipe et Mes cadeaux, bouton de la vitrine (qui
passe à la caméra intégrée), « Photographier un autre ticket ». Exceptions : la
reprise d'une photo en attente (`?resume=1`) et le filet « l'app a été fermée »
(ADR 0056 §3), où il y a déjà quelque chose à montrer.

Le bouton rond tapé alors qu'on est déjà sur l'écran ticket rouvre la caméra sur place.

Sans caméra intégrée disponible (vieux navigateur), l'écran reste celui d'avant, avec
son grand bouton : l'appareil photo du téléphone exige un geste.

### 2. Fermer la caméra, c'est revenir en arrière

Fermée sans photo à l'écran, la caméra ramène là où l'on était. Pendant une reprise
(une photo déjà à l'écran), elle se ferme simplement.

### 3. Une photo incomplète se reprend

Si la lecture ne donne pas le total, ou pas le numéro de commande là où l'établissement
en a un fiable, pas de récap : un message en haut dit **quoi** recadrer — « On voit mal
le total », « On voit mal le Bestelnummer », ou les deux — avec « Reprendre la photo »,
qui rouvre la caméra. Même chose quand l'aperçu ne reconnaît pas le ticket.

L'année réparée d'un numéro lu (incident Kasia) n'est pas un problème de cadrage : elle
reste une vérification au récap (ADR 0055 §2).

### 4. Jamais bloqué : saisie à la main après deux échecs

Au bout de deux photos ratées sur le même ticket, un lien « Je n'y arrive pas, saisir à
la main » apparaît à côté de « Reprendre la photo ». Il ouvre le récap avec les champs
manquants à remplir. Un ticket froissé, effacé ou mal imprimé peut toujours partir ; la
relecture serveur et la revue manuelle tranchent, comme avant.

## Alternatives rejetées

- **Garder l'écran intermédiaire.** Il n'apporte que les consignes de cadrage, que la
  vue caméra affiche déjà par-dessus l'image.
- **Recadrer sans jamais proposer la saisie.** Un ticket physiquement illisible ne
  pourrait plus jamais être envoyé : la personne perdrait ses points pour un défaut
  d'impression.
- **Proposer la saisie dès le premier échec.** C'est l'ancien récap sous un autre nom ;
  la plupart des échecs se règlent en se rapprochant.

## Conséquences

- Mesure : `receipt_reframe_requested` (`missing`, `attempt`) dit ce qui manque le plus
  souvent et combien d'essais il faut ; `receipt_manual_entry` compte ceux qui
  abandonnent la photo.
- La première ouverture demande l'accès à la caméra dès l'arrivée sur l'écran ticket,
  sans tap préalable.

### À surveiller

- **Des reprises en boucle** sur un établissement dont les tickets impriment mal : un
  `attempt` moyen élevé est un signal pour le guide de cadrage ou le prompt OCR, pas
  pour rendre la saisie plus visible.
- **Le bouton retour du navigateur** depuis la caméra quitte l'écran ticket (ADR 0056,
  à surveiller) ; c'est désormais aussi le comportement de la croix.
