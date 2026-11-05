#!/usr/bin/env node
// Génère components/icons/index.tsx à partir de Hugeicons (trait arrondi 1,5),
// la bibliothèque d'icônes de Boosteats (charte anti-slop, 2026-11-05).
//
// Pourquoi un module local plutôt qu'un paquet : aucune dépendance, aucun appel
// à un service tiers à l'affichage (CSP fermée), seules les icônes utilisées
// partent dans le bundle. Les SVG viennent d'Iconify, la source de better-icons.
//
// Ajouter une icône : la chercher (`NODE_OPTIONS=--use-system-ca npx better-icons
// search <mot> --prefix hugeicons`), l'ajouter à ICONS ci-dessous, puis lancer
// `node scripts/icons/build-icons.mjs`. Ne jamais éditer le fichier généré à la main.
// Sur le PC Euronet, Node a besoin de `NODE_OPTIONS=--use-system-ca` (Zscaler).

import { writeFileSync } from "node:fs";

// Nom du composant → nom Hugeicons.
const ICONS = {
  ArrowDown: "arrow-down-01",
  ArrowRight: "arrow-right-02",
  Calculator: "calculator-01",
  ChartColumn: "chart-column",
  Check: "tick-02",
  Close: "cancel-01",
  Gauge: "dashboard-speed-01",
  Location: "location-01",
  Search: "search-01",
  Smartphone: "smartphone",
  Star: "star",
};

const out = [];
for (const [name, id] of Object.entries(ICONS)) {
  const res = await fetch(`https://api.iconify.design/hugeicons.json?icons=${id}`);
  if (!res.ok) throw new Error(`${id} : HTTP ${res.status}`);
  const json = await res.json();
  const icon = json.icons?.[id];
  if (!icon) throw new Error(`${id} : introuvable chez Hugeicons`);
  const size = json.width ?? icon.width ?? 24;
  // Le corps est injecté tel quel (innerHTML) : les attributs restent en kebab-case.
  const body = icon.body;
  out.push({ name, id, size, body });
}

const file = `// FICHIER GÉNÉRÉ par scripts/icons/build-icons.mjs, ne pas éditer à la main.
// Icônes Hugeicons (trait arrondi 1,5, licence MIT), la bibliothèque de Boosteats.
import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function make(viewBox: string, body: string, name: string) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={viewBox}
        aria-hidden={rest["aria-label"] ? undefined : true}
        focusable="false"
        dangerouslySetInnerHTML={{ __html: body }}
        {...rest}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

${out
  .map((i) => `/** hugeicons:${i.id} */\nexport const ${i.name} = make("0 0 ${i.size} ${i.size}", ${JSON.stringify(i.body)}, "${i.name}");`)
  .join("\n")}
`;

writeFileSync(new URL("../../components/icons/index.tsx", import.meta.url), file);
console.log(`${out.length} icônes écrites dans components/icons/index.tsx`);
