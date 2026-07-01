import Anthropic from "@anthropic-ai/sdk";
import { getMenuItems } from "./menu";
import { SOLO_BANDS, COMMUNITY_BANDS } from "./reward-bands";

// ADR 0013 — Suggestion de cadeaux. L'app propose quel article placer à chaque
// palier (forte valeur perçue / faible coût réel) ; l'admin accepte ou remplace.
// Données euros : service role uniquement, jamais côté membre (ADR 0007).

export type TierSuggestion = {
  layer: "solo" | "community";
  threshold: number;
  item_name: string | null;
  rationale: string;
};

type RawSuggestion = { threshold?: number; item_name?: string; rationale?: string };

export async function suggestRewardGrid(restaurantId: string): Promise<{
  suggestions: TierSuggestion[];
  note: string;
}> {
  const items = (await getMenuItems(restaurantId)).filter((i) => i.is_active && i.reward_eligible);
  if (items.length === 0) {
    return { suggestions: [], note: "Catalogue vide ou aucun article éligible aux cadeaux." };
  }

  const catalog = items.map((i) => ({
    name: i.name,
    category: i.category,
    prix_vente: i.menu_price,
    prix_revient: i.cost_price,
    ratio: i.cost_price > 0 ? Number((i.menu_price / i.cost_price).toFixed(1)) : null,
  }));

  const prompt = `Tu aides un restaurateur à choisir quels articles offrir en cadeau dans son programme de fidélité.

Catalogue (articles éligibles aux cadeaux) :
${JSON.stringify(catalog, null, 2)}

Règle de choix : un bon cadeau a une forte VALEUR PERÇUE (prix_vente) pour un COÛT RÉEL faible (prix_revient) — donc un ratio prix_vente/prix_revient élevé. Plus le palier est élevé, plus le cadeau peut être généreux (coût réel plus élevé).

Assigne un article à chacun de ces paliers :
- Couche SOLO (récompense selon le montant d'une commande, en €) : seuils ${JSON.stringify([...SOLO_BANDS])}
- Couche COMMUNAUTAIRE (bonus selon le score de l'équipe, en points) : seuils ${JSON.stringify([...COMMUNITY_BANDS])}

Petits paliers → articles à petit coût et fort ratio (boissons, accompagnements, desserts) ; gros paliers → articles plus consistants. Un même article peut servir plusieurs paliers. N'utilise QUE des noms présents dans le catalogue.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{"solo":[{"threshold":15,"item_name":"...","rationale":"1 phrase mentionnant le ratio/coût"}],"community":[{"threshold":1000,"item_name":"...","rationale":"..."}]}`;

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
    const bands = layer === "solo" ? SOLO_BANDS : COMMUNITY_BANDS;
    const arr: RawSuggestion[] = Array.isArray(parsed[layer]) ? parsed[layer]! : [];
    for (const band of bands) {
      const hit = arr.find((x) => Number(x?.threshold) === band);
      const name = hit && typeof hit.item_name === "string" && validNames.has(hit.item_name)
        ? hit.item_name
        : null;
      suggestions.push({
        layer,
        threshold: band,
        item_name: name,
        rationale: typeof hit?.rationale === "string" ? hit.rationale : "",
      });
    }
  }

  return { suggestions, note: "Suggestions générées — à valider ou ajuster avant d'enregistrer." };
}
