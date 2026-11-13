"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/admin/ui";
import { KIND_LABEL, KIND_TIP, STRENGTH_LABEL, STRENGTH_NOTE, TIPS, plural, ruleText } from "@/lib/menu-options/copy";
import {
  addArticle, addChoice, addGroup, applyBulkPrice, canValidate, confirmGroup, descriptionOf, editDescription, groupPricesMissing, lotConflicts,
  lotIssues, mergeLots, mergeSuggestions, needsPrice, removeArticle, removeGroup, renameLot, reopenLot, resetDescription, setViande, splitArticle,
  updateChoice, updateGroup, validateLot,
  type DraftChoice, type DraftGroup, type EditorState, type Lot,
} from "@/lib/menu-options/lots";
import type { Viande } from "@/lib/menu-options/descriptions";
import type { GroupKind } from "@/lib/menu-options/types";
import { NumberField, TextField, Tip } from "./fields";

export type Change = (fn: (s: EditorState) => EditorState) => void;
export type ArticleMeta = Record<string, { price: number; hasPhoto: boolean }>;

const euro = (n: number) => Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

const btn = "min-h-[40px] rounded-lg px-3 py-2 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const ghost = `${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`;
const primary = `${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
const select = "min-h-[40px] min-w-0 max-w-full rounded-lg border border-paper-border bg-white px-2 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

// ─── Une liste de choix ──────────────────────────────────────────────────────

function BulkPrice({ lotKey, group, change }: { lotKey: string; group: DraftGroup; change: Change }) {
  const [value, setValue] = useState<number | null>(null);
  const missing = groupPricesMissing(group);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
      <Tip text={TIPS.bulk}>
        <span className="font-semibold text-ink">{missing} prix à mettre.</span>
      </Tip>
      <span>Même prix pour tous :</span>
      <NumberField value={value} onCommit={setValue} ariaLabel="Même prix pour tous" className="w-20 text-right" />
      <span>€</span>
      <button type="button" className={ghost} disabled={value === null} onClick={() => value !== null && change((s) => applyBulkPrice(s, lotKey, group.key, value))}>
        Appliquer
      </button>
    </div>
  );
}

function ChoiceRow({ lotKey, group, choice, lotValidated, weak, change }: { lotKey: string; group: DraftGroup; choice: DraftChoice; lotValidated: boolean; weak: boolean; change: Change }) {
  const proposal = choice.origin === "pack" && !lotValidated;
  const needs = needsPrice(group, choice);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-paper-border py-2 ${choice.keep ? "" : "opacity-50"} ${proposal ? "bg-paper" : ""}`}>
      <Tip text={proposal ? TIPS.proposal : TIPS.keep}>
        <input type="checkbox" className="h-5 w-5 accent-ink" checked={choice.keep} aria-label={`Garder ${choice.name || "ce choix"}`} onChange={(e) => change((s) => updateChoice(s, lotKey, choice.key, { keep: e.target.checked }))} />
      </Tip>
      <TextField value={choice.name} ariaLabel="Nom du choix" placeholder="Nom du choix" className="min-w-[150px] flex-1" onCommit={(v) => change((s) => updateChoice(s, lotKey, choice.key, { name: v }))} />
      {group.kind === "retrait" ? (
        <span className="text-[13px] text-ink-muted">0 €</span>
      ) : (
        <Tip text={TIPS.price}>
          <span className="flex items-center gap-1 text-[15px] text-ink-body">
            +
            <NumberField
              value={choice.priceDelta}
              ariaLabel={`Supplément en euros pour ${choice.name || "ce choix"}`}
              placeholder="ton prix"
              max={100}
              className={`w-24 text-right ${needs ? "border-warn bg-warn/10" : ""}`}
              onCommit={(v) => change((s) => updateChoice(s, lotKey, choice.key, { priceDelta: v }))}
            />
            €
          </span>
        </Tip>
      )}
      {group.kind !== "retrait" && (
        <>
          <Tip text={TIPS.maxQty}>
            <label className="flex items-center gap-1 text-[13px] text-ink-muted">
              Fois max
              <NumberField value={choice.maxQty} integer min={1} max={20} ariaLabel="Combien de fois au plus" className="w-14 text-right" onCommit={(v) => change((s) => updateChoice(s, lotKey, choice.key, { maxQty: v ?? 1 }))} />
            </label>
          </Tip>
          <Tip text={TIPS.isDefault}>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={choice.isDefault} onChange={(e) => change((s) => updateChoice(s, lotKey, choice.key, { isDefault: e.target.checked }))} />
              Déjà coché
            </label>
          </Tip>
        </>
      )}
      {weak && proposal && (
        <Tip text="Une idée de notre part : beaucoup de restaurants la proposent, mais pas tous. Garde-la ou décoche-la." align="right">
          <StatusBadge>Idée</StatusBadge>
        </Tip>
      )}
    </div>
  );
}

