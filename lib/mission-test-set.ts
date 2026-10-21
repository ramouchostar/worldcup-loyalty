import { addDays } from "./console-journey";
import { earliestDeadline, type BriefAnswers, type BriefTemplate } from "./mission-brief";
import type { Metier } from "./mission-money";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 quindecies) — le jeu de test : RÈGLES PURES.
//
// Quatre prestataires fictifs (un par métier) et une mission envoyée chez chacun, sur un établissement de DÉMONSTRATION, pour parcourir
// le module de bout en bout. Tout porte le marqueur « [TEST] » dans le nom : c'est CE marqueur, et rien d'autre, qui désigne ce que
// « Tout effacer » retire. Les adresses sont des alias de l'adresse du super-admin qui génère (aucun e-mail ne part chez un tiers).
// ============================================================

export const TEST_PREFIX = "[TEST] ";

export const isTestName = (name: string | null | undefined): boolean => typeof name === "string" && name.startsWith(TEST_PREFIX);

export const TEST_PROVIDERS: readonly { metier: Metier; name: string; locale: "fr" | "nl" | "en" }[] = [
  { metier: "video", name: `${TEST_PREFIX}Studio Croustille (vidéo)`, locale: "fr" },
  { metier: "photo", name: `${TEST_PREFIX}Atelier Lumière (photo)`, locale: "nl" },
  { metier: "design", name: `${TEST_PREFIX}Maison Graphique (design)`, locale: "en" },
  { metier: "impression", name: `${TEST_PREFIX}Imprimerie Express (impression)`, locale: "fr" },
];

/** `omar@gmail.com` → `omar+test-video@gmail.com` : la boîte du super-admin reçoit tout. `null` si l'adresse n'est pas exploitable. */
export function aliasEmail(email: string | null | undefined, metier: Metier): string | null {
  const m = /^([^@\s+]+)(?:\+[^@\s]*)?@([^@\s]+\.[^@\s]+)$/.exec((email ?? "").trim().toLowerCase());
  return m ? `${m[1]}+test-${metier}@${m[2]}` : null;
}

const SAMPLE_TEXT = "Brief de test généré par Boosteats : à remplacer par un vrai texte.";

/**
 * Des réponses qui passent la validation du brief pour N'IMPORTE quel modèle (même modifié en base) : on remplit les questions
 * obligatoires de la phase « brief », avec une valeur admise par le modèle. Un test vérifie les quatre modèles par défaut.
 */
export function testAnswers(template: BriefTemplate, today: string, who = "Test"): BriefAnswers {
  const out: BriefAnswers = {};
  for (const q of template.questions) {
    if ((q.phase ?? "brief") !== "brief") continue;
    if (!q.required && q.key !== "idea") continue;
    switch (q.kind) {
      case "choice":
        // « Prêt à imprimer » exigerait un fichier joint : on prend l'autre réponse quand il y en a une.
        out[q.key] = q.key === "file_state" ? (q.options?.find((o) => o !== "Prêt à imprimer") ?? q.options?.[0]) : q.options?.[0];
        break;
      case "multi":
        out[q.key] = q.options?.[0] ? [q.options[0]] : [];
        break;
      case "text":
        out[q.key] = SAMPLE_TEXT.padEnd(Math.max(q.minLength ?? 0, SAMPLE_TEXT.length), ".");
        break;
      case "list":
        out[q.key] = q.key === "deciders" ? [who] : ["Plat de test 1", "Plat de test 2"];
        break;
      case "number":
        out[q.key] = q.key === "budget_cents" ? Math.max(template.budgetFloorCents ?? 0, 150_000) : 2;
        break;
      case "date":
        out[q.key] = addDays(earliestDeadline(today), 10);
        break;
      case "flag":
        out[q.key] = true;
        break;
      default:
        break;
    }
  }
  return out;
}
