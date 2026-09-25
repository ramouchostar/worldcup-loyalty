// ADR 0069 §4 — exécuter un audit déjà créé et en enregistrer chaque volet.
// Appelé en tâche de fond (`after()`) depuis la console ; ne lève jamais :
// un échec se lit dans la ligne de l'audit et de ses volets.

import { isBrussels, postalCodeOf } from "./brussels";
import type { Target } from "./dataforseo";
import { measure } from "./measure";
import { saveSection, updateAudit } from "./store";

export async function runAudit(auditId: string, target: Target): Promise<void> {
  try {
    const m = await measure(target);

    // Contrôle Bruxelles sur l'adresse réellement renvoyée par la source.
    if (m.fiche.status === "ok") {
      const info = m.fiche.result.info;
      const postal = info.address_info?.postal_code ?? postalCodeOf(info.address);
      await updateAudit(auditId, {
        name: info.title ?? undefined,
        cid: info.cid,
        place_id: info.place_id,
        address: info.address,
        postal_code: postal,
      });
      if (!isBrussels(postal)) {
        await saveSection(auditId, "fiche", { status: "echec", source: m.fiche.source, raw: info, error: `Hors des 19 communes de Bruxelles (code postal ${postal ?? "inconnu"}).` });
        await updateAudit(auditId, { status: "echec", cost_usd: m.costUsd, calls: m.calls });
        return;
      }
    }

    await saveSection(auditId, "fiche", m.fiche.status === "ok"
      ? { status: "ok", source: m.fiche.source, raw: m.fiche.raw, result: m.fiche.result.score, cost_usd: m.fiche.cost }
      : { status: m.fiche.status, source: m.fiche.source, error: m.fiche.error });
    await saveSection(auditId, "avis", m.avis.status === "ok"
      ? { status: "ok", source: m.avis.source, raw: m.avis.raw, result: m.avis.result, cost_usd: m.avis.cost }
      : { status: m.avis.status, source: m.avis.source, error: m.avis.error });
    // Volets C et B : PR 3 et 4.
    await saveSection(auditId, "concurrents", m.concurrents.status === "ok"
      ? { status: "ok", source: m.concurrents.source, result: m.concurrents.result, cost_usd: m.concurrents.cost }
      : { status: m.concurrents.status, source: m.concurrents.source, error: m.concurrents.error });
    await saveSection(auditId, "reseaux", { status: "non_branche", error: "Volet pas encore livré (ADR 0069 §7, PR 4)." });
    // Volet SEO : dépend de la migration 20260925-1530 (contrainte CHECK) — sans elle, on
    // garde le reste de l'audit et le rapport dit que le volet n'a pas été enregistré.
    await saveSection(auditId, "seo", m.seo.status === "ok"
      ? { status: "ok", source: m.seo.source, result: m.seo.result, cost_usd: m.seo.cost }
      : { status: m.seo.status, source: m.seo.source, error: m.seo.error }).catch((e) => console.error("[audit] volet SEO non enregistré :", e));

    const allFailed = m.fiche.status !== "ok" && m.avis.status !== "ok";
    await updateAudit(auditId, {
      status: allFailed ? "echec" : "mesure",
      scores: m.scores,
      signals: m.signals,
      recommendations: m.recommendations,
      cost_usd: m.costUsd,
      calls: m.calls,
    });
  } catch (e) {
    console.error("[audit] runAudit a échoué :", e);
    await updateAudit(auditId, { status: "echec" }).catch(() => {});
  }
}
