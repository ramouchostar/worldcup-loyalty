# ADR 0098 — Les tickets de livraison et d'Ixelles ne sont jamais acceptés

**Statut** : Proposé (2026-11-10). Décision du porteur. Complète l'[ADR 0073](0073-le-format-de-la-cle-du-ticket.md) (code d'établissement) et l'[ADR 0091](0091-l-en-tete-imprime-decide-de-l-etablissement.md) (l'en-tête décide).

## Contexte

Deux familles de tickets ne peuvent jamais compter dans le programme, mais recevaient aujourd'hui « reprends la photo » (ou, à l'aperçu, passaient) :

- **Livraison** (Uber Eats, Deliveroo, « Livraison ») : sur 60 jours, 25 scans portent ce canal, aucun n'a de clé lue (le ticket n'en imprime pas), 9 sont passés à l'aperçu du visiteur sans refus, les autres sont partis en « illisible » ou « clé manquante », avec une relecture Fable payante à chaque fois.
- **Belchicken Ixelles** (code 234, 11 lectures, en-tête « Belchicken Ixelles ») : établissement hors programme ; le message « autre établissement » ne disait pas pourquoi.

Le porteur a tranché : ils ne sont **définitivement pas acceptés**, chacun avec son message.

## Décision

1. **Livraison** : le canal imprimé lu par le modèle (`channel`) est comparé à une liste (livraison, Uber Eats, Deliveroo, Just Eat, Thuisbezorgd). « Take away » et « Collection » ne sont pas de la livraison. Refus : « Les tickets de livraison (…) ne sont pas acceptés : le programme est réservé aux commandes passées au restaurant. » Aucune relecture Fable pour un ticket de livraison.
2. **Hors programme** (Ixelles) : reconnu par l'en-tête (l'établissement désigné n'est pas actif en base) ou par le code de la clé (liste dans `lib/refused-tickets.ts`, 234). Refus : « Les tickets de {nom} ne sont pas acceptés dans ce programme. Utilise un ticket de {restaurant}. » Le nom vient de notre liste ou de la base, **jamais du texte lu sur la photo**.
3. Aucun des deux messages ne demande une nouvelle photo. Les deux routes de lecture (aperçu du visiteur et envoi du membre) appliquent les mêmes règles, avant tous les autres refus.
4. Deux nouveaux motifs d'entonnoir et de scan : `delivery_ticket` et `outside_program`.

## Conséquences

- L'[ADR 0025](0025-gdpr-data-governance.md) reste vrai pour les établissements du programme : un ticket de Houba présenté à Kraainem ne nomme toujours pas Houba. Ixelles est nommé parce qu'il est hors programme.
- Moins de lectures payantes (plus de relecture Fable pour la livraison) et plus d'aperçu « réussi » à tort pour un visiteur.
- Ajouter un autre établissement hors programme = une ligne dans `NOT_IN_PROGRAM_BY_CODE`, ou le laisser en attente en base (son en-tête suffit).
- Risque : un canal mal lu (« Livraison » sur un ticket de salle) refuserait à tort. À relire à 7 jours : nombre de `delivery_ticket` et `outside_program`, et leur part de membres qui réessaient avec un autre ticket.
