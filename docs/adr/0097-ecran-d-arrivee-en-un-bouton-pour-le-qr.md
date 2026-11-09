# ADR 0097 — Écran d'arrivée en un seul bouton pour le QR imprimé

**Statut** : Proposé (2026-11-10). Applique l'étape 3 du tunnel cible. Complète l'[ADR 0057](0057-l-ecran-ticket-s-ouvre-sur-la-camera.md) (l'écran ticket s'ouvre sur la caméra) et l'[ADR 0040](0040-onboarding-visiteur-compte-au-premier-ticket.md) ; s'appuie sur la mesure de l'[ADR 0094](0094-camera-ouverte-et-resultat-vu.md).

## Contexte

Quelqu'un qui scanne l'affiche au comptoir a son ticket en main. La vitrine actuelle lui montre un titre, le bouton « Prendre mon ticket en photo », l'offre, « Se connecter », le Top 5 et un pied de page. Pour le tunnel cible, l'arrivée doit être un seul geste.

Décisions du porteur (2026-11-10) : l'écran en un bouton ne vaut **que pour les arrivées par le QR imprimé** ; un petit lien « Déjà membre ? Se connecter » reste tout en bas (un membre déconnecté ne doit jamais rester dehors) ; une seule ligne d'offre sous le bouton (le détail vient après la lecture) ; le Top 5 et le pied de page sont retirés de cet écran mais restent sur la vitrine complète, la page classement et l'app. Maquette validée le 2026-11-10.

## Décision

1. Drapeau par établissement `restaurants.arrival_one_button`, **éteint par défaut** (migration `20261110-1000`). Colonne absente ou panne : éteint.
2. L'écran n'apparaît que si : drapeau allumé, `utm_source=qr_code`, visiteur non connecté. Tout le reste voit la vitrine complète, inchangée.
3. Toute la surface est un lien vers l'écran ticket, qui ouvre la caméra comme aujourd'hui. La ligne d'offre est le cadeau d'accueil (« X offert pour ton premier ticket »), sinon « Des points à chaque ticket », sinon rien.
4. Test sur un seul établissement, une semaine, puis comparaison avant / après (`docs/mesures/suivi-arrivee-un-bouton.sql`) : arrivées par QR → caméra ouverte → photo prise → résultat vu.

## Conséquences

- Pas de A/B : sans identifiant d'appareil (ADR 0037), seule la comparaison avant / après sur le même établissement est possible, à lire avec prudence.
- Retour immédiat à la vitrine habituelle en éteignant le drapeau, sans déploiement.
- `restaurant_landing_viewed` porte `variant: "one_button"` pour GA4 (aveugle sans consentement) ; la mesure de référence est l'entonnoir serveur.
- Le rendu n'a pas été vu dans un navigateur à la rédaction : à regarder sur un vrai téléphone, iPhone compris, avant d'allumer le drapeau.
