-- Suivi de l'accueil de l'espace de commande (ADR 0108 §4, ADR 0109 §3, ADR 0065). À lancer en lecture seule dans
-- l'éditeur SQL de Supabase. Aucune donnée du client : seulement des compteurs, dans site_order_refusals (migration
-- 20261113-2330), à côté des refus.
--
--   fiche_vue_ouvert:<source> / fiche_vue_ferme:<source>
--       une visite à qui la page a dit « ouvert » ou « fermé ». Sources : google (la fiche), saisi (le restaurant montre
--       les siens), repli (la fiche ne dit rien ou ne répond pas : les siens), fermeture (jour fermé par le restaurant) ;
--   fiche_vue_inconnu:<cause>                  : une visite sans horaires, donc SANS commande possible. Causes :
--       pas_de_fiche (aucun google_place_id), places_absent (clé GOOGLE_PLACES_API_KEY vide),
--       lecture_impossible (Google ne répond pas ou refuse), sans_horaires (la fiche n'en donne pas) ;
--   ferme / horaires_inconnus                  : un envoi REFUSÉ par le serveur ;
--   entree_app                                 : une arrivée par le bloc « Commander à emporter » de l'app.
--
-- La requête 10 de suivi-options-menu.sql (« refus par motif ») montre aussi ces compteurs : les lignes « fiche_vue_… » et
-- « entree_app » n'y sont pas des refus.

-- A. Ce que voient les visites, par établissement (28 derniers jours).
-- Seuil : UNE SEULE ligne « inconnu » chez un établissement ouvert aux commandes est à traiter le jour même (personne ne
-- peut commander). « pas_de_fiche » ou « places_absent » : réglage à faire avant d'ouvrir le drapeau.
SELECT
  restaurant_id,
  reason                                                                       AS ce_que_la_page_a_dit,
  COUNT(*)                                                                     AS visites,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY restaurant_id))    AS pct,
  MAX(created_at)                                                              AS derniere_fois
FROM site_order_refusals
WHERE reason LIKE 'fiche_vue_%' AND created_at >= NOW() - INTERVAL '28 days'
GROUP BY 1, 2
ORDER BY 1, visites DESC;

-- B. « Fermé » aux heures où l'on mange : les horaires montrés sont-ils les bons ?
-- Seuil : à une heure où le restaurant sert, plus d'une visite sur cinq lit « fermé » = horaires (fiche ou saisis, voir A)
-- à vérifier avec le restaurateur, ou calcul faux (lib/site-orders/hours.ts).
SELECT
  restaurant_id,
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Brussels')::int            AS heure_belge,
  COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_ouvert%')                      AS ouvert,
  COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_ferme%')                       AS ferme,
  COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_inconnu%')                     AS inconnu
FROM site_order_refusals
WHERE reason LIKE 'fiche_vue_%' AND created_at >= NOW() - INTERVAL '28 days'
GROUP BY 1, 2
ORDER BY 1, 2;

-- C. Les envois refusés par les horaires, à comparer aux commandes reçues.
-- La page bloque déjà l'envoi quand elle sait que c'est fermé : un refus ici veut dire que la page ne le savait pas
-- (fermeture passée entre-temps, retour de connexion, fiche illisible au chargement).
-- Seuil : plus d'un refus pour vingt commandes = la page et le serveur ne se disent pas la même chose, à chercher.
WITH refus AS (
  SELECT restaurant_id,
         COUNT(*) FILTER (WHERE reason = 'ferme')              AS refus_ferme,
         COUNT(*) FILTER (WHERE reason = 'horaires_inconnus')  AS refus_inconnus
  FROM site_order_refusals
  WHERE reason IN ('ferme', 'horaires_inconnus') AND created_at >= NOW() - INTERVAL '28 days'
  GROUP BY 1
), commandes AS (
  SELECT restaurant_id, COUNT(*) AS recues
  FROM site_orders WHERE created_at >= NOW() - INTERVAL '28 days' GROUP BY 1
)
SELECT
  COALESCE(r.restaurant_id, c.restaurant_id)                                   AS restaurant_id,
  COALESCE(c.recues, 0)                                                        AS commandes_recues,
  COALESCE(r.refus_ferme, 0)                                                   AS refus_ferme,
  COALESCE(r.refus_inconnus, 0)                                                AS refus_horaires_inconnus,
  ROUND(100.0 * (COALESCE(r.refus_ferme, 0) + COALESCE(r.refus_inconnus, 0)) / NULLIF(COALESCE(c.recues, 0), 0)) AS pct_des_commandes
FROM refus r
FULL JOIN commandes c USING (restaurant_id)
ORDER BY commandes_recues DESC;

