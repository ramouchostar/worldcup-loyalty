import Anthropic from "@anthropic-ai/sdk";
import { getMenuItems } from "./menu";
import { COMMUNITY_BANDS } from "./reward-bands";
import { getAverageBasket } from "./avg-basket";
import {
  DEFAULT_BUDGET_PCT,
  pickBestGift,
  soloCostCap,
  suggestSoloBands,
  type GiftCandidate,
} from "./reward-sizing";

// ADR 0013 — Suggestion de cadeaux. L'app propose quel article placer à chaque
// palier (forte valeur perçue / faible coût réel) ; l'admin accepte ou remplace.
// ADR 0017 — Les paliers solo sont dimensionnés par établissement (panier
// moyen + coût du cadeau le moins cher) et chaque palier n'accepte que des
// articles sous son plafond de coût — filtrage déterministe avant l'appel au
// modèle, re-validation après.
// Données euros : service role uniquement, jamais côté membre (ADR 0007).

const BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? String(DEFAULT_BUDGET_PCT));

export type TierSuggestion = {
  layer: "solo" | "community";
  threshold: number;
  item_name: string | null;
  rationale: string;
};

type RawSuggestion = { threshold?: number; item_name?: string; rationale?: string };

export async function suggestRewardGrid(restaurantId: string): Promise<{
  suggestions: TierSuggestion[];
  soloBands: number[];
  note: string;
}> {
  const [allItems, avgBasket] = await Promise.all([
    getMenuItems(restaurantId),
    getAverageBasket(restaurantId),
  ]);
  const items = allItems.filter((i) => i.is_active && i.reward_eligible);
  if (items.length === 0) {
    return {
      suggestions: [],
      soloBands: [],
      note: "Catalogue vide ou aucun article éligible aux cadeaux.",
    };
  }

  // Paliers solo propres à l'établissement (ADR 0017)
  const costs = items.map((i) => Number(i.cost_price)).filter((c) => c > 0);
  const cheapestCost = costs.length > 0 ? Math.min(...costs) : 0;
  const soloBands = suggestSoloBands(avgBasket, cheapestCost, BUDGET_PCT);

  const candidates: GiftCandidate[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    menu_price: Number(i.menu_price),
    cost_price: Number(i.cost_price),
  }));

  // Articles autorisés par palier solo : coût réel sous le plafond du palier
  const allowedByBand = new Map<number, GiftCandidate[]>(
    soloBands.map((b) => [b, candidates.filter((c) => c.cost_price <= soloCostCap(b, BUDGET_PCT))])
  );

  const catalog = items.map((i) => ({
    name: i.name,
    category: i.category,
    prix_vente: i.menu_price,
    prix_revient: i.cost_price,
    ratio: i.cost_price != null && i.cost_price > 0 ? Number((i.menu_price / i.cost_price).toFixed(1)) : null,
  }));

  const soloConstraints = soloBands
    .map((b) => {
      const names = (allowedByBand.get(b) ?? []).map((c) => c.name);
      return `- Palier €${b} : uniquement parmi ${names.length > 0 ? JSON.stringify(names) : "(aucun article assez peu coûteux — laisse item_name null)"}`;
    })
    .join("\n");

  const prompt = `Tu aides un restaurateur à choisir quels articles offrir en cadeau dans son programme de fidélité.

Catalogue (articles éligibles aux cadeaux) :
${JSON.stringify(catalog, null, 2)}

Règle de choix : un bon cadeau a une forte VALEUR PERÇUE (prix_vente) pour un COÛT RÉEL faible (prix_revient) — donc un ratio prix_vente/prix_revient élevé. Plus le palier est élevé, plus le cadeau peut être généreux (coût réel plus élevé).

Assigne un article à chacun de ces paliers :
- Couche SOLO (récompense selon le montant d'une commande, en €) : seuils ${JSON.stringify(soloBands)}
- Couche COMMUNAUTAIRE (bonus selon le score de l'équipe, en points) : seuils ${JSON.stringify([...COMMUNITY_BANDS])}

Contrainte STRICTE de rentabilité pour la couche SOLO (le coût du cadeau doit rester sous ${Math.round(BUDGET_PCT * 100)} % de la commande) :
${soloConstraints}

Petits paliers → articles à petit coût et fort ratio (boissons, accompagnements, desserts) ; gros paliers → articles plus consistants. Un même article peut servir plusieurs paliers. N'utilise QUE des noms présents dans le catalogue.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{"solo":[{"threshold":${soloBands[0]},"item_name":"...","rationale":"1 phrase mentionnant le ratio/coût"}],"community":[{"threshold":1000,"item_name":"...","rationale":"..."}]}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: { solo?: RawSuggestion[]; community?: RawSuggestion[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Réponse de suggestion illisible.");
  }

  const validNames = new Set(items.map((i) => i.name));
  const suggestions: TierSuggestion[] = [];

  for (const layer of ["solo", "community"] as const) {
    const bands = layer === "solo" ? soloBands : [...COMMUNITY_BANDS];
    const arr: RawSuggestion[] = Array.isArray(parsed[layer]) ? parsed[layer]! : [];
    for (const band of bands) {
      const hit = arr.find((x) => Number(x?.threshold) === band);
      let name =
        hit && typeof hit.item_name === "string" && validNames.has(hit.item_name)
          ? hit.item_name
          : null;
      let rationale = typeof hit?.rationale === "string" ? hit.rationale : "";

      // Re-validation du plafond solo (ADR 0017) : une proposition au-dessus
      // du plafond est remplacée par le meilleur article couvert — jamais
      // laissée passer.
      if (layer === "solo") {
        const allowed = allowedByBand.get(band) ?? [];
        if (!name || !allowed.some((c) => c.name === name)) {
          const fallback = pickBestGift(allowed, soloCostCap(band, BUDGET_PCT));
          name = fallback?.name ?? null;
          if (fallback) {
            rationale = `Meilleur ratio sous le plafond de €${soloCostCap(band, BUDGET_PCT).toFixed(2)} (coût €${fallback.cost_price.toFixed(2)}).`;
          }
        }
      }

      suggestions.push({ layer, threshold: band, item_name: name, rationale });
    }
  }

  return {
    suggestions,
    soloBands,
    note: `Paliers solo dimensionnés pour ton établissement (panier moyen ~€${Math.round(avgBasket)}). Suggestions à valider ou ajuster avant d'enregistrer.`,
  };
}
