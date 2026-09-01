"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Scan } from "lucide-react";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { COIN_EMOJI, RECEIPT_EMOJI } from "@/lib/fluent-emoji";
import { pointsForOrder } from "@/lib/points-model";
import { amountBand, track } from "@/lib/analytics";
import { prepareReceiptImage } from "@/lib/receipt-image-client";
import { describeUploadFailure, readJsonSafe } from "@/lib/receipt-upload-errors";
import { savePendingTicket, loadPendingTicket, clearPendingTicket } from "@/lib/pending-ticket";
import { PostTicketSheet } from "@/components/member/PostTicketSheet";
import { rememberPendingTicket } from "@/app/r/[restaurantId]/submit-order/actions";
import { createClient } from "@/lib/supabase-browser";

type SubmitStatus = "idle" | "loading" | "success_validated" | "success_pending" | "error" | "duplicate";
type ParseStatus = "idle" | "parsing" | "done" | "error";

// Repris de la landing (ADR 0042) — même repère 1-2-3 tout au long du
// parcours visiteur, retour terrain 2026-08-30.
const STEPS = [
  { num: "1", desc: "Photo du ticket, ici même" },
  { num: "2", desc: "Compte en 10 secondes, une fois la photo prise" },
  { num: "3", desc: "Cadeau au comptoir à ta prochaine visite" },
];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * 2000) + 3000; // 3000–5000ms
}

