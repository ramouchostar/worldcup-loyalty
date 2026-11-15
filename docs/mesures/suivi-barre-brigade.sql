-- Suivi de la barre de la brigade (ADR 0105). Lecture seule.
--
-- 1. Qui parle : idées MONTRÉES par assistant sur 14 jours. Seuil de révision : un assistant
--    actif (forfait couvert) sans aucune idée montrée en 14 jours chez un établissement est à
--    revoir (données périmées ou barre trop haute pour lui).
SELECT restaurant_id, assistant, count(*) FILTER (WHERE status <> 'ecartee') AS montrees,
       count(*) FILTER (WHERE discard_reason = 'sous_la_barre') AS sous_la_barre
FROM agent_proposals
WHERE created_at > now() - interval '14 days' AND origin = 'systeme'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 2. Ce que la barre coupe, par condition. Si une condition coupe plus de 90 % des idées d'un
--    type pendant 30 jours, soit le générateur est à refaire, soit la fiche de jeu est à retirer.
SELECT assistant, type, content->'barre'->>'condition' AS condition, count(*)
FROM agent_proposals
WHERE discard_reason = 'sous_la_barre' AND created_at > now() - interval '30 days'
GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- 3. Condition 5 : résultats mesurés par type sur le réseau (pause sous 80 % dès 10 résultats).
SELECT assistant, type, count(*) AS resultats,
       count(*) FILTER (WHERE result->>'outcome' = 'reussi') AS reussites
FROM agent_proposals
WHERE status = 'executee' AND result->>'outcome' IS NOT NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4. Le « Oui » : part des idées montrées acceptées, avant/après le 2026-11-15 (avant : 1 sur 64).
SELECT (created_at >= '2026-11-15') AS apres_barre,
       count(*) FILTER (WHERE status IN ('acceptee','executee')) AS oui,
       count(*) FILTER (WHERE status NOT IN ('ecartee','proposee')) AS decidees_ou_expirees
FROM agent_proposals WHERE origin = 'systeme' GROUP BY 1;

-- 5. Max, horaires des jours fériés (ADR 0105 §5, étape 2). Une idée par occasion et par
--    établissement Pro, de J-15 à J-2. Seuil : à J-2 du 24/12, un établissement Pro sans idée
--    montrée ni écartée « deja_sur_la_fiche » = générateur en panne (voir le rapport du passage).
--    Réussite (à écrire dans result.outcome) : horaires relus par Places dans les 7 jours.
SELECT restaurant_id, content->>'finding' AS occasion, status, refusal_reason,
       content->'evidence'->>'ficheRead' AS fiche_lue, decided_at, executed_at
FROM agent_proposals
WHERE assistant = 'max' AND type = 'horaires_jours_speciaux'
ORDER BY created_at DESC;
