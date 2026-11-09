-- ============================================================
-- Suivi du test « arrivée en un seul bouton » (ADR 0097) — LECTURE SEULE, comptes uniquement.
-- Remplacer 'kraainem' et les deux dates par celles du test. La comparaison est AVANT / APRÈS sur le
-- même établissement (pas un test A/B : aucun identifiant d'appareil, ADR 0037) : à lire avec prudence,
-- les jours de la semaine et le flux de clients changent d'une période à l'autre.
--
-- Le chiffre qui compte : arrivées par le QR → caméra ouverte (camera_open, ADR 0094) → photo prise
-- (ticket_capture_opened) → résultat vu (result_view). Si « caméra ouverte / arrivées QR » ne monte pas
-- d'une période à l'autre, l'écran en un bouton n'apporte rien.
-- ============================================================

-- Arrivées anonymes par QR, jour par jour
SELECT day, SUM(count) AS arrivees_qr
  FROM qr_landings
 WHERE restaurant_id = 'kraainem' AND source = 'qr_code' AND visitor = 'anonyme'
   AND day >= '2026-11-01'
 GROUP BY day ORDER BY day;

-- Les étages de l'entonnoir, jour par jour (même établissement)
SELECT day, step, SUM(count) AS n
  FROM funnel_events
 WHERE restaurant_id = 'kraainem'
   AND step IN ('camera_open', 'ticket_capture_opened', 'photo_retake_asked', 'result_view', 'signup_started', 'signup_completed')
   AND day >= '2026-11-01'
 GROUP BY day, step ORDER BY day, step;

-- Taux AVANT / APRÈS la date d'allumage ('2026-11-17' à remplacer)
WITH q AS (
  SELECT (day >= '2026-11-17') AS apres, SUM(count) AS arrivees
    FROM qr_landings
   WHERE restaurant_id = 'kraainem' AND source = 'qr_code' AND visitor = 'anonyme' AND day >= '2026-11-01'
   GROUP BY 1
), c AS (
  SELECT (day >= '2026-11-17') AS apres,
         SUM(count) FILTER (WHERE step = 'camera_open')            AS cameras,
         SUM(count) FILTER (WHERE step = 'ticket_capture_opened')  AS photos,
         SUM(count) FILTER (WHERE step = 'result_view')            AS resultats
    FROM funnel_events
   WHERE restaurant_id = 'kraainem' AND day >= '2026-11-01'
   GROUP BY 1
)
SELECT q.apres, q.arrivees, c.cameras, c.photos, c.resultats,
       ROUND(100.0 * c.cameras / NULLIF(q.arrivees, 0), 1) AS pct_camera_sur_arrivees_qr
  FROM q JOIN c USING (apres) ORDER BY q.apres;
