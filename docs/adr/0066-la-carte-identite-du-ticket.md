# ADR 0066 — La carte d'identité du ticket

**Statut** : Accepté (2026-09-23) — **phase 1 en service** (on capte et on mesure),
phase 2 à décider sur les chiffres. Complète l'[ADR 0019](0019-receipt-key-discovery.md)
(découverte de la clé à l'onboarding), l'[ADR 0052](0052-dedoublonnage-par-empreinte-de-ticket.md)
(anti-doublon par empreinte) et l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md)
(seule la lecture serveur compte). Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

**Terrain Kraainem, 20 septembre 2026, 20:41 et 20:42.** Une cliente photographie le même
ticket deux fois — une fois de près, une fois de loin. **Deux commandes ont été validées**,
soit 735 points en trop (la moitié de son solde), corrigés à la main le 2026-09-23.

Les deux lectures, côte à côte :

| | Photo de près | Photo de loin |
|---|---|---|
| Total | 73,30 € (vrai) | **73,50 €** |
| Numéro | `2026-09-20/223/01645` (vrai) | **`2026-09-20/221/04145`** (inexistant) |
| Articles | Magnifique Beef Menu, Belkids Box… | **Wagyu Roast, Sakisoba Rice** (pas au menu) |
| Heure imprimée | non lue | non lue |

La seconde lecture n'a pas « mal lu » : elle a **inventé** des valeurs plausibles. Nos trois
protections anti-doublon (numéro, empreinte de contenu, empreinte d'image) comparent des
valeurs : quand les valeurs sont fausses, elles ne voient rien.

Mesure sur les lectures conservées (25 août → 23 septembre, Kraainem et Houba) : **l'heure de
commande est lue dans 85 à 90 % des cas** et n'est utilisée nulle part ; le canal, le numéro du
jour, le sous-total, la remise et le moyen de paiement ne sont **pas lus du tout**.

## Décision

### 1. Un ticket a une carte d'identité, pas seulement un numéro

À chaque lecture, on extrait et on conserve : date imprimée, heure de commande, canal
(« Self-order kiosk », « Intake module »…), numéro de séquence du jour (« Take away - 179 »),
sous-total, remise, moyen de paiement, articles et prix. **Jamais de donnée bancaire** : le
numéro de carte et les codes d'autorisation ne sont pas lus (ADR 0025).

### 2. L'onboarding relève la structure du ticket, pas seulement la clé

La découverte (ADR 0019) renvoie en plus un `receipt_profile` : l'heure est-elle imprimée et
où, quels canaux existent, y a-t-il un numéro du jour, un sous-total, une remise, un moyen de
paiement, quelle langue. Conservé dans `restaurant_receipt_config.receipt_profile`. C'est ce
qui permet de juger une lecture **par rapport aux tickets de cet établissement**.

### 3. Une lecture se juge, et chaque contrôle porte un nom

`lib/receipt-coherence.ts` (pur, testé sur les deux lectures réelles du 20/09) :

| Contrôle | Ce qu'il dit |
|---|---|
| `time_read` | l'heure imprimée a été lue |
| `items_match_menu` | au moins la moitié des articles ressemblent à la carte de cet établissement |
| `items_sum_matches_total` | la somme des lignes retombe sur le total (testé seulement si tout est lisible et sans remise) |
| `key_date_matches_printed` | la date du numéro est celle imprimée sur le ticket |

Un contrôle non testable (carte vide, prix manquants, remise imprimée) n'est **jamais** un échec.

### 4. Mesurer d'abord, refuser ensuite

**Phase 1 (celle-ci)** : les contrôles sont calculés et conservés (`receipt_scans.ocr_checks`,
`ocr_checks_failed`), visibles dans la console plateforme. **Rien n'est refusé.**
**Phase 2, sur les chiffres** : une lecture incohérente ne sera plus validée automatiquement ;
le client, encore au comptoir avec son ticket en main, sera invité à **reprendre la photo de
plus près** (choix du porteur : le restaurateur n'a pas le temps de trancher). Le motif nommé
expliquera enfin *pourquoi* un ticket est refusé. L'identité composite (numéro **ou** date +
heure + total) rejoindra alors l'anti-doublon.

Cet ordre est la décision principale : **on n'ajoute pas un refus qu'on n'a pas mesuré** — la
photo refusée à tort coûte un client.

## Conséquences

- Migration `20260923-1000` : huit colonnes sur `receipt_scans`, `receipt_profile` sur
  `restaurant_receipt_config`. Code tolérant à son absence.
- Le coût de lecture ne change pas (mêmes appels, prompt enrichi).
- Ce qu'on saura dans une semaine : la part de lectures qui échouent à chaque contrôle, et si
  une lecture inventée échoue toujours à `items_match_menu`. C'est ce qui décidera de la phase 2.
- Limite assumée : deux commandes réellement distinctes passées à la même minute pour le même
  montant resteront indiscernables par l'identité composite — seul le numéro les sépare.
