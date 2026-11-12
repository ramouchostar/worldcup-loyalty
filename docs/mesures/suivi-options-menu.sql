-- Suivi de l'écran « Options de mes plats » (ADR 0100, ADR 0065). À lancer en lecture seule dans l'éditeur SQL de Supabase.
-- Table : menu_option_setups (migration 20261112-0417). Un enregistrement = une ligne, un groupe de plats = un objet de `detail`.
--
-- La règle à surveiller : « nos propositions de choix, par famille de plats, sont bonnes ». Si la part des choix gardés
-- tombe sous les deux tiers pour une famille, ses propositions sont à revoir (lib/menu-options/packs.ts) ou la famille
-- passe de « forte » à « faible » (lib/menu-options/families.ts).

-- 1. Par famille : la part des choix proposés que les restaurateurs GARDENT, les lignes qu'ils changent par groupe.
SELECT
  d->>'family'                                         AS famille,
  d->>'strength'                                       AS confiance,
  COUNT(*)                                             AS groupes_de_plats,
  SUM((d->>'articles')::int)                           AS plats,
  SUM((d->>'proposed')::int)                           AS choix_proposes,
  SUM((d->>'kept')::int)                               AS choix_gardes,
  ROUND(100.0 * SUM((d->>'kept')::int) / NULLIF(SUM((d->>'proposed')::int), 0))  AS pct_gardes,
  ROUND(AVG((d->>'edits')::int), 1)                    AS lignes_changees_par_groupe,
  SUM((d->>'added')::int)                              AS choix_ajoutes_par_eux
FROM menu_option_setups s, jsonb_array_elements(s.detail) AS d
GROUP BY 1, 2
ORDER BY groupes_de_plats DESC;

-- 2. Par enregistrement : combien de plats rangés d'eux-mêmes, combien restent à ranger à la main.
SELECT
  restaurant_id,
  created_at::date                                     AS jour,
  articles_total, lots_total, lots_saved, unplaced,
  ROUND(100.0 * (articles_total - unplaced) / NULLIF(articles_total, 0))  AS pct_plats_ranges_par_nous,
  suggested, suggested_kept, dishes_added, merges, splits,
  prices_set
FROM menu_option_setups
ORDER BY created_at DESC
LIMIT 50;

-- 3. Les plats que nous proposons « avec » un groupe (paninis avec les durums) : gardés ou retirés ?
SELECT
  SUM(suggested)                                       AS plats_proposes,
  SUM(suggested_kept)                                  AS gardes,
  ROUND(100.0 * SUM(suggested_kept) / NULLIF(SUM(suggested), 0))  AS pct_gardes
FROM menu_option_setups;

-- 4. Combien de groupes à valider par restaurant, à comparer à la médiane de 3 à 4 mesurée sur le corpus.
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY lots_total)  AS mediane_groupes,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY articles_total) AS mediane_plats
FROM menu_option_setups;
