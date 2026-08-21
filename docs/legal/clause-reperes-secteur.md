# Clause « Repères secteur » — brouillon pour les conditions restaurateur

> **Statut : BROUILLON — à valider par un juriste avant toute commercialisation** (ADR 0029 §7).
> Cette clause est destinée aux futures conditions d'utilisation **restaurateur**
> (contrat de partenariat / CGV) — PAS aux CGU membres (`cgu.md`), qui couvrent le client final.
> Elle est la contrepartie contractuelle du plan Gratuit : tous les établissements
> contribuent aux agrégats, seuls les plans Pro les consultent.

## Proposition de texte

**Article [N] — Contribution aux statistiques sectorielles anonymisées**

1. Le Partenaire accepte que les données d'activité générées par son établissement
   sur la plateforme (volumes et montants de commandes, répartition temporelle,
   indicateurs d'engagement du programme) soient utilisées par l'Éditeur pour
   produire des **statistiques agrégées et anonymisées** à l'échelle d'un secteur
   ou du réseau (« Repères secteur »).
2. Ces statistiques sont exclusivement des **valeurs médianes ou agrégées portant
   sur au moins [N — actuellement 5] établissements**. Aucune donnée brute, aucun
   chiffre individuel et aucun élément permettant d'identifier un établissement
   précis ne sont communiqués à des tiers, y compris aux autres partenaires.
3. Cette contribution est **indissociable du service** (y compris en plan
   Gratuit) : elle conditionne l'existence même des Repères secteur, dont la
   consultation est réservée aux plans qui l'incluent.
4. Les données personnelles des clients finaux ne sont jamais concernées par cet
   article — leur traitement est régi par la politique de confidentialité et
   l'ADR 0025 (consentements granulaires, seuil d'anonymisation ≥ 20 membres).

## Points à trancher avec le juriste

- Qualification exacte (licéité de l'agrégation au regard du RGPD — les données
  d'établissement ne sont pas des données personnelles, mais les commandes
  sous-jacentes en contiennent ; cohérence avec le registre des traitements).
- Le seuil plancher contractuel ([N] établissements) vs le seuil technique
  (`SECTOR_MIN_RESTAURANTS`, lib/sector-benchmarks.ts) — les garder alignés.
- Droit de retrait ? (l'ADR 0029 le refuse — « contrepartie du gratuit » — à
  confirmer juridiquement.)
