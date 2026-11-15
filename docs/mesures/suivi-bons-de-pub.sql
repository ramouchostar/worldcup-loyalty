-- ============================================================
-- Suivi des BONS DE PUB (ADR 0104 §2) — LECTURE SEULE, aucune donnée personnelle.
-- Une pub « Visites » avec offre mène à /bon/<établissement>/<n° de demande> ; le passant y
-- obtient un bon (code + QR) que la caisse valide depuis la console.
-- Clics (Meta) → vues de la page du bon → bons obtenus → bons utilisés en caisse.
--
-- Ce qui dirait que la règle est fausse (seuils de l'ADR, repris dans lib/ads/vouchers.ts) :
-- * après 100 clics, moins de 20 % des clics deviennent un bon → la page du bon est à revoir ;
-- * après 30 bons obtenus, moins de 10 % sont utilisés → l'offre ou le scan en caisse est à
--   revoir (l'équipe ne scanne pas ? demander au restaurateur) ;
-- * beaucoup de vues « direct » et peu de « meta » → le lien de la pub n'est pas le bon
--   (vérifier le lien sur /platform/pub avant le lancement) ;
-- * plus de 20 bons en une heure sur une même empreinte : refusé, ligne « [bon] plafond » dans
--   les journaux Vercel.
-- ============================================================

-- Par pub : l'entonnoir complet
SELECT r.restaurant_id,
       r.seq,
       r.offer_text,
       r.offer_from,
       r.offer_to,
       COALESCE((c.lifetime->>'clicks')::int, 0)                                   AS clics_meta,
       (SELECT count(*) FROM ad_voucher_views v WHERE v.request_id = r.id)          AS vues,
       (SELECT count(*) FROM ad_voucher_views v WHERE v.request_id = r.id AND v.source = 'meta') AS vues_meta,
       (SELECT count(*) FROM ad_vouchers b WHERE b.request_id = r.id)               AS bons_obtenus,
       (SELECT count(*) FROM ad_vouchers b WHERE b.request_id = r.id AND b.redeemed_at IS NOT NULL) AS bons_utilises
  FROM ad_requests r
  LEFT JOIN ad_campaigns c ON c.request_id = r.id
 WHERE r.objective = 'TRAFIC'
   AND r.offer_text IS NOT NULL
 ORDER BY r.created_at DESC;

-- Par jour : quand les bons s'obtiennent et quand ils sont utilisés (heure de Bruxelles)
SELECT restaurant_id,
       (created_at AT TIME ZONE 'Europe/Brussels')::date AS jour,
       count(*)                                          AS obtenus,
       count(*) FILTER (WHERE redeemed_at IS NOT NULL)   AS utilises
  FROM ad_vouchers
 GROUP BY 1, 2
 ORDER BY 2 DESC, 1;

-- Délai entre le bon obtenu et son passage en caisse
SELECT restaurant_id,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (redeemed_at - created_at)) / 3600) AS heures_medianes
  FROM ad_vouchers
 WHERE redeemed_at IS NOT NULL
 GROUP BY 1;

-- Empreintes qui demandent beaucoup de bons (remplissage ?)
SELECT ip_hash, count(*) AS bons, min(created_at) AS premier, max(created_at) AS dernier
  FROM ad_vouchers
 GROUP BY ip_hash
HAVING count(*) >= 5
 ORDER BY bons DESC;
