"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, ProgressBar, StatusBadge } from "@/components/admin/ui";
import { describeHttpFailure, readJsonSafe } from "@/lib/fetch-json";
import { STRENGTH_LABEL, STRENGTH_NOTE, TIPS, plural } from "@/lib/menu-options/copy";
import { TONES, type Tone } from "@/lib/menu-options/descriptions";
import { buildEditor, savePayload, setTone, traceOf, type EditorState, type Lot } from "@/lib/menu-options/lots";
import { LotCard, type ArticleMeta, type Change } from "./LotCard";
import { Tip } from "./fields";

type Loaded = { items: { id: string; name: string; category: string; price: number; hasPhoto: boolean }[]; configured: Record<string, number>; available: boolean };
type Msg = { kind: "ok" | "err"; text: string; details?: string[]; technical?: string };

// L'écran « Options de mes plats » (ADR 0100) : on part du menu que le restaurateur a déjà, on range ses plats en groupes
// qui ont les mêmes choix, et il règle un groupe d'un seul geste. Rien n'est écrit tant qu'il n'a pas cliqué sur
// « Enregistrer », et seuls les groupes qu'il a validés partent.

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

// La « signature » d'un groupe validé : ce qui partirait en base (options ET descriptions). Si elle change après un
// enregistrement, le groupe n'est plus « enregistré » et le bouton le dit.
const sigOf = (s: EditorState, lot: Lot) => {
  if (!lot.validated) return "";
  const p = savePayload({ ...s, lots: [lot] })[0];
  return JSON.stringify([p.groups, p.descriptions]) + lot.articleIds.join(",");
};

