# ADR 0090 — La charte anti-slop : un seul Boosteats, sobre, vérifié à chaque page

**Statut** : Accepté (2026-11-05) — décidé par le porteur sur la proposition
https://claude.ai/artifact/SBt9HRy9DeajVo4GYVmj8V. **Remplace le style** (pas la structure) de la
maquette de l'[ADR 0089](0089-la-brigade-des-idees-que-le-gerant-valide.md) : verre dépoli, photos de
banque d'images partout et vert acide. Complète la [charte Boosteats](../../design-system/boosteats/MASTER.md),
l'[ADR 0054](0054-console-restaurateur-un-seul-jeu-de-primitives.md) (primitives de la console) et le
bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md) (montrer le rendu avant de construire).

## Contexte

Le 2026-11-05, la landing additionnait les signes d'une page générée : verre dépoli sur chaque carte,
dégradés en voile sur chaque photo, vert acide sur fond quasi noir, trois polices sur une page (cinq dans
le produit), une pastille au-dessus de chaque titre, un mot du titre en couleur, des « A · B » et des
« → » partout, des photos Unsplash là où on parle de vrais restaurants. Le défaut le plus grave était
mesurable : le texte blanc sur le vert #A2C523 des boutons principaux avait un contraste de **1,99:1**
(minimum 4,5:1). Nos cibles — restaurateurs indépendants et leurs clients — ont besoin d'une interface
simple, sobre et crédible.

## Décision

1. **La structure ne bouge pas, on ne travaille que le design** : sections, contenus et ordre restent ceux
   décidés par le porteur.
2. **Fond et surfaces** : fond uni blanc (ou blanc cassé à peine teinté). Interdits : dégradé, verre
   dépoli, blob lumineux, flou décoratif, forme 3D. Une carte seulement pour un objet qu'on touche ou
   compare ; deux arrondis (8 px, et le rond des avatars ; la pilule reste aux filtres) ; une seule ombre
   discrète pour ce qui flotte. Texte blanc sur photo : voile **uni**, jamais un dégradé.
3. **Couleur** : l'olive Boosteats `#6B7C3F` est le seul accent partout (texte d'accent `#4F5C2D`) ; le
   vert acide disparaît. Rouge réservé à ce qui est cassé ou refusé. Contraste 4,5:1 pour tout texte,
   3:1 pour les icônes et bords de champ, **mesuré**.
4. **Typographie** : Instrument Sans, une seule famille pour tout Boosteats (vitrine, puis console et
   plateforme) ; l'app membre garde la police de l'établissement (ADR 0015). Échelle fixe 13 · 15 · 17 ·
   20 · 24 · 32 · 44 · 56 px. Interdits : mot du titre en couleur, capitales espacées au-dessus des
   titres, monospace décoratif, gras saupoudré.
5. **Icônes** : Hugeicons (trait arrondi 1,5), servies par `components/icons/` que génère
   `scripts/icons/build-icons.mjs` (better-icons / Iconify) ; plus de nouvel import `lucide-react`.
6. **Photos** : d'abord les vraies (établissements, plats, équipe) ; une image d'illustration ne passe
   jamais pour un vrai client, un vrai restaurateur ou un membre de l'équipe, et le crédit le dit.
7. **Mouvement et états** : rien ne bouge seul, une exception par page au plus (sur la landing, le
   téléphone du héros) ; pas d'apparition au défilement ; survol, appui, focus clavier visible et
   désactivé sur tout ce qui se clique ; 44 px de zone de toucher sur téléphone ;
   `prefers-reduced-motion` respecté.
8. **Texte** : phrases courtes, vocabulaire du restaurateur ; interdits : « ce n'est pas X, c'est Y »,
   « pas de X, pas de Y », chaînes « A · B · C », « → » collé aux liens.
9. **Contrôle qualité**, à chaque page touchée :
   - CI : `scripts/check-design.mjs` compte les motifs interdits (dégradé, verre, flou, Lucide, vert
     acide) fichier par fichier ; les comptes du 2026-11-05 sont figés dans
     `scripts/design-baseline.json` et ne peuvent que baisser ;
   - PR : captures à 390, 768 et 1 440 px, débordement horizontal nul, contrastes mesurés, focus
     vérifié au clavier ;
   - avant de construire : le rendu se montre d'abord (ADR 0065).

## Conséquences

- La landing (`components/restaurateurs/`) est passée à la charte le 2026-11-05 ; viennent ensuite les
  pages publiques et le blog, la connexion et l'analyse gratuite, l'app membre, la console, la plateforme.
- La barre de recherche partagée (`RestaurantSearchBar`) passe à l'olive lisible sur toutes les pages
  publiques en même temps.
- Les tokens `moss-*` et `night-*` du site vitrine restent dans `tailwind.config.ts` tant que d'autres
  pages les utilisent ; le cliquet empêche leur retour sur une page nettoyée.
- Trace : le nombre d'occurrences restantes (`node scripts/check-design.mjs --update`, 336 au
  2026-11-05) dit où on en est ; toute hausse fait échouer le CI.
- Règles détaillées pour les agents : `.claude/rules/design.md`.
