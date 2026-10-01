-- ============================================================
-- Backlog plateforme : signaux extérieurs du copilote (ADR 0074 §8)
--
-- QUOI. Ajoute au backlog des associés (`platform_backlog`, ADR 0033 §3) une
-- action par API de signal extérieur, plus le socle commun, décidés le
-- 2026-10-01 et répartis entre Mehdi et Omar pour le week-end du 3-4 octobre.
-- Les sources gratuites sont « à faire » ; les payantes (PredictHQ, licence
-- commerciale Open-Meteo) restent en « idée », sans personne, pour plus tard.
--
-- Ordre de travail : l'ADR (contrat de la table `external_signals` et forme
-- d'un module de source) d'abord, samedi matin — chaque source s'écrit
-- ensuite en parallèle comme un module pur `lib/signals/<source>.ts` testé.
-- Source de la liste : docs/strategie/positionnement.md §10.
--
-- RLS : inchangée — `platform_backlog` reste service-role only. Aucun impact
-- membre ni restaurateur.
--
-- Idempotente : chaque ligne n'est insérée que si aucune action du même titre
-- n'existe déjà. Impacts et efforts (1–5) = propositions de départ ; la
-- priorité se calcule (impact ÷ effort). `owner` = miroir hérité de owners[1]
-- (migration 20260906-2225).
-- ============================================================

