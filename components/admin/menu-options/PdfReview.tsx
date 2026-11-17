"use client";

import { useState } from "react";
import { Card, StatusBadge } from "@/components/admin/ui";
import { describeHttpFailure, readJsonSafe } from "@/lib/fetch-json";
import { TIPS, plural } from "@/lib/menu-options/copy";
import { MAX_DESCRIPTION } from "@/lib/menu-options/descriptions";
import {
  ALLERGENS, hasEffect, setConfirmed, setDescription, setUseDescription, toSaveRow, toggleAllergen, traceOfReviews,
  type MenuReadResult, type PdfReview,
} from "@/lib/menu-options/pdf";
import { Tip } from "./fields";

// ADR 0100 §8 — les descriptions que le restaurateur a écrites dans son menu, et les allergènes IMPRIMÉS dans son menu (PDF
// ou lien, ADR 0100 §11) : il relit plat par plat. Rien n'est écrit avant son clic ; un allergène ne devient un fait que
// s'il le confirme. La lecture du menu se fait plus haut (MenuSource) : ici on ne fait que relire et enregistrer.

type Msg = { kind: "ok" | "err"; text: string; details?: string[]; technical?: string };

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

export function PdfReview({ restaurantId, res, names, onSaved, onClose }: { restaurantId: string; res: MenuReadResult; names: Record<string, string>; onSaved?: () => void; onClose: () => void }) {
  const [phase, setPhase] = useState<"review" | "saving" | "done">("review");
  const [reviews, setReviews] = useState<PdfReview[]>(res.reviews);
  const [msg, setMsg] = useState<Msg | null>(null);

  const patch = (id: string, fn: (r: PdfReview) => PdfReview) => { setMsg(null); setReviews((rs) => rs.map((r) => (r.articleId === id ? fn(r) : r))); };

  const rows = reviews.map(toSaveRow).filter(hasEffect);

  async function save() {
    if (rows.length === 0) return;
    setPhase("saving");
    setMsg(null);
    try {
      const r = await fetch("/api/admin/menu/options/pdf", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, rows, trace: traceOfReviews(res.linesRead, res.counts, reviews, { source: res.source, counts: res.menuCounts }) }),
      });
      const { data } = await readJsonSafe<{ error?: string; errors?: string[]; detail?: string; rows?: number }>(r);
      if (!r.ok) {
        setMsg({ kind: "err", text: data?.error ?? describeHttpFailure(r.status, null), details: data?.errors, technical: data?.detail });
        setPhase("review");
        return;
      }
      setMsg({ kind: "ok", text: `Enregistré : ${plural(data?.rows ?? rows.length, "plat", "plats")}.` });
      setPhase("done");
      onSaved?.();
    } catch {
      setMsg({ kind: "err", text: "L'enregistrement n'a pas pu partir. Rien n'est perdu : réessaie." });
      setPhase("review");
    }
  }

  const confirmable = reviews.filter((r) => r.allergensFromPdf && !r.confirmed).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Descriptions et allergènes de ton menu</h2>
        <Tip text={TIPS.pdfWhy} />
      </div>
      <p className="mt-1 text-[15px] text-ink-muted">
        Nous reprenons tes descriptions telles que tu les as écrites et nous te proposons les allergènes qui y sont écrits. Tu relis plat par plat.
      </p>

      {msg && (
        <div role={msg.kind === "err" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-[15px] ${msg.kind === "err" ? "border-danger text-danger" : "border-good text-good"}`}>
          <p>{msg.text}</p>
          {msg.details?.map((d) => <p key={d} className="mt-1 text-[13px]">{d}</p>)}
          {msg.technical && <p className="mt-1 text-[13px] text-ink-muted">Détail pour l&apos;équipe : {msg.technical}</p>}
        </div>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="mt-4 space-y-4">
          <p className="text-[15px] text-ink">
            {plural(res.counts.matched, "plat", "plats")} à relire.
            {res.counts.unmatched > 0 && ` ${plural(res.counts.unmatched, "ligne n'a", "lignes n'ont")} pas été rapprochée${res.counts.unmatched > 1 ? "s" : ""} : nous ne devinons pas.`}
          </p>

          <div className="rounded-lg border border-paper-border bg-paper px-3 py-2 text-[13px] text-ink-muted">{TIPS.allergenWhy}</div>

          {confirmable > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tip text={TIPS.allergenBulk}>
                <button type="button" className={`${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`}
                  onClick={() => { setMsg(null); setReviews((rs) => rs.map((r) => (r.allergensFromPdf ? setConfirmed(r, true) : r))); }}>
                  J&apos;ai tout relu : confirmer les {confirmable} plats écrits dans mon menu
                </button>
              </Tip>
            </div>
          )}

          {reviews.length === 0 ? (
            <p className="text-[15px] text-ink">Aucun plat de ton menu n&apos;a été reconnu avec certitude. Vérifie que les noms ressemblent à ceux de ton menu.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.articleId} className="min-w-0 space-y-2 rounded-lg border border-paper-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[15px] text-ink">{names[r.articleId] ?? "Plat"}</b>
                    {r.how === "proche" && (<Tip text={TIPS.pdfNear}><StatusBadge tone="warn">Nom proche</StatusBadge></Tip>)}
                  </div>

                  {r.descriptionOriginal !== null || r.description !== null ? (
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-[13px] text-ink-muted" htmlFor={`use-${r.articleId}`}>
                        <input id={`use-${r.articleId}`} type="checkbox" className="h-5 w-5" checked={r.useDescription} onChange={(e) => patch(r.articleId, (x) => setUseDescription(x, e.target.checked))} />
                        Reprendre la description de mon menu
                      </label>
                      <textarea
                        aria-label={`Description de ${names[r.articleId] ?? "ce plat"}`} rows={2} maxLength={MAX_DESCRIPTION} value={r.description ?? ""}
                        onChange={(e) => patch(r.articleId, (x) => setDescription(x, e.target.value))}
                        className="block w-full min-w-0 rounded-lg border border-paper-border bg-white px-2.5 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                      />
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-muted">{r.descriptionTooLong ? `La description de ton menu dépasse ${MAX_DESCRIPTION} lettres : écris-la plus courte ci-dessus.` : "Pas de description dans ton PDF pour ce plat."}</p>
                  )}

                  <fieldset className="min-w-0">
                    <legend className="text-[13px] font-semibold text-ink">
                      Allergènes {r.allergensFromPdf ? "écrits dans ton menu" : "(rien d'écrit dans ton menu : coche toi-même)"}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ALLERGENS.map(([k, label]) => {
                        const on = r.allergens.includes(k);
                        return (
                          <button
                            key={k} type="button" aria-pressed={on} onClick={() => patch(r.articleId, (x) => toggleAllergen(x, k))}
                            className={`min-h-[36px] rounded-full border px-3 py-1 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${on ? "border-ink bg-ink text-white" : "border-paper-border bg-white text-ink"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <label className="flex items-start gap-2 text-[15px] text-ink" htmlFor={`ok-${r.articleId}`}>
                    <input id={`ok-${r.articleId}`} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={r.confirmed} onChange={(e) => patch(r.articleId, (x) => setConfirmed(x, e.target.checked))} />
                    <span>
                      {r.allergens.length > 0
                        ? "J'ai relu : ce plat contient ces allergènes, et aucun autre."
                        : "J'ai relu : ce plat ne contient aucun des 14 allergènes de la liste."}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {res.unmatchedLines.length > 0 && (
            <details className="rounded-lg border border-paper-border px-3 py-2 text-[15px] text-ink">
              <summary className="cursor-pointer font-semibold">Lignes de ton menu qui ne sont pas dans ton menu ({res.unmatchedLines.length})</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-ink-muted">{res.unmatchedLines.map((l, i) => <li key={`${l.name}-${i}`}>{l.name}</li>)}</ul>
              <p className="mt-2 text-[13px] text-ink-muted">Ajoute ces plats dans « Menu et coûts », puis lis ton menu une nouvelle fois.</p>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`} disabled={rows.length === 0 || phase === "saving"} onClick={() => void save()}>
              {phase === "saving" ? "Enregistrement…" : `Enregistrer ${plural(rows.length, "plat", "plats")}`}
            </button>
            <button type="button" className={`${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`} disabled={phase === "saving"} onClick={onClose}>
              Annuler
            </button>
            {rows.length === 0 && <span className="text-[13px] text-ink-muted">Garde une description ou confirme des allergènes pour enregistrer.</span>}
          </div>
        </div>
      )}

      {phase === "done" && (
        <button type="button" className={`${btn} mt-3 border border-paper-border bg-white text-ink hover:border-ink-faint`} onClick={onClose}>
          Fermer
        </button>
      )}
    </Card>
  );
}
