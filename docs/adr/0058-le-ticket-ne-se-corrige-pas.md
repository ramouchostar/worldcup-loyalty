# ADR 0058 — Le ticket ne se corrige pas : seule la lecture du serveur compte

**Statut** : Accepté (2026-09-14) — amende [ADR 0008](0008-auto-validation-whatsapp-bot.md)
(l'OCR serveur n'est plus seulement la source du flagging : c'est la source des
valeurs), [ADR 0019](0019-receipt-key-discovery.md) (plus de clé saisie ni de
chemin « numéro illisible » pour un établissement à clé fiable),
[ADR 0055](0055-le-ticket-part-tout-seul.md) §2 (le récap disparaît) et
[ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md) §3-§4 (plus de saisie à la
main ; l'année réparée se reprend en photo).

## Contexte

Demande du porteur, le 2026-09-14 : retirer la possibilité de modifier le montant ou
le Bestelnummer, pour éviter la fraude.

Retirer les boutons « Modifier » ne suffisait pas. `/api/orders` créditait le montant
**envoyé par le téléphone** — points, cadeau, CA programme — et construisait la clé
anti-doublon avec le numéro **envoyé par le téléphone**. La relecture serveur ne servait
qu'à lever un drapeau (`amount_mismatch` au-delà de 5 %, `ocr_failed`). La route
acceptait même, par un chemin JSON « outils admin » sans plus aucun appelant, un montant
et un numéro **sans photo**. N'importe qui d'authentifié pouvait donc :

- gonfler un montant de moins de 5 % sans aucun drapeau ;
- changer un chiffre du numéro pour passer sous la clé anti-doublon (l'empreinte de
  l'ADR 0052 en rattrape une partie, pas tout) ;
- envoyer un « ticket » sans photo.

## Décision

### 1. Le serveur n'utilise que sa propre lecture

`/api/orders` n'accepte qu'une photo (et le jeton du scan, ADR 0036). Tout champ
`amount` ou `order_number` envoyé est ignoré. Le montant crédité et la clé de commande
sont ceux que l'OCR serveur lit sur la photo. Le chemin JSON est supprimé.

Conséquences sur le flagging : `amount_mismatch`, `ocr_failed` et `no_receipt`
disparaissent (le montant **est** la lecture, la photo et la lecture sont obligatoires).
Les libellés restent mappés côté admin pour l'historique.

### 2. Une lecture incomplète ne crée rien

Si la relecture serveur ne trouve pas le total, ou — pour un établissement à clé
fiable — pas la clé, ou une clé dont l'année a dû être réparée, ou une date de clé
impossible : aucune commande n'est créée. La réponse est un refus « reprends la
photo » qui dit quoi manque (`missing`). Lecture impossible (panne de l'OCR) : on
demande de réessayer, rien n'est mis en revue sur des valeurs non lues.

### 3. Aucune saisie côté membre

Plus de récap, plus de « Modifier », plus de saisie à la main après deux échecs
(ADR 0057 §4). La seule façon de corriger un ticket, c'est une nouvelle photo. Un
ticket physiquement illisible ne peut pas être envoyé : c'est le choix du porteur,
entre ne jamais bloquer et ne jamais laisser taper.

L'année réparée d'un Bestelnummer (incident Kasia) n'ouvre plus de vérification : elle
demande une nouvelle photo, comme un numéro absent.

## Alternatives rejetées

- **Masquer les boutons, garder le serveur tel quel.** La fraude passe par la route,
  pas par l'écran.
- **Envoi en vérification sans saisie** (le restaurateur lit la photo et encode les
  valeurs). Écarté par le porteur : ajoute une saisie côté console et une file à
  traiter ; le terrain dira s'il faut y revenir.
- **Saisie à la main mais toujours en revue.** Garde un champ libre côté client et
  transfère la charge au restaurateur, qui ne peut aujourd'hui que valider ou refuser.

## Conséquences

- La relecture serveur devient critique : sa panne bloque l'envoi (message « réessaie »)
  au lieu de laisser passer en revue.
- Un ticket mal imprimé ou abîmé ne rapporte rien. À suivre avec
  `receipt_reframe_requested` (`missing`, `attempt`) : des essais répétés sur un même
  établissement signalent un problème de tickets ou de guide de cadrage.
- Les points annoncés à l'écran de succès viennent encore de la lecture de l'aperçu ;
  en cas d'écart avec la relecture serveur, c'est le serveur qui crédite.
