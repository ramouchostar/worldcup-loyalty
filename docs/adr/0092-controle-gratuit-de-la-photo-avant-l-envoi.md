# ADR 0092 — Contrôle gratuit de la photo avant l'envoi

**Statut** : Proposé (2026-11-09). Complète l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) (lecture incomplète = nouvelle photo) et l'[ADR 0037](0037-qr-funnel-measurement.md) (entonnoir sans identifiant : une onzième étape).

## Contexte

Une photo noire ou très floue coûte une lecture payante (Sonnet, parfois Fable) et dix secondes d'attente pour un refus certain. On peut la voir en quelques millisecondes sur le téléphone, avant tout envoi.

Mesure du 2026-11-09 (copies locales gelées, image réduite à 640 px, variance du laplacien) : flou < 40 retient 10 des 52 photos « rien lu » (19 %) et 4 des 205 envois réussis (2 %) ; sur les 30 derniers jours, 7 des 14 « rien lu » pour 1 des 96 réussis. Une seule photo quasi noire (luminosité < 20), sans résultat. Les photos sombres de 44 à 74 livrent presque toutes leur total : non bloquées.

Ce que ce contrôle ne traite pas : la cause principale des refus (49 photos avec le total mais sans la clé, cadrage hors du numéro). Ni le flou ni la lumière ne la voient ; le message « on voit mal le numéro de commande » avec l'endroit où il est imprimé existe déjà ([ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md)).

## Décision

1. `lib/photo-quality.ts` (pur, testé) : luminosité moyenne et netteté → `ok`, `blurry` (< 40) ou `dark` (< 20).
2. L'écran ticket mesure la photo juste après son allègement, avant la lecture, pour le membre comme pour le visiteur. Photo floue ou noire : message net (« La photo est floue… ») et reprise.
3. **Jamais de piège** : le second essai de suite passe toujours, le serveur tranche. Mesure impossible (navigateur qui ne décode pas) : aucun contrôle.
4. Compté : étape d'entonnoir `photo_retake_asked`, déclarable par le navigateur (liste close, ADR 0037 §2, même fiabilité qu'un chargement de page — un événement, pas une personne).

## Conséquences

- Environ 2 % des photos arrêtées avant la lecture payante : un gain modeste, sans attente.
- Un faux positif coûte une reprise de photo, jamais un ticket perdu.
- Non mesuré, donc non construit : « ticket trop petit dans le cadre ».
- À relire à 7 jours : `photo_retake_asked` rapporté aux arrivées, puis part de ces membres qui envoient ensuite un ticket lu. Si cette part est faible, le seuil 40 est trop dur.