export function OptionsEditor({ restaurantId }: { restaurantId: string }) {
  const [phase, setPhase] = useState<"loading" | "error" | "unavailable" | "empty" | "ready">("loading");
  const [meta, setMeta] = useState<ArticleMeta>({});
  const [configured, setConfigured] = useState<Record<string, number>>({});
  const [st, setSt] = useState<EditorState | null>(null);
  const [savedSig, setSavedSig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const load = useCallback(async (first: boolean) => {
    const res = await fetch(`/api/admin/menu/options?restaurantId=${encodeURIComponent(restaurantId)}`);
    const { data } = await readJsonSafe<Loaded>(res);
    if (!res.ok || !data) { if (first) setPhase("error"); return; }
    setConfigured(data.configured);
    if (!first) return;
    if (!data.available) { setPhase("unavailable"); return; }
    if (data.items.length === 0) { setPhase("empty"); return; }
    setMeta(Object.fromEntries(data.items.map((i) => [i.id, { price: i.price, hasPhoto: i.hasPhoto }])));
    setSt(buildEditor(data.items.map((i) => ({ id: i.id, name: i.name, category: i.category }))));
    setPhase("ready");
  }, [restaurantId]);

  useEffect(() => { void load(true); }, [load]);

  const change: Change = useCallback((fn) => { setMsg(null); setSt((s) => (s ? fn(s) : s)); }, []);

  const placed = useMemo(() => (st ? st.lots.reduce((n, l) => n + l.articleIds.length, 0) : 0), [st]);
  const photos = useMemo(() => (st ? Object.keys(st.articles).filter((id) => meta[id]?.hasPhoto).length : 0), [st, meta]);
  const toSave = useMemo(() => (st ? st.lots.filter((l) => l.validated && sigOf(st, l) !== savedSig[l.key]) : []), [st, savedSig]);

  if (phase === "loading") return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-paper-border bg-white" />)}</div>;
  if (phase === "error") return <Card><p className="text-[15px] text-danger">Impossible de lire ton menu pour le moment. Recharge la page, ou réessaie dans un instant.</p></Card>;
  if (phase === "unavailable") return <Card><p className="text-[15px] text-ink">Les options des plats ne sont pas encore activées pour ton compte. Réessaie dans un moment : nous nous en occupons.</p></Card>;
  if (phase === "empty") {
    return (
      <Card>
        <p className="text-[15px] text-ink">Tu n&apos;as aucun plat actif pour l&apos;instant. Les options se règlent à partir de ton menu.</p>
        <p className="mt-2 text-[15px]"><Link href={`/admin/${restaurantId}/menu`} className="font-semibold text-ink underline">Ajouter mon menu dans « Menu et coûts »</Link>, puis reviens ici.</p>
      </Card>
    );
  }
  if (!st) return null;

  const left = st.lots.filter((l) => !l.validated).length;
  const done = st.lots.filter((l) => l.validated).reduce((n, l) => n + l.articleIds.length, 0);
  const trace = traceOf(st);

  async function save() {
    if (!st || toSave.length === 0 || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/menu/options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, lots: savePayload({ ...st, lots: toSave }), trace: traceOf(st) }),
      });
      const { data } = await readJsonSafe<{ error?: string; details?: string[]; detail?: string; lots?: number; articles?: number; traceSaved?: boolean; descriptions?: number; descriptionsSaved?: boolean | null; descriptionsDetail?: string }>(res);
      if (!res.ok) {
        // Le détail technique aide l'équipe à trouver la cause sans fouiller les journaux du serveur.
        setMsg({ kind: "err", text: describeHttpFailure(res.status, data?.error), details: data?.details, technical: data?.detail ?? `réponse ${res.status}` });
        return;
      }
      // Des descriptions qui n'ont pas pu partir : le groupe reste « à enregistrer », pour pouvoir réessayer sans rien retoucher.
      const descriptionsFailed = data?.descriptionsSaved === false;
      if (!descriptionsFailed) setSavedSig((prev) => ({ ...prev, ...Object.fromEntries(toSave.map((l) => [l.key, sigOf(st, l)])) }));
      const notes: string[] = [];
      // La mesure interne n'est pas ton travail : on le dit sans t'alarmer, et nous le voyons de notre côté.
      if (data?.traceSaved === false) notes.push("Tes options sont bien enregistrées. Notre compteur interne, lui, n'a pas pu l'être : ce n'est pas un problème pour toi.");
      if (descriptionsFailed) notes.push("Tes options sont enregistrées, mais pas tes descriptions : la mise à jour de la base qui les accueille n'est peut-être pas encore faite. Elles restent ici : réessaie dans un moment.");
      setMsg({
        kind: "ok",
        text: `Enregistré : ${plural(data?.lots ?? toSave.length, "groupe", "groupes")} de plats, ${plural(data?.articles ?? 0, "plat", "plats")}${data?.descriptionsSaved === true ? `, ${plural(data.descriptions ?? 0, "description", "descriptions")}` : ""}.`,
        details: notes.length > 0 ? notes : undefined,
        technical: data?.descriptionsDetail,
      });
      await load(false);
    } catch (e) {
      setMsg({ kind: "err", text: "Impossible de joindre le serveur. Ton travail est encore ici : réessaie.", technical: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-paper-border bg-paper px-4 py-3 text-[15px] text-ink-body">
        <b className="block text-ink">Un groupe, un clic.</b>
        On est partis de ton menu Boosteats. Nous avons rangé tes plats en groupes qui ont les mêmes choix, et nous avons préparé ces choix d&apos;après ce que vendent des restaurants comme le tien. Toi, tu relis, tu décoches ce que tu ne fais pas, tu mets tes prix, et c&apos;est fait pour tout le groupe. Rien n&apos;est mis en ligne tant que tu n&apos;as pas cliqué sur « Enregistrer ».
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-paper-border bg-white px-4 py-3">
        <b className="text-[15px] text-ink">Ton des descriptions</b>
        <Tip text={TIPS.tone}>
          <select
            aria-label="Ton des descriptions"
            value={st.tone}
            onChange={(e) => change((s) => setTone(s, e.target.value as Tone))}
            className="min-h-[40px] rounded-lg border border-paper-border bg-white px-2 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Tip>
        <span className="min-w-[200px] flex-1 text-[13px] text-ink-muted">Tu peux le changer quand tu veux. Les descriptions que nous avons écrites se réécrivent toutes seules, pas celles que tu as écrites.</span>
      </div>

      <Card>
        <h2 className="text-[17px] font-semibold text-ink">On a lu ton menu</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {[[Object.keys(st.articles).length, "plats"], [st.lots.length, "groupes"], [photos, "photos"]].map(([n, label]) => (
            <div key={label as string} className="flex min-w-[72px] flex-col items-center rounded-lg bg-paper-subtle px-3 py-1.5">
              <b className="text-[24px] leading-none tabular-nums text-ink">{n}</b>
              <span className="text-[12px] text-ink-muted">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 divide-y divide-paper-border">
          {st.lots.map((l) => (
            <div key={l.key} className="flex items-center gap-3 py-2 text-[15px]">
              <span className="w-8 text-right font-semibold tabular-nums text-ink">{l.articleIds.length}</span>
              <span className="min-w-0 flex-1 text-ink">{l.label}</span>
              <Tip text={STRENGTH_NOTE[l.strength]} align="right">
                <StatusBadge tone={l.strength === "forte" ? "good" : l.strength === "faible" ? "warn" : "neutral"}>{STRENGTH_LABEL[l.strength]}</StatusBadge>
              </Tip>
            </div>
          ))}
        </div>
        {st.unplaced.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-muted">
            Nous n&apos;avons pas su où mettre {plural(st.unplaced.length, "plat", "plats")} : {st.unplaced.map((id) => st.articles[id]?.name).join(", ")}. Tu pourras {st.unplaced.length > 1 ? "les ajouter" : "l'ajouter"} à un groupe ci-dessous.
          </p>
        )}
      </Card>

      <div className="rounded-xl border border-paper-border bg-white p-4">
        <div className="mb-2 flex justify-between gap-3 text-[15px] font-semibold text-ink">
          <span>{done} plats réglés sur {placed}</span>
          <span className="tabular-nums">{placed ? Math.round((done * 100) / placed) : 0} %</span>
        </div>
        <ProgressBar value={done} max={Math.max(placed, 1)} tone={left === 0 ? "good" : "neutral"} label="Plats réglés" />
      </div>

      {st.lots.map((lot) => (
        <LotCard key={lot.key} lot={lot} state={st} meta={meta} configured={configured} saved={lot.validated && sigOf(st, lot) === savedSig[lot.key]} change={change} />
      ))}

      {left === 0 && st.lots.length > 0 && (
        <div className="rounded-xl border border-good/30 bg-good/10 px-4 py-3 text-[17px] font-semibold text-good">
          Bravo ! {placed} plats configurés avec seulement {st.lots.length} validations au lieu de {placed}.
        </div>
      )}

      <Card>
        <h2 className="text-[17px] font-semibold text-ink">Pour nous aider à nous améliorer</h2>
        <p className="mt-1 text-[13px] text-ink-muted">On compte ce que tu changes. Si tu changes beaucoup de choses, c&apos;est que nos propositions sont mauvaises, et nous le saurons.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-ink-muted sm:grid-cols-3">
          {[
            [`${trace.lots}`, `groupes pour ${trace.articles} plats`],
            [`${trace.choicesKept} / ${trace.choicesProposed}`, "de nos choix proposés gardés (groupes enregistrés)"],
            [`${trace.lines}`, "lignes que tu as changées"],
            [`${trace.suggestedKept} / ${trace.suggested}`, "plats proposés gardés dans leur groupe"],
            [`${trace.added}`, "plats ajoutés par toi à un groupe"],
            [`${trace.pricesSet}`, "prix de suppléments mis par toi"],
            [`${trace.descKept} / ${trace.descGenerated}`, "descriptions gardées telles quelles (groupes enregistrés)"],
            [`${trace.descEdited + trace.descCleared}`, "descriptions que tu as réécrites ou vidées"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-lg border border-paper-border bg-paper px-3 py-2"><b className="block text-[17px] tabular-nums text-ink">{n}</b>{label}</div>
          ))}
        </div>
      </Card>

      {msg && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-[15px] ${msg.kind === "ok" ? "border-good/30 bg-good/10 text-good" : "border-danger/30 bg-danger/10 text-danger"}`}>
          <p className="font-semibold">{msg.text}</p>
          {msg.details && msg.details.length > 0 && <ul className="mt-1 list-inside list-disc text-[13px]">{msg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          {msg.technical && <p className="mt-2 break-words text-[13px] font-normal">Détail pour l&apos;équipe : {msg.technical}</p>}
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-paper-border bg-white px-4 py-3 shadow-[0_8px_24px_rgba(12,21,9,0.10)]">
        <span className={`text-[15px] font-semibold ${left === 0 ? "text-good" : "text-ink"}`}>
          {left === 0 ? "Tous les groupes sont réglés." : `${plural(left, "groupe", "groupes")} sur ${st.lots.length} à régler`}
          {toSave.length > 0 && <span className="ml-2 font-normal text-ink-muted">{plural(toSave.length, "groupe réglé pas encore enregistré", "groupes réglés pas encore enregistrés")}</span>}
        </span>
        <button type="button" className={`${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`} disabled={toSave.length === 0 || saving} onClick={() => void save()}>
          {saving ? "Enregistrement…" : "Enregistrer mes options"}
        </button>
      </div>
    </div>
  );
}