function GroupEditor({ lotKey, group, depth, lotValidated, weak, change }: { lotKey: string; group: DraftGroup; depth: number; lotValidated: boolean; weak: boolean; change: Change }) {
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-paper-border p-3 ${depth > 0 ? "ml-4 border-dashed" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <TextField value={group.title} ariaLabel="Nom de la liste de choix" className="min-w-[150px] flex-1 font-semibold" onCommit={(v) => change((s) => updateGroup(s, lotKey, group.key, { title: v }))} />
        <Tip text={KIND_TIP[group.kind]}>
          <select className={select} aria-label="Genre de choix" value={group.kind} onChange={(e) => change((s) => updateGroup(s, lotKey, group.key, { kind: e.target.value as GroupKind }))}>
            {(Object.keys(KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Tip>
        {group.guess && (
          <Tip text={TIPS.guess} align="right">
            <StatusBadge tone={group.confirmed ? "good" : "warn"}>{group.confirmed ? "Genre confirmé" : "Nous ne sommes pas sûrs : regarde"}</StatusBadge>
          </Tip>
        )}
        {group.guess && !group.confirmed && <button type="button" className={ghost} onClick={() => change((s) => confirmGroup(s, lotKey, group.key))}>C&apos;est bon</button>}
      </div>

      {group.kind !== "retrait" ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
          <Tip text={TIPS.min}>
            <label className="flex items-center gap-1">Au moins <NumberField value={group.min} integer ariaLabel="Au moins" className="w-14 text-right" onCommit={(v) => change((s) => updateGroup(s, lotKey, group.key, { min: v ?? 0 }))} /></label>
          </Tip>
          <Tip text={TIPS.max}>
            <label className="flex items-center gap-1">Au plus <NumberField value={group.max} integer min={1} placeholder="sans limite" ariaLabel="Au plus" className="w-24 text-right" onCommit={(v) => change((s) => updateGroup(s, lotKey, group.key, { max: v }))} /></label>
          </Tip>
          <span className="min-w-[200px] flex-1">{ruleText(group.kind, group.min, group.max)}</span>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">{ruleText("retrait", 0, null)}</p>
      )}

      {groupPricesMissing(group) > 1 && <BulkPrice lotKey={lotKey} group={group} change={change} />}

      <div>
        {group.choices.map((c) => <ChoiceRow key={c.key} lotKey={lotKey} group={group} choice={c} lotValidated={lotValidated} weak={weak} change={change} />)}
      </div>
      {group.choices.flatMap((c) => (c.keep ? c.groups : [])).map((sub) => (
        <GroupEditor key={sub.key} lotKey={lotKey} group={sub} depth={depth + 1} lotValidated={lotValidated} weak={weak} change={change} />
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => change((s) => addChoice(s, lotKey, group.key))}>+ Ajouter un choix</button>
        <button type="button" className={ghost} onClick={() => change((s) => removeGroup(s, lotKey, group.key))}>Retirer cette liste</button>
      </div>
    </div>
  );
}

// ─── Un groupe de plats ──────────────────────────────────────────────────────

export function LotCard({ lot, state, meta, configured, saved, change }: { lot: Lot; state: EditorState; meta: ArticleMeta; configured: Record<string, number>; saved: boolean; change: Change }) {
  const issues = lotIssues(lot);
  const k = lot.articleIds.length;
  const weak = lot.strength === "faible";
  const others = state.lots.filter((l) => l.key !== lot.key && !l.validated);
  const suggestion = lot.validated ? undefined : mergeSuggestions(state).find((m) => m.intoKey === lot.key);
  const already = lot.articleIds.filter((id) => (configured[id] ?? 0) > 0).length;
  const pool: { id: string; label: string; group: string }[] = [
    ...state.unplaced.map((id) => ({ id, label: state.articles[id]?.name ?? id, group: "Pas encore de choix" })),
    ...state.lots.filter((l) => l.key !== lot.key).flatMap((l) => l.articleIds.map((id) => ({ id, label: `${state.articles[id]?.name ?? id} (de « ${l.label} »)`, group: "Dans un autre groupe" }))),
  ];
  const nSugg = lot.suggestedIds.length;
  const conflicts = lotConflicts(state, lot);
  const described = lot.articleIds.map((id) => ({ id, d: descriptionOf(state, lot, id) })).filter((x) => x.d && x.d.text);

  const hint = lot.validated
    ? "Groupe réglé."
    : [
        nSugg ? `Nous avons ajouté ${plural(nSugg, "plat", "plats")} qui ${nSugg > 1 ? "vont" : "va"} souvent avec les autres : retire ceux qui sont différents.` : k > 1 ? `Ces ${k} plats ont les mêmes choix.` : "Ce plat a ses propres choix.",
        issues.pending + conflicts.length ? `${plural(issues.pending + conflicts.length, "ligne", "lignes")} à regarder.` : "",
        issues.pricesMissing ? `${issues.pricesMissing} prix à mettre.` : "",
      ].filter(Boolean).join(" ");

  return (
    <section className={`flex flex-col gap-3 rounded-xl border bg-white p-4 md:p-5 ${lot.validated ? "border-good/40" : "border-paper-border"}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-[72px] flex-col items-center rounded-lg bg-paper-subtle px-3 py-1.5">
          <b className="text-[24px] leading-none tabular-nums text-ink">{k}</b>
          <span className="text-[12px] text-ink-muted">{k > 1 ? "plats" : "plat"}</span>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <TextField value={lot.label} ariaLabel="Nom du groupe de plats" className="text-[17px] font-semibold" onCommit={(v) => change((s) => renameLot(s, lot.key, v))} />
          <span className="text-[13px] text-ink-muted">{hint}</span>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {saved && <StatusBadge tone="good">Enregistré</StatusBadge>}
          {lot.validated ? (
            <button type="button" className={ghost} onClick={() => change((s) => reopenLot(s, lot.key))}>Rouvrir</button>
          ) : (
            <>
              {others.length > 0 && (
                <Tip text={TIPS.merge} align="right">
                  <select className={select} aria-label="Réunir avec un autre groupe" value="" onChange={(e) => e.target.value && change((s) => mergeLots(s, lot.key, e.target.value))}>
                    <option value="">Réunir avec…</option>
                    {others.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.articleIds.length})</option>)}
                  </select>
                </Tip>
              )}
              <Tip text={issues.pricesMissing ? TIPS.validateBlocked(issues.pricesMissing) : TIPS.validate} align="right">
                <button type="button" className={primary} disabled={!canValidate(lot)} onClick={() => change((s) => validateLot(s, lot.key))}>Je valide ce groupe</button>
              </Tip>
            </>
          )}
        </div>
      </div>

      {lot.validated && <div className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-[15px] font-semibold text-good">{k > 1 ? `Bravo ! ${k} plats configurés d'un seul coup.` : "Bien joué ! Ce plat est prêt."}</div>}

      {already > 0 && !lot.validated && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          {plural(already, "plat a déjà des options", "plats ont déjà des options")} : elles seront remplacées par celles de ce groupe quand tu enregistres.
        </div>
      )}

      {issues.errors.length > 0 && !lot.validated && (
        <ul className="list-inside list-disc rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {issues.errors.slice(0, 5).map((e, i) => <li key={i}>{e.message}</li>)}
        </ul>
      )}

      {suggestion && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-paper-border bg-paper px-3 py-2 text-[13px] text-ink-body">
          <span className="min-w-[200px] flex-1">{suggestion.text}</span>
          <button type="button" className={ghost} onClick={() => change((s) => mergeLots(s, suggestion.intoKey, suggestion.fromKey))}>Les réunir</button>
        </div>
      )}

      {!lot.validated && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${weak ? "border border-warn/30 bg-warn/10 text-warn" : "border border-dashed border-paper-border bg-paper text-ink-muted"}`}>
          <b>{STRENGTH_LABEL[lot.strength]}.</b> {STRENGTH_NOTE[lot.strength]}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {lot.articleIds.map((id) => {
          const suggested = lot.suggestedIds.includes(id);
          return (
            <span key={id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] text-ink ${suggested ? "border-dashed border-ink-faint bg-paper-subtle" : "border-paper-border bg-white"}`}>
              {suggested ? (
                <Tip text={TIPS.suggestedArticle}><span className="cursor-help">{state.articles[id]?.name} (proposé)</span></Tip>
              ) : state.articles[id]?.name}
              {!lot.validated && (
                <Tip text={TIPS.removeArticle}>
                  <button type="button" aria-label={`Retirer ${state.articles[id]?.name} du groupe`} className="px-1 text-[14px] leading-none text-ink-muted hover:text-danger" onClick={() => change((s) => removeArticle(s, id))}>×</button>
                </Tip>
              )}
            </span>
          );
        })}
      </div>

      {!lot.validated && pool.length > 0 && (
        <Tip text={TIPS.addArticle}>
          <select className={`${select} max-w-full`} aria-label="Ajouter un plat à ce groupe" value="" onChange={(e) => e.target.value && change((s) => addArticle(s, lot.key, e.target.value))}>
            <option value="">+ Ajouter un plat…</option>
            {["Pas encore de choix", "Dans un autre groupe"].map((g) => {
              const rows = pool.filter((p) => p.group === g);
              return rows.length ? <optgroup key={g} label={g}>{rows.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup> : null;
            })}
          </select>
        </Tip>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-paper-border bg-paper px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[15px] text-ink">Descriptions</b>
          <Tip text={TIPS.descRule}><StatusBadge>Seulement ce qui est dans le nom</StatusBadge></Tip>
        </div>
        {lot.family === "burger" && !lot.validated && (
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-body">
            <Tip text={TIPS.viande}><span>De quelle viande sont tes burgers quand le nom ne le dit pas ? <span className="text-ink-muted">(facultatif)</span></span></Tip>
            <select className={select} aria-label="Viande des burgers" value={lot.viande ?? ""} onChange={(e) => change((s) => setViande(s, lot.key, (e.target.value || null) as Viande | null))}>
              <option value="">Je ne dis pas</option>
              <option value="bœuf">Bœuf</option>
              <option value="poulet">Poulet</option>
              <option value="mélange">Un mélange (on n&apos;écrit pas la viande)</option>
            </select>
          </label>
        )}
        {lot.strength === "aucune" ? (
          <p className="text-[13px] text-ink-muted">Pas de description pour les boissons, les desserts et les sauces : le nom suffit.</p>
        ) : described.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nous ne savons pas encore décrire ces plats. Tu peux écrire leur description toi-même, plat par plat, ci-dessous.</p>
        ) : (
          described.slice(0, 2).map(({ id, d }) => (
            <p key={id} className="text-[13px] italic text-ink-body"><b className="not-italic">{state.articles[id]?.name}</b> : {d!.text}</p>
          ))
        )}
        {conflicts.length > 0 && !lot.validated && (
          <ul className="list-inside list-disc text-[13px] text-warn">
            {conflicts.slice(0, 3).map((c) => <li key={c.articleId}>{state.articles[c.articleId]?.name} : {c.message}</li>)}
          </ul>
        )}
      </div>

      <details className="text-[13px] text-ink-muted">
        <summary className="cursor-pointer">Voir les plats de ce groupe</summary>
        <div className="mt-2 divide-y divide-paper-border rounded-lg border border-paper-border">
          {lot.articleIds.map((id) => {
            const d = descriptionOf(state, lot, id);
            const conflict = d?.conflict;
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[15px] text-ink">
                <span className="min-w-[160px] flex-1 font-medium">{state.articles[id]?.name}</span>
                <Tip text={TIPS.menuPrice}><span className="text-[13px] text-ink-muted">{meta[id] ? euro(meta[id].price) : ""}</span></Tip>
                {meta[id] && !meta[id].hasPhoto && <StatusBadge>Pas de photo</StatusBadge>}
                {!lot.validated && k > 1 && (
                  <Tip text={TIPS.split} align="right"><button type="button" className={ghost} onClick={() => change((s) => splitArticle(s, id))}>Il a d&apos;autres choix</button></Tip>
                )}
                <div className="flex w-full flex-wrap items-center gap-2">
                  <TextField
                    value={d?.text ?? ""}
                    ariaLabel={`Description de ${state.articles[id]?.name ?? "ce plat"}`}
                    placeholder="Pas de description : écris la tienne"
                    disabled={lot.validated}
                    className="min-w-[220px] flex-1 text-[13px] disabled:opacity-60"
                    onCommit={(v) => change((s) => editDescription(s, id, v))}
                  />
                  {d?.source === "restaurateur" && !lot.validated && (
                    <Tip text={TIPS.descReset} align="right"><button type="button" className={ghost} onClick={() => change((s) => resetDescription(s, id))}>Reprendre la nôtre</button></Tip>
                  )}
                  {conflict && !lot.validated && <Tip text={TIPS.descConflict} align="right"><StatusBadge tone="warn">Le nom et ta réponse ne vont pas ensemble</StatusBadge></Tip>}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {lot.validated ? (
        <p className="text-[13px] text-ink-muted">Choix : {lot.groups.length ? lot.groups.map((g) => g.title).join(", ") : "aucun"}.</p>
      ) : (
        <>
          {lot.groups.map((g) => <GroupEditor key={g.key} lotKey={lot.key} group={g} depth={0} lotValidated={lot.validated} weak={weak} change={change} />)}
          <div><button type="button" className={ghost} onClick={() => change((s) => addGroup(s, lot.key))}>+ Ajouter une liste de choix</button></div>
        </>
      )}
    </section>
  );
}
