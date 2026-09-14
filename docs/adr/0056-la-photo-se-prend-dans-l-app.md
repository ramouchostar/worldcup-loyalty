# ADR 0056 — La photo du ticket se prend dans l'app

**Statut** : Accepté (2026-09-14) — complète [ADR 0055](0055-le-ticket-part-tout-seul.md)
(l'envoi automatique ne sert à rien si la photo n'arrive jamais dans la page). Ne
change rien à la préparation de l'image, à l'OCR ni à la validation (**ADR 0008**,
**0036**, **0045**). §1 amendé par
[ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md) : l'écran ticket s'ouvre
directement sur la caméra.

## Contexte

Premier test terrain de l'ADR 0055, le 2026-09-14, sur un Android à Kraainem : photo
prise, aucun message, retour sur l'écran vide, ticket introuvable côté plateforme.

Les journaux de production racontent la séquence :

- 13:24:45 → 13:24:49 : l'écran ticket s'ouvre ;
- 13:25:21 → 13:25:24 : **l'app redémarre** (nouveau chargement complet, manifeste
  compris) — le temps de prendre une photo ;
- **aucun appel** à l'aperçu OCR, à l'envoi ni à l'entonnoir entre les deux.

Le bouton ouvrait l'appareil photo du téléphone (`<input capture>`). C'est une autre
app : la page passe en arrière-plan, et Android la tue quand la mémoire manque. Au
retour, la photo n'a jamais atteint la page. Rien à rattraper : ni fichier, ni
brouillon, ni trace serveur. Le phénomène ne dépend pas de l'ADR 0055, qui n'agit
qu'une fois la photo reçue ; il est vraisemblablement ancien et invisible, puisqu'il
ne laisse aucune trace.

En enquêtant, un second trou du même genre : une photo refusée avant l'envoi
(format illisible, photo de l'affiche du programme) affichait son message **sous**
les repères 1-2-3, hors écran. Même symptôme pour la personne : « aucun message ».

## Décision

### 1. La caméra s'ouvre dans la page

« Prendre le ticket en photo » et « Reprendre » ouvrent une vue caméra plein écran
dans l'app (`getUserMedia`, caméra arrière). La page reste au premier plan du début à
la fin : il n'y a plus rien à tuer.

La vue dessine le cadre de la seule zone utile (total + clé de commande, incident du
2026-09-02) et propose la galerie à côté du déclencheur. La photo est une vraie photo
quand le navigateur le permet (`ImageCapture.takePhoto`, Chrome Android), sinon une
image du flux vidéo ; elle passe ensuite par la même préparation qu'avant.

### 2. Les deux portes historiques restent le repli

Navigateur sans caméra, accès refusé, caméra occupée : la vue affiche « Ouvrir
l'appareil photo du téléphone » et « Choisir dans la galerie ». Ces boutons sont un
geste direct, seul moyen pour qu'un navigateur accepte d'ouvrir l'appareil photo ou
la galerie après l'attente d'une permission.

### 3. Filet : l'app a été fermée pendant la photo

Quand l'appareil photo du téléphone est utilisé malgré tout, l'app note l'heure juste
avant de l'ouvrir et efface la note dès que la page reprend vie (photo reçue, retour
au premier plan). Une note encore là au redémarrage suivant (moins de 5 minutes)
prouve que la page a été tuée : l'écran le dit en haut — « Ton téléphone a fermé
l'app pendant la photo » — et met la galerie en avant.

### 4. Aucun message ne demande de scroller

Refus de la photo, erreur d'envoi, doublon : un seul emplacement, **en haut de
l'écran**, sous le logo, et la page remonte d'elle-même quand un message apparaît. Le
visiteur voit aussi le refus d'une photo qui n'a pas pu être gardée (sinon il
reste devant un écran vide) ; l'échec de l'aperçu OCR sur une photo gardée reste
silencieux côté visiteur (ADR 0045).

## Alternatives rejetées

- **Filet seul, appareil photo du téléphone conservé.** Le client doit comprendre le
  message puis refaire le trajet par la galerie : un détour à chaque ticket sur les
  téléphones concernés, précisément ceux qui manquent de mémoire.
- **Reprendre la photo au retour.** Impossible : quand la page est tuée, le fichier
  n'existe nulle part côté navigateur.

## Conséquences

- Mesure : `receipt_camera_fallback` (raison `unsupported`, `denied`, `error` ou
  `app_closed`) dit combien de personnes quittent la caméra intégrée, et combien de
  fois Android ferme encore l'app.
- La première ouverture demande l'accès à la caméra (une fois par site sur Android ;
  iOS peut le redemander dans l'app installée).

### À surveiller

- **Netteté des photos.** Une image du flux vidéo (iOS) est moins nette qu'une photo.
  Si le taux de refus à l'aperçu monte, la réponse est de viser une résolution plus
  haute ou d'attendre la mise au point, pas le retour à l'appareil photo du téléphone.
- **Bouton retour Android.** Il quitte l'écran ticket au lieu de fermer la vue
  caméra ; aucune photo n'est perdue à ce stade. Pas de manipulation de l'historique :
  le routeur de Next.js recharge la page sur une entrée qu'il ne reconnaît pas — le
  bug même que cet ADR corrige.
