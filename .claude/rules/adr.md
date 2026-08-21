---
paths:
  - "docs/adr/**"
---

# Règles ADR (chargées quand on touche à docs/adr/)

- **Numéro = suivant sur `origin/master`** (`git fetch` d'abord), jamais depuis le clone local.
  `/new-adr` le fait correctement. Le CI refuse les doublons.
- **Réserver vite** : ouvrir la PR dès le fichier créé, même en statut « Proposé ».
- **Format du projet** : titre `# ADR NNNN — …`, ligne `**Statut**` (Proposé / Accepté + date,
  et les mentions « amendé par », « supersedé par »), puis Contexte / Décision / Conséquences.
- **Cascade documentaire** : amender le statut des ADR touchés, mettre à jour le glossaire
  `CONTEXT.md` (terme + `_Avoid_`) et `CLAUDE.md` si une règle devient critique.
- Un ADR dit **pourquoi** ; le détail d'implémentation vit dans le code et ses commentaires.
- Ne jamais renuméroter un ADR déjà fusionné (les références croisées casseraient) : en cas de
  collision détectée tard, c'est le **dernier arrivé** qui change de numéro.
