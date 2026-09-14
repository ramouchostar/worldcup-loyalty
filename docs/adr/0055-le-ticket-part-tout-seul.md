# ADR 0055 — Le ticket part tout seul quand il est bien lu

**Statut** : Accepté (2026-09-14) — amende [ADR 0048](0048-le-gain-avant-le-compte.md) §6
(le titre cède la place à la photo côté membre aussi) et
[ADR 0040](0040-onboarding-visiteur-compte-au-premier-ticket.md) (la photo attend
sur l'appareil pour le membre aussi). Ne change rien à la validation serveur ni au
délai artificiel (**ADR 0008**), ni au dédoublonnage (**ADR 0052**). Complété par
[ADR 0056](0056-la-photo-se-prend-dans-l-app.md) : la photo se prend dans l'app, et
les messages s'affichent en haut de l'écran. §2 amendé par
[ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md) : une photo sans total ou
sans numéro se reprend avant tout récap.

## Contexte

Retour terrain du 2026-09-14 : beaucoup de tickets photographiés ne sont jamais
envoyés. Les captures d'écran d'un membre à Kraainem montrent pourquoi.

Après la photo, l'écran garde tout ce qui précédait : le logo, le titre
« Prends ton ticket en photo » en 4xl sur deux lignes, la photo jusqu'à 224 px,
puis le récap « Montant · Numéro », la carte « Prochain cadeau », et enfin
« Envoyer mon ticket ». Mesuré sur la capture (écran 360 × 800) : la zone
visible s'arrête à ~692 px, au-dessus de la barre du bas ; le bouton commence
à ~870 px. Il faut scroller de près de 200 px pour le voir.

Ce que la personne voit sans scroller, c'est sa photo et un montant : tout
indique que c'est fini. Elle ferme l'app. Le ticket est perdu, et le membre ne
l'était jamais sur l'appareil : seul le visiteur voyait sa photo gardée en
IndexedDB (ADR 0040).

L'ADR 0048 §6 avait réglé exactement ce problème côté visiteur (« un écran de
conversion dont le CTA demande de scroller ne convertit pas ») sans l'étendre au
membre.

La question de fond était pourtant ailleurs : **à quoi sert ce tap ?** Le
serveur relit lui-même chaque ticket (`/api/orders`) et n'utilise aucune donnée
OCR du client. Un montant corrigé à la main ne valide rien : l'écart avec la
relecture serveur envoie la commande en revue (`amount_mismatch`). Ce que le
récap permet vraiment, c'est de réparer le **numéro** : l'écrire quand l'OCR ne
l'a pas lu, ou vérifier une année réparée (incident Kasia, 2026-08-22). Et de
voir un doublon avant l'envoi.

## Décision

### 1. Une lecture propre part toute seule

Quand l'aperçu OCR revient avec un montant accepté (> 0, ≤ 500), un numéro lu,
une année non réparée, et que `/api/orders/precheck` ne signale pas de doublon,
le ticket est envoyé sans rien demander. La personne voit « Vérification en
cours... » (le délai 3–5 s de l'ADR 0008 est inchangé), puis l'écran de
résultat.

Un établissement sans clé fiable n'a pas de numéro à réparer (le serveur
l'ignore et envoie en revue quoi qu'il arrive) : le montant suffit.

La règle vit dans `lib/ticket-auto-send.ts` (`canAutoSend`), testée à part.

### 2. Le récap ne sert plus qu'à réparer

Il s'affiche seulement quand un humain a quelque chose à faire : numéro
illisible, année réparée, montant non lu, doublon, ou envoi refusé par le
serveur (date hors programme, erreur réseau). Dans ce cas, il doit tenir à
l'écran :

- le titre « Prends ton ticket en photo » disparaît dès que la photo est là,
  **pour tout le monde** (§6 de l'ADR 0048 étendu au membre) ;
- la photo passe en vignette, comme côté visiteur ;
- « Envoyer mon ticket » reste collé au-dessus de la barre du bas tant que le
  formulaire est à l'écran, quelle que soit la hauteur de l'écran.

### 3. La confirmation accompagne la photo

« En envoyant, tu confirmes une commande passée directement au restaurant — pas
via une plateforme de livraison » était attachée au bouton. Le geste qui envoie
est désormais la photo : la phrase passe sous « Prendre le ticket en photo »
(« En prenant la photo, tu confirmes… »). Elle reste aussi sous le bouton du
récap, quand il y en a un.

### 4. La photo attend jusqu'à la réponse du serveur

La photo est gardée sur l'appareil (IndexedDB, 24 h) pour le membre aussi. Elle
n'est effacée que quand le serveur a tranché : ticket accepté (201), doublon
(409), ou photo refusée à l'aperçu (422, ce n'est pas un ticket). Un membre qui
quitte avant retrouve « Ton ticket t'attend » sur la vitrine et sur l'écran de
scan ; en le reprenant, le ticket repart tout seul s'il est bien lu.

## Alternatives rejetées

- **Garder le tap et remonter le bouton seulement.** Règle le scroll, pas la
  croyance « la photo suffit ». Chaque tap demandé après le geste principal
  est un endroit où l'on perd des gens.
- **Supprimer le récap pour tous.** Un numéro mal lu ou absent partirait tel
  quel : revue manuelle au lieu d'une correction de deux secondes, et la boucle
  de l'incident Kasia (année fausse → refus → même photo → même refus) revient
  sans issue.

## Conséquences

- La majorité des tickets passe de deux gestes (photo, envoi) à un seul.
- La carte « Cadeau visé » du récap n'est plus vue sur une lecture propre :
  l'écran de résultat nomme déjà le cadeau obtenu.
- Mesure : l'entonnoir serveur (ADR 0051) compare `ticket_capture_opened` et
  `ticket_submitted` ; l'événement `order_submitted` porte `auto_sent` pour
  séparer les deux chemins.

### À surveiller

- **Un montant mal lu part sans relecture.** Avant, la correction du membre
  menait en revue de toute façon ; maintenant, si l'aperçu et la relecture
  serveur lisent la même erreur, la commande est validée avec ce montant. Si le
  retour terrain montre des montants faux, la réponse est un seuil de confiance
  OCR dans `canAutoSend`, pas le retour du tap pour tous.
- **Plus de retour arrière sur une lecture propre.** Un membre qui voulait
  corriger n'en a plus l'occasion avant l'envoi ; la revue admin reste le filet.
