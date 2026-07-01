# ADR 0005 — Multi-établissement : déploiements séparés par restaurant_id

**Statut** : Superseded par [ADR 0015](0015-multi-restaurant-platform-pivot.md) (2026-07-01) — le pivot plateforme remplace le modèle "1 déploiement Vercel par restaurant" par un déploiement unique servant tous les établissements en libre-service. Conservé ci-dessous pour l'historique.

## Contexte

Le programme doit tourner pour 3 établissements Belchicken distincts, chacun avec ses propres CA, liens sociaux, communautés et seuils. Les 3 restaurants ont des revenus très différents — un seuil CA commun serait injuste pour les petits établissements.

## Décision

Chaque établissement dispose de son propre déploiement Vercel pointant vers le même repo GitHub, avec sa propre variable d'environnement `NEXT_PUBLIC_RESTAURANT_ID` (slug texte : `kraainem`, `houba`, `[troisième établissement à nommer]`). Toutes les tables Supabase portent une colonne `restaurant_id TEXT NOT NULL`. Toutes les requêtes filtrent sur `restaurant_id = NEXT_PUBLIC_RESTAURANT_ID`.

Les liens sociaux (`NEXT_PUBLIC_GOOGLE_MAPS_URL`, `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_TIKTOK_URL`, `NEXT_PUBLIC_FACEBOOK_URL`) sont également des variables d'environnement par déploiement.

## Alternatives rejetées

- **Sous-domaines dans un seul déploiement** : plus complexe (middleware de routing, gestion des cookies cross-subdomain), sans avantage réel au stade MVP.
- **3 projets Supabase séparés** : triple la maintenance de la base de données et des triggers.
- **Programmes partagés avec seuils CA par restaurant** : crée une expérience confuse pour les clients (score communauté élevé mais récompense bloquée localement).

## Conséquences

- Chaque déploiement Vercel est autonome et administrable séparément.
- Un admin d'un établissement ne voit jamais les données des autres.
- Ajouter un 4e établissement = créer un nouveau déploiement Vercel + configurer les env vars.
