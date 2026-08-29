# ADR 0044 — Retrait du tour de bienvenue visiteur (modal) de la landing

**Statut** : Accepté — amende [ADR 0040](0040-onboarding-visiteur-compte-au-premier-ticket.md) point 2

## Contexte

Retour terrain en test live après la fusion de la PR #93 (2026-08-29) : le
tour de bienvenue visiteur (`VisitorTour`, 3 écrans en modal, ADR 0040 point
2) s'affiche par-dessus la vitrine dès l'arrivée du visiteur — "Gagne un
{premier palier solo}", navigation "Suivant" / "Passer".

Ce modal date d'avant la refonte de la carte hero (ADR 0042, amendée par
ADR 0043) : à l'époque, la vitrine ne citait aucun cadeau concret et le tour
était le seul endroit où un visiteur voyait un nom de cadeau réel. Ce n'est
plus vrai depuis l'ADR 0043 : la carte "Ce que ce ticket peut débloquer",
présente directement sur la page (sans modal, sans clic), nomme déjà un
article réel par couche de récompense. Le tour est devenu redondant — un
écran de friction en plus pour répéter une information déjà visible.

## Décision

Le tour de bienvenue est retiré de la landing publique (`app/r/[restaurantId]/page.tsx`).
Son composant (`components/member/VisitorTour.tsx`) et sa source de données
(`lib/visitor-tour.ts::getTourGifts`) n'ayant plus aucun appelant, ils sont
supprimés plutôt que laissés morts dans le code.

Le reste de l'ADR 0040 est inchangé : le compte n'est toujours demandé qu'à
l'envoi du premier ticket, le scan reste ouvert aux visiteurs, la reprise
après connexion fonctionne à l'identique.

## Conséquences

### Code
- Supprimés : `components/member/VisitorTour.tsx`, `lib/visitor-tour.ts`.
- `app/r/[restaurantId]/page.tsx` : retrait de l'import et du rendu de
  `VisitorTour`, retrait du fetch `getTourGifts`.
- `docs/tracking-plan.md` : retrait de la ligne `visitor_tour_viewed` /
  `visitor_tour_completed` / `visitor_tour_skipped` (plus aucun code ne les
  émet). Les autres événements visiteur (`visitor_ticket_captured`,
  `visitor_signup_started`, `visitor_ticket_resumed`) restent inchangés —
  ils appartiennent au parcours de scan, pas au tour.

### À surveiller
- Si l'entonnoir (`restaurant_landing_viewed` → `order_submitted`) se
  dégrade après ce retrait, envisager de réintroduire une forme plus légère
  (bannière non bloquante plutôt que modal) plutôt que de restaurer le tour
  tel quel.
