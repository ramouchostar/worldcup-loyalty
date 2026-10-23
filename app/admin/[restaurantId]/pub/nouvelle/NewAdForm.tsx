"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OBJECTIVE_RESULT } from "@/lib/ads/objectives";
import { META_SPEC, OPEN_OBJECTIVES, RADII_KM, dayCount, type OpenObjective } from "@/lib/ads/meta-spec";
import { formatEur } from "@/lib/ads/money";
import { Card } from "@/components/admin/ui";
import { askUpload, submitRequest } from "../actions";

export type PostOption = { id: string; mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; likes: number; comments: number; thumbnail: string | null; permalink: string | null; caption: string | null };
type Billing = { legalName: string; vatNumber: string | null; address: string } | null;

const BUDGETS = [100, 200, 300];
const STEP = "text-[15px] font-semibold text-ink";
const INPUT = "mt-1 block w-full rounded-lg border border-paper-border bg-white px-3 py-2.5 text-[15px] text-ink";
const chip = (on: boolean) =>
  `flex-1 rounded-lg px-3 py-2.5 text-[14px] ${on ? "border-2 border-boost-olive bg-boost-cream font-semibold text-ink" : "border border-paper-border bg-white text-ink-body"}`;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function NewAdForm(p: { restaurantId: string; today: string; posts: PostOption[]; address: string | null; feePct: number; planLabel: string; vatRate: number; billing: Billing }) {
  const router = useRouter();
  const [objective, setObjective] = useState<OpenObjective>("TRAFIC");
  const [postId, setPostId] = useState<string | null>(p.posts.find((x) => x.mediaType === "VIDEO")?.id ?? p.posts[0]?.id ?? null);
  const [upload, setUpload] = useState<{ path: string; mime: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adText, setAdText] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [startsOn, setStartsOn] = useState(addDays(p.today, 1));
  const [endsOn, setEndsOn] = useState(addDays(p.today, 14));
  const [budget, setBudget] = useState(200);
  const [custom, setCustom] = useState(false);
  const [legalName, setLegalName] = useState(p.billing?.legalName ?? "");
  const [vatNumber, setVatNumber] = useState(p.billing?.vatNumber ?? "");
  const [billAddress, setBillAddress] = useState(p.billing?.address ?? "");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsVideo = META_SPEC[objective].needsVideo;
  const posts = needsVideo ? p.posts.filter((x) => x.mediaType === "VIDEO") : p.posts;
  const days = startsOn && endsOn && endsOn >= startsOn ? dayCount(startsOn, endsOn) : 0;
  const q = useMemo(() => {
    const b = Math.max(0, Math.round(budget)) * 100;
    const fee = Math.round((b * p.feePct) / 100);
    const vat = Math.round(((b + fee) * p.vatRate) / 100);
    return { b, fee, vat, total: b + fee + vat };
  }, [budget, p.feePct, p.vatRate]);

  async function onFile(f: File | null) {
    if (!f) return;
    setError(null);
    setUploading(true);
    try {
      const asked = await askUpload(p.restaurantId, f.type, f.size);
      if (!asked.ok) return setError(asked.error);
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", f);
      const sent = await fetch(asked.uploadUrl, { method: "PUT", body: form });
      if (!sent.ok) return setError("L'envoi a été coupé, réessaie.");
      setUpload({ path: asked.path, mime: f.type, name: f.name });
      setPostId(null);
    } catch {
      setError("Pas de connexion, réessaie.");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    const post = p.posts.find((x) => x.id === postId);
    const creative = upload
      ? { kind: "upload", path: upload.path, mime: upload.mime }
      : post
        ? { kind: "instagram_post", mediaId: post.id, mediaType: post.mediaType, permalink: post.permalink, thumbnail: post.thumbnail }
        : null;
    start(async () => {
      const r = await submitRequest(p.restaurantId, {
        objective,
        budgetEuros: budget,
        startsOn,
        endsOn,
        radiusKm,
        adText,
        creative,
        billing: { legalName, vatNumber, address: billAddress },
        termsAccepted: terms,
      });
      if (!r.ok) return setError(r.error ?? "Réessaie.");
      router.push(`/admin/${p.restaurantId}/pub/${r.requestId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className={STEP}>1. Tu veux quoi ?</p>
        {OPEN_OBJECTIVES.map((o) => (
          <label key={o} className={`flex items-center gap-3 rounded-lg p-3 text-[14px] ${objective === o ? "border-2 border-boost-olive bg-boost-cream" : "border border-paper-border bg-white"}`}>
            <input type="radio" name="objective" checked={objective === o} onChange={() => setObjective(o)} />
            {OBJECTIVE_RESULT[o].label}
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <p className={STEP}>2. Quelle publication ?</p>
        <p className="text-[13px] text-ink-muted">{posts.length ? "Tes publications Instagram qui ont le mieux marché, vidéos d'abord." : needsVideo ? "Envoie une vidéo." : "Envoie une photo ou une vidéo."}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {posts.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setPostId(x.id);
                setUpload(null);
              }}
              aria-pressed={postId === x.id && !upload}
              className={`relative aspect-[4/5] overflow-hidden rounded-lg bg-paper-subtle text-left ${postId === x.id && !upload ? "ring-4 ring-boost-olive" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.thumbnail && <img src={x.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1.5 py-1 text-[11px] font-semibold text-white">
                {x.mediaType === "VIDEO" ? "Vidéo" : "Photo"} · {x.likes} ♥
              </span>
            </button>
          ))}
          <label className={`flex aspect-[4/5] cursor-pointer items-center justify-center rounded-lg border border-dashed border-ink-faint bg-white p-2 text-center text-[12px] font-semibold text-ink ${upload ? "ring-4 ring-boost-olive" : ""}`}>
            <input type="file" accept={needsVideo ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime"} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {uploading ? "Envoi…" : upload ? `✓ ${upload.name}` : needsVideo ? "Envoyer une vidéo" : "Envoyer une photo ou une vidéo"}
          </label>
        </div>
        <label className="block text-[13px] text-ink-body">
          Texte de la pub
          <textarea value={adText} onChange={(e) => setAdText(e.target.value)} maxLength={500} rows={3} className={INPUT} placeholder="Ce que les gens du quartier vont lire au-dessus de ta pub" />
        </label>
        {!upload && postId && <p className="text-[12px] text-ink-faint">Avec une publication Instagram, Meta reprend sa légende : ton texte nous sert à la vérifier.</p>}
      </section>

      <section className="space-y-2">
        <p className={STEP}>3. Où et quand ?</p>
        <div className="flex gap-1.5">
          {RADII_KM.map((r) => (
            <button key={r} type="button" className={chip(radiusKm === r)} onClick={() => setRadiusKm(r)} aria-pressed={radiusKm === r}>
              {r} km
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-muted">Autour de : {p.address ?? "ton restaurant"} · tous les âges</p>
        <div className="flex gap-2">
          <label className="flex-1 text-[13px] text-ink-body">
            Début
            <input type="date" min={addDays(p.today, 1)} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
          </label>
          <label className="flex-1 text-[13px] text-ink-body">
            Fin
            <input type="date" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <p className={STEP}>4. Ton budget</p>
        <div className="flex gap-1.5">
          {BUDGETS.map((b) => (
            <button key={b} type="button" className={chip(!custom && budget === b)} onClick={() => { setCustom(false); setBudget(b); }} aria-pressed={!custom && budget === b}>
              {b} €
            </button>
          ))}
          <button type="button" className={chip(custom)} onClick={() => setCustom(true)} aria-pressed={custom}>Autre</button>
        </div>
        {custom && (
          <label className="block text-[13px] text-ink-body">
            Budget (€)
            <input type="number" min={100} step={10} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className={INPUT} />
          </label>
        )}
        <p className="text-[13px] text-ink-muted">
          {days > 0 ? `Soit environ ${formatEur(Math.floor(q.b / days))} par jour sur ${days} jour${days > 1 ? "s" : ""}. ` : ""}Minimum 100 €.
        </p>
      </section>

      <section className="space-y-2">
        <p className={STEP}>
          5. Facturation {!p.billing && <span className="text-[13px] font-normal text-ink-muted">(une seule fois)</span>}
        </p>
        <label className="block text-[13px] text-ink-body">
          Raison sociale
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={INPUT} autoComplete="organization" />
        </label>
        <label className="block text-[13px] text-ink-body">
          Numéro de TVA
          <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} className={INPUT} placeholder="BE0123456789" />
        </label>
        <label className="block text-[13px] text-ink-body">
          Adresse
          <input value={billAddress} onChange={(e) => setBillAddress(e.target.value)} className={INPUT} autoComplete="street-address" />
        </label>
      </section>

      <Card className="space-y-2 text-[14px] text-ink">
        <div className="flex justify-between"><span>Budget de diffusion</span><span className="tabular-nums">{formatEur(q.b)}</span></div>
        <div className="flex justify-between text-ink-muted"><span>Frais de service ({p.planLabel}, {p.feePct} %)</span><span className="tabular-nums">{formatEur(q.fee)}</span></div>
        {q.vat > 0 && <div className="flex justify-between text-ink-muted"><span>TVA ({p.vatRate} %)</span><span className="tabular-nums">{formatEur(q.vat)}</span></div>}
        <div className="flex justify-between border-t border-paper-border pt-2 text-[16px] font-bold"><span>À payer</span><span className="tabular-nums">{formatEur(q.total)}</span></div>
        {p.vatRate === 0 && <p className="text-[12px] text-ink-faint">Régime particulier de la franchise de taxe : pas de TVA.</p>}
      </Card>

      <label className="flex items-start gap-3 text-[13px] text-ink-body">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
        <span>
          J&apos;accepte les{" "}
          <a href="/campaign-hub/terms" target="_blank" rel="noreferrer" className="font-semibold text-boost-olive-dark underline">
            conditions de la Pub
          </a>
          .
        </span>
      </label>

      {error && <p className="text-[14px] font-semibold text-danger" role="alert">{error}</p>}
      <button type="button" disabled={pending || uploading} onClick={submit} className="block w-full rounded-xl bg-boost-olive px-4 py-3.5 text-[15px] font-semibold text-white hover:bg-boost-olive-dark disabled:opacity-50">
        {pending ? "Envoi…" : "Demander ma pub"}
      </button>
      <p className="text-center text-[12px] text-ink-faint">Tu paies par virement. On prépare la pub dès réception et on la lance après vérification.</p>
    </div>
  );
}
