---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "**/*.css"
  - "public/marketing/**"
---

# Charte anti-slop (ADR 0090) — chargée quand on touche au front

**On ne restructure pas une page pour la rendre jolie** : sections, contenus et ordre sont des
décisions du porteur. On ne travaille que le design, sauf demande explicite.

## Avant de construire
- Montrer le rendu (capture ou aperçu) et attendre un oui (ADR 0065).
- Skills utiles : `ui-design-brain`, `frontend-design`, `interface-design` (console),
  `better-icons` (icônes), `web-design-guidelines` et `improve-react` (relecture).

## Interdits
- Dégradé (y compris en voile sur une photo), verre dépoli / `backdrop-blur`, blob, flou décoratif, 3D.
- Vert acide `#A2C523` et utilitaires `*-moss` : l'accent est l'olive `boost-olive` (`#6B7C3F`),
  texte d'accent `boost-olive-dark` (`#4F5C2D`), sur fond sombre `boost-light`.
- Nouvel import `lucide-react` : icônes Hugeicons via `@/components/icons` ; pour en ajouter une,
  l'inscrire dans `scripts/icons/build-icons.mjs` puis lancer le script
  (`NODE_OPTIONS=--use-system-ca` sur le PC Euronet).
- Mot du titre en couleur, capitales espacées au-dessus d'un titre, monospace décoratif, gras saupoudré.
- Chaînes « A · B », « → » collé à un lien, « ce n'est pas X, c'est Y ».
- Apparitions au défilement ; plus d'une animation autonome par page.
- Image d'illustration présentée comme un vrai client, restaurateur ou membre de l'équipe.

## Obligatoire
- Fond uni ; deux arrondis (8 px, rond des avatars ; pilule = filtres) ; une ombre :
  `0 8px 24px rgba(12,21,9,.10)`.
- Instrument Sans ; tailles 13 · 15 · 17 · 20 · 24 · 32 · 44 · 56 px ; titres 600, −2 à −3 %.
- Contraste mesuré : 4,5:1 texte, 3:1 icônes et bords de champ.
- États : survol, appui, focus visible, désactivé ; 44 px de zone de toucher sur téléphone.
- `prefers-reduced-motion` respecté.

## Avant de pousser
- `npm run check:design` (le CI le lance : un compte qui monte fait échouer la PR ; après un
  nettoyage, `node scripts/check-design.mjs --update` fige le progrès).
- Captures 390 / 768 / 1 440 px dans la PR, débordement horizontal = 0.
- Serveur local hors OneDrive (`~/dev/...`) : sous OneDrive, `next dev` recompile en boucle.
