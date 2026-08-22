"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { amountBand, track } from "@/lib/analytics";
import { prepareReceiptImage } from "@/lib/receipt-image-client";
import { describeUploadFailure, readJsonSafe } from "@/lib/receipt-upload-errors";

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
  // Deux entrées : l'appareil photo (capture) et la galerie — sur mobile, une
  // seule <input> sans `capture` n'ouvre pas l'appareil directement.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState("");
  // L'année de la clé a été réparée côté serveur (lecture OCR fausse) :
  // on l'affiche et on invite à vérifier.
  const [keyCorrected, setKeyCorrected] = useState(false);

  const [orderNumber, setOrderNumber] = useState("");
  const [orderNumberEditable, setOrderNumberEditable] = useState(false);
  // Libellé + exemple de la clé de commande propres à l'établissement (ADR 0019)
  const [keyLabel, setKeyLabel] = useState("Numéro de commande");
  const [keyExample, setKeyExample] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ocrAmount, setOcrAmount] = useState<number | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [noRestaurantHeader, setNoRestaurantHeader] = useState(false);
  // ADR 0036 — jeton du scan rendu par l'aperçu OCR : renvoyé tel quel à la
  // soumission pour que le serveur réutilise la photo déjà stockée.
  const [scanId, setScanId] = useState<string | null>(null);
  const [noDelivery, setNoDelivery] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  // ADR 0034 — renvoyé par /api/orders : sans équipe, pas de score communautaire
  // à annoncer, et on propose d'en rejoindre une depuis l'écran de succès.
  const [hasTeam, setHasTeam] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Entrée du tunnel de scan : c'est le dénominateur qui donne son sens au
  // taux d'abandon entre l'ouverture du formulaire et le ticket soumis.
  useEffect(() => {
    track("order_submit_started", { restaurant_id: restaurantId });
  }, [restaurantId]);

  // Une photo arrive (appareil, galerie ou glisser-déposer) : on l'allège
  // côté navigateur (HEIC → JPEG, ≤ 1 600 px, ≈ 300 Ko) PUIS on lance
  // l'analyse tout de suite — plus de second tap « Analyser ».
  // Incident 2026-08 : les photos > 4,5 Mo partaient telles quelles → 413
  // Vercel → « erreur réseau » → 6 essais.
  async function acceptFile(file: File | undefined | null) {
    if (!file) return;
    setParseStatus("idle");
    setParseError("");
    setOrderNumber("");
    setOrderNumberEditable(false);
    setKeyCorrected(false);
    setAmount("");
    setScanId(null);
    setPreparing(true);
    try {
      const prepared = await prepareReceiptImage(file);
      if (!prepared.ok) {
        setReceiptFile(null);
        setPreview(null);
        setParseStatus("error");
        setParseError(prepared.error);
        return;
      }
      setReceiptFile(prepared.file);
      setPreview(URL.createObjectURL(prepared.file));
      await analyseReceipt(prepared.file);
    } finally {
      setPreparing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    void acceptFile(e.target.files?.[0]);
    // Permet de reprendre exactement la même photo après une erreur.
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void acceptFile(e.dataTransfer.files[0]);
  }

  async function analyseReceipt(fileArg?: File) {
    const file = fileArg ?? receiptFile;
    if (!file) return;
    setParseStatus("parsing");
    setParseError("");

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

      // Jamais `res.json()` à l'aveugle : un 413/502 de la plateforme est du
      // texte, et tombait dans le catch « erreur réseau » (faux, re-essais).
      const { ok, status, data: parsedData } = await readJsonSafe<{
        order_number?: string | null;
        amount?: number | null;
        confidence?: number | null;
        has_restaurant_header?: boolean;
        key_label?: string | null;
        key_example?: string | null;
        key_corrected?: boolean;
        scan_id?: string | null;
        error?: string;
      }>(res);
      const data = parsedData ?? {};

      if (!ok) {
        setParseStatus("error");
        setParseError(describeUploadFailure(status, data.error));
        return;
      }

      setParseStatus("done");
      setScanId(data.scan_id ?? null);
      setKeyCorrected(data.key_corrected === true);
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
    if (scanId !== null)         formData.append("scan_id", scanId);

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

      const { data: submitData } = await readJsonSafe<{ status?: string; error?: string; has_team?: boolean }>(res);
      const data = submitData ?? {};

      if (res.status === 201) {
        const validated = data.status === "validated";
        setHasTeam(data.has_team !== false);
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
      setErrorMsg(describeUploadFailure(res.status, data.error));
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
    setScanId(null);
    setKeyCorrected(false);
    setNoDelivery(false);
    setSubmitStatus("idle");
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
          {hasTeam
            ? "Ta commande est validée. Ton score communautaire sera mis à jour sous peu."
            : "Ta commande est validée. Rejoins une équipe pour que tes prochains tickets fassent aussi grandir ses cadeaux."}
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
          {!hasTeam && (
            <Link
              href={`/r/${restaurantId}/my-team`}
              className="block bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Rejoindre une équipe
            </Link>
          )}
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
          {!hasTeam && (
            <Link
              href={`/r/${restaurantId}/my-team`}
              className="block bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Rejoindre une équipe
            </Link>
          )}
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

      {/* Zone photo — deux portes : appareil photo direct (capture) et
          galerie. La photo est allégée ici avant envoi, quel que soit son
          format/poids d'origine (HEIC iPhone, 8 Mo Android…). */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-5 mb-4 text-center hover:border-brand-red transition-colors"
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
            <div className="flex justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200"
              >
                📷 Reprendre
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200"
              >
                🖼️ Autre photo
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-4xl mb-2">🧾</p>
            <p className="font-semibold text-gray-700 mb-3">Photo du ticket de caisse</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={preparing}
                className="bg-brand-red text-white py-3 px-5 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors"
              >
                📷 Prendre le ticket en photo
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={preparing}
                className="bg-gray-100 text-gray-700 py-3 px-5 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-60 transition-colors"
              >
                🖼️ Choisir dans la galerie
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Cadre tout le ticket, bien à plat et bien éclairé — on s&apos;occupe du reste.
            </p>
          </div>
        )}
        {preparing && (
          <p className="text-xs text-gray-500 mt-3">Préparation de la photo…</p>
        )}
        {/* Appareil photo (mobile) — capture="environment" = caméra arrière */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Galerie / fichiers — tous formats d'image : on convertit côté client */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* L'analyse part automatiquement après la photo ; ce bouton ne sert
          qu'à relancer après une erreur (ou si l'auto-lancement a échoué). */}
      {preview && parseStatus !== "done" && (
        <button
          onClick={() => analyseReceipt()}
          disabled={parseStatus === "parsing" || preparing}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors mb-4"
        >
          {parseStatus === "parsing" ? "Analyse en cours..." : parseStatus === "error" ? "Réessayer l'analyse" : "Analyser le ticket"}
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

          {/* Clé de commande — lue par l'OCR mais TOUJOURS corrigeable : une
              lecture fausse (année…) ne doit jamais enfermer le membre dans
              une boucle d'erreurs (incident Kasia, 2026-08-22). */}
          {orderNumberEditable && !keyCorrected && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-orange-800 text-sm font-semibold">{keyLabel} non détecté</p>
              <p className="text-orange-700 text-xs mt-1">
                Entre le numéro manuellement si tu le vois sur ton ticket,
                ou laisse vide — ta commande sera vérifiée manuellement sous 2h.
              </p>
            </div>
          )}
          {keyCorrected && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-amber-900 text-sm font-semibold">Vérifie le {keyLabel.toLowerCase()}</p>
              <p className="text-amber-800 text-xs mt-1">
                L&apos;année lue sur le ticket semblait erronée et a été corrigée automatiquement.
                Compare avec ton ticket et corrige si besoin.
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
              <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 flex items-center justify-between gap-2 font-mono text-sm">
                <span className="truncate">{orderNumber}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 font-sans">Lu sur le ticket</span>
                  <button
                    type="button"
                    onClick={() => setOrderNumberEditable(true)}
                    className="text-xs font-sans font-semibold text-brand-red hover:underline"
                  >
                    Modifier
                  </button>
                </span>
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
