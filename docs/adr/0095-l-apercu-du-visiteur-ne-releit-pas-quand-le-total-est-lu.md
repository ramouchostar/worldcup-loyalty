# ADR 0095 — L'aperçu du visiteur ne relit pas quand le total est lu

**Statut** : Proposé (2026-11-10). Précise l'[ADR 0072](0072-sonnet-lit-fable-relit.md) (Fable relit si la lecture est incomplète) et l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) ; suite des décisions du tunnel cible du 2026-11-10 (compte après lecture gardé, gain dès la première lecture, pas de chiffre provisoire).

## Contexte

Sur 30 jours, 51 des 181 scans de visiteurs (28 %) ont attendu une relecture de Fable : 6,7 s en médiane, 12,9 s pour 9 sur 10, 15,9 s au pire. Dans les 51 cas, le total était déjà lu au premier passage ; la relecture a comblé une clé 11 fois et rien 40 fois.

Or l'aperçu du visiteur ne montre que le total, le cadeau d'accueil et les points. Sa clé n'est jamais utilisée : la vraie lecture, qui crée la commande, a lieu à l'envoi de la photo, après l'inscription. Attendre Fable pour une clé que l'aperçu n'emploie pas est une attente sans effet.

## Décision

Dans l'aperçu (`/api/orders/parse-receipt`), pas de relecture quand le premier passage a lu le **total** et reconnu le **ticket** (en-tête reconnu ou clé lue) sans écart de clé. Le visiteur voit son gain dès la lecture de Sonnet.

Inchangé :
- le total absent, ou le ticket non reconnu (ni en-tête ni clé) : Fable relit comme avant ;
- l'envoi du membre et la lecture qui crée la commande : la règle de l'ADR 0072 s'applique telle quelle, car la clé est exigée pour créer la commande.

Ce n'est pas une relecture « en arrière-plan » : l'aperçu n'est pas conservé, il n'y a rien à compléter après coup.

## Trace

`ocr_trace.rescue_skipped = "preview_enough"` marque chaque relecture évitée. À 7 jours : leur nombre, le gain de durée du visiteur, et surtout la part de ces visiteurs dont la vraie lecture, à l'envoi, a ensuite abouti. Si elle est plus faible qu'avant, la règle est trop large.

## Conséquences

- Le scan d'aperçu d'un visiteur enregistre plus souvent « total lu, clé non lue » : les chiffres de clé lue des visiteurs baissent sans que la qualité baisse (la clé n'était pas utilisée).
- Gain attendu : environ 17 % des scans de visiteurs (30 sur 181) gagnent 7 à 13 s. Rien ne change pour les membres.
