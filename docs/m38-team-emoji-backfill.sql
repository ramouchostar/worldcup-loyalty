-- m38 — Backfill des avatars d'équipe (audit 2026-07-23, M2)
-- Depuis le pivot ADR 0014, flag_emoji est un avatar par TYPE d'équipe
-- (posé à la création par lib/teams.ts teamEmoji). Les équipes d'avant le
-- pivot portent encore un drapeau national — on les réaligne sur leur type.
-- Idempotent.

UPDATE teams SET flag_emoji = CASE type
  WHEN 'ecole'        THEN '🎓'
  WHEN 'entreprise'   THEN '🏢'
  WHEN 'rue_quartier' THEN '🏘️'
  WHEN 'taxis'        THEN '🚕'
  ELSE '👥'
END
WHERE flag_emoji IS DISTINCT FROM CASE type
  WHEN 'ecole'        THEN '🎓'
  WHEN 'entreprise'   THEN '🏢'
  WHEN 'rue_quartier' THEN '🏘️'
  WHEN 'taxis'        THEN '🚕'
  ELSE '👥'
END;
