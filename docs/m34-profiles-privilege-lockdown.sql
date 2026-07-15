-- ============================================================
-- M34 : CORRECTIF SÉCURITÉ CRITIQUE — élévation de privilèges via profiles
--
-- Faille (trouvée au pentest du 2026-07-15) :
--   La policy `profiles_own_update` (m2) autorise UPDATE sur SA propre ligne
--   sans restriction de colonne. Or `is_admin` (m2) et `is_super_admin` (m28)
--   sont des colonnes de `profiles`. Un membre authentifié pouvait donc, avec
--   la seule clé anon PUBLIQUE + son JWT, exécuter :
--       supabase.from('profiles').update({ is_super_admin: true }).eq('id', <soi>)
--   et devenir super-admin plateforme (accès /platform + console admin de TOUS
--   les établissements, CA, owners) — compromission totale du modèle d'autz
--   par n'importe quel compte inscrit.
--
-- Correctif : privilèges au niveau COLONNE. On retire l'UPDATE global au rôle
-- `authenticated` et on ne re-grant QUE les deux colonnes qu'un membre édite
-- légitimement (display_name à l'inscription, zones à l'inscription + page
-- zones — cf. app/(auth)/register/actions.ts et app/api/profile/zones).
-- Toute tentative d'écrire is_admin / is_super_admin / email / team_id / etc.
-- via la clé anon échoue désormais avec « permission denied for column ».
--
-- Le rôle `service_role` (createAdminClient) conserve tous ses privilèges :
-- bootstrap-admin, callback d'auth et la console plateforme continuent de
-- promouvoir/rétrograder normalement. La policy RLS `profiles_own_update`
-- reste en place (double verrou : bonne ligne ET bonnes colonnes).
--
-- Idempotent, sûr à rejouer.
-- ============================================================

REVOKE UPDATE ON profiles FROM anon, authenticated;

GRANT UPDATE (display_name, zones) ON profiles TO authenticated;

-- Vérification (doit renvoyer uniquement display_name et zones pour authenticated) :
--   SELECT column_name, privilege_type
--   FROM information_schema.column_privileges
--   WHERE table_name = 'profiles' AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
