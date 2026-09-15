# ADR 0056 — La photo du ticket se prend dans l'app

**Statut** : Accepté (2026-09-14) — complète [ADR 0055](0055-le-ticket-part-tout-seul.md)
(l'envoi automatique ne sert à rien si la photo n'arrive jamais dans la page). Ne
change rien à la préparation de l'image, à l'OCR ni à la validation (**ADR 0008**,
**0036**, **0045**). §1 amendé par
[ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md) : l'écran ticket s'ouvre
directement sur la caméra. §5 ajouté le 2026-09-15 : cadre au format ticket, affiche
repérée dans le viseur. §6 ajouté le même jour : la lampe.

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

### 5. Un cadre au format ticket, l'affiche repérée avant la photo (2026-09-15)

**Constat (Kraainem, 7-14 septembre).** Une lecture sur cinq n'était pas un ticket
mais l'affiche du programme : le client vient d'en scanner le QR et la caméra
s'ouvre alors qu'il la vise encore. Le cadre horizontal et la consigne « cadre le
total » ne disaient jamais « ton ticket de caisse ».

**Décision.**
- Le cadre prend la forme d'un ticket : étroit, vertical, bord supérieur déchiré,
  surmonté de « Ton ticket de caisse ». Une zone pointillée en bas du cadre montre
  où tombent le total et la clé de commande.
- Pas le ticket entier : sur les photos réelles, le total et la clé tiennent en bas
  du ticket, sur sa largeur. Un cadre étroit fait remplir la largeur du ticket, donc
  photographier de près (l'incident du 2026-09-02 reste la limite).
- Chrome Android : le viseur cherche le QR du programme toutes les 600 ms. Tant
  qu'il est visible (et 1,5 s après), le cadre passe au rouge, le libellé devient
  « C'est l'affiche : vise ton ticket » et le déclencheur est bloqué :
  la photo serait refusée juste après. Le QR d'avis imprimé sur les tickets ne
  déclenche rien (`isProgramQrPayload`).
- iOS : pas de détecteur ; la forme et le libellé guident seuls, le serveur refuse
  l'affiche. Le contrôle après la photo reste le filet de la galerie.

**Mesure.** `receipt_poster_seen_live` compte les affiches repérées dans le
viseur ; l'effet se lit sur les refus serveur `qr_detected` et `unreadable`
(entonnoir) et sur la part de `header_rejected` dans `receipt_scans`.

### 6. La lampe (2026-09-15)

Dans une salle sombre, la photo du ticket est illisible et part en refus. La caméra
intégrée n'avait aucun moyen d'éclairer.

- **Bouton lampe** à droite du déclencheur, **seulement** quand la caméra annonce la
  capacité `torch` (Chrome Android). Safari iOS ne l'expose pas aux pages web : pas de
  bouton, pas de faux espoir.
- **Rappel** : quand le viseur est sombre (luminosité moyenne sous 60/255, mesurée chaque
  seconde sur une vignette de 24 px) et la lampe éteinte, « Il fait sombre ? Allume la
  lampe » s'affiche et le bouton pulse.
- **Photo lampe allumée** : l'image vient du flux vidéo, pas de `takePhoto()`. Selon les
  téléphones, la prise de photo coupe la lampe continue au déclenchement ; l'image du flux
  est déjà éclairée.
- Un flux relancé (retour au premier plan) repart lampe éteinte ; une capacité annoncée
  mais refusée retire le bouton.
- Mesure : `receipt_torch_used`, une fois par ouverture.

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
