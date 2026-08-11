"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import type { OrderRewardLine, OrderRewardLineLayer } from "@/types";

type SubmitStatus = "idle" | "loading" | "success_validated" | "success_pending" | "error" | "duplicate";
type ParseStatus = "idle" | "parsing" | "done" | "error";

// Présentation des 3 couches — même vocabulaire et mêmes emojis que la hero
// card du dashboard (ADR 0006/0010). Uniquement des noms d'articles, jamais
// d'euros ni de coûts (ADR 0007).
const LAYER_META: Record<OrderRewardLineLayer, { emoji: string; label: string; prefix: string }> = {
  base:      { emoji: "🍗", label: "cadeau de base",      prefix: "" },
  community: { emoji: "👥", label: "bonus communautaire", prefix: "+ " },
  team:      { emoji: "🏆", label: "bonus d'équipe",      prefix: "+ " },
};

// Repli : anciens déploiements ou réponse partielle → on ne garde que des
// lignes bien formées ; sans lignes, l'écran de succès actuel s'affiche tel quel.
function parseRewardLines(raw: unknown): OrderRewardLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is OrderRewardLine =>
      !!l &&
      typeof l === "object" &&
      typeof (l as OrderRewardLine).label === "string" &&
      (l as OrderRewardLine).layer in LAYER_META
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * 2000) + 3000; // 3000–5000ms
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

