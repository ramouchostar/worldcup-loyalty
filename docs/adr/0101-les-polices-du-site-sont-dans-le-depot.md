# ADR 0101 — Les polices du site sont dans le dépôt, le build n'a plus besoin de Google

**Statut** : Proposé (2026-11-13), par Omar. Précise la charte [ADR 0090](0090-charte-anti-slop.md) (Instrument Sans, tailles et graisses) et la charte graphique par établissement (`lib/branding.ts`, `FONT_OPTIONS`) : **aucune police, aucune graisse ni aucune variable CSS ne change**, seule la provenance des fichiers.

## Contexte

Les onze familles du site étaient chargées par `next/font/google`, qui les **télécharge pendant le build**, depuis le réseau de la CI et de Vercel. Quand Google ne répond pas, le build échoue avec « Can't resolve '@vercel/turbopack-next/internal/font/google/font' », sans rapport avec le code livré. Constaté le 2026-11-13 sur les PR #435, #441, #444 et #445 (un contrôle `build` rouge à relancer, deux déploiements Vercel en échec). Un déploiement de production qui échoue ainsi laisse l'ancienne version en ligne sans que personne l'ait voulu.

## Décision

Les fichiers `woff2` du sous-ensemble **latin** (le français : accents, « œ », « € », tirets et apostrophes typographiques, comme avant) sont **dans le dépôt**, sous `app/fonts/` (384 Ko pour 14 fichiers), et chargés par `next/font/local` dans `app/layout.tsx` avec les mêmes variables CSS (`--font-inter`, `--font-instrument`…). Le script `scripts/fonts/fetch-fonts.mjs` les récupère chez Google Fonts avec les mêmes graisses qu'avant et écrit un manifeste ; il ne se lance **jamais au build**, seulement quand on change de police ou de graisse. Toutes les familles sont publiées sous licence SIL Open Font License 1.1 (`app/fonts/LICENSES.md`), qui autorise l'hébergement et la redistribution avec le site.

Une police variable (un seul fichier pour toutes les graisses) est déclarée avec sa plage (`weight: "100 900"`) ; les fichiers statiques de Poppins gardent une graisse chacun. Le repli de secours ajusté (`adjustFontFallback`) reste sur Arial, sur Times New Roman pour Playfair Display (à empattements) et il est coupé pour JetBrains Mono (chasse fixe).

## Conséquences

- **Plus d'échec de build ou de déploiement dû à Google.** Le build a été lancé avec un proxy volontairement inaccessible : il réussit.
- **Même rendu**, à vérifier par la comparaison avant/après de la PR. Les subsets latin-ext, cyrillique, grec et vietnamien n'étaient pas chargés avant et ne le sont pas : un nom d'établissement polonais ou turc retomberait sur la police de secours, comme avant.
- **Le dépôt grossit de 384 Ko** (binaires). Mettre à jour une police = relancer le script et valider le diff, pas un simple changement de version.
- **Les `.woff2` doivent rester inchangés par les fins de ligne** : ce sont des binaires, jamais retouchés à la main.

## Alternatives rejetées

- **Garder `next/font/google` et relancer les builds en échec** : chaque relance coûte plusieurs minutes et un humain, et ne protège pas un déploiement de production.
- **Paquets `@fontsource/*`** : une dépendance de plus par famille à tenir à jour, pour les mêmes fichiers.
- **Une balise `<link>` vers Google Fonts à l'exécution** : un domaine externe de plus dans la politique de sécurité des contenus (CSP), une requête de plus au chargement, et un transfert de l'adresse IP du visiteur à Google (RGPD) que l'hébergement local évite.
