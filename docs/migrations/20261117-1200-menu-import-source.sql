-- ============================================================
-- D'où vient le menu importé, et ce que nous en avons repris (ADR 0100 §11)
--
-- Le restaurateur peut donner son menu par un PDF OU par le lien de son menu en ligne. La lecture en tire aussi les
-- rubriques, les sauces et les accompagnements gratuits qui rangent ses plats (« Menus kebab », « Menus burger »).
-- Cette table (une ligne par enregistrement d'un import, des compteurs seulement : ni nom de plat, ni texte du menu, ni
-- adresse) dit désormais d'où il vient et combien de rubriques et de listes ont été reprises.
--
--   source        'pdf' | 'lien'
--   categories    rubriques distinctes lues dans le menu, rattachées à un plat
--   sauce_lists   listes de sauces DISTINCTES reprises
--   side_lists    listes d'accompagnements (« frites ou riz ») DISTINCTES reprises
--
-- Idempotente, non cassante. Si elle n'est pas appliquée, la trace s'écrit sans ces trois colonnes (rien n'est perdu, rien
-- ne casse). À appliquer à la main dans l'éditeur SQL de Supabase dès la fusion.
-- ============================================================

ALTER TABLE menu_pdf_imports ADD COLUMN IF NOT EXISTS source      TEXT    NOT NULL DEFAULT 'pdf';
ALTER TABLE menu_pdf_imports ADD COLUMN IF NOT EXISTS categories  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_pdf_imports ADD COLUMN IF NOT EXISTS sauce_lists INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_pdf_imports ADD COLUMN IF NOT EXISTS side_lists  INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_pdf_imports_source_known') THEN
    ALTER TABLE menu_pdf_imports ADD CONSTRAINT menu_pdf_imports_source_known CHECK (source IN ('pdf', 'lien'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_pdf_imports_structure_counts') THEN
    ALTER TABLE menu_pdf_imports ADD CONSTRAINT menu_pdf_imports_structure_counts CHECK (categories >= 0 AND sauce_lists >= 0 AND side_lists >= 0);
  END IF;
END $$;