export default function SubmitOrderPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const { name: restaurantName } = useRestaurantInfo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState("");
  // true uniquement si la lecture elle-même a échoué (pas une erreur réseau/timeout)
  const [parseFailedReading, setParseFailedReading] = useState(false);
  const [amountError, setAmountError] = useState("");

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
  // Récap « ce que ce ticket t'a rapporté » (audit UX 2026-08, C3) — vide si
  // l'API ne renvoie pas le détail : le récap est purement additif.
  const [rewardLines, setRewardLines] = useState<OrderRewardLine[]>([]);

  function acceptFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setReceiptFile(null);
      setPreview(null);
      setParseStatus("error");
      setParseFailedReading(false);
      setParseError("Ta photo est trop lourde (max 5 Mo). Réessaie avec une photo plus légère.");
      return;
    }
    setReceiptFile(file);
    setPreview(URL.createObjectURL(file));
    setParseError("");
    setParseFailedReading(false);
    setOrderNumber("");
    setOrderNumberEditable(false);
    setAmount("");
    setAmountError("");
    // La lecture démarre dès le choix de la photo — un tap de moins (audit UX 2026-08)
    void analyseReceipt(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    acceptFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    acceptFile(file);
  }

  async function analyseReceipt(file: File) {
    setParseStatus("parsing");
    setParseError("");
    setParseFailedReading(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const formData = new FormData();
      formData.append("receipt", file);
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
        setParseFailedReading(true);
        setParseError(data.error ?? "La lecture du ticket n'a pas fonctionné.");
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
      setParseFailedReading(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setParseError("La lecture a pris trop de temps. Réessaie avec une photo plus légère.");
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

    // Validation maison du montant (messages en français, virgule acceptée)
    const normalizedAmount = amount.replace(",", ".").trim();
    const amountValue = Number(normalizedAmount);
    if (!normalizedAmount || Number.isNaN(amountValue)) {
      setAmountError("Entre le montant du ticket, par exemple 12,50");
      return;
    }
    if (amountValue < 1 || amountValue > 500) {
      setAmountError("Le montant doit être entre 1 € et 500 €.");
      return;
    }
    setAmountError("");

    setSubmitStatus("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("receipt", receiptFile);
    formData.append("order_number", orderNumber);
    formData.append("amount", normalizedAmount);
    formData.append("restaurantId", restaurantId);
    if (ocrAmount !== null)      formData.append("ocr_amount", String(ocrAmount));
    if (ocrConfidence !== null)  formData.append("ocr_confidence", String(ocrConfidence));
    if (noRestaurantHeader)      formData.append("no_restaurant_header", "true");

    // Délai artificiel 3–5s + fetch en parallèle (ADR 0008)
    try {
      const [res] = await Promise.all([
        fetch("/api/orders", { method: "POST", body: formData }),
        sleep(randomDelay()),
      ]);

      const data = await res
        .json()
        .catch(() => ({}) as { status?: string; error?: string; reward_lines?: unknown });

      if (res.status === 201) {
        setRewardLines(data.status === "validated" ? parseRewardLines(data.reward_lines) : []);
        setSubmitStatus(data.status === "validated" ? "success_validated" : "success_pending");
        return;
      }
      if (res.status === 409) {
        setSubmitStatus("duplicate");
        return;
      }
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
    setParseFailedReading(false);
    setOrderNumber("");
    setOrderNumberEditable(false);
    setAmount("");
    setAmountError("");
    setNoDelivery(false);
    setSubmitStatus("idle");
    setErrorMsg("");
    setRewardLines([]);
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
        {/* Récap des 3 couches (ADR 0006/0010) — même présentation que la
            hero card du dashboard. Absent si l'API n'a pas renvoyé le détail. */}
        {rewardLines.length > 0 && (
          <div className="max-w-xs mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 text-left">
            <p className="text-sm font-bold text-gray-900 mb-3">
              Voici ce que ce ticket t&apos;a rapporté :
            </p>
            <div className="space-y-2">
              {rewardLines.map((line) => (
                <div key={line.layer} className="flex items-center gap-2">
                  <span aria-hidden="true">{LAYER_META[line.layer].emoji}</span>
                  <span className="font-bold text-gray-900">
                    {LAYER_META[line.layer].prefix}
                    {line.label}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">{LAYER_META[line.layer].label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
          <button
            onClick={reset}
            className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center"
          >
            Scanner un autre ticket
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
          <button
            onClick={reset}
            className="text-sm text-gray-600 hover:text-gray-800 underline min-h-[44px] inline-flex items-center"
          >
            Scanner un autre ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scanner mon ticket</h1>
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

      {/* Zone upload — <label> reliée à l'input pour l'accès clavier */}
      <label
        htmlFor="receipt-photo"
        className="block border-2 border-dashed border-gray-300 rounded-xl p-6 mb-4 text-center cursor-pointer hover:border-brand-red focus-within:ring-2 focus-within:ring-brand-red transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {preview ? (
          <span className="block relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Ticket de caisse"
              className="max-h-56 mx-auto rounded-lg object-contain"
            />
            <span className="block text-sm text-gray-600 mt-2">Appuie pour changer la photo</span>
          </span>
        ) : (
          <span className="block py-4">
            <span className="block text-4xl mb-3">🧾</span>
            <span className="block font-semibold text-gray-700">Photo du ticket de caisse</span>
            <span className="block text-sm text-gray-600 mt-1">
              Appuie ici pour prendre ou choisir une photo
            </span>
          </span>
        )}
        <input
          id="receipt-photo"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {/* Lecture en cours — lancée dès le choix de la photo */}
      {parseStatus === "parsing" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-xl animate-spin">⏳</span>
          <p className="text-blue-800 text-sm font-semibold">Lecture du ticket…</p>
        </div>
      )}

      {parseStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-red-700 text-sm">{parseError}</p>
          {parseFailedReading && (
            <p className="text-red-600 text-sm mt-1">
              Assure-toi que le numéro de commande est bien visible sur la photo.
            </p>
          )}
          {receiptFile && (
            <button
              type="button"
              onClick={() => analyseReceipt(receiptFile)}
              className="mt-3 w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Réessayer la lecture
            </button>
          )}
        </div>
      )}

      {/* Formulaire — visible après analyse réussie */}
      {parseStatus === "done" && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2 items-start">
            <span className="text-green-600">✓</span>
            <p className="text-green-800 text-sm">
              C&apos;est lu ! Vérifie les infos ci-dessous.
            </p>
          </div>

          {/* Clé de commande — read-only if found, editable if not */}
          {orderNumberEditable && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-orange-800 text-sm font-semibold">{keyLabel} non détecté</p>
              <p className="text-sm text-gray-600 mt-1">
                Entre le numéro manuellement si tu le vois sur ton ticket,
                ou laisse vide — ta commande sera vérifiée manuellement sous 2h.
              </p>
            </div>
          )}
          <div>
            <label
              htmlFor={orderNumberEditable ? "order-number" : undefined}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {keyLabel}
            </label>
            {orderNumberEditable ? (
              <input
                id="order-number"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={keyExample ?? ""}
                autoCapitalize="characters"
                autoComplete="off"
                className="w-full px-4 py-3 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900 font-mono text-sm"
              />
            ) : (
              <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 flex items-center justify-between font-mono text-sm">
                <span>{orderNumber}</span>
                <span className="text-xs text-gray-400 font-sans">Lu sur le ticket</span>
              </div>
            )}
          </div>

          {/* Montant — editable, validation JS maison (virgule acceptée) */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Montant total (€)
            </label>
            <div className="relative">
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountError("");
                }}
                placeholder="Ex : 12,50"
                aria-invalid={amountError ? true : undefined}
                aria-describedby={amountError ? "amount-error" : undefined}
                className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 text-gray-900 ${
                  amountError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-brand-red"
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                €
              </span>
            </div>
            {amountError ? (
              <p id="amount-error" className="text-sm text-red-600 mt-1">
                {amountError}
              </p>
            ) : (
              <p className="text-sm text-gray-600 mt-1">Corrige si le montant lu est incorrect</p>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 border-gray-200 hover:border-brand-red transition-colors">
            <input
              type="checkbox"
              checked={noDelivery}
              onChange={(e) => setNoDelivery(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-brand-red shrink-0"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">Je confirme :</span> j&apos;ai commandé directement
              au restaurant {restaurantName} (sur place, téléphone ou WhatsApp).{" "}
              <span className="font-semibold text-brand-red">Pas via une app de livraison.</span>
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
              <p className="font-semibold text-orange-900 text-sm">Ticket déjà utilisé</p>
              <p className="text-orange-800 text-sm mt-1">
                Ce ticket a déjà été utilisé. Un ticket = un cadeau.
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Vérifie dans Mes cadeaux, ou parles-en au comptoir si c&apos;est une erreur.
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
            {submitStatus === "loading" ? "Vérification en cours..." : "Envoyer mon ticket"}
          </button>

          {!noDelivery && (
            <p className="text-center text-sm text-gray-600">
              Coche la case de confirmation pour envoyer ton ticket
            </p>
          )}
        </form>
      )}
    </div>
  );
}