-- D. Le coût chez Google : un appel « Place Details Enterprise » par visite d'un établissement relié à une fiche (la note,
-- même avec ses propres horaires), plus un par envoi qui arrive jusqu'aux horaires, sauf avec « Les miens » ou un jour
-- fermé (aucun appel). L'écran « Infos de ma page » en coûte un par ouverture et par modification (hors « Ce que tu
-- proposes »), non comptés ici. Rien n'est gardé (conditions Google Maps Platform). C'est une ESTIMATION (un compteur non
-- écrit ne se voit pas, et les envois sont jugés d'après le réglage D'AUJOURD'HUI) : la facture de la console fait foi.
-- Repère (grille mondiale lue le 2026-11-26) : 1 000 appels gratuits par mois pour tout le compte, puis 20 $ les 1 000.
-- L'analyse gratuite et la brigade utilisent le même compte. Seuil : au-delà de 800 appels estimés dans le mois, en parler.
-- Sans la migration 20261126-2300 : retirer la jointure et la condition sur site_page_settings.
WITH relies AS (
  SELECT r.id AS restaurant_id,
         (p.hours_source = 'manual' AND p.weekly_hours IS NOT NULL) IS TRUE     AS ses_horaires
  FROM restaurants r
  LEFT JOIN site_page_settings p ON p.restaurant_id = r.id::text
  WHERE r.google_place_id IS NOT NULL
), appels AS (
  SELECT date_trunc('month', f.created_at AT TIME ZONE 'Europe/Brussels') AS mois, f.restaurant_id, COUNT(*) AS n
  FROM site_order_refusals f JOIN relies x ON x.restaurant_id::text = f.restaurant_id::text
  WHERE (f.reason LIKE 'fiche_vue_%' AND f.reason NOT IN ('fiche_vue_inconnu:pas_de_fiche', 'fiche_vue_inconnu:places_absent'))
     OR (NOT x.ses_horaires AND f.reason IN ('ferme', 'horaires_inconnus', 'plat_inconnu', 'plat_indisponible', 'choix_invalide', 'plafond'))
  GROUP BY 1, 2
  UNION ALL
  SELECT date_trunc('month', o.created_at AT TIME ZONE 'Europe/Brussels'), o.restaurant_id, COUNT(*)
  FROM site_orders o JOIN relies x ON x.restaurant_id::text = o.restaurant_id::text
  WHERE NOT x.ses_horaires
  GROUP BY 1, 2
)
SELECT mois::date AS mois, restaurant_id, SUM(n) AS appels_google_estimes
FROM appels
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- E. L'entrée depuis l'app : le bloc « Commander à emporter » amène-t-il quelqu'un ?
-- Seuil : après quatre semaines d'espace ouvert, moins d'une arrivée par l'app pour dix visites = le bloc est mal placé
-- (il est sous le bouton photo) ou les membres ne commandent pas depuis l'app.
SELECT
  restaurant_id,
  COUNT(*) FILTER (WHERE reason = 'entree_app')                                AS arrivees_par_l_app,
  COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_%')                            AS visites,
  ROUND(100.0 * COUNT(*) FILTER (WHERE reason = 'entree_app')
        / NULLIF(COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_%'), 0))        AS pct_par_l_app
FROM site_order_refusals
WHERE (reason = 'entree_app' OR reason LIKE 'fiche_vue_%') AND created_at >= NOW() - INTERVAL '28 days'
GROUP BY 1
ORDER BY visites DESC;

-- F. La source des horaires, par établissement : ce que le restaurant a réglé, et ce que ses visites ont réellement reçu
-- (28 derniers jours). Demande la migration 20261126-2300.
-- Seuils : un établissement « repli » à plus d'une visite sur cinq = sa fiche Google est muette ou en panne, lui proposer
-- « Les miens » ; « Les miens » sans mise à jour depuis 6 mois = relire ses horaires avec lui ; plus de 3 jours « fermeture »
-- dans la semaine = « Fermer pour aujourd'hui » oublié ou mal compris.
WITH visites AS (
  SELECT restaurant_id::text AS restaurant_id,
         COUNT(*)                                                              AS visites,
         COUNT(*) FILTER (WHERE reason LIKE '%:google')                        AS vues_google,
         COUNT(*) FILTER (WHERE reason LIKE '%:saisi')                         AS vues_saisi,
         COUNT(*) FILTER (WHERE reason LIKE '%:repli')                         AS vues_repli,
         COUNT(*) FILTER (WHERE reason LIKE '%:fermeture')                     AS vues_fermeture,
         COUNT(*) FILTER (WHERE reason LIKE 'fiche_vue_inconnu:%')             AS vues_sans_horaires
  FROM site_order_refusals
  WHERE reason LIKE 'fiche_vue_%' AND created_at >= NOW() - INTERVAL '28 days'
  GROUP BY 1
)
SELECT
  COALESCE(p.restaurant_id, v.restaurant_id)                                   AS restaurant_id,
  CASE WHEN p.hours_source = 'manual' THEN 'Les miens' ELSE 'Ceux de Google' END AS horaires_choisis,
  p.weekly_hours IS NOT NULL                                                   AS semaine_saisie,
  jsonb_array_length(COALESCE(p.closures, '[]'::jsonb))                        AS jours_speciaux_enregistres,
  p.updated_at                                                                 AS dernier_reglage,
  v.visites, v.vues_google, v.vues_saisi, v.vues_repli, v.vues_fermeture, v.vues_sans_horaires
FROM site_page_settings p
FULL JOIN visites v ON v.restaurant_id = p.restaurant_id
ORDER BY v.visites DESC NULLS LAST;
