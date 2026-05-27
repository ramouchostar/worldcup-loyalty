"use client";

import { useRef, useState } from "react";

type SubmitStatus = "idle" | "loading" | "success" | "error" | "duplicate";
type ParseStatus = "idle" | "parsing" | "done" | "error";

interface ExtractedData {
  date: string | null;
  time: string | null;
  amount: number | null;
}

export default function SubmitOrderPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState("");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState("");
  const [noDelivery, setNoDelivery] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const programStart = process.env.NEXT_PUBLIC_PROGRAM_START_DATE ?? "2026-06-01";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setPreview(URL.createObjectURL(file));
    setParseStatus("idle");
    setParseError("");
    setDate("");
    setTime("");
    setAmount("");
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setReceiptFile(file);
    setPreview(URL.createObjectURL(file));
    setParseStatus("idle");
    setParseError("");
    setDate("");
    setTime("");
    setAmount("");
  }

  async function analyseReceipt() {
    if (!receiptFile) return;
    setParseStatus("parsing");
    setParseError("");

    const formData = new FormData();
    formData.append("receipt", receiptFile);

    const res = await fetch("/api/orders/parse-receipt", {
      method: "POST",
      body: formData,
    });

    const data: ExtractedData & { error?: string } = await res.json();

    if (!res.ok) {
      setParseStatus("error");
      setParseError(data.error ?? "Erreur lors de l'analyse.");
      return;
    }

    if (!data.date || !data.time) {
      setParseStatus("error");
      setParseError(
        "Impossible de lire la date ou l'heure sur ce ticket. Prends une photo plus nette, bien éclairée et sans flou."
      );
      return;
    }

    setParseStatus("done");
    setDate(data.date);
    setTime(data.time);
    if (data.amount) setAmount(String(data.amount));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noDelivery) return;

    setSubmitStatus("loading");
    setErrorMsg("");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_date: date, order_time: time, amount: parseFloat(amount) }),
    });

    if (res.status === 201) {
      setSubmitStatus("success");
      return;
    }

    const data = await res.json();
    if (res.status === 409) {
      setSubmitStatus("duplicate");
    } else {
      setSubmitStatus("error");
      setErrorMsg(data.error ?? "Erreur inconnue.");
    }
  }

  function reset() {
    setPreview(null);
    setReceiptFile(null);
    setParseStatus("idle");
    setParseError("");
    setDate("");
    setTime("");
    setAmount("");
    setNoDelivery(false);
    setSubmitStatus("idle");
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (submitStatus === "success") {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Commande soumise !</h2>
        <p className="text-gray-600 text-sm mb-6">
          Elle est en attente de validation par notre équipe. Tu recevras une confirmation sur ton
          dashboard.
        </p>
        <button
          onClick={reset}
          className="bg-brand-red text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
        >
          Soumettre une autre commande
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Soumettre une commande</h1>
        <p className="text-gray-500 text-sm mt-1">
          Prends en photo ton ticket de caisse — on s'occupe du reste.
        </p>
      </div>

      {/* Bannière règle importante */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="font-semibold text-amber-900 text-sm">Commandes directes uniquement</p>
          <p className="text-amber-700 text-xs mt-1">
            Les commandes passées via Uber Eats, Takeaway ou Deliveroo ne comptent pas.
          </p>
        </div>
      </div>

      {/* Zone upload */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-6 mb-4 text-center cursor-pointer hover:border-brand-red transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Ticket de caisse"
              className="max-h-56 mx-auto rounded-lg object-contain"
            />
            <p className="text-xs text-gray-400 mt-2">Clique pour changer la photo</p>
          </div>
        ) : (
          <div className="py-4">
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-semibold text-gray-700">Photo du ticket de caisse</p>
            <p className="text-xs text-gray-400 mt-1">
              Clique ici ou glisse ta photo (JPG, PNG, WebP — max 5 Mo)
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Bouton analyser */}
      {preview && parseStatus !== "done" && (
        <button
          onClick={analyseReceipt}
          disabled={parseStatus === "parsing"}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors mb-4"
        >
          {parseStatus === "parsing" ? "Analyse en cours..." : "Analyser le ticket"}
        </button>
      )}

      {parseStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-red-700 text-sm">{parseError}</p>
          <p className="text-red-500 text-xs mt-1">Remplis les champs ci-dessous manuellement.</p>
        </div>
      )}

      {/* Formulaire — visible après analyse ou si erreur OCR */}
      {(parseStatus === "done" || parseStatus === "error") && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {parseStatus === "done" && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 items-start">
              <span className="text-green-600">✓</span>
              <p className="text-green-800 text-sm">
                Informations extraites automatiquement. Vérifie qu'elles sont correctes avant de
                soumettre.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date de la commande
            </label>
            <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 flex items-center justify-between">
              <span>{date}</span>
              <span className="text-xs text-gray-400">Lu sur le ticket</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Heure de la commande
            </label>
            <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 flex items-center justify-between">
              <span>{time}</span>
              <span className="text-xs text-gray-400">Lu sur le ticket</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant total (€)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="500"
                step="0.01"
                placeholder="Ex : 12.50"
                required
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                €
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Entre 1€ et 500€</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-red transition-colors">
            <input
              type="checkbox"
              checked={noDelivery}
              onChange={(e) => setNoDelivery(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-brand-red shrink-0"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">Je confirme</span> que cette commande a été passée
              directement au restaurant Belchicken (sur place ou téléphone/WhatsApp),{" "}
              <span className="font-semibold text-brand-red">
                et non via une plateforme de livraison
              </span>
              .
            </span>
          </label>

          {submitStatus === "duplicate" && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="font-semibold text-orange-900 text-sm">Commande déjà soumise</p>
              <p className="text-orange-700 text-xs mt-1">
                Une commande avec la même date, heure et montant existe déjà.
              </p>
            </div>
          )}

          {submitStatus === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-700 text-sm">{errorMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!noDelivery || submitStatus === "loading"}
            className="w-full bg-brand-red text-white py-4 px-4 rounded-xl font-semibold text-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitStatus === "loading" ? "Envoi en cours..." : "Soumettre la commande"}
          </button>

          {!noDelivery && (
            <p className="text-center text-xs text-gray-400">
              Coche la case de confirmation pour soumettre
            </p>
          )}
        </form>
      )}
    </div>
  );
}
