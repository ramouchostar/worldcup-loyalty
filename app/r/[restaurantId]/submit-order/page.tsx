"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { amountBand, track } from "@/lib/analytics";

type SubmitStatus = "idle" | "loading" | "success_validated" | "success_pending" | "error" | "duplicate";
type ParseStatus = "idle" | "parsing" | "done" | "error";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * 2000) + 3000; // 3000–5000ms
}

export default function SubmitOrderPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const { name: restaurantName } = useRestaurantInfo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState("");

  const [orderNumber, setOrderNumber] = useState("");
  const [orderNumberEditable, setOrderNumberEditable] = useState(false);
  // Libellé + exemple de la clé de commande propres à l'établissement (ADR 0019)
  const [keyLabel, setKeyLabel] = useState("Numéro de commande");
  const [keyExample, setKeyExample] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ocrAmount, setOcrAmount] = useState<number | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [noRestaurantHeader, setNoRestaurantHeader] = useState(false);
  const [noDelivery, setNoDelivery] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Entrée du tunnel de scan : c'est le dénominateur qui donne son sens au
  // taux d'abandon entre l'ouverture du formulaire et le ticket soumis.
  useEffect(() => {
    track("order_submit_started", { restaurant_id: restaurantId });
  }, [restaurantId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setPreview(URL.createObjectURL(file));
    setParseStatus("idle");
    setParseError("");
    setOrderNumber("");
    setOrderNumberEditable(false);
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
    setOrderNumber("");
    setAmount("");
  }

  async function analyseReceipt() {
    if (!receiptFile) return;
    setParseStatus("parsing");
    setParseError("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("restaurantId", restaurantId);

      const res = await fetch("/api/orders/parse-receipt", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data: {
        order_number?: string | null;
        amount?: number | null;
        confidence?: number | null;
        has_restaurant_header?: boolean;
        key_label?: string | null;
        key_example?: string | null;
        error?: string;
      } = await res.json();

      if (!res.ok) {
        setParseStatus("error");
        setParseError(data.error ?? "Erreur lors de l'analyse.");
        return;
      }

      setParseStatus("done");
      if (data.key_label) setKeyLabel(data.key_label);
      if (data.key_example) setKeyExample(data.key_example);
      if (data.order_number) {
        setOrderNumber(data.order_number);
        setOrderNumberEditable(false);
      } else {
        setOrderNumber("");
        setOrderNumberEditable(true);
      }
      if (data.amount) {
        setAmount(String(data.amount));
        setOcrAmount(data.amount);
      }
      setOcrConfidence(data.confidence ?? null);
      setNoRestaurantHeader(!(data.has_restaurant_header ?? true));
    } catch (err) {
      setParseStatus("error");
      if (err instanceof DOMException && err.name === "AbortError") {
        setParseError("L'analyse a pris trop de temps. Réessaie avec une photo plus légère.");
      } else {
        setParseError("Erreur réseau. Vérifie ta connexion et réessaie.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noDelivery || !receiptFile) return;

    setSubmitStatus("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("receipt", receiptFile);
    formData.append("order_number", orderNumber);
    formData.append("amount", amount);
    formData.append("restaurantId", restaurantId);
    if (ocrAmount !== null)      formData.append("ocr_amount", String(ocrAmount));
    if (ocrConfidence !== null)  formData.append("ocr_confidence", String(ocrConfidence));
    if (noRestaurantHeader)      formData.append("no_restaurant_header", "true");

    // Le montant part en tranche, jamais en euros (ADR 0028) : la charge utile
    // d'un événement analytics est lisible côté client.
    track("order_submitted", {
      restaurant_id: restaurantId,
      amount_band: amountBand(Number(amount)),
      has_receipt_photo: true,
    });

    // Délai artificiel 3–5s + fetch en parallèle (ADR 0008)
    try {
      const [res] = await Promise.all([
        fetch("/api/orders", { method: "POST", body: formData }),
        sleep(randomDelay()),
      ]);

      const data = await res.json().catch(() => ({}) as { status?: string; error?: string });

      if (res.status === 201) {
        const validated = data.status === "validated";
        track("order_result", {
          restaurant_id: restaurantId,
          result: validated ? "validated" : "pending_review",
        });
        setSubmitStatus(validated ? "success_validated" : "success_pending");
        return;
      }
      if (res.status === 409) {
        // Doublon : rejeté silencieusement côté membre, mais c'est un signal
        // utile côté produit (ticket rescanné, QR partagé entre membres).
        track("order_result", { restaurant_id: restaurantId, result: "rejected" });
        setSubmitStatus("duplicate");
        return;
      }
      track("order_result", { restaurant_id: restaurantId, result: "rejected" });
      setSubmitStatus("error");
      setErrorMsg(data.error ?? "Erreur inconnue.");
    } catch {
      // Coupure réseau pendant la soumission — ne jamais rester bloqué sur
      // « Vérification en cours… » (audit UX 2026-07).
      setSubmitStatus("error");
      setErrorMsg("Erreur réseau. Vérifie ta connexion et réessaie.");
    }
  }

  function reset() {
    setPreview(null);
    setReceiptFile(null);
    setParseStatus("idle");
    setParseError("");
    setOrderNumber("");
    setOrderNumberEditable(false);
    setAmount("");
    setNoDelivery(false);
    setSubmitStatus("idle");
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ADR 0030 §6 — après un scan réussi, la suite naturelle est « qu'est-ce
  // que ça m'a rapporté ? » (libellés neutres : la validation est différée,
  // ADR 0008 — ne jamais promettre un cadeau déjà là).
  if (submitStatus === "success_validated") {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Ticket vérifié !</h2>
        <p className="text-gray-600 text-sm mb-2">
          Ta commande est validée. Ton score communautaire sera mis à jour sous peu.
        </p>
        <p className="text-gray-500 text-xs mb-6">
          Passe au comptoir lors de ta prochaine visite pour récupérer tes cadeaux.
        </p>
        <div className="max-w-xs mx-auto space-y-3">
          <Link
            href={`/r/${restaurantId}/my-rewards`}
            className="block bg-brand-red text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
          >
            Voir mes cadeaux →
          </Link>
          <Link
            href={`/r/${restaurantId}/dashboard`}
            className="block bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Soumettre une autre commande
          </button>
        </div>
      </div>
    );
  }

  if (submitStatus === "success_pending") {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">⏳</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Vérification en cours</h2>
        <p className="text-gray-600 text-sm mb-6">
          Ton ticket est en cours de traitement. Tu seras notifié dès que la vérification est terminée.
        </p>
        <div className="max-w-xs mx-auto space-y-3">
          <Link
            href={`/r/${restaurantId}/dashboard`}
            className="block bg-brand-red text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Soumettre une autre commande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Soumettre une commande</h1>
        <p className="text-gray-500 text-sm mt-1">
          Prends en photo ton ticket de caisse — on s&apos;occupe du reste.
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
          className="w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors mb-4"
        >
          {parseStatus === "parsing" ? "Analyse en cours..." : "Analyser le ticket"}
        </button>
      )}

      {parseStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-red-700 text-sm">{parseError}</p>
          <p className="text-red-500 text-xs mt-1">
            Assure-toi que le numéro de commande est bien visible sur la photo.
          </p>
        </div>
      )}

      {/* Formulaire — visible après analyse réussie */}
      {parseStatus === "done" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 items-start">
            <span className="text-green-600">✓</span>
            <p className="text-green-800 text-sm">
              Ticket analysé. Vérifie que les informations ci-dessous correspondent à ton reçu.
            </p>
          </div>

          {/* Clé de commande — read-only if found, editable if not */}
          {orderNumberEditable && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-orange-800 text-sm font-semibold">{keyLabel} non détecté</p>
              <p className="text-orange-700 text-xs mt-1">
                Entre le numéro manuellement si tu le vois sur ton ticket,
                ou laisse vide — ta commande sera vérifiée manuellement sous 2h.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {keyLabel}
            </label>
            {orderNumberEditable ? (
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={keyExample ?? ""}
                className="w-full px-4 py-3 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900 font-mono text-sm"
              />
            ) : (
              <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 flex items-center justify-between font-mono text-sm">
                <span>{orderNumber}</span>
                <span className="text-xs text-gray-400 font-sans">Lu sur le ticket</span>
              </div>
            )}
          </div>

          {/* Montant — editable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant total (€)
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
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
            <p className="text-xs text-gray-400 mt-1">Corrige si le montant lu est incorrect</p>
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
              directement au restaurant {restaurantName} (sur place ou téléphone/WhatsApp),{" "}
              <span className="font-semibold text-brand-red">
                et non via une plateforme de livraison
              </span>
              .
            </span>
          </label>

          {submitStatus === "loading" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl animate-spin">⏳</span>
              <div>
                <p className="font-semibold text-blue-900 text-sm">Vérification en cours...</p>
                <p className="text-blue-700 text-xs mt-0.5">
                  Analyse de ton ticket en cours, merci de patienter.
                </p>
              </div>
            </div>
          )}

          {submitStatus === "duplicate" && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="font-semibold text-orange-900 text-sm">Commande déjà soumise</p>
              <p className="text-orange-700 text-xs mt-1">
                Ce numéro de ticket a déjà été enregistré dans le système.
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
            className="w-full bg-brand-red text-white py-4 px-4 rounded-xl font-semibold text-lg hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitStatus === "loading" ? "Vérification en cours..." : "Soumettre la commande"}
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
