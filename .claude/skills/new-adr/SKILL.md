---
name: new-adr
description: Créer un nouvel ADR (docs/adr/NNNN-slug.md) sans collision de numéro — numéro suivant pris sur origin/master, fichier au format du projet (Statut, Contexte, Décision, Conséquences), PR ouverte tout de suite pour réserver le numéro. Utiliser dès qu'une décision d'architecture ou de produit est prise ("on décide que", "ADR", "formalise la décision").
argument-hint: "<slug-en-minuscules> [titre]"
---

# /new-adr — ADR sans collision (CLAUDE.md § Collaboration)

Les ADR 0022–0024 ont été renumérotés deux fois parce que chacun prenait « le numéro
suivant » de son clone local. Le numéro se prend sur **origin/master** et se **réserve** par
une PR ouverte immédiatement.

## Étapes

1. `git fetch origin` puis calculer le prochain numéro depuis **origin/master** :
   `git ls-tree --name-only origin/master docs/adr/` → max des préfixes `NNNN` + 1, sur 4 chiffres.
2. Créer `docs/adr/NNNN-<slug>.md` (slug = `$ARGUMENTS`, minuscules-tirets) au format du projet :

   ```markdown
   # ADR NNNN — <Titre>

   **Statut** : Proposé (AAAA-MM-JJ) — décisions à valider par le porteur / Accepté (...)

   ## Contexte
   ## Décision
   ## Conséquences
   ## Alternatives rejetées (si utile)
   ```

   S'inspirer du ton et de la densité des ADR récents (ex. 0029, 0030). Un ADR documente le
   **pourquoi** ; le code documente le comment.
3. **Cascade documentaire** (convention du projet) : si l'ADR amende/supersede un ADR
   existant, ajouter la mention dans le **statut** de l'ancien ; mettre à jour le glossaire
   `CONTEXT.md` (termes nouveaux + `_Avoid_`) et, si une règle est critique, `CLAUDE.md`.
4. `npm run check:naming` (unicité du numéro).
5. **Réserver le numéro** : livrer tout de suite avec `/ship` (même si l'ADR est encore
   « Proposé » — la PR fusionnée verrouille le numéro ; on amende ensuite).

## Interdits

- Prendre le numéro depuis le clone local sans fetch.
- Garder un ADR plusieurs jours en local non poussé (collision garantie au rythme actuel).
