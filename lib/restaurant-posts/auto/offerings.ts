// ADR 0112 — « Ce que tu proposes » (terrasse, sur place, écran), tel que les phrases préparées s'en servent. Un article
// automatique ne parle jamais de ce que le restaurant n'a pas coché. PUR, testé ; la lecture est dans offerings-db.ts.

import type { Offers } from "../../site-orders/page-settings";
import type { PostBlock, PostContent } from "../types";
import { compose } from "./phrases";
import type { Facts, Offerings } from "./types";

export const NO_OFFERINGS: Offerings = { terrace: false, onSite: false, screen: false };

export const offeringsOf = (o: Offers): Offerings => ({ terrace: o.terrace, onSite: o.dineIn, screen: o.matchScreen });

const textOf = (c: { title: string; blocks: PostBlock[] }): string =>
  JSON.stringify([c.title, c.blocks.flatMap((b) => (b.type === "p" ? [b.text] : []))]);

/** Tout ce qu'on pourrait écrire avec une partie de ce qui est coché : rien, une case, deux, les trois. */
const within = (o: Offerings): Offerings[] =>
  (Object.keys(NO_OFFERINGS) as (keyof Offerings)[]).reduce<Offerings[]>(
    (all, key) => (o[key] ? [...all, ...all.map((x) => ({ ...x, [key]: true }))] : all),
    [NO_OFFERINGS],
  );

/**
 * Le brouillon composé la veille tient-il encore avec ce qui est coché maintenant ? Une case décochée depuis : non. Une
 * case cochée depuis ne change rien : l'article en dit seulement moins. À n'appeler que pour un brouillon que personne
 * n'a modifié.
 */
export function stillOffered(draft: PostContent, facts: Facts, variant: number, current: Offerings): boolean {
  const written = textOf(draft);
  return within(current).some((offerings) => textOf(compose(facts, { offerings, dishId: null, variant })) === written);
}
