# ADR 0096 — Compter les refus par famille de téléphone

**Statut** : Proposé (2026-11-10). Complète l'[ADR 0093](0093-lecture-tolerante-et-origine-des-arrivees.md) (l'agent utilisateur est lu, classé dans une liste close, puis jeté) et l'[ADR 0037](0037-qr-funnel-measurement.md).

## Contexte

Le contrôle « photo du QR de l'affiche » sur le téléphone utilise `BarcodeDetector`, que seul Chrome Android possède. Sur iPhone la photo part au serveur : lecture payante et plusieurs secondes d'attente pour un refus certain. Un décodeur de QR en JavaScript réglerait cela, mais il ajoute une bibliothèque au projet. Avant de décider, il manque un chiffre : combien de refus « QR de l'affiche » viennent d'un iPhone ? (9 refus sur 88 en 14 jours viennent du QR de l'affiche, sans séparation par téléphone.)

## Décision

Chaque scan porte dans `receipt_scans.ocr_trace` la famille de téléphone du client, `ios`, `android` ou `autre`, déduite de l'agent utilisateur puis jetée. Aucune migration (la trace est du JSON). Les requêtes de lecture sont dans `docs/mesures/suivi-refus-par-telephone.sql`, avec une règle de décision : au-delà d'environ 1 % des scans iPhone, ou 10 refus par semaine, le décodeur vaut le coup.

## Conséquences

- Aucun changement pour le client.
- Les scans d'avant la mise en service n'ont pas de famille de téléphone.
- L'iPad en mode « ordinateur » se déclare comme un Mac : il est classé `autre`. Écart assumé, la mesure vise les iPhone.