INSERT INTO platform_backlog (title, details, area, status, impact, effort, owners, owner, due_date)
SELECT v.title, v.details, v.area, v.status, v.impact, v.effort,
       v.owners, v.owners[1], v.due_date
  FROM (VALUES
    -- ── Socle commun (Mehdi) ─────────────────────────────────────────────
    ('Signaux extérieurs : ADR du copilote (à faire en premier)',
     'Décidé le 2026-10-01. ADR (numéro pris sur origin/master) : table external_signals (source, type, zone, début, fin, contenu brut, lu le), un module pur par source lib/signals/<source>.ts (lecture + tests, aucun accès base), moteur déterministe et explicable comme le forecast (ADR 0027 §5) — pas de modèle appris. Trois actions par semaine au plus, chaque signal prouvé contre le groupe témoin (ADR 0063) ou retiré. Samedi matin : c''est le contrat sur lequel Omar écrit ses sources en parallèle.',
     'tech', 'a_faire', 5, 1, ARRAY['Mehdi'], DATE '2026-10-03'),
    ('Signaux : coordonnées de chaque établissement',
     'Décidé le 2026-10-01. Aucune latitude ni longitude en base aujourd''hui (seulement google_maps_url). Colonnes restaurants.lat / lng, remplies depuis google_place_id (ADR 0075) via Places (GOOGLE_PLACES_API_KEY, déjà branchée) ; repli : saisie plateforme. Sans coordonnées : aucun signal local pour cet établissement, et il est compté sur /platform (jamais d''échec silencieux).',
     'tech', 'a_faire', 5, 2, ARRAY['Mehdi'], DATE '2026-10-03'),
    ('Signaux : table external_signals, tâche planifiée et suivi des sources',
     'Décidé le 2026-10-01. Migration horodatée external_signals (RLS sans policy). Cron /api/cron/signals qui appelle chaque module de source. Journal par lecture : source, réussite/échec, nombre de lignes, durée. Écran de suivi des sources dans /platform (dernière lecture réussie, échecs 7 jours). Source en panne → aucune action n''en sort, et ça se voit.',
     'tech', 'a_faire', 5, 3, ARRAY['Mehdi'], DATE '2026-10-04'),
    -- ── Sources (Mehdi) ──────────────────────────────────────────────────
    ('API météo : Open-Meteo (prévisions 7 jours + historique)',
     'Décidé le 2026-10-01. Sans clé. Prévisions horaires par établissement (pluie, température, vent) + archive historique pour calibrer l''effet météo sur SES tickets (« chez vous, la pluie fait +22 % ») — Kraainem en premier. Offre gratuite = usage non commercial : suffisant pour construire et tester ; la licence commerciale est une action séparée (idée). Secours : données ouvertes IRM (opendata.meteo.be).',
     'tech', 'a_faire', 5, 3, ARRAY['Mehdi'], DATE '2026-10-04'),
    ('API Ramadan et Aïd : Aladhan (heures de prière, calendrier hégirien)',
     'Décidé le 2026-10-01. Gratuit, sans clé. Dates du Ramadan et des Aïd + heure de rupture du jeûne (maghrib) aux coordonnées de l''établissement. Signal activé UNIQUEMENT si le restaurateur le choisit (ADR 0074 §8) : réglage par établissement, éteint par défaut. Action type : horaires et offre de rupture du jeûne.',
     'tech', 'a_faire', 4, 2, ARRAY['Mehdi'], DATE '2026-10-04'),
    ('Signaux calculés : jours de paie, allocations, coucher du soleil',
     'Décidé le 2026-10-01. Sans API : fin de mois / début de mois et versement des allocations familiales (déjà « moment du mois » dans lib/forecast.ts — réutiliser, ne pas dupliquer), coucher du soleil calculé aux coordonnées (Ramadan, terrasses). Sert à choisir le MOMENT d''envoi d''une action.',
     'tech', 'a_faire', 2, 1, ARRAY['Mehdi'], DATE '2026-10-04'),
    -- ── Sources (Omar) ───────────────────────────────────────────────────
    ('API vacances scolaires : OpenHolidays (FR / NL / DE)',
     'Décidé le 2026-10-01. Gratuit, sans clé. Remplace la saisie à la main de reference_calendar (m46, s''arrête à l''été 2027) par une synchronisation — même table, pas de seconde source. Vérifier à l''appel que le découpage par communauté (BE-FR / BE-NL / BE-DE) est bien fourni, comparer au seed m46 avant de remplacer. Déjà branché : restaurants.school_calendars (lib/school-calendar.ts) et le forecast.',
     'tech', 'a_faire', 4, 2, ARRAY['Omar'], DATE '2026-10-03'),
    ('API foot : API-Football (Diables, Pro League, Ligue des champions, sélections)',
     'Décidé le 2026-10-01. Compte gratuit api-sports.io (100 appels/jour : un import quotidien suffit), clé en variable d''env Vercel. Le restaurateur choisit les équipes qui comptent pour SA clientèle (Belgique, Maroc, Turquie…, clubs belges) : réglage par établissement. Coup d''envoi en heure de Bruxelles. Remplace à terme wc2026_matches (football-data.org, Mondial seul).',
     'tech', 'a_faire', 5, 3, ARRAY['Omar'], DATE '2026-10-04'),
    ('API événements : UiTdatabank (agenda Flandre + Bruxelles)',
     'Décidé le 2026-10-01. Gratuit, clé à demander chez publiq (validation possiblement de quelques jours : demander dès vendredi). Événements dans un rayon autour des coordonnées de l''établissement, avec date, heure, lieu et taille quand elle est connue. Action type : pub locale, horaires adaptés.',
     'tech', 'a_faire', 4, 3, ARRAY['Omar'], DATE '2026-10-04'),
    ('API événements : Ticketmaster Discovery (grandes salles)',
     'Décidé le 2026-10-01. Gratuit (5 000 appels/jour), clé développeur. Concerts et spectacles des grandes salles (Forest National, Lotto Arena, stade Roi Baudouin…) autour de l''établissement. Dédoublonner avec UiTdatabank (même lieu, même jour).',
     'tech', 'a_faire', 3, 2, ARRAY['Omar'], DATE '2026-10-04'),
    ('API transports et grèves : iRail (SNCB) + données ouvertes STIB',
     'Décidé le 2026-10-01. iRail : gratuit, sans clé ; STIB : compte sur opendata.stib-mivb.be. Perturbations et grèves annoncées près de l''établissement. Action type : « toujours ouverts, voici l''accès », mise en avant de l''emporter.',
     'tech', 'a_faire', 3, 2, ARRAY['Omar'], DATE '2026-10-04'),
    ('Signal blocus et examens : calendriers universitaires',
     'Décidé le 2026-10-01. Pas d''API : saisie annuelle des sessions d''examens ULB, UCLouvain, KU Leuven, VUB dans reference_calendar (nouveau kind), avec la ville du campus. Action type : offre tard le soir pour les établissements proches d''un campus.',
     'tech', 'a_faire', 3, 1, ARRAY['Omar'], DATE '2026-10-04'),
    -- ── Payant, plus tard (sans personne) ────────────────────────────────
    ('Météo : licence commerciale Open-Meteo',
     'Décidé le 2026-10-01. L''offre gratuite exclut l''usage commercial : à souscrire avant le premier pilote payant (prix à vérifier sur open-meteo.com/en/pricing), ou basculer sur les données ouvertes IRM.',
     'legal', 'idee', 4, 1, ARRAY[]::TEXT[], NULL::DATE),
    ('Événements : PredictHQ (événements notés par affluence)',
     'Décidé le 2026-10-01. Payant (cher) — après preuve de l''effet événements avec UiTdatabank + Ticketmaster contre le groupe témoin. Apporte l''affluence prévue et les événements non billetés.',
     'tech', 'idee', 3, 2, ARRAY[]::TEXT[], NULL::DATE)
  ) AS v(title, details, area, status, impact, effort, owners, due_date)
 WHERE NOT EXISTS (SELECT 1 FROM platform_backlog b WHERE b.title = v.title);

-- Vérification : les 14 actions sont présentes.
SELECT title, status, owners, impact, effort, due_date
  FROM platform_backlog
 WHERE details LIKE 'Décidé le 2026-10-01%'
 ORDER BY owners, due_date, title;
