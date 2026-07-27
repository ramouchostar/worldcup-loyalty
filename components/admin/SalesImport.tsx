"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsvTable, guessMapping, parseSalesRows, parseRowsFromGrid } from "@/lib/sales-import";
import { parseXlsxToGrid } from "@/lib/xlsx";

// Import des ventes de caisse (ADR 0027 §2). Le mapping des colonnes se fait
// côté client (aperçu instantané) ; l'enregistrement passe par le RPC
// transactionnel côté serveur (remplacement par plage de dates).

type LastImport = {
  filename: string | null;
  row_count: number;
  date_min: string | null;
  date_max: string | null;
  imported_at: string;
} | null;

type Result = { imported: number; dropped: number; dateMin: string | null; dateMax: string | null };

export default function SalesImport({
  restaurantId,
  lastImport,
}: {
  restaurantId: string;
  lastImport: LastImport;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string>("");
  const [csvText, setCsvText] = useState<string>("");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [kind, setKind] = useState<"csv" | "xlsx" | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState<number | null>(null);
  const [amountCol, setAmountCol] = useState<number | null>(null);
  const [timeCol, setTimeCol] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setCsvText("");
    setGrid(null);
    setKind(null);
    setHeaders([]);
    setDateCol(null);
    setAmountCol(null);
    setTimeCol(null);
    setError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    reset();
    if (!file) return;
    setFilename(file.name);
    try {
      let h: string[];
      if (/\.xlsx$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { headers: xh, rows } = parseXlsxToGrid(bytes);
        h = xh;
        setGrid(rows);
        setKind("xlsx");
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const text = await file.text();
        h = parseCsvTable(text).headers;
        setCsvText(text);
        setKind("csv");
      } else {
        setError(
          "Format non supporté. Utilise un CSV ou un Excel .xlsx (les vieux .xls ne sont pas lus — enregistre-les en .xlsx ou en CSV)."
        );
        return;
      }
      if (h.length === 0) {
        setError("Fichier illisible ou vide.");
        return;
      }
      const g = guessMapping(h);
      setHeaders(h);
      setDateCol(g.date);
      setAmountCol(g.amount);
      setTimeCol(g.time);
    } catch {
      setError("Impossible de lire ce fichier. Vérifie qu'il s'agit d'un CSV ou d'un .xlsx valide.");
    }
  }

  // Aperçu instantané avec le mapping courant.
  const preview = useMemo(() => {
    if (dateCol === null || amountCol === null) return null;
    const m = { date: dateCol, amount: amountCol, time: timeCol };
    if (kind === "xlsx" && grid) return parseRowsFromGrid(grid, m);
    if (kind === "csv" && csvText) return parseSalesRows(csvText, m);
    return null;
  }, [kind, grid, csvText, dateCol, amountCol, timeCol]);

  async function submit() {
    if (dateCol === null || amountCol === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sales-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          filename,
          mapping: { date: dateCol, amount: amountCol, time: timeCol },
          ...(kind === "xlsx" ? { rows: grid } : { csvText }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Échec de l'import.");
        return;
      }
      setResult({ imported: data.imported, dropped: data.dropped, dateMin: data.dateMin, dateMax: data.dateMax });
      reset();
      setFilename("");
      router.refresh(); // recalcule le forecast avec les nouvelles ventes
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  const options = headers.map((h, i) => ({ label: h || `Colonne ${i + 1}`, value: i }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="font-bold text-gray-900">Importer mes ventes de caisse</h2>
      <p className="text-xs text-gray-500 mt-1">
        Exporte tout ton chiffre depuis ton logiciel de caisse (CSV ou Excel) et dépose-le ici. On n&apos;en garde que
        la <span className="font-medium">date, l&apos;heure et le montant</span> — jamais tes clients. Ces ventes
        ne s&apos;affichent nulle part : elles servent uniquement à calculer tes prévisions.
      </p>

      {lastImport && (
        <p className="text-xs text-gray-400 mt-2">
          Dernier import : {lastImport.row_count.toLocaleString("fr-BE")} ventes
          {lastImport.date_min && lastImport.date_max ? ` (${fr(lastImport.date_min)} → ${fr(lastImport.date_max)})` : ""}.
        </p>
      )}

      <div className="mt-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,.txt,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-dark file:text-white hover:file:bg-black/80 cursor-pointer"
        />
      </div>

      {error && (
        <div className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">
          ✅ {result.imported.toLocaleString("fr-BE")} ventes importées
          {result.dateMin && result.dateMax ? ` (${fr(result.dateMin)} → ${fr(result.dateMax)})` : ""}.
          {result.dropped > 0 && ` ${result.dropped} ligne(s) illisible(s) ignorée(s).`}
        </div>
      )}

      {headers.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Colonne date *">
              <Select value={dateCol} onChange={setDateCol} options={options} />
            </Field>
            <Field label="Colonne montant *">
              <Select value={amountCol} onChange={setAmountCol} options={options} />
            </Field>
            <Field label="Colonne heure (optionnel)">
              <Select value={timeCol} onChange={setTimeCol} options={options} allowNone />
            </Field>
          </div>

          {preview && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              {preview.rows.length > 0 ? (
                <>
                  <span className="font-semibold text-gray-700">{preview.rows.length.toLocaleString("fr-BE")}</span>{" "}
                  ventes détectées
                  {preview.dateMin && preview.dateMax ? ` du ${fr(preview.dateMin)} au ${fr(preview.dateMax)}` : ""}.
                  {preview.dropped > 0 && (
                    <span className="text-amber-700"> {preview.dropped} ligne(s) non reconnue(s).</span>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preview.rows.slice(0, 3).map((r, i) => (
                      <span key={i} className="bg-white border border-gray-200 rounded px-2 py-0.5 tabular-nums">
                        {fr(r.d)}
                        {r.t ? ` ${r.t}` : ""} · {r.a.toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-amber-700">
                  Aucune vente reconnue avec ces colonnes — vérifie ton choix ci-dessus.
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy || dateCol === null || amountCol === null || !preview || preview.rows.length === 0}
              className="bg-brand-red text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-red/90 transition-colors"
            >
              {busy ? "Import en cours…" : "Importer ces ventes"}
            </button>
            <button onClick={reset} disabled={busy} className="text-sm text-gray-500 hover:text-gray-700">
              Annuler
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Ré-importer une période déjà chargée la <span className="font-medium">remplace</span> proprement —
            aucun risque de compter deux fois.
          </p>
        </div>
      )}
    </div>
  );
}

function fr(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  allowNone,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  options: { label: string; value: number }[];
  allowNone?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white"
    >
      <option value="">{allowNone ? "— aucune —" : "Choisir…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
