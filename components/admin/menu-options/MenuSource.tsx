"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/admin/ui";
import { describeHttpFailure, readJsonSafe } from "@/lib/fetch-json";
import { plural } from "@/lib/menu-options/copy";
import type { MenuReadResult } from "@/lib/menu-options/pdf";
import { Tip } from "./fields";

// ADR 0100 §11 — « Par où commencer ? » : le menu du restaurateur, donné par son PDF OU par le lien de son menu en ligne.
// C'est le PREMIER geste de l'écran : le menu classe déjà ses plats par rubrique et dit ses sauces et ses accompagnements,
// donc nous le lisons avant de ranger quoi que ce soit. Rien n'est écrit en base ici : la lecture ne fait que préparer
// l'écran (les groupes), et le restaurateur règle et enregistre ensuite.

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const MAX_MB = 4;

type Way = "pdf" | "lien";

export function MenuSource({ restaurantId, result, outcome, locked, onRead, onClear }: {
  restaurantId: string;
  result: MenuReadResult | null;
  /** Ce que l'écran a fait de la lecture (groupes rangés d'après le menu, ou non, et pourquoi). */
  outcome: string | null;
  /** Des groupes sont déjà réglés : une nouvelle lecture ne les remplacerait pas, elle ne servirait qu'aux descriptions. */
  locked: boolean;
  onRead: (r: MenuReadResult) => void;
  onClear: () => void;
}) {
  const [way, setWay] = useState<Way>("pdf");
  const [link, setLink] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(body: FormData) {
    setError(null);
    setReading(true);
    try {
      body.set("restaurantId", restaurantId);
      const r = await fetch("/api/admin/menu/options/pdf", { method: "POST", body });
      const { data } = await readJsonSafe<MenuReadResult & { error?: string }>(r);
      if (!r.ok || !data || !data.reviews) {
        setError(data?.error ?? describeHttpFailure(r.status, null));
        return;
      }
      onRead(data);
    } catch {
      setError(way === "pdf" ? "Impossible d'envoyer le PDF pour le moment. Vérifie ta connexion et réessaie." : "Impossible de lire ce lien pour le moment. Vérifie ta connexion et réessaie.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Ce PDF fait plus de ${MAX_MB} Mo. Compresse-le, ou envoie seulement les pages du menu.`); return; }
    const body = new FormData();
    body.set("file", file);
    void send(body);
  }

  function onLink() {
    if (link.trim() === "") { setError("Colle l'adresse de ton menu en ligne."); return; }
    const body = new FormData();
    body.set("link", link.trim());
    void send(body);
  }

  const tab = (w: Way, label: string) => (
    <button
      type="button" role="radio" aria-checked={way === w} disabled={reading} onClick={() => { setWay(w); setError(null); }}
      className={`${btn} border ${way === w ? "border-ink bg-ink text-white" : "border-paper-border bg-white text-ink hover:border-ink-faint"}`}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Par où commencer ? Ton menu</h2>
        <Tip text="Ton menu classe déjà tes plats par rubrique, et il dit souvent quelles sauces tu proposes et avec quoi tes plats sont servis. Si nous le lisons d'abord, nous rangeons tes plats comme toi, et nous reprenons tes sauces au lieu d'en deviner." />
      </div>
      <p className="mt-1 text-[15px] text-ink-muted">
        Donne-nous ton menu, et nous rangeons tes plats d&apos;après tes rubriques. Nous reprenons aussi tes sauces et tes accompagnements gratuits (« servi avec frites ou riz »). Tu relis tout avant que quoi que ce soit soit enregistré.
      </p>

      {!result && (
        <div className="mt-3 space-y-3">
          <div role="radiogroup" aria-label="Comment donner ton menu" className="flex flex-wrap gap-2">
            {tab("pdf", "J'ai un PDF")}
            {tab("lien", "J'ai un lien")}
          </div>

          {way === "pdf" ? (
            <div className="space-y-2">
              <label className="block text-[15px] font-semibold text-ink" htmlFor="menu-pdf">Choisis ton PDF ({MAX_MB} Mo au plus)</label>
              <input
                id="menu-pdf" ref={fileRef} type="file" accept="application/pdf" disabled={reading}
                onChange={(e) => onFile(e.target.files?.[0])}
                className="block w-full min-w-0 text-[15px] text-ink file:mr-3 file:min-h-[44px] file:rounded-lg file:border file:border-paper-border file:bg-white file:px-4 file:py-2 file:text-[15px] file:font-semibold"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[15px] font-semibold text-ink" htmlFor="menu-link">L&apos;adresse de ton menu en ligne</label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="menu-link" type="url" inputMode="url" autoComplete="off" placeholder="https://monrestaurant.be/menu" value={link} disabled={reading}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onLink(); }}
                  className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-paper-border bg-white px-3 py-2 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                />
                <button type="button" className={`${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`} disabled={reading} onClick={onLink}>
                  Lire mon menu
                </button>
              </div>
              <p className="text-[13px] text-ink-muted">
                Le site de ton restaurant, ou le lien de ton QR code. Les liens des plateformes de livraison (Uber Eats, Deliveroo, Takeaway…) ne sont pas encore lus : envoie ton PDF.
              </p>
            </div>
          )}
          {reading && <p role="status" className="text-[15px] text-ink-muted">Lecture de ton menu… Cela peut prendre une minute.</p>}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <p role="status" className="text-[15px] text-ink">
            Nous avons lu {plural(result.linesRead, "ligne", "lignes")} de ton {result.source === "lien" ? "menu en ligne" : "PDF"} et retrouvé {plural(result.counts.matched, "plat", "plats")} de ton menu Boosteats.
            {result.menuCounts.categories > 0 && ` Rubriques reprises : ${result.menuCounts.categories}.`}
            {result.menuCounts.sauceLists > 0 && ` Liste${result.menuCounts.sauceLists > 1 ? "s" : ""} de sauces : ${result.menuCounts.sauceLists}.`}
            {result.menuCounts.sideLists > 0 && ` Accompagnements au choix : ${result.menuCounts.sideLists}.`}
          </p>
          {outcome && <p className="rounded-lg border border-paper-border bg-paper px-3 py-2 text-[15px] text-ink">{outcome}</p>}
          {result.menuCounts.categories === 0 && result.menuCounts.sauceLists === 0 && result.menuCounts.sideLists === 0 && !locked && (
            <p className="text-[13px] text-ink-muted">Ton menu ne donne ni rubriques ni sauces que nous puissions rattacher à tes plats : nous gardons nos propositions habituelles.</p>
          )}
          <button type="button" className={`${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`} onClick={onClear}>
            Lire un autre menu
          </button>
        </div>
      )}
    </Card>
  );
}
