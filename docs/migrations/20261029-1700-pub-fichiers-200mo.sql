-- ============================================================
-- Pub : fichiers jusqu'à 200 Mo (ADR 0086 amendé le 2026-10-29)
--
-- Quoi : le bucket ad-creatives accepte 200 Mo par fichier (au lieu de 100).
-- Pourquoi : les vidéos du tournage (30 s en 4K ≈ 170 Mo) doivent passer telles quelles.
--   La limite globale du stockage Supabase est réglée à 200 Mo en même temps (réglage du
--   projet, Storage → Settings) : c'est la plus basse des deux qui s'applique.
-- Sans elle : le bucket reste à 100 Mo ; un fichier entre 100 et 200 Mo est refusé à l'envoi
--   par Supabase, la page affiche « L'envoi a échoué », rien n'est créé.
-- RLS inchangée. Idempotente.
-- ============================================================

UPDATE storage.buckets SET file_size_limit = 209715200 WHERE id = 'ad-creatives';

-- Contrôle : SELECT id, file_size_limit FROM storage.buckets WHERE id = 'ad-creatives';
