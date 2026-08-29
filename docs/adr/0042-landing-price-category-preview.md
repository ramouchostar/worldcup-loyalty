# ADR 0042 — Landing publique : catégories de prix génériques, jamais de nom ni de seuil

**Statut** : Accepté — amendé par [ADR 0043](0043-landing-nom-produit-aleatoire.md) (la landing nomme désormais un article réel, tiré au hasard dans la tranche de prix ; la tranche elle-même ne s'affiche plus)

## Contexte

La landing publique post-scan (`app/r/[restaurantId]/page.tsx`) citait jusqu'ici
zéro cadeau concret dans son hero — seul le tour de bienvenue visiteur
(`VisitorTour`, ADR 0040) nommait de vrais articles du catalogue. Une refonte
du hero propose d'afficher, dès cette première page, un aperçu de ce que le
ticket peut débloquer.

Deux problèmes empêchent de reprendre tel quel le mockup initial :

1. **Nommer un article réel avant même le scan sur-promet.** Le cadeau
   effectivement délivré dépend du double verrou (ADR 0007), du plafond
   budget mensuel (ADR 0012) et de la couverture d'équipe (ADR 0017) — tous
   invisibles côté client. Nommer "Finest burger" sur la toute première
   impression du programme risque d'annoncer un article qui ne sera pas
   couvert.
2. **Le mockup affichait des seuils en euros** ("dès 25 € de commande", "dès
   40 € cumulés"). Interdit tel quel : ADR 0007, amendé par ADR 0028, bannit
   tout euro côté client, y compris les dépenses personnelles du membre — la
   seule exception est la saisie du montant à la soumission du ticket.

## Décision

### 1. Aperçu par catégorie de prix, jamais par nom

`lib/reward-tier-preview.ts::getLandingTierPreview(restaurantId)` calcule,
pour chaque couche de récompense configurée (`solo` → `community` →
`saver`), la **catégorie de prix** de l'article assigné à son palier
d'entrée (seuil le plus bas) :

- **Catégorie 1** — produit parmi les plus chers du catalogue.
- **Catégorie 2** — milieu de panier.
- **Catégorie 3** — petit produit (frites, milkshake…).

La catégorie est calculée par **tertiles de `menu_price`** sur le catalogue
actif et éligible aux récompenses de l'établissement (pas de tranches
codées en dur — s'adapte à chaque resto, comme les paliers eux-mêmes,
ADR 0017). La fonction ne renvoie jamais un nom d'article ni un montant —
uniquement `{ layer, category }`. Best-effort : une erreur renvoie `[]`,
la landing ne tombe jamais pour cet aperçu (même principe que
`recordLanding`, ADR 0037).

### 2. Rendu : icône + libellé générique + relance qualitative

La carte "Ce que ce ticket peut débloquer" affiche, par couche présente,
une ligne `{icône} Produit catégorie {1|2|3}` suivie d'une relance
qualitative fixe par couche ("Dès cette commande" / "En cumulant avec ta
communauté" / "En mettant de côté tes visites") — jamais de seuil, jamais
d'euro, en cohérence avec le principe "conséquences, pas chiffres" de
l'ADR 0010. La carte entière est masquée si l'établissement n'a aucun
palier configuré.

### 3. Portée limitée à cette landing

Cette décision s'applique **uniquement** à la landing publique pré-scan.
Le tour de bienvenue visiteur (`VisitorTour`, ADR 0040) n'est pas touché et
continue de nommer de vrais cadeaux — incohérence assumée entre les deux
écrans pour cette itération (choix produit, 2026-08-29), à trancher
séparément si le retour terrain le justifie.

### 4. Simplifications d'accompagnement

- Un seul CTA dans le hero ("📷 Scanner mon ticket") — le bouton secondaire
  "🏆 Classement live" est retiré ; le classement reste accessible via le
  pied de page et la section "Top 5 équipes".
- "Pas de ticket sous la main ? Crée ton compte quand même" devient "Déjà
  membre ? Se connecter" (même action serveur `redirectToLogin`) — le lien
  secondaire vise désormais les membres existants plutôt que les visiteurs
  sans ticket.
- Les 3 étapes numérotées repartent de la photo du ticket, pas du scan du
  QR (déjà fait pour arriver sur cette page).

## Conséquences

### Code
- `lib/reward-tier-preview.ts` (nouveau) : `getLandingTierPreview`.
- `app/r/[restaurantId]/page.tsx` : hero restructuré, carte blanche
  superposée avec aperçu + CTA + étapes, ancienne section "Comment ça
  marche" repliée dans la carte.

### À surveiller
- Toute évolution qui voudrait nommer un article sur cette landing devra
  d'abord amender cet ADR et revérifier la conformité ADR 0007/0028.
- Si le décalage avec le tour de bienvenue (catégories ici, noms réels
  deux écrans plus tard) crée de la confusion terrain, un chantier séparé
  devra harmoniser les deux surfaces.
