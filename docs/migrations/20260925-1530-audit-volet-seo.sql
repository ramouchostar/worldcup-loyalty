-- ADR 0069 — volet SEO de l'audit : un cinquième type de volet dans restaurant_audit_sections.
--
-- Quoi : la contrainte CHECK de restaurant_audit_sections.section accepte 'seo' (site du
-- restaurant, vitesse mobile, rang dans Google), en plus de fiche, avis, concurrents, reseaux.
-- Pourquoi : demande du porteur (2026-09-25) — « voir comment on est positionné, le score SEO ».
-- Sécurité : inchangée (RLS activée sans policy, service-role seulement).
-- Si la migration n'est pas appliquée : l'enregistrement du volet SEO échoue, le rapport
-- l'annonce (« volet SEO non enregistré ») et les autres volets sont gardés (fail-open).

ALTER TABLE restaurant_audit_sections DROP CONSTRAINT IF EXISTS restaurant_audit_sections_section_check;
ALTER TABLE restaurant_audit_sections
  ADD CONSTRAINT restaurant_audit_sections_section_check
  CHECK (section IN ('fiche', 'avis', 'concurrents', 'reseaux', 'seo'));
