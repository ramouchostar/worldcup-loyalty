# ADR 0054 — Console restaurateur : un seul jeu de primitives

**Statut** : Accepté (2026-09-13). Prolonge le redesign m54 (identité de la console :
Space Grotesk + JetBrains Mono, jetons `ink-*`/`paper-*`, icônes au lieu d'émojis) et le
socle de design system du 2026-09-12 (`design-system/boosteats/MASTER.md`), qui avait
explicitement laissé la console de côté. Amende la **surface** de l'**ADR 0052**
(l'arbitrage des doublons n'a plus de page dédiée). Aucune migration.

## Contexte

Le redesign m54 n'avait touché qu'une page : le dashboard. Les 21 autres pages de
`/admin/[restaurantId]/**` étaient restées sur le style d'avant. L'écart mesuré au
2026-09-13, avant ce chantier :

| | Dashboard | Les 21 autres pages |
|---|---|---|
| Titres | `font-display` · `text-ink` · `tracking-[-0.02em]` | `text-2xl font-bold text-gray-900` |
| Neutres | jetons `ink-*` / `paper-*` | `gray-*` — **682** occurrences contre 49 jetons |
| Statuts | `danger` / `warn` / `good` (contraste AA mesuré) | `red-600`, `green-700`, `amber-800`… — **335** occurrences, contraste non vérifié |
| Icônes | `lucide-react` | **209 emojis**, 2 fichiers sur 46 utilisant lucide |
| Cartes | 1 variante | 3 variantes concurrentes |

Le coût n'était pas seulement esthétique :

- **des blocs recopiés à la main divergeaient** — trois implémentations d'onglets de
  filtre (Commandes, Cadeaux, Actions) dont une seule posait un `bg-red-600` en dur ;
- **des textes sous le minimum AA** — les teintes brutes de Tailwind n'avaient jamais
  été mesurées sur `paper` (#FAFAF7), contrairement aux jetons ;
- **un arc-en-ciel sans signification** — six couleurs (rouge, orange, ambre, violet,
  fuchsia) pour des étiquettes purement descriptives sur les tickets signalés ;
- **une décision possible à deux endroits** — un ticket en arbitrage de doublon
  apparaissait dans Commandes *et* sur sa page dédiée ; le valider depuis Commandes
  sautait la comparaison côte à côte et laissait sa ligne `duplicate_reviews` en
  attente.

## Décision

### 1. Une liste fermée de primitives — `components/admin/ui/`

`PageHeader` · `Card` / `CardRow` / `SectionLabel` · `FilterTabs` · `EmptyState` ·
`StatTile` · `StatusBadge` · `Restricted`.

C'est **la** liste de ce dont une page de la console a besoin. Une page qui repose à la
main un titre, une carte ou un onglet recrée la divergence que ce socle referme : si une
primitive manque, on l'**ajoute ici** plutôt que de la réinventer sur place.

### 2. Jetons seulement — aucune couleur Tailwind brute

- neutres : `ink` / `ink-body` / `ink-muted` / `ink-faint`, `paper` / `paper-subtle` /
  `paper-border` ;
- statuts : `danger` / `warn` / `good`, mesurés AA sur `paper` (5,12 / 4,60 / 4,61:1) ;
- accent d'établissement : `brand-red` / `brand-gold` / `brand-dark` (ADR 0015).

**Le bleu n'existe pas dans la console.** Les encarts d'information sont neutres, pas
une sixième teinte.

**Le rouge ne sert qu'à ce qui est cassé ou refusé.** Un libellé descriptif — « > €200 »,
« OCR < 70 % », « Doublon possible » — est une information, pas une alerte : il prend le
ton neutre. La carte porte déjà sa bordure de statut, et un ticket qui affiche une
étiquette est de toute façon à regarder. Quand tout est rouge, plus rien ne se remarque.

**Exception — les surfaces sombres.** Sur `brand-dark`, `ink-faint` est illisible : les
textes atténués y sont des blancs transparents (`text-white/60`…), pas des jetons
d'encre.

### 3. Trois registres pour les emojis — avec un registre 2 propre à la console

1. **icône d'interface → `lucide-react`.** Un emoji ne se rend pas pareil sur iOS,
   Android et Windows : un ✓ de validation ne peut pas dépendre de la police système de
   l'appareil.
2. **illustration d'état vide → icône lucide sur pastille teintée.** Volontairement
   **pas** de Fluent Emoji 3D, contrairement à l'app membre (m54 : « rendu console pro
   plutôt que grand public »).
3. **donnée → l'emoji reste du texte.** Inchangé.

Restent donc, délibérément : les `message:` d'Opportunités (textes WhatsApp/push
**sortants**), les `icon:` de chaque proposition (illustration propre à l'offre, souvent
le glyphe qui ouvrira l'annonce), les types d'équipe (`teamTypeEmoji`, ADR 0031) et
`teams.flag_emoji`, le quadrant de la carte (⭐🐴🧩🪨, mnémonique), le 🎂 du coupon
d'anniversaire, et les décors des supports imprimables.

### 4. Le logo de l'établissement en tête de console

Le logo (`restaurants.logo_url`, ADR 0015) prend la place du nom écrit ; le nom passe en
`sr-only`. Sans logo, la pastille à initiale et le nom restent.

Le logo est **toujours posé sur une pastille blanche**, jamais à nu : l'en-tête est sur
`brand_dark` et rien ne garantit qu'un logo d'établissement contraste avec sa propre
couleur sombre — un logo monochrome noir y disparaîtrait. `object-contain` et non
`cover` : un logo est un dessin, le recadrer couperait un mot.

### 5. Une décision, un endroit

L'arbitrage des doublons (**ADR 0052**) devient un **onglet de Commandes** au lieu d'une
page à part, et un ticket en arbitrage **sort** du filtre « Suspectes ». La décision de
l'ADR 0052 est inchangée : seule sa surface bouge.

Même règle pour la navigation : une destination déjà dans la nav de gauche n'est pas
relistée en bas du dashboard.

## Conséquences

- Toute nouvelle page de la console part de `components/admin/ui/`. Un
  `text-gray-900`, un `bg-red-100` ou un emoji-icône dans `app/admin/**` ou
  `components/admin/**` est une régression, au même titre qu'exposer `target_revenue`
  côté client (ADR 0007).
- Les deux **exceptions** documentées restent hors règle : les supports imprimables
  (`qr/print/**`, dont les couleurs sont des choix d'impression) et les textes sortants.
- `RULE_LABELS` vit dans `lib/duplicate-review-labels.ts` : `lib/duplicate-reviews.ts`
  importe `next/headers`, et un composant client qui y prendrait une valeur d'exécution
  entraînerait le client Supabase serveur dans le bundle.
- La section « Fichiers » de l'**ADR 0052** mentionne encore
  `app/admin/[restaurantId]/duplicates/` : la file vit désormais dans
  `components/admin/DuplicateReviews.tsx` + `app/api/admin/duplicate-reviews/`.
- **`/platform` n'est pas concernée.** C'est une autre console, avec son propre accent
  (`platform-accent`) et son mode sombre : un chantier à part.

## Fichiers

- `components/admin/ui/` — les primitives, et `index.ts` qui en porte la règle
- `components/admin/RestaurantMark.tsx` — le logo (ou l'initiale) de l'établissement
- `components/admin/DuplicateReviews.tsx` + `app/api/admin/duplicate-reviews/route.ts`
- `design-system/boosteats/MASTER.md` — la ligne « console et `/platform` à faire » ne
  vaut plus que pour `/platform`
