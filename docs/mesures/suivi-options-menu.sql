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
-- La même table compte les visites de la page (voir suivi-accueil-commande.sql) : ce ne sont pas des refus.
WHERE reason NOT LIKE 'fiche_vue_%' AND reason <> 'entree_app'
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

-- 13. Import du menu par PDF ou par lien (ADR 0100 §11) : lequel est utilisé, et rend-il de quoi ranger les plats ?
-- Table menu_pdf_imports (colonnes source, categories, sauce_lists, side_lists : migration 20261117-1200).
-- Règle à surveiller : si « lien » a presque toujours 0 rubrique, la lecture des pages web ne sert à rien (essayer un autre
-- format ou retirer l'entrée) ; si une liste de sauces est reprise mais que la part « choix gardés » (requête 1) tombe,
-- la lecture se trompe de sauces.
SELECT
  source,
  COUNT(*)                                             AS imports_enregistres,
  ROUND(AVG(lines_read))                               AS lignes_lues_en_moyenne,
  ROUND(100.0 * SUM(matched) / NULLIF(SUM(lines_read), 0))  AS pct_lignes_rapprochees,
  ROUND(AVG(categories), 1)                            AS rubriques_en_moyenne,
  ROUND(AVG(sauce_lists), 1)                           AS listes_de_sauces_en_moyenne,
  ROUND(AVG(side_lists), 1)                            AS listes_d_accompagnements_en_moyenne
FROM menu_pdf_imports
GROUP BY 1
ORDER BY 2 DESC;

-- 14. Secours WhatsApp de la commande du site (ADR 0107 §10) : combien de fois la page l'a-t-elle proposé, et combien de clients
-- ont TOUCHÉ le bouton ? Table site_order_refusals (motifs `secours_propose`, `whatsapp_touche`, `message_copie`) : des compteurs,
-- aucune donnée du client. On ne voit PAS si le client a ensuite appuyé sur « Envoyer » dans WhatsApp.
-- Seuils : moins de la moitié des clients qui touchent le bouton après une proposition = le message est mal placé ou mal compris ;
-- plus d'une commande sur dix refusée pour « indisponible » ou « imprimante_hors_ligne » = le matériel ou le réseau est trop fragile
-- pour ouvrir à d'autres établissements.
SELECT
  restaurant_id,
  COUNT(*) FILTER (WHERE reason = 'secours_propose')                          AS propositions,
  COUNT(*) FILTER (WHERE reason = 'whatsapp_touche')                          AS boutons_touches,
  COUNT(*) FILTER (WHERE reason = 'message_copie')                            AS messages_copies,
  ROUND(100.0 * COUNT(*) FILTER (WHERE reason = 'whatsapp_touche')
        / NULLIF(COUNT(*) FILTER (WHERE reason = 'secours_propose'), 0))      AS pct_boutons_touches,
  COUNT(*) FILTER (WHERE reason IN ('indisponible', 'imprimante_hors_ligne')) AS commandes_refusees_panne,
  MIN(created_at)::date                                                       AS depuis
FROM site_order_refusals
WHERE reason IN ('secours_propose', 'whatsapp_touche', 'message_copie', 'indisponible', 'imprimante_hors_ligne')
GROUP BY 1
ORDER BY propositions DESC;

-- 15. L'entonnoir de la connexion de la commande du site (ADR 0108 §2) : combien de fois la page a-t-elle dû demander un compte,
-- et combien de commandes sont parties avec un compte ? Table site_order_refusals (motif `connexion_demandee`, un compteur sans
-- donnée du client) et colonne site_orders.member_id (migration 20261120-2000, à appliquer à la main).
-- Lecture : un client qui se connecte PUIS envoie compte une demande et une commande ; un client déjà connecté, une commande seule.
-- Donc (demandes - commandes_avec_compte) est une borne BASSE du nombre de clients qui ont renoncé à la connexion.
-- Seuil : si cette borne dépasse la moitié des demandes, le mur du compte est trop haut (ADR 0108 §2 : revoir le moment de la
-- connexion, ou rouvrir l'invité avec téléphone). À recalibrer avec les premières commandes réelles.
WITH demandes AS (
  SELECT restaurant_id, COUNT(*) AS n, MIN(created_at)::date AS depuis
  FROM site_order_refusals WHERE reason = 'connexion_demandee' GROUP BY 1
), commandes AS (
  SELECT restaurant_id,
         COUNT(*) FILTER (WHERE member_id IS NOT NULL) AS avec_compte,
         COUNT(*) FILTER (WHERE member_id IS NULL)     AS sans_compte
  FROM site_orders GROUP BY 1
)
SELECT
  COALESCE(d.restaurant_id, c.restaurant_id)                      AS restaurant_id,
  COALESCE(d.n, 0)                                                AS connexions_demandees,
  COALESCE(c.avec_compte, 0)                                      AS commandes_avec_compte,
  COALESCE(c.sans_compte, 0)                                      AS commandes_sans_compte,
  ROUND(100.0 * GREATEST(COALESCE(d.n, 0) - COALESCE(c.avec_compte, 0), 0)
        / NULLIF(COALESCE(d.n, 0), 0))                            AS pct_renoncements_au_moins,
  d.depuis
FROM demandes d
FULL JOIN commandes c USING (restaurant_id)
ORDER BY connexions_demandees DESC;

-- 16. Les points des commandes du site (ADR 0108 §5, migration 20261123-1000) : chaque commande retirée par un compte a-t-elle
-- rapporté ses points ? Une ligne par commande dans point_transactions (raison `site_order_points`) :
--   - creditees                  : delta > 0, les points sont dans le solde (disponibles 4 h après la remise) ;
--   - sans_point_ticket_proche   : delta = 0, le même compte avait un ticket à moins de 6 h dans ce restaurant (même repas, pas de
--                                  double compte) ;
--   - credit_manquant            : AUCUNE ligne : le crédit a échoué (cherche « credit_site_order_points » dans les journaux de la
--                                  base) ou la migration n'était pas appliquée à la remise. Doit rester à 0.
-- Seuils : credit_manquant > 0 = un bug, à corriger avant d'ouvrir à d'autres établissements ; plus d'une commande retirée sur
-- cinq « sans_point_ticket_proche » = la fenêtre de 6 h est trop large, ou les clients photographient leur ticket malgré tout.
SELECT
  so.restaurant_id,
  COUNT(*)                                                          AS commandes_retirees_avec_compte,
  COUNT(*) FILTER (WHERE pt.id IS NOT NULL AND pt.delta > 0)        AS creditees,
  COUNT(*) FILTER (WHERE pt.id IS NOT NULL AND pt.delta = 0)        AS sans_point_ticket_proche,
  COUNT(*) FILTER (WHERE pt.id IS NULL)                             AS credit_manquant,
  MIN(so.picked_up_at)::date                                        AS depuis
FROM site_orders so
LEFT JOIN point_transactions pt ON pt.site_order_id = so.id AND pt.reason = 'site_order_points'
WHERE so.status = 'retiree' AND so.member_id IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

-- 16 bis. La fuite connue du double compte (ADR 0108 §5) : des tickets signalés « Commande du site récente » que le restaurateur a
-- VALIDÉS quand même. Chacun est un repas peut-être compté deux fois (la commande du site a déjà rapporté ses points). Seuil :
-- plus de la moitié des tickets signalés qui sont validés = les restaurateurs ne lisent pas le signalement, ou le signalement est trop large.
SELECT
  restaurant_id,
  COUNT(*)                                       AS tickets_signales,
  COUNT(*) FILTER (WHERE status = 'validated')   AS valides_quand_meme,
  COUNT(*) FILTER (WHERE status = 'rejected')    AS refuses,
  COUNT(*) FILTER (WHERE status = 'pending')     AS en_attente
FROM orders
WHERE 'site_order_recent' = ANY(flag_reasons)
GROUP BY 1
ORDER BY 2 DESC;

-- 17. Le rapport de la semaine (ADR 0108 §6) : les mêmes chiffres, recalculés dans la base, à COMPARER à l'écran
-- « Rapport de la semaine » (sept jours belges, aujourd'hui compris). Un écart = l'écran ment, ou la requête : à chercher.
-- Le total est en euros : requête pour l'équipe, jamais montrée à un client (ADR 0007).
WITH debut AS (
  SELECT ((now() AT TIME ZONE 'Europe/Brussels')::date - 6)::timestamp AT TIME ZONE 'Europe/Brussels' AS depuis
)
SELECT
  so.restaurant_id,
  COUNT(*)                                                            AS recues,
  COUNT(*) FILTER (WHERE so.status = 'retiree')                       AS retirees,
  COUNT(*) FILTER (WHERE so.status = 'annulee')                       AS annulees,
  ROUND(COALESCE(SUM(so.total_cents) FILTER (WHERE so.status = 'retiree'), 0) / 100.0, 2) AS total_retirees_eur,
  ROUND(AVG(ROUND(EXTRACT(EPOCH FROM (so.ready_at - so.created_at)) / 60)) FILTER (WHERE so.ready_at >= so.created_at)) AS delai_moyen_min,
  COUNT(DISTINCT so.member_id) FILTER (WHERE m.joined_at BETWEEN so.created_at AND so.created_at + INTERVAL '5 minutes') AS nouveaux_membres
FROM site_orders so
CROSS JOIN debut
LEFT JOIN memberships m ON m.user_id = so.member_id AND m.restaurant_id = so.restaurant_id
WHERE so.created_at >= debut.depuis
GROUP BY 1
ORDER BY 2 DESC;
