---
name: point-associes
description: Préparer le point entre associés (les décisions à prendre à deux), puis, après la réunion, en tirer le compte rendu et mettre le backlog plateforme à jour. Utiliser quand on dit "point avec mon associé", "réunion associés", "points à traiter", "prépare la réunion", ou quand l'utilisateur colle ses notes de réunion.
argument-hint: "[preparer | compte-rendu]"
---

# /point-associes — préparer le point, puis en garder la trace

Deux temps, un seul fil : **avant** la réunion, la liste courte de ce qui ne se décide qu'à
deux ; **après**, les notes de l'utilisateur deviennent un compte rendu et un backlog à jour.
Mode `preparer` par défaut ; `compte-rendu` dès que l'utilisateur donne ses notes de réunion.

Réponses en français, phrases courtes, zéro jargon. Ne jamais nommer l'associé ni supposer son
genre (« ton associé », « vous deux »).

## Mode `preparer` — les décisions à prendre à deux

Rendu **dans la conversation**, pas de doc. Seulement ce qui attend une décision commune :
pas de récit de ce qui a été livré, pas de liste de projets.

### 1. Rassembler (lecture seule)

`git fetch origin` d'abord : tout se lit sur **origin/master**, jamais sur la branche locale.

| Source | Ce qu'on cherche |
|---|---|
| `docs/adr/*.md` (origin/master) | `**Statut** : Proposé`, « à valider par l'associé », sections « À trancher » / « Questions ouvertes » |
| PR ouvertes (`gh pr list --state open`) | celles de plus de 7 jours : fusionner ou fermer ? |
| `platform_backlog` (prod, lecture) | `status = 'bloque'`, et les items dont `details` contient « associé » ou « à trancher » |
| Mémoire Claude du projet | décisions marquées « à valider », relances commerciales en attente d'un choix commun |
| Dernier compte rendu (si l'utilisateur donne son lien) | sa section « Questions ouvertes » |

**Écarter ce qui est déjà tranché** : un ADR « Proposé » dont le backlog porte une note
« [Réunion AAAA-MM-JJ] … validé » n'est plus à décider — le signaler en une ligne
(« 0074 validé le 19/10, statut de l'ADR pas encore mis à jour »), pas comme un point de réunion.

### 2. Rendre

Une seule liste, **classée par ce que ça débloque** (ce qui bloque une livraison de la semaine
en premier). Chaque point tient en trois lignes au plus :

- **Le sujet** et sa source (ADR, PR, item du backlog) en lien cliquable
- **La question exacte** à trancher, avec les options et la recommandation de l'ADR s'il y en a une
- **Ce que ça bloque** si on ne tranche pas

Terminer par une ligne : « Après la réunion, colle-moi tes notes : je fais le compte rendu et je
mets le backlog à jour. »

## Mode `compte-rendu` — après la réunion

Entrée : les notes de l'utilisateur, souvent en vrac. Les lire **telles quelles** : ce qu'il a
écrit est décidé, rien d'autre. Une note ambiguë (mauvais numéro d'ADR, phrase coupée) → la
rattacher au sens le plus probable et **le dire** dans la réponse finale.

### 1. Le compte rendu (Claude Doc)

Créer un doc « Réunion associés — <date> » (outil Claude Docs, squelette d'abord, une section
par appel). Sections, chacune ouverte par une phrase qui dit le point :

1. **Décisions** — tableau ADR / sujet / décision
2. **Priorités de la semaine** — liste numérotée, dans l'ordre décidé
3. Une section par thème discuté (refus de tickets, prospection, clients…)
4. **Actions et questions ouvertes** — cases à cocher « Cette semaine » / « Ensuite », idées à
   cadrer, questions ouvertes, ce qui a été retiré ou marqué fait dans le backlog

Si un ADR passe à « Accepté », ne pas modifier l'ADR dans la même foulée :
ajouter un item de backlog « passer l'ADR en Accepté » (un chantier = une PR).

### 2. Le backlog plateforme (`platform_backlog`, prod)

L'utilisateur a validé que ce mode **écrit en prod** sans redemander. Toujours :

- **Lire avant d'écrire** : les items ouverts (`status not in ('fait','abandonne')`), pour
  mettre à jour plutôt que dupliquer.
- **Une seule transaction** (`begin; … commit;`).
- Mettre à jour : `fait` (avec `done_at = now()`), `bloque` (qui on attend), `en_cours` +
  `due_date` pour les priorités de la semaine, `abandonne` pour ce que la réunion retire.
  Toujours **ajouter** au `details` une ligne `[Réunion AAAA-MM-JJ] …` qui dit pourquoi.
- Créer les nouveaux items : `details` commence par « Réunion AAAA-MM-JJ — », `impact` et
  `effort` de 1 à 5 (la priorité est calculée, jamais saisie), `area` parmi
  `produit|tech|vente|marketing|ops|legal`, `restaurant_id` quand l'item vise un établissement,
  `owner` seulement si les notes le nomment.
- Vérifier après coup (nombre de lignes touchées par statut) et le dire.

**Accès** : le MCP Supabase du dépôt (`.mcp.json`) s'il est authentifié ; sinon l'API de
gestion en HTTPS — `POST https://api.supabase.com/v1/projects/kdbyemmsdgybzqfphxup/database/query`
avec `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` (lu dans `.env.local`, espaces retirés,
**jamais affiché**). Sans accès : lister les changements prévus et s'arrêter là.

### 3. Les suivis

- Relance commerciale ou échéance personnelle (« relancer X début novembre ») → un item de
  backlog avec `due_date`, et une note dans la mémoire Claude du projet.
- Jamais de rappel envoyé ni d'événement d'agenda créé sans que l'utilisateur le demande.

### 4. Réponse finale

Une ligne pour le lecteur (« Écrit pour : … »), le lien du doc, ce qui a bougé dans le backlog
(ajoutés / mis à jour / retirés), les notes ambiguës et comment elles ont été lues, les
questions restées ouvertes. Rien d'autre.
