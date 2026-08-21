---
name: ship
description: Livrer le travail en cours selon les règles de collaboration du repo — branche dédiée, commit, push, PR, attente du CI vert, fusion via GitHub, retour sur master à jour. Utiliser quand on dit "ship", "livre", "pousse", "fais la PR", "merge", ou dès qu'un chantier est prêt à partir. Jamais de push direct sur master (branche protégée).
argument-hint: "[sujet-de-branche] [message de commit optionnel]"
---

# /ship — livrer par branche + PR (CLAUDE.md § Collaboration)

`master` est protégé (PR + check CI `build` vert obligatoires, même pour les admins).
Ce skill encode le seul chemin valide. Ne saute aucune étape.

## Étapes

1. **État des lieux** : `git status -sb`. S'il n'y a rien à livrer, arrête-toi.
   Ne jamais inclure `next-env.d.ts` (régénéré par `next dev`) ni les scripts `scripts/tmp-*.mjs`.
2. **Branche** : si on est sur `master`, créer `claude/<sujet>` (sujet = `$ARGUMENTS` ou un
   slug court du chantier, minuscules-tirets). Si on est déjà sur une branche `claude/*`
   ou `<prénom>/*`, la garder.
3. **Vérifications locales** (toutes doivent passer, sinon corriger d'abord) :
   `npm run check:naming` → `npm run type-check` → `npm run build`.
4. **Commit** : message conventionnel en français (`feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`),
   corps = quoi/pourquoi + ADR concerné + ce qui a été vérifié ; terminer par
   `Co-Authored-By: Claude <noreply@anthropic.com>` (adapter au modèle en cours).
   ⚠️ PowerShell 5.1 : pas de guillemets doubles `"` dans le message (ça casse le passage d'arguments).
5. **Fetch + rebase** : `git fetch origin` puis `git rebase origin/master`. Conflit → le résoudre en
   adoptant la structure de l'autre (il a fusionné avant), re-vérifier (étape 3), `git add`, `git rebase --continue`.
6. **Push + PR** : `git push -u origin <branche>` puis
   `gh pr create --base master --head <branche> --title "<titre du commit>" --body "<résumé : quoi, pourquoi, vérifié comment, migration à appliquer ?>"`.
7. **CI** : `gh pr checks <n>` jusqu'à ce que `build` soit `pass` (≈ 1–2 min). Rouge → lire le job
   (`gh run view <id> --log-failed`), corriger, pousser sur la même branche (la PR se met à jour).
8. **Fusion** : `gh pr merge <n> --merge --delete-branch` (merge commit — style du repo, pas de squash).
9. **Retour** : `git checkout master && git pull --ff-only origin master && git branch -d <branche>`.
10. **Migration ?** Si la PR contenait un fichier `docs/migrations/*.sql`, rappeler à l'auteur humain de
    **l'appliquer dans l'éditeur SQL Supabase maintenant** et le noter dans la PR (commentaire `gh pr comment`).

## Ce que ce skill refuse

- Pousser sur `master` (le hook `guard-git.mjs` le bloque de toute façon).
- Fusionner avec un CI rouge ou sans PR.
- Mélanger deux chantiers dans une PR : si le diff couvre deux sujets, proposer de scinder.
