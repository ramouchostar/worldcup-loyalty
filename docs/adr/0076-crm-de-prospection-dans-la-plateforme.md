# ADR 0076 — Le CRM de prospection vit dans la plateforme

**Statut** : Proposé (2026-10-03) — demande du porteur du même jour, à valider par l'associé
(offre « 2 mois Pro offerts » en particulier). Étend l'[ADR 0033](0033-console-plateforme-demo-chiffres-backlog.md) §4
(un onglet de plus dans `/platform`, huit au total). S'appuie sur l'audit de l'[ADR 0069](0069-audit-restaurant-depuis-la-plateforme.md)
et l'offre de l'[ADR 0074](0074-boosteats-outil-marketing-pas-outil-d-exploitation.md). N'amende ni l'ADR 0007
ni l'ADR 0029 : rien de ce qui est ici ne descend vers un membre. Stratégies détaillées :
[`docs/strategie/prospection-bruxelles.md`](../strategie/prospection-bruxelles.md).

## Contexte

Les associés veulent signer **5 établissements par semaine** à Bruxelles. Il n'existe aucun suivi :
qui a été contacté, quand relancer, quelle approche, combien d'audits il faut pour une signature.
L'ADR 0074 fixe la mesure qui dira si l'offre tient (« moins de 3 pilotes payants sur 10
démarchés ») — sans journal des démarches, elle est impossible à lire.

Sources vérifiées le 2026-10-03 : Google Places (Text Search) donne nom, adresse, note, avis,
téléphone et site d'un établissement — jamais l'e-mail ni le gérant. Le gérant se lit au registre
public des entreprises (BCE, kbopub), l'e-mail sur le site ou la page de l'établissement. Une
recherche web seule, sans Places, a donné en moyenne 10 fiches exploitables par zone de trois
communes, la moitié sans téléphone.

## Décision

### 1. Un onglet CRM dans `/platform`, pas un outil à côté

`/platform/crm`, super-admin uniquement (garde du layout + contrôle sur la page et chaque Server
Action). Même raison que le backlog (ADR 0033 §3) : un Trello ou un tableur se désynchronise du
produit, et le CRM doit lancer l'audit et retrouver l'établissement inscrit.

### 2. Deux tables, un journal qui fait foi

- `crm_prospects` : coordonnées publiques, gérant, fiche Google, stratégie, offre, message
  d'approche, statut, prochaine action, motif de perte, `do_not_contact`, audit et établissement reliés.
- `crm_prospect_events` : chaque changement de statut, appel, WhatsApp, e-mail, visite, note.

Les compteurs de la semaine (contactés, RDV audit, audits présentés, signés) et les **taux de
conversion** se calculent **depuis le journal**, jamais saisis. Entonnoir :
à qualifier → à contacter → contacté → RDV audit → audit présenté → signé (ou perdu, avec motif).

### 3. Quatre stratégies, deux offres

| Stratégie | Offre |
|---|---|
| Pilier du quartier | Démarrer gratuitement |
| Réputation à reprendre | Démarrer gratuitement |
| Jeune adresse qui veut décoller | 2 mois Pro offerts (place pilote) |
| Enseigne en croissance (2–5 sites ou dépendante de la livraison) | 2 mois Pro offerts (place pilote) |

La stratégie est **suggérée** par une règle pure (`suggestStrategy`, `lib/crm-model.ts`, testée) et
modifiable à la main. Les deux mois Pro sont une **place pilote** livrée en partie à la main tant
que le Pro n'est pas construit (ADR 0074 §7) : jamais présentés comme une fonction disponible.
Au plus 3 nouvelles places pilotes Pro par semaine.

### 4. L'objectif se dimensionne avec des taux réels

`weeklyPlan` déduit les contacts, RDV et audits nécessaires de l'objectif (5 signés). Taux de
départ : 25 % contact → RDV, 80 % RDV → audit, 50 % audit → signé (soit 52 contacts par semaine).
Chaque taux est remplacé par le taux mesuré dès 10 prospects observés à l'étape, et l'écran dit
lequel est une hypothèse.

### 5. D'où viennent les fiches

- **Import** d'une liste préparée (JSON collé dans la console, `normalizeProspect` : rien n'est
  deviné, un e-mail ou un lien illisible reste vide, code postal hors des 19 communes refusé).
- **« Trouver sur Google Maps »** : Text Search dans le rectangle de Bruxelles avec la clé serveur
  (`GOOGLE_PLACES_API_KEY`, ADR 0069 §4), fiches ajoutées « à qualifier ». Écartées et **comptées par
  motif** : chaînes et franchises (dont Belchicken, traité par son siège), hors Bruxelles, type hors
  cible, moins de 50 avis.
- **« Relier la fiche Google »** sur une fiche : rafraîchit note et avis, complète téléphone et site
  sans écraser une saisie.

### 6. Données personnelles

Prospection B2B sur intérêt légitime : seulement ce que l'établissement publie et le gérant inscrit
au registre public, chaque contact avec sa source. Jamais de recherche de numéro ou d'adresse
personnelle. Tables en RLS **sans policy** (service-role). **Le dépôt est public : aucune donnée de
prospect n'est écrite dans le code ni dans une migration** — elles s'importent depuis la console.
Droit d'opposition : `do_not_contact`. Aucun envoi automatique vers un prospect : les liens
WhatsApp et e-mail ouvrent un message prérempli, envoyé à la main.

## Conséquences

- Migration `docs/migrations/20261003-0020-crm-prospection.sql` à appliquer ; sans elle l'onglet
  affiche « tables absentes » (fail-open, rien d'autre n'en dépend).
- `/platform` passe à huit onglets (ADR 0033 §4, CLAUDE.md).
- Le coût Google d'une recherche (Text Search, niveau Enterprise) est un appel par clic ; il n'est
  pas encore compté en base — à ajouter si les recherches dépassent quelques dizaines par semaine.

## Mesures (ce qui dira que c'est faux)

- **Taux audit présenté → signé** sous 30 % après 20 audits : l'audit ne convainc pas, revoir le
  rapport ou l'offre, pas le volume d'appels.
- **Taux contact → RDV** sous 10 % après 50 contacts : le message ou le canal ne marche pas.
- **Signés en Pro offert qui passent payants à J+60** : sous 1 sur 3, l'offre Pro offerte coûte du
  temps humain sans revenu — la retirer au profit du Gratuit.
- **Motifs de perte** : si un motif dépasse 40 % des pertes, il devient un chantier produit.

## Alternatives rejetées

- **HubSpot / Pipedrive / tableur** : gratuits ou peu chers, mais sans lien avec l'audit, les
  établissements inscrits ni le groupe témoin ; et une copie de plus des données de contact.
- **Seed des 50 premières fiches dans une migration** : le dépôt est public.
- **Envoi d'e-mails de prospection en séquence** : risque de spam et de plainte RGPD ; un message
  personnel, envoyé à la main après un constat sur son restaurant, convertit mieux.
