# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Boosteats
**Generated:** 2026-09-12 21:27:55 (ui-ux-pro-max 2.13.0)
**Category:** Restaurant/Food Service
**Révisé le 2026-09-12** — sortie du générateur réconciliée avec le code réel.

> **Statut de ce fichier.** Les sections *Typographie*, *Palette*, *Espacement*,
> *Ombres* et *Anti-patterns* ont été alignées sur ce que l'app fait
> réellement — c'est la version qui fait foi. Le reste (pattern de page, style,
> checklist) est la proposition brute du générateur, utile comme grille de
> relecture, pas comme décision prise.
>
> Rappel de cadrage produit, qui prime sur tout ce document : `CLAUDE.md` et
> `docs/adr/`. En particulier l'**ADR 0007** (aucun euro ni seuil côté membre)
> et l'**ADR 0015** (chaque établissement a sa charte : couleurs et police
> pilotées par `lib/branding.ts`, jamais figées dans un composant).

---

## Global Rules

### Color Palette

La palette proposée par le générateur (rouge « appétissant » + or) n'a pas été
retenue : Boosteats n'a pas UNE palette, il en a une par établissement
(`restaurants.brand_primary / brand_dark / brand_accent`, ADR 0015). Les jetons
réels, définis dans `app/globals.css` et `tailwind.config.ts` :

| Rôle | Jeton Tailwind | Défaut Boosteats | Surchargé par établissement |
|------|----------------|------------------|------------------------------|
| Accent principal, boutons | `brand-red` | `#6B7C3F` (vert olive) | oui — `brand_primary` |
| Mise en avant, badges | `brand-gold` | `#A9BB6E` | oui — `brand_accent` |
| En-têtes, fonds sombres | `brand-dark` | `#0C1509` | oui — `brand_dark` |
| Console restaurateur | `ink-*` / `paper-*` | neutres fixes (m54) | non |
| Vitrine restaurateurs | `moss-*` / `night-*` | fixes (m55) | non |
| Console plateforme | `platform-accent` | `#A2C523` | non — `/platform` uniquement |

Statut, contrastes vérifiés sur `paper` (#FAFAF7) le 2026-09-12 :

| Jeton | Valeur | Contraste |
|-------|--------|-----------|
| `danger` | `#B8443A` | 5,12:1 |
| `warn` | `#9E6612` | 4,60:1 |
| `good` | `#467F3B` | 4,61:1 |
| `ink-faint` | `#6F6F68` | 4,84:1 |

**Deux règles de couleur propres au produit**, plus fortes que n'importe quelle
proposition de palette :
- **jamais de texte rouge côté client** — `brand_accent` résout en rouge pour
  Kraainem, ce qui fait lire une bonne nouvelle comme une alerte ;
- **aucun accent rouge sur l'écran de gain** (ADR 0048 §7).

### Typography

Référence demandée : Uber. **Uber Move** et **Uber Move Text** sont des polices
propriétaires commandées par Uber — ni sur Google Fonts, ni licenciables pour
une autre app. On reprend leur découpage, pas leurs fichiers :

- **Titres — Manrope** (`--brand-display-font`, utilitaire `font-brand-display`) :
  la géométrique typée, comme Uber Move pour les titres et les gros chiffres.
- **Corps — Inter** (`--brand-font`, et `fontFamily.sans` pour toute l'app) :
  la grotesque neutre, imbattable en 11–13px, comme Uber Move Text dans l'UI.

Ce que le générateur proposait (Playfair Display SC en titre, Karla en corps)
n'a pas été retenu : une display serif ne tient pas un écran de liste sur
mobile, et aucune des deux n'est dans l'app.

Portée :
- les deux polices sont les **défauts** ; un établissement qui a choisi sa
  police (m48, `FONT_OPTIONS`) la garde partout, titres compris ;
- la console restaurateur garde **Space Grotesk** (titres) + **JetBrains Mono**
  (étiquettes) — identité de l'outil, m54 ;
- la vitrine restaurateurs garde **Archivo** — m55.

Les variables `next/font` sont posées sur `<html>` et non sur `<body>` : le
preflight Tailwind déclare `font-family` sur `<html>`, où une `var()` non
définie invaliderait toute la déclaration.

### Spacing Variables

L'échelle recommandée (4 / 8 / 16 / 24 / 32 / 48 / 64 px) **est déjà** celle de
Tailwind : `1 / 2 / 4 / 6 / 8 / 12 / 16`. Aucun jeton `--space-*` n'a été ajouté
— deux systèmes d'espacement en parallèle, c'est la garantie que les deux
divergent. On utilise les utilitaires Tailwind.

| Recommandation | Utilitaire | Usage |
|----------------|------------|-------|
| 4px | `p-1` / `gap-1` | interstices serrés |
| 8px | `p-2` / `gap-2` | icône ↔ texte |
| 16px | `p-4` | padding standard |
| 24px | `p-6` | padding de section |
| 32px | `p-8` | grands écarts |
| 48px | `p-12` | marges de section |
| 64px | `p-16` | padding de hero |

### Shadow Depths

Même constat : les quatre niveaux proposés correspondent aux `shadow-sm`,
`shadow-md`, `shadow-lg`, `shadow-xl` de Tailwind, aux ombres portées près.
On utilise ces utilitaires.

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A16207;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #DC2626;
  border: 2px solid #DC2626;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FEF2F2;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #DC2626;
  outline: none;
  box-shadow: 0 0 0 3px #DC262620;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Vibrant & Block-based

**Keywords:** Bold, energetic, playful, block layout, geometric shapes, high color contrast, duotone, modern, energetic

**Best For:** Startups, creative agencies, gaming, social media, youth-focused, entertainment, consumer

**Key Effects:** Large sections (48px+ gaps), animated patterns, bold hover (color shift), scroll-snap, large type (32px+), 200-300ms

### Page Pattern

**Pattern Name:** Funnel (3-Step Conversion)

- **Conversion Strategy:** Progressive disclosure. Show only essential info per step. Use progress indicators. Multiple CTAs.
- **CTA Placement:** Each step: mini-CTA. Final: main CTA
- **Section Order:** Hero > Step 1 (problem) > Step 2 (solution) > Step 3 (action) > CTA progression

---

## Anti-Patterns (Do NOT Use)

- ❌ Low-quality imagery
- ❌ Outdated hours

### Additional Forbidden Patterns

- ❌ **Emoji en guise d'icône d'interface** — trois registres, un par rôle
  (appliqué à l'app membre le 2026-09-12 ; console et `/platform` à faire) :
  1. **icône d'action ou d'état** → `lucide-react` (un emoji ne se rend pas
     pareil sur iOS, Android et Windows) ;
  2. **illustration d'état vide** → Fluent Emoji 3D (`lib/fluent-emoji.ts`) ;
  3. **donnée** → l'emoji reste du texte : podium 🥇🥈🥉, type d'équipe
     (`teamTypeEmoji`, ADR 0031), réseaux sociaux, messages WhatsApp sortants.
  Exception : les glyphes qui **reproduisent l'interface d'un autre logiciel**
  (⬆️ ＋ ⋮ de Safari/Chrome dans `PostTicketSheet`) restent tels quels.
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Quatre points sont **déjà tenus globalement** dans `app/globals.css` (socle du
2026-09-12) — ne pas les reposer composant par composant : `cursor: pointer`
sur les éléments cliquables, focus clavier visible (`:focus-visible`, anneau en
`currentColor`), `prefers-reduced-motion` respecté (chargeurs et squelettes
ralentis plutôt que figés), et les jetons de couleur au-dessus de 4,5:1.

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
