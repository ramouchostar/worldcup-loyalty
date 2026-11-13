// Les textes de l'écran « Options de mes plats » (ADR 0100), écrits pour quelqu'un qui n'est pas du tout technique :
// comme si on parlait à un enfant de 12 ans. Une phrase courte, un exemple, jamais un mot de développeur. Purs et testés
// (le client lit « SANS SALADE », jamais « SANS » tout seul : le cuisinier peut ne pas comprendre).

import type { Strength } from "./families";
import type { GroupKind } from "./types";

export const KIND_LABEL: Record<GroupKind, string> = {
  inclus: "Gratuit, le client choisit",
  variante: "Obligatoire (taille, pâtes…)",
  extra: "En plus, payant",
  retrait: "À enlever (« sans… »)",
};

export const KIND_TIP: Record<GroupKind, string> = {
  inclus: "Le client choisit, et ça ne coûte rien de plus. Exemple : la sauce qui est déjà comprise dans le prix.",
  variante: "Le client doit choisir une seule chose avant de commander. Exemple : la taille de la pizza.",
  extra: "Des choses en plus que le client peut ajouter, et qu'il paie. Exemple : un supplément de fromage.",
  retrait: "Ce que le client ne veut pas dans son plat. Exemple : sans salade. C'est gratuit. Le cuisinier lit « SANS SALADE » en gros sur le ticket, jamais juste « SANS ».",
};

/** La règle d'une liste de choix, en une phrase que le restaurateur comprend. */
export function ruleText(kind: GroupKind, min: number, max: number | null): string {
  if (kind === "retrait") return "Le client peut enlever ce qu'il veut. C'est gratuit. Le cuisinier lit « SANS » avec le nom, par exemple « SANS SALADE », jamais juste « SANS ».";
  if (max === null) return min === 0 ? "Le client peut en prendre autant qu'il veut, ou aucun." : `Le client doit en prendre au moins ${min}, et il peut en prendre autant qu'il veut.`;
  if (max === 1) return min === 0 ? "Le client peut en prendre un seul, ou aucun." : "Le client doit en prendre un, et un seul.";
  if (min === max) return `Le client doit en prendre exactement ${max}.`;
  return min === 0 ? `Le client peut en prendre jusqu'à ${max}, ou aucun.` : `Le client doit en prendre entre ${min} et ${max}.`;
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  forte: "Choix déjà préparés",
  moyenne: "Choix à relire",
  faible: "Idées à cocher",
  aucune: "Sans choix",
};

export const STRENGTH_NOTE: Record<Strength, string> = {
  forte: "Pour ces plats, presque tous les restaurants proposent les mêmes choix. Nous les avons déjà préparés : tu décoches ce que tu ne fais pas et tu mets tes prix.",
  moyenne: "La plupart des restaurants proposent des choix proches pour ces plats, mais pas tous. Relis bien chaque ligne.",
  faible: "Chaque restaurant fait à sa façon pour ces plats. Ce sont des idées à cocher, pas une réponse : tu connais tes vrais choix mieux que nous.",
  aucune: "Ces plats n'ont pas de choix : un seul clic.",
};

export const TIPS = {
  validate: "Tu as tout relu dans ce groupe ? Un seul clic, et c'est réglé pour tous ses plats.",
  validateBlocked: (n: number) => `Il manque ${n} prix de suppléments. Mets un prix, ou décoche le choix que tu ne vends pas.`,
  merge: "Un autre groupe a les mêmes choix que celui-ci ? Réunis-les. Les plats de l'autre groupe prendront les choix de celui-ci.",
  removeArticle: "Retirer ce plat du groupe. Il n'aura plus de choix, tu pourras les lui donner plus tard.",
  suggestedArticle: "Proposé par nous : les plats de cette famille ont souvent les mêmes choix. Garde-le s'il a les mêmes choix que les autres, sinon retire-le avec la croix.",
  addArticle: "Un plat qui a les mêmes choix que ce groupe ? Ajoute-le : il prendra les choix de ce groupe.",
  split: "Ce plat n'a pas les mêmes choix que les autres de ce groupe. On le met dans un groupe à lui pour que tu le règles seul.",
  keep: "Case cochée : tes clients voient ce choix. Décoche la case si tu ne veux plus le proposer.",
  proposal: "Ce choix est une proposition de notre part, pas une chose que tu as écrite. Si tu ne le vends pas, décoche la case et tes clients ne le verront pas.",
  price: "Ce que le client paie en plus pour ce choix. Nous ne connaissons pas tes prix : c'est toi qui les mets. 0 € veut dire que c'est gratuit.",
  bulk: "Tous ces choix ont le même prix chez toi ? Tape-le une fois, et il est mis partout. Tu peux ensuite changer une ligne.",
  maxQty: "Combien de fois le client peut prendre la même chose. Exemple : 3 pour avoir la même sauce jusqu'à 3 fois. 1 veut dire une seule fois.",
  isDefault: "Déjà coché quand le client ouvre le plat, par exemple la salade. S'il la décoche, le cuisinier lit « SANS SALADE » sur le ticket, pas juste « SANS ».",
  min: "Combien de choses le client doit choisir, au moins. 0 veut dire qu'il peut ne rien choisir.",
  max: "Combien de choses il peut choisir, au plus. Laisse vide s'il n'y a pas de limite.",
  guess: "Nous avons deviné de quel genre est cette liste de choix, mais nous ne sommes pas sûrs. Regarde la case à côté : si ce n'est pas le bon genre, change-le.",
  menuPrice: "Ce prix vient de ton menu, celui que tu as déjà dans Boosteats. Pour le changer, va dans « Menu et coûts ».",
} as const;

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