// ADR 0040 (assoupli par ADR 0045) — l'écran vit en deux modes :
// - `visitor` : pas de compte. La photo est prise et préparée normalement,
//   gardée sur l'appareil (IndexedDB), ET analysée tout de suite (OCR ouvert
//   aux visiteurs, bridé par IP — ADR 0045) pour prouver que le scan a
//   marché avant de proposer la connexion (« garder ses points »).
// - `resume` : retour de connexion — la photo en attente est rechargée et
//   l'analyse enchaîne toute seule (nouvel appel, authentifié cette fois),
//   comme si de rien n'était.
export default function SubmitOrderClient({
  visitor,
  resume,
  logoUrl,
}: {
  visitor: boolean;
  resume: boolean;
  logoUrl: string | null;
}) {
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
  // Étape 06 — récap modifiable au tap : le montant s'affiche en ligne de
  // récap, l'input ne s'ouvre qu'à la demande (la clé a déjà ce pattern).
  const [amountEditable, setAmountEditable] = useState(false);
  // Étape 06 — pré-vérification avant envoi : cadeau visé par le montant +
  // doublon détecté à la saisie du numéro (au lieu d'un rejet après envoi).
  const [precheck, setPrecheck] = useState<{
    reward: string | null;
    next_tier: { item: string; pct: number } | null;
    duplicate: boolean;
  } | null>(null);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  // ADR 0034 — renvoyé par /api/orders : sans équipe, pas de score communautaire
  // à annoncer, et on propose d'en rejoindre une depuis l'écran de succès.
  const [hasTeam, setHasTeam] = useState(true);
  // Étape 07 (backlog onboarding) — cadeau réellement obtenu (couche 1 créée
  // côté serveur) et prochain palier : nom + proportion de barre uniquement,
  // jamais de seuil ni d'euro (ADR 0007/0028 §6).
  const [reward, setReward] = useState<string | null>(null);
  const [nextTier, setNextTier] = useState<{ item: string; pct: number } | null>(null);
  // Distinct de `reward` (créé par CE ticket) : un cadeau peut déjà être
  // disponible depuis une commande précédente (ADR 0011) — c'est cette
  // valeur qui décide si "Voir mes cadeaux" a un sens sur l'écran de succès.
  const [hasReward, setHasReward] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Entrée du tunnel de scan : c'est le dénominateur qui donne son sens au
  // taux d'abandon entre l'ouverture du formulaire et le ticket soumis.
  useEffect(() => {
    track("order_submit_started", { restaurant_id: restaurantId, visitor });
  }, [restaurantId, visitor]);

  // Étape 06 — pré-vérification débouncée : à chaque changement du montant ou
  // du numéro, le serveur dit quel cadeau ce ticket vise et si le numéro est
  // un doublon — AVANT l'envoi. Best-effort : un échec n'affiche rien de
  // spécial, le 409 de /api/orders reste le filet.
  useEffect(() => {
    if (visitor || parseStatus !== "done") return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/orders/precheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantId,
            amount: Number(amount) || null,
            order_number: orderNumber,
          }),
        });
        const { data } = await readJsonSafe<{
          reward?: string | null;
          next_tier?: { item: string; pct: number } | null;
          duplicate?: boolean;
        }>(res);
        if (res.ok && data) {
          setPrecheck({
            reward: data.reward ?? null,
            next_tier: data.next_tier ?? null,
            duplicate: data.duplicate === true,
          });
        }
      } catch {
        // silencieux — la soumission reste possible, le serveur tranche
      }
    }, 500);
    return () => clearTimeout(t);
  }, [visitor, parseStatus, amount, orderNumber, restaurantId]);

  // Retour de connexion : la photo prise en visiteur attend dans l'appareil.
  // Absente (autre navigateur, expiration, navigation privée) → écran normal,
  // le membre reprend simplement sa photo.
  useEffect(() => {
    if (visitor || !resume) return;
    let cancelled = false;
    (async () => {
      const file = await loadPendingTicket(restaurantId);
      if (!file || cancelled) return;
      await clearPendingTicket(restaurantId);
      track("visitor_ticket_resumed", { restaurant_id: restaurantId });
      await acceptFile(file);
    })();
    return () => {
      cancelled = true;
    };
    // acceptFile est stable au sein du montage — dépendances volontairement réduites
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor, resume, restaurantId]);

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
    setAmountEditable(false);
    setPrecheck(null);
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
      if (visitor) {
        // La photo reste sur l'appareil en attendant le compte (ADR 0040) ;
        // l'aperçu OCR tourne quand même — non authentifié, bridé par IP
        // (ADR 0045) — pour prouver que le scan a marché avant de demander
        // le compte.
        await savePendingTicket(restaurantId, prepared.file);
        track("visitor_ticket_captured", { restaurant_id: restaurantId });
      }
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

  // Départ vers la connexion, photo en poche : cookies de reprise puis OAuth
  // (navigation complète) ou pages signup/login classiques.
  async function continueWith(dest: "google" | "signup" | "login") {
    setAuthLoading(true);
    track("visitor_signup_started", { restaurant_id: restaurantId, method: dest });
    try {
      await rememberPendingTicket(restaurantId);
      if (dest === "google") {
        const supabase = createClient();
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        return; // la redirection OAuth prend la main
      }
      window.location.href = dest === "signup" ? "/signup" : "/login";
    } catch {
      setAuthLoading(false);
    }
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
        setAmountEditable(false);
      } else {
        // Montant non lu → l'input est directement ouvert, rien à taper de plus.
        setAmountEditable(true);
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
    if (!receiptFile) return;

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

      const { data: submitData } = await readJsonSafe<{
        status?: string;
        error?: string;
        has_team?: boolean;
        reward?: string | null;
        next_tier?: { item: string; pct: number } | null;
        has_reward?: boolean;
      }>(res);
      const data = submitData ?? {};

      if (res.status === 201) {
        const validated = data.status === "validated";
        setHasTeam(data.has_team !== false);
        setReward(data.reward ?? null);
        setNextTier(data.next_tier ?? null);
        setHasReward(data.has_reward === true);
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
    setAmountEditable(false);
    setPrecheck(null);
    setSubmitStatus("idle");
    setReward(null);
    setNextTier(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // ADR 0030 §6 — après un scan réussi, la suite naturelle est « qu'est-ce
  // que ça m'a rapporté ? » (libellés neutres : la validation est différée,
  // ADR 0008 — ne jamais promettre un cadeau déjà là).
  if (submitStatus === "success_validated") {
    // ADR 0028 — points gagnés sur CE ticket, même formule courbée
    // (pointsForOrder) que le score d'équipe et les compteurs header/dashboard :
    // pas d'euro affiché, "amount" ne ressort qu'ici, transformé en points.
    const earnedPoints = pointsForOrder(Number(amount));
    const pointsLabel = `point${earnedPoints > 1 ? "s" : ""} gagné${earnedPoints > 1 ? "s" : ""}`;
    return (
      <div>
        {/* Étape 08 — app + notifications en UNE feuille, posée ICI : après
            le premier ticket validé de l'appareil, un cadeau vient d'être
            gagné. La feuille décide elle-même si elle a quelque chose à
            proposer (une seule apparition par appareil). */}
        <PostTicketSheet restaurantId={restaurantId} />
        {/* Dégradé vert centré, identité Boosteats fixe — PAS brand_accent :
            pour Kraainem cette variable résout en rouge (cf. le badge
            "Pro" ou la bordure de la zone photo), lu comme un signal de
            danger sur un écran de célébration. Ce moment reste identique
            quel que soit l'établissement. */}
        <div
          className="text-white text-center rounded-b-3xl px-4 pt-10 pb-8 -mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-3xl"
          style={{ background: "radial-gradient(circle at 50% 30%, #9DBA6C 0%, #5E7238 55%, #263012 100%)" }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2">Ticket validé</p>
          {/* Étape 07 — le titre nomme le cadeau RÉELLEMENT créé (couche 1) ;
              sans cadeau créé (rien d'atteint, ou cadeau déjà actif ADR 0011),
              on retombe sur le titre neutre. */}
          <h2 className="text-2xl font-black mb-5">
            {reward ? `🎁 ${reward} débloqué !` : "Beau scan !"}
          </h2>
          <div className="flex items-center justify-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COIN_EMOJI} alt="" className="w-10 h-10" />
            <span className="text-5xl font-black tabular-nums">+{earnedPoints}</span>
          </div>
          <p className="text-sm font-bold uppercase tracking-wide mt-1">{pointsLabel}</p>

          {/* Barre vers le palier suivant — proportion visuelle + nom du
              cadeau, aucun chiffre lisible (ADR 0028 §6, comme le hero).
              Pas de carte blanche : le montant/l'heure du ticket répétaient
              une info déjà donnée par le gros nombre au-dessus. */}
          {nextTier && (
            <div className="bg-white/15 text-left rounded-2xl p-4 max-w-xs mx-auto mt-5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-white/80">Prochain cadeau</span>
                <span className="font-bold">🎁 {nextTier.item}</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${Math.max(nextTier.pct, 4)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {hasTeam && (
          <p className="text-gray-600 text-sm text-center mt-5 mb-1">
            Ton score communautaire sera mis à jour sous peu.
          </p>
        )}

        {/* Étape 07bis — un seul CTA principal à la fois, selon ce qui a
            vraiment un sens : le cadeau s'il existe (créé maintenant ou déjà
            disponible, ADR 0011), sinon rejoindre une équipe si ce n'est pas
            déjà fait, sinon juste enchaîner un scan. Le reste vit dans la
            BottomNav. */}
        <div className={`max-w-xs mx-auto space-y-3 ${hasTeam ? "" : "mt-5"}`}>
          {hasReward ? (
            <Link
              href={`/r/${restaurantId}/my-rewards`}
              className="block text-center bg-brand-red text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
            >
              {reward ? `Voir mon ${reward} →` : "Voir mes cadeaux →"}
            </Link>
          ) : !hasTeam ? (
            <div>
              <Link
                href={`/r/${restaurantId}/my-team`}
                className="block text-center bg-brand-red text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
              >
                Rejoindre une équipe
              </Link>
              <p className="text-center text-xs text-gray-500 mt-2">Pour gagner encore plus de cadeaux</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            <Scan className="w-4 h-4" aria-hidden="true" /> Scanner un autre ticket
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
        {/* Étape 07 — deux sorties ici aussi, cohérentes avec l'écran validé. */}
        <div className="max-w-xs mx-auto space-y-3">
          <Link
            href={`/r/${restaurantId}/dashboard`}
            className="block bg-brand-red text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            <Scan className="w-4 h-4" aria-hidden="true" /> Scanner un autre ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="block mx-auto h-14 w-auto object-contain mb-6" />
        ) : null}
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Scanne ton ticket</h1>
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
              // ADR 0045 — côté visiteur, la photo cède la place à la preuve
              // du scan (montant OCR) et aux boutons de connexion : vignette
              // plutôt qu'aperçu pleine taille.
              className={
                visitor
                  ? "h-20 w-20 mx-auto rounded-lg object-cover"
                  : "max-h-56 mx-auto rounded-lg object-contain"
              }
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={RECEIPT_EMOJI} alt="" aria-hidden="true" className="w-16 h-16 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 mb-4">Photo du ticket de caisse</p>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={preparing}
              className="flex items-center justify-center gap-2 w-full sm:w-auto sm:mx-auto bg-brand-red text-white py-5 px-8 rounded-full font-bold text-xl hover:bg-brand-red/85 disabled:opacity-60 transition-colors shadow-lg"
            >
              Prendre le ticket en photo <Scan className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={preparing}
              className="block mx-auto mt-4 text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-60"
            >
              Choisir dans la galerie
            </button>
            <p className="text-xs text-gray-400 mt-4">
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

      <div className="mb-6 space-y-2">
        {STEPS.map((step) => (
          <p key={step.num} className="text-sm text-gray-500">
            <span className="font-bold text-gray-900">{step.num}</span> · {step.desc}
          </p>
        ))}
      </div>

      {/* ADR 0040 — la photo est prise : c'est LE moment où le compte devient
          utile, et le message dit pourquoi (garder ses points).
          ADR 0045 — l'aperçu OCR tourne déjà (non authentifié, ci-dessus) :
          dès qu'un montant est lu, on l'affiche comme preuve que le scan a
          marché, avant même de demander le compte. */}
      {visitor && preview && !preparing && (
        <div className="bg-white border-2 border-brand-red/40 rounded-2xl p-5 text-center mb-4">
          {parseStatus === "done" && ocrAmount !== null ? (
            <>
              <p className="text-3xl mb-1">✅</p>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
                Scan réussi
              </p>
              <p className="text-3xl font-black text-gray-900 mb-1">{ocrAmount.toFixed(2)} €</p>
              <p className="text-gray-500 text-xs mb-4">Montant détecté sur ton ticket</p>
            </>
          ) : (
            <>
              <p className="text-3xl mb-2">📸</p>
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                {parseStatus === "parsing" ? "Lecture de ton ticket…" : "Ton ticket est prêt !"}
              </h2>
            </>
          )}
          <p className="text-gray-600 text-sm mb-4">
            Connecte-toi en quelques secondes pour l&apos;envoyer et{" "}
            <span className="font-semibold">garder tes points</span>. La photo reste sur ton
            téléphone en attendant.
          </p>
          <div className="space-y-2 max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => continueWith("google")}
              disabled={authLoading}
              className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors"
            >
              Continuer avec Google
            </button>
            <button
              type="button"
              onClick={() => continueWith("signup")}
              disabled={authLoading}
              className="w-full bg-white border-2 border-gray-300 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              Continuer avec un e-mail
            </button>
            <button
              type="button"
              onClick={() => continueWith("login")}
              disabled={authLoading}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              J&apos;ai déjà un compte
            </button>
          </div>
        </div>
      )}

      {/* L'analyse part automatiquement après la photo ; ce bouton ne sert
          qu'à relancer après une erreur (ou si l'auto-lancement a échoué). */}
      {!visitor && preview && parseStatus !== "done" && (
        <button
          onClick={() => analyseReceipt()}
          disabled={parseStatus === "parsing" || preparing}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors mb-4"
        >
          {parseStatus === "parsing" ? "Analyse en cours..." : parseStatus === "error" ? "Réessayer l'analyse" : "Analyser le ticket"}
        </button>
      )}

      {/* Un visiteur n'a pas encore de compte : ce message parle du numéro de
          commande d'un formulaire qu'il ne voit pas encore (ADR 0045) — la
          preuve de scan côté visiteur reste best-effort, silencieuse en cas
          d'échec, jamais bloquante. */}
      {parseStatus === "error" && !visitor && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-red-700 text-sm">{parseError}</p>
          <p className="text-red-500 text-xs mt-1">
            Assure-toi que le numéro de commande est bien visible sur la photo.
          </p>
        </div>
      )}

      {/* Formulaire — visible après analyse réussie, réservé aux membres
          connectés (un visiteur ne peut pas soumettre, /api/orders exige une
          session — ADR 0045). */}
      {parseStatus === "done" && !visitor && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Clé de commande — lue par l'OCR mais TOUJOURS corrigeable : une
              lecture fausse (année…) ne doit jamais enfermer le membre dans
              une boucle d'erreurs (incident Kasia, 2026-08-22). */}
          {orderNumberEditable && !keyCorrected && orderNumber === "" && (
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

          {/* Étape 06 — récap en 2 lignes, modifiables AU TAP : plus de
              formulaire à relire, on tape la ligne qu'on veut corriger. */}
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            <div className="p-4">
              {amountEditable ? (
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Montant total (€)</span>
                  <div className="relative mt-1">
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
                      autoFocus
                      className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
                  </div>
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setAmountEditable(true)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm text-gray-500">Montant</span>
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-black text-gray-900 tabular-nums">
                      {Number(amount) > 0 ? `${Number(amount).toFixed(2)} €` : "—"}
                    </span>
                    <span className="text-xs font-semibold text-brand-red">Modifier</span>
                  </span>
                </button>
              )}
            </div>
            <div className="p-4">
              {orderNumberEditable ? (
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">{keyLabel}</span>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder={keyExample ?? ""}
                    className="mt-1 w-full px-4 py-3 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900 font-mono text-sm"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setOrderNumberEditable(true)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm text-gray-500 shrink-0">{keyLabel}</span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm text-gray-900 truncate">{orderNumber || "—"}</span>
                    <span className="text-xs font-semibold text-brand-red shrink-0">Modifier</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Étape 06 — le doublon se voit À LA SAISIE, pas en rejet après
              l'envoi ; sinon, le cadeau visé est mis en évidence (libellé
              prudent : la validation est différée, ADR 0008 — jamais de
              cadeau promis comme acquis). */}
          {precheck?.duplicate ? (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="font-semibold text-orange-900 text-sm">Ce numéro de ticket a déjà été utilisé</p>
              <p className="text-orange-700 text-xs mt-1">
                Vérifie le {keyLabel.toLowerCase()} ci-dessus — ou reprends la photo si ce n&apos;est pas le bon ticket.
              </p>
            </div>
          ) : precheck?.reward ? (
            <div className="bg-brand-gold/15 border border-brand-gold/50 rounded-xl p-4 flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">🎁</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Cadeau visé</p>
                <p className="font-black text-gray-900">{precheck.reward}</p>
                <p className="text-xs text-gray-500">À récupérer au comptoir après validation.</p>
              </div>
            </div>
          ) : precheck?.next_tier ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-600">🎁 Prochain cadeau</span>
                <span className="font-bold text-gray-900">{precheck.next_tier.item}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-red rounded-full transition-all"
                  style={{ width: `${Math.max(precheck.next_tier.pct, 4)}%` }}
                />
              </div>
            </div>
          ) : null}

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
            disabled={submitStatus === "loading" || precheck?.duplicate === true}
            className="w-full bg-brand-red text-white py-4 px-4 rounded-xl font-semibold text-lg hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitStatus === "loading" ? "Vérification en cours..." : "Envoyer mon ticket"}
          </button>

          {/* Étape 06 — la confirmation « pas via une plateforme » n'est plus
              une case bloquante mais une mention à l'envoi (la règle est déjà
              affichée avant, étape 03). */}
          <p className="text-center text-xs text-gray-400">
            En envoyant, tu confirmes une commande passée directement au restaurant{" "}
            {restaurantName} — pas via une plateforme de livraison.
          </p>
        </form>
      )}
    </div>
  );
}
