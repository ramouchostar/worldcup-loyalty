# ADR 0078 — Le CA du jour se note à la main, d'abord en test

**Statut** : Proposé (2026-10-05) — décidé par le porteur en conversation de session. Amende
l'[ADR 0027](0027-sales-import-and-forecast.md) §3 (le CSV n'est plus la seule source des ventes de
caisse). Reste dans le cadre de l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md)
(mesurer, jamais se brancher sur la caisse) et applique l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md) (tester la
scène avant de construire).

## Contexte

Belchicken nous a demandé si Boosteats pouvait se connecter à Belpeople, leur portail de rapports de
caisse, avec l'identifiant et le mot de passe d'un restaurant. Refusé : c'est un portail fait pour des
humains (il faudrait simuler un navigateur, fragile et silencieux quand il casse), l'accès appartient
au franchiseur et pas à l'exploitant, et on garderait un mot de passe qui ouvre plus que les ventes.
Belpeople ne permet pas non plus d'exporter le rapport, donc l'import CSV de l'ADR 0027 ne sert pas.

Reste à demander le chiffre au restaurant. Les captures d'écran ont été écartées (trop compliqué pour
eux, et inutile pour un restaurant sans portail). La saisie journalière marche partout, Belchicken ou
non. Son risque est unique : qu'elle ne devienne pas une routine. C'est quelqu'un sur place, le gérant
ou le propriétaire, qui doit la tenir, et une tablette de plus finirait débranchée à côté de celles
des plateformes de livraison.

## Décision

1. **Le chiffre se demande, il ne se lit pas dans la caisse.** Une fois par jour, le chiffre
   d'affaires de la veille, TVA comprise, avec en option le nombre de tickets (seul moyen de mesurer
   la part des tickets qui passent par le programme).
2. **On teste le geste à la main avant de le construire.** Pendant 14 jours à Houba, un associé envoie
   chaque matin vers 10 h un WhatsApp « CA d'hier ? » au responsable de la caisse, relance à 15 h, et
   renvoie une réponse qui compare (mêmes jours des semaines passées, ticket moyen, semaine en cours).
   **Objectif : 10 réponses sur 14 jours ouverts.** En dessous de la moitié, on ne construit rien
   avant d'avoir compris ce qui bloque.
3. **La page `/platform/ca` sert au test** : super-admin seulement, hors du menu de la plateforme
   (le lien est gardé par l'associé qui mène le test). Elle garde le chiffre et la trace de ce qui
   s'est passé, prépare les messages à copier, et donne le verdict.
4. **Un jour noté est une vente de caisse** : il est reporté dans `restaurant_sales` (une ligne sans
   heure, qui remplace les ventes de ce jour), donc la prévision de l'ADR 0027 le lit sans changement.
   **Un jour fermé ou sans réponse n'a pas de ligne de vente** : jamais un 0 €, qui ferait baisser
   les médianes de la prévision.
5. **Si le test réussit**, le rappel s'automatise : message à 10 h au responsable nommé (WhatsApp de
   préférence, réponse par un simple chiffre), « Plus tard » qui relance à 15 h, tâche « CA d'hier »
   sur l'accueil de la console, récapitulatif du lundi au propriétaire (« 6 jours sur 7 remplis »).
   Ce sera un ADR à part, nourri des notes du test.

## Conséquences

- Nouvelle table `daily_revenue_entries` (un jour par établissement, issue du jour, heures d'envoi et
  de réponse, note) et RPC `save_daily_revenue` / `delete_daily_revenue` qui écrivent dans la même
  transaction le jour et sa vente — migration `docs/migrations/20261005-2041-ca-du-jour.sql`, RLS sans
  policy, service-role seulement. Sans la migration, `/platform/ca` affiche « table absente ».
- Règles pures et testées dans `lib/daily-revenue-model.ts` (lecture du montant avec milliers belges,
  réponse comparée, statistiques du test, verdict).
- Noter un jour remplace les ventes de ce jour, y compris celles d'un import CSV ; un import CSV
  ultérieur qui couvre ce jour reprend la main sur les ventes (même règle « remplacement par plage »).
- **Trace** : taux de réponse sur les jours ouverts, part sans relance, délai médian entre l'envoi et
  la réponse — affichés en tête de `/platform/ca`, calculés depuis la table.
- Houba est un compte de démonstration (m56) : le test se fait à la main et ne dépend pas de son
  statut, mais la version automatisée exigera de l'activer.
- Le chiffre d'affaires ne sort jamais côté membre (ADR 0007).
