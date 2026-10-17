import { isObjective, isRegie, type Objective, type Regie } from "./objectives";

// ADR 0085 §2-3 — lecture du nom d'une campagne, d'un ensemble ou d'une
// publicité. Module PUR et testé : il dit à qui appartient une campagne et ce
// qui cloche, il ne corrige jamais rien.
//
//   <code client>_<établissement>_<régie>_<objectif>_v<N>          campagne
//   <nom de la campagne>_<ciblage | création>                      ensemble / publicité
//
// « _ » ne sert qu'à séparer : les identifiants d'établissement et les
// segments libres utilisent le tiret.

export type NameProblem =
  | "separator" // pas la forme attendue : illisible, jamais rattachée
  | "unknown_code" // code client que personne ne porte
  | "establishment_mismatch" // le code et l'établissement ne vont pas ensemble
  | "unknown_regie"
  | "unknown_objective"
  | "missing_version"
  | "prefix_mismatch"; // ensemble ou publicité dont le préfixe n'est pas sa campagne

export type ParsedName = {
  clientCode: string;
  establishment: string;
  regie: string;
  objective: string;
  version: number | null;
  /** Ciblage (ensemble) ou création (publicité) ; null pour une campagne. */
  suffix: string | null;
};

const CODE = /^[A-Z]{2}[0-9]{3}$/;
const VERSION = /^v([0-9]+)$/i;

/** Découpe un nom ; null s'il n'a pas la forme (moins de cinq segments, code illisible). */
export function parseAdName(name: string): ParsedName | null {
  const parts = name.trim().split("_");
  if (parts.length < 5 || parts.length > 6) return null;
  const [rawCode, establishment, rawRegie, rawObjective, rawVersion, suffix] = parts;
  const clientCode = rawCode.toUpperCase();
  if (!CODE.test(clientCode) || !establishment) return null;
  const v = VERSION.exec(rawVersion);
  return {
    clientCode,
    establishment,
    regie: rawRegie.toUpperCase(),
    objective: rawObjective.toUpperCase(),
    version: v ? Number(v[1]) : null,
    suffix: suffix ?? null,
  };
}

export type Attachment =
  | {
      attached: true;
      restaurantId: string;
      parsed: ParsedName;
      regie: Regie | null;
      objective: Objective | null;
      /** Signalés sur /platform, sans empêcher le rattachement. */
      warnings: NameProblem[];
    }
  | { attached: false; parsed: ParsedName | null; problem: NameProblem };

/**
 * À qui appartient une campagne, d'après son nom (première lecture seulement :
 * ensuite le lien identifiant → établissement fait foi).
 * @param clients code client → identifiant d'établissement (`restaurants.client_code`)
 */
export function attachCampaign(name: string, clients: ReadonlyMap<string, string>): Attachment {
  const parsed = parseAdName(name);
  if (!parsed) return { attached: false, parsed: null, problem: "separator" };
  const restaurantId = clients.get(parsed.clientCode);
  if (!restaurantId) return { attached: false, parsed, problem: "unknown_code" };
  if (restaurantId !== parsed.establishment) return { attached: false, parsed, problem: "establishment_mismatch" };

  const warnings: NameProblem[] = [];
  const regie = isRegie(parsed.regie) ? parsed.regie : null;
  const objective = isObjective(parsed.objective) ? parsed.objective : null;
  if (!regie) warnings.push("unknown_regie");
  if (!objective) warnings.push("unknown_objective");
  if (parsed.version === null) warnings.push("missing_version");
  if (parsed.suffix !== null) warnings.push("prefix_mismatch"); // un nom de campagne n'a pas de suffixe
  return { attached: true, restaurantId, parsed, regie, objective, warnings };
}

/** Un ensemble ou une publicité doit commencer par le nom exact de sa campagne, puis `_<libre>`. */
export function childMatchesCampaign(childName: string, campaignName: string): boolean {
  const prefix = `${campaignName.trim()}_`;
  const child = childName.trim();
  return child.startsWith(prefix) && child.length > prefix.length && !child.slice(prefix.length).includes("_");
}

/** Le nom qu'on donne à une campagne créée par Boosteats. */
export function campaignName(p: {
  clientCode: string;
  establishment: string;
  regie: Regie;
  objective: Objective;
  version: number;
}): string {
  if (p.establishment.includes("_")) throw new Error(`identifiant d'établissement avec « _ » : ${p.establishment}`);
  return `${p.clientCode}_${p.establishment}_${p.regie}_${p.objective}_v${p.version}`;
}

/** Un segment libre (ciblage, création) : minuscules, tirets, jamais « _ ». */
export function freeSegment(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
