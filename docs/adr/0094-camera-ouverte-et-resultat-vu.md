# ADR 0094 — Deux étages de plus à l'entonnoir : caméra ouverte, résultat vu

**Statut** : Proposé (2026-11-10). Complète l'[ADR 0037](0037-qr-funnel-measurement.md) (entonnoir serveur, étapes déclarables par le navigateur) et l'[ADR 0092](0092-controle-gratuit-de-la-photo-avant-l-envoi.md).

## Contexte

Pour juger le tunnel cible « arrivée → caméra → photo → résultat → inscription », deux étages manquaient. `ticket_capture_opened` est émis **après** la photo (son nom trompe) : on ne voyait donc pas combien d'arrivées ouvrent la caméra, ni combien de clients voient leur résultat.

## Décision

1. `camera_open` : émis quand la caméra s'ouvre, intégrée ou celle du téléphone, avant la photo.
2. `result_view` : émis quand le client voit son résultat : « Ton ticket est prêt » pour le visiteur, la confirmation d'envoi pour le membre.
3. Les deux sont déclarables par le navigateur (liste close, ADR 0037 §2), sans identifiant d'appareil ni de session : ce sont des **événements**, pas des personnes.
4. Les noms existants ne sont pas changés (l'historique est indexé dessus). Correspondance avec les événements du brief :

| Brief | Étape en base |
|---|---|
| `landing_view` | `qr_landing` |
| `camera_open` | `camera_open` (nouveau) |
| `photo_taken` / `photo_sent` | `ticket_capture_opened` / `ticket_submitted` |
| `photo_rejected_blur` | `photo_retake_asked` (ADR 0092) |
| `photo_rejected_qr` | `ticket_rejected` motif `qr_detected` |
| `result_view` | `result_view` (nouveau) |
| `cta_save_tap` | `signup_started` |
| `signup_done` | `signup_completed` |

## Conséquences

- Le tableau d'entonnoir de `/platform/scans` passe à treize étages ; les taux des étages existants ne changent pas.
- `camera_open` compte une ouverture, pas une personne : un client qui rouvre la caméra compte deux fois.
- Les rappels J+1 et l'identifiant d'appareil du brief restent hors de ce chantier (ADR 0037, 0025, 0045 : décision à prendre).
