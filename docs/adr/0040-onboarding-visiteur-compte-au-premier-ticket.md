# ADR 0040 — Onboarding visiteur : la valeur d'abord, le compte au premier ticket

**Statut** : Accepté — implémenté (2026-08-25). Point 2 (tour de bienvenue,
`VisitorTour`) retiré par [ADR 0044](0044-retrait-tour-de-bienvenue.md) : la
carte "Ce que ce ticket peut débloquer" de la vitrine (ADR 0042/0043) affiche
désormais les mêmes cadeaux réels directement sur la page, sans modal.

## Contexte

Observation terrain (Belchicken Kraainem, 2026-08-25) : le parcours d'entrée
est trop long pour un client debout au comptoir. QR → vitrine → `/login` →
e-mail magic link (sortir de l'app, ouvrir sa boîte, revenir) → adhésion →
dashboard : 4 à 5 écrans avant la moindre valeur perçue, dont le pire au pire
moment. Chaque écran avant la valeur coûte une part importante des scans
(mesurable via l'entonnoir QR, ADR 0037).

Un mode invité complet (points en suspens sur une session anonyme) a été
écarté : risque « j'ai perdu mes points » (cookies effacés, navigation privée,
changement d'appareil), surface anti-fraude et RGPD à repenser — beaucoup de
complexité pour un gain réel faible par rapport à l'option retenue.

## Décision

**Le compte n'est demandé qu'au moment où il devient indispensable : l'envoi
du premier ticket — « pour garder tes points ».** Avant cela, tout se visite.

1. **Arrivée directe dans l'app du resto.** Un membre connecté qui rescanne le
   QR est redirigé vers son dashboard (la vitrine ne sert qu'aux visiteurs et
   aux connectés non-membres). `recordLanding` (ADR 0037) compte toujours.
2. **Tour de bienvenue visiteur** (`components/member/VisitorTour.tsx`) :
   3 écrans, montrés une fois par établissement (localStorage), passables.
   Les cadeaux cités sont les **paliers réels du resto** (`lib/visitor-tour.ts`
   lit `reward_tiers` + `menu_items` — noms seuls, jamais de coût ni d'euros,
   ADR 0007/0017) : « Gagne un {premier palier solo} », « Accumule des points —
   de quoi viser un {cadeau saver} », « Un ticket suffit ».
3. **Scan ouvert aux visiteurs.** CTA principal de la vitrine : « J'ai un
   ticket — je le scanne ». L'écran de scan (`SubmitOrderClient`) prend et
   prépare la photo normalement, la garde **sur l'appareil** (IndexedDB,
   `lib/pending-ticket.ts`, 30 min) et propose alors : « Ton ticket est
   prêt ! Connecte-toi pour l'envoyer et garder tes points » — **Google en un
   tap d'abord**, e-mail en secours. L'OCR reste authentifié (coût, abus).
4. **Reprise automatique.** Les cookies `pending_restaurant_id` +
   `pending_ticket` (même mécanique que l'existant) ramènent la session sur
   `/r/[id]/submit-order?resume=1` après login/signup/OAuth ; la photo est
   rechargée et l'analyse enchaîne. Photo absente (autre navigateur,
   expiration) → écran normal, on reprend la photo — jamais d'erreur.
5. **Adhésion automatique à l'écran de scan.** Un connecté non-membre qui
   ouvre le scan d'un resto veut soumettre un ticket ici : adhésion créée
   (adhésion libre, ADR 0015 §3 ; attribution du parrainage préservée via
   `ensureMembership`, extrait de `joinRestaurant`).

## Conséquences

- Le parcours au comptoir devient : scan QR → tour (3 taps) → photo du ticket
  → compte (1 tap Google) → ticket envoyé. La motivation maximale (ticket en
  main, points « déjà là ») porte le moment le plus coûteux (le compte).
- ADR 0034 renforcé : aucun préalable social ni administratif avant la photo.
- Entonnoir mesurable (`visitor_tour_*`, `visitor_ticket_captured`,
  `visitor_signup_started`, `visitor_ticket_resumed` — docs/tracking-plan.md)
  à comparer à `restaurant_landing_viewed` → `order_submitted` avant/après.
- Le tour retombe sur des textes génériques si le resto n'a pas de paliers
  configurés — la config des paliers devient encore plus importante.
