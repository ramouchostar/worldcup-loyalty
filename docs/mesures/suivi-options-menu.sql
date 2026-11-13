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

-- 5. Descriptions des plats (ADR 0100 §7) : la part que les restaurateurs réécrivent ou vident.
-- Seuil : si plus d'un tiers des descriptions composées est retouché (même seuil que l'import du catalogue, ADR 0083),
-- la règle « d'après le nom seulement » ne fait pas gagner de temps et est à revoir.
SELECT
  SUM(descriptions_generated)                          AS composees_par_nous,
  SUM(descriptions_kept)                               AS gardees_telles_quelles,
  SUM(descriptions_edited)                             AS reecrites_par_eux,
  SUM(descriptions_cleared)                            AS videes_par_eux,
  ROUND(100.0 * (SUM(descriptions_edited) + SUM(descriptions_cleared)) / NULLIF(SUM(descriptions_generated), 0))  AS pct_retouchees
FROM menu_option_setups;

-- 6. Par famille de plats : quelles familles voient leurs descriptions réécrites ?
SELECT
  d->>'family'                                         AS famille,
  SUM((d->>'descGenerated')::int)                      AS composees,
  SUM((d->>'descKept')::int)                           AS gardees,
  SUM((d->>'descEdited')::int + (d->>'descCleared')::int)  AS retouchees,
  ROUND(100.0 * SUM((d->>'descEdited')::int + (d->>'descCleared')::int) / NULLIF(SUM((d->>'descGenerated')::int), 0))  AS pct_retouchees
FROM menu_option_setups s, jsonb_array_elements(s.detail) AS d
WHERE d ? 'descGenerated'
GROUP BY 1
ORDER BY composees DESC;

-- 7. Import du PDF (ADR 0100 §8) : la lecture est-elle bonne ? Table menu_pdf_imports (migration 20261113-2130).
-- Seuils à surveiller : moins de 2/3 des lignes rapprochées = la lecture ou le rapprochement est à revoir ; plus d'un tiers
-- des descriptions du PDF réécrites = la reprise « telle quelle » ne convient pas.
SELECT
  COUNT(*)                                                                       AS imports,
  SUM(lines_read)                                                                AS lignes_lues,
  ROUND(100.0 * SUM(matched) / NULLIF(SUM(lines_read), 0))                       AS pct_lignes_rapprochees,
  ROUND(100.0 * SUM(matched_near) / NULLIF(SUM(matched), 0))                     AS pct_rapprochements_proches,
  SUM(unmatched)                                                                 AS lignes_a_part,
  SUM(articles_without)                                                          AS plats_sans_ligne,
  ROUND(100.0 * SUM(desc_edited) / NULLIF(SUM(desc_kept) + SUM(desc_edited), 0)) AS pct_descriptions_retouchees
FROM menu_pdf_imports;

-- 8. Allergènes : combien le PDF en propose, combien le restaurateur en corrige, combien il en confirme.
-- Si plus d'un quart des listes proposées par le PDF est corrigé, la lecture des allergènes est à revoir avant d'aller plus loin.
SELECT
  SUM(allergens_proposed)                                                        AS plats_avec_allergenes_du_pdf,
  SUM(allergens_changed)                                                         AS listes_corrigees_par_eux,
  ROUND(100.0 * SUM(allergens_changed) / NULLIF(SUM(allergens_proposed), 0))     AS pct_corrigees,
  SUM(allergens_confirmed)                                                       AS plats_confirmes,
  ROUND(100.0 * SUM(allergens_confirmed) / NULLIF(SUM(rows_written), 0))         AS pct_confirmes_parmi_ecrits
FROM menu_pdf_imports;

-- 9. Coins de cuisine (ADR 0100 §9) : notre proposition d'après la famille du plat est-elle bonne ? Table menu_zone_setups
-- (migration 20261113-2300). Seuil : moins de deux tiers des propositions gardées = la table famille -> coin
-- (lib/menu-options/tickets.ts, ZONE_OF) est à revoir.
SELECT
  COUNT(*)                                                                    AS enregistrements,
  SUM(articles)                                                               AS plats,
  ROUND(AVG(zones), 1)                                                        AS coins_par_restaurant,
  SUM(suggested)                                                              AS coins_proposes,
  SUM(suggested_kept)                                                         AS gardes,
  SUM(changed)                                                                AS changes,
  SUM(cleared)                                                                AS vides,
  ROUND(100.0 * SUM(suggested_kept) / NULLIF(SUM(suggested), 0))              AS pct_gardes
FROM menu_zone_setups;

-- 10. Commandes du site refusées (ADR 0099 §7) : pourquoi ? Table site_order_refusals (migration 20261113-2330).
-- Seuil : plus d'une commande refusée sur cinq pour « choix_invalide » ou « plat_indisponible » = la page client montre des choix
-- que le serveur refuse : à corriger AVANT d'ouvrir le drapeau à un vrai restaurant.
SELECT
  restaurant_id,
  reason                                                                       AS motif,
  COUNT(*)                                                                     AS refus,
  MIN(created_at)::date                                                        AS depuis
FROM site_order_refusals
GROUP BY 1, 2
ORDER BY refus DESC;

-- 11. Commandes du site : combien, et en combien de minutes une commande est-elle « prête » ? Table site_orders.
SELECT
  restaurant_id,
  COUNT(*)                                                                     AS commandes,
  COUNT(*) FILTER (WHERE status = 'annulee')                                   AS annulees,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'annulee') / NULLIF(COUNT(*), 0)) AS pct_annulees,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ready_at - created_at)) / 60)::numeric, 1) AS minutes_mediane_avant_prete,
  COUNT(*) FILTER (WHERE status IN ('recue', 'prete') AND created_at < NOW() - INTERVAL '6 hours') AS jamais_cloturees
FROM site_orders
GROUP BY 1
ORDER BY commandes DESC;

-- 12. Purge des commandes du site (ADR 0099 §7) : des commandes d'avant la durée de conservation portent-elles encore un prénom
-- ou un téléphone ? DOIT rester à 0 (le cron nocturne les efface). Remplacer 30 par SITE_ORDER_PURGE_DAYS s'il est réglé.
SELECT
  COUNT(*)                                                                     AS commandes_qui_portent_encore_des_donnees,
  MIN(created_at)::date                                                        AS la_plus_ancienne
FROM site_orders
WHERE created_at < NOW() - INTERVAL '30 days'
  AND (phone IS NOT NULL OR first_name <> '—');
