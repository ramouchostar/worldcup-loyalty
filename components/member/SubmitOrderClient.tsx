"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Images } from "lucide-react";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { CAMERA_EMOJI, COIN_EMOJI } from "@/lib/fluent-emoji";
import { foodIconUrl } from "@/lib/food-icon";
import { isProgramQrPayload, POSTER_MEMBER_MESSAGE } from "@/lib/poster-detect";
import { pointsForOrder } from "@/lib/points-model";
import { amountBand, track } from "@/lib/analytics";
import { beaconFunnelStep } from "@/lib/funnel-beacon";
import { prepareReceiptImage } from "@/lib/receipt-image-client";
import { describeUploadFailure, readJsonSafe } from "@/lib/receipt-upload-errors";
import { savePendingTicket, loadPendingTicket, clearPendingTicket } from "@/lib/pending-ticket";
import { canAutoSend, missingReceiptParts, type MissingParts } from "@/lib/ticket-auto-send";
import { OPEN_RECEIPT_CAMERA_EVENT } from "@/lib/open-camera-event";
import ReceiptCamera, { inAppCameraAvailable, type CameraFailure } from "@/components/member/ReceiptCamera";
import {
  clearNativeCameraMark,
  consumeAppClosedDuringCamera,
  markNativeCameraOpened,
} from "@/lib/native-camera-guard";
import { memoriserCadeauAReclamer } from "@/lib/claim-reward";
import { PostTicketSheet } from "@/components/member/PostTicketSheet";
import TicketGainCard from "@/components/member/TicketGainCard";
import { TeamRecognitionPrompt, type PromptSuggestion } from "@/components/member/TeamRecognitionPrompt";
import { rememberPendingTicket } from "@/app/r/[restaurantId]/submit-order/actions";
import { createClient } from "@/lib/supabase-browser";

type SubmitStatus = "idle" | "loading" | "success_validated" | "success_pending" | "error" | "duplicate";
type ParseStatus = "idle" | "parsing" | "done" | "error";

// Réponse de l'aperçu OCR (/api/orders/parse-receipt) — noms d'articles et
// proportion de barre uniquement côté cadeau (ADR 0007/0028).
type ParsedReceipt = {
  order_number?: string | null;
  amount?: number | null;
  confidence?: number | null;
  has_restaurant_header?: boolean;
  key_label?: string | null;
  key_example?: string | null;
  key_corrected?: boolean;
  has_reliable_key?: boolean;
  scan_id?: string | null;
  reward?: string | null;
  next_tier?: { item: string; pct: number } | null;
};

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
  receiptKeyLabel = null,
  guidePhotoUrl = null,
  teamPrompt = null,
}: {
  visitor: boolean;
  resume: boolean;
  logoUrl: string | null;
  // Libellé de la clé du ticket de CET établissement (« Bestelnummer »…),
  // fourni par la page serveur pour le guide de cadrage — avant même le
  // premier scan (le state keyLabel n'était rempli qu'après l'aperçu OCR).
  receiptKeyLabel?: string | null;
  // Photo RÉELLE de la zone à cadrer (echantillons/, URL signée) — remplace
  // le spécimen dessiné quand elle existe pour ce resto.
  guidePhotoUrl?: string | null;
  // Étape 10 — question d'équipe due (ADR 0031), posée sur l'écran de succès
  // du ticket validé. Null si : visiteur, déjà une équipe, relance pas échue,
  // équipes masquées.
  teamPrompt?: { suggestions: PromptSuggestion[] } | null;
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
  const [keyLabel, setKeyLabel] = useState(receiptKeyLabel ?? "Numéro de commande");
  const [keyExample, setKeyExample] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ocrAmount, setOcrAmount] = useState<number | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [noRestaurantHeader, setNoRestaurantHeader] = useState(false);
  // ADR 0048 — ce que le ticket VAUT, rendu par l'aperçu OCR avant toute
  // demande de compte : le cadeau de couche 1 atteint par ce montant, ou la
  // distance jusqu'au premier palier. Noms d'articles et proportion de barre
  // uniquement — jamais un seuil, jamais un euro (ADR 0007/0028).
  const [gainReward, setGainReward] = useState<string | null>(null);
  const [gainNextTier, setGainNextTier] = useState<{ item: string; pct: number } | null>(null);
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
  // ADR 0055 — lecture propre : le ticket part sans passer par le récap. Vrai
  // du verdict « lecture propre » jusqu'à la réponse de /api/orders ; le récap
  // ne réapparaît que si l'envoi échoue ou tombe sur un doublon.
  const [autoSending, setAutoSending] = useState(false);
  // ADR 0056 — vue caméra intégrée ouverte ; et filet : la page a été tuée
  // pendant que l'appareil photo du téléphone était ouvert.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLost, setCameraLost] = useState(false);
  // ADR 0057 — photo lue mais incomplète (total ou clé illisible) : on
  // demande de recadrer au lieu d'ouvrir le récap. Après 2 photos ratées sur
  // le même ticket, la saisie à la main est proposée — un ticket froissé ou
  // effacé ne bloque jamais (il part alors en vérification manuelle).
  const [framingIssue, setFramingIssue] = useState<MissingParts | null>(null);
  const [framingFailures, setFramingFailures] = useState(0);
  const [manualEntry, setManualEntry] = useState(false);
  const router = useRouter();
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
  // Étape 10 — la question d'équipe ne se pose qu'une fois par écran de succès.
  const [teamAskDone, setTeamAskDone] = useState(false);
  // ADR 0049 — la feuille app + notifications passe AVANT la question
  // d'équipe (séquence gain → compte → app → notifs → équipes). Ce drapeau
  // est levé dès qu'elle a fini son tour — refermée, ou jamais ouverte faute
  // de quelque chose à demander.
  const [sheetDone, setSheetDone] = useState(false);

  // Entrée du tunnel de scan : c'est le dénominateur qui donne son sens au
  // taux d'abandon entre l'ouverture du formulaire et le ticket soumis.
  useEffect(() => {
    track("order_submit_started", { restaurant_id: restaurantId, visitor });
  }, [restaurantId, visitor]);

  // À l'arrivée. ADR 0056 — une marque « appareil photo ouvert » survit au
  // redémarrage : la page n'a jamais repris vie, la photo est perdue, on le
  // dit. ADR 0057 — sinon l'écran s'ouvre directement sur la caméra : tous
  // les boutons ticket y mènent, l'étape « grand bouton photo » disparaît.
  // Pas sur une reprise (`?resume=1`) : une photo attend déjà.
  useEffect(() => {
    if (consumeAppClosedDuringCamera()) {
      setCameraLost(true);
      track("receipt_camera_fallback", { restaurant_id: restaurantId, reason: "app_closed" });
      return;
    }
    if (!resume && inAppCameraAvailable()) setCameraOpen(true);
    // montage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bouton photo de la barre du bas tapé alors qu'on est déjà ici.
  useEffect(() => {
    const open = () => {
      reset();
      openCamera();
    };
    window.addEventListener(OPEN_RECEIPT_CAMERA_EVENT, open);
    return () => window.removeEventListener(OPEN_RECEIPT_CAMERA_EVENT, open);
    // reset/openCamera n'utilisent que des setters et des refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Étape 06 — pré-vérification débouncée : à chaque changement du montant ou
  // du numéro, le serveur dit quel cadeau ce ticket vise et si le numéro est
  // un doublon — AVANT l'envoi. Best-effort : un échec n'affiche rien de
  // spécial, le 409 de /api/orders reste le filet.
  useEffect(() => {
    // Pendant l'envoi automatique (ADR 0055), le doublon est déjà vérifié par
    // sendIfClean — inutile de doubler l'appel. Photo à recadrer (ADR 0057) :
    // pas de récap à l'écran, rien à pré-vérifier.
    if (visitor || parseStatus !== "done" || autoSending) return;
    if (framingIssue && !manualEntry) return;
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
  }, [visitor, parseStatus, autoSending, framingIssue, manualEntry, amount, orderNumber, restaurantId]);

  // Retour de connexion OU tap sur le bandeau « ton ticket t'attend » de la
  // vitrine (`?resume=1`) : la photo attend dans l'appareil, on la recharge et
  // l'analyse enchaîne. Ouvert aussi aux visiteurs (audit parcours 2026-09-04)
  // — un visiteur revenu par la vitrine reprend sa photo sans compte, l'aperçu
  // OCR anonyme (ADR 0045) tourne comme à la capture. Absente (autre
  // navigateur, expiration, navigation privée) → écran normal.
  useEffect(() => {
    if (!resume) return;
    let cancelled = false;
    (async () => {
      const file = await loadPendingTicket(restaurantId);
      if (!file || cancelled) return;
      // La photo SURVIT à ce rechargement, visiteur comme membre (ADR 0055) :
      // acceptFile la re-sauve, et seule la réponse de /api/orders l'efface.
      // L'effacer ici perdait le ticket d'un membre qui quittait avant l'envoi.
      track("visitor_ticket_resumed", { restaurant_id: restaurantId });
      await acceptFile(file);
    })();
    return () => {
      cancelled = true;
    };
    // acceptFile est stable au sein du montage — dépendances volontairement réduites
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor, resume, restaurantId]);

  // Reprise SANS ?resume=1 (audit parcours 2026-09-04, friction M1) : rouvrir
  // l'écran de scan ne reproposait jamais la photo qui dort en IndexedDB.
  // Bandeau passif plutôt que chargement d'office : la personne vient
  // peut-être scanner un NOUVEAU ticket — c'est elle qui tape.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  useEffect(() => {
    if (resume) return;
    let cancelled = false;
    (async () => {
      const file = await loadPendingTicket(restaurantId);
      if (file && !cancelled) setPendingFile(file);
    })();
    return () => {
      cancelled = true;
    };
  }, [resume, restaurantId]);

  async function reprendrePendingFile() {
    const file = pendingFile;
    if (!file) return;
    setPendingFile(null);
    track("visitor_ticket_resumed", { restaurant_id: restaurantId });
    await acceptFile(file);
  }

  // Une photo arrive (appareil, galerie ou glisser-déposer) : on l'allège
  // côté navigateur (HEIC → JPEG, ≤ 1 600 px, ≈ 300 Ko) PUIS on lance
  // l'analyse tout de suite — plus de second tap « Analyser ».
  // Incident 2026-08 : les photos > 4,5 Mo partaient telles quelles → 413
  // Vercel → « erreur réseau » → 6 essais.
  async function acceptFile(file: File | undefined | null) {
    if (!file) return;
    let reading: ParsedReceipt | null = null;
    let readFile: File | null = null;
    setParseStatus("idle");
    setParseError("");
    setOrderNumber("");
    setOrderNumberEditable(false);
    setKeyCorrected(false);
    setAmount("");
    setScanId(null);
    setAmountEditable(false);
    setPrecheck(null);
    setGainReward(null);
    setGainNextTier(null);
    setFramingIssue(null);
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
      // Verrou GRATUIT avant tout appel Vision (backlog « refus des photos de
      // QR/affiche ») : si la photo contient un QR qui pointe vers NOTRE
      // programme, c'est l'affiche — pas un ticket. Le QR d'avis imprimé au
      // bas des tickets pointe ailleurs et ne déclenche jamais ce verrou.
      // BarcodeDetector n'existe que sur Chrome/Android : ailleurs (iOS), le
      // serveur tranche avec le champ « affiche » de l'analyse. Best-effort.
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(i: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (Detector) {
          const bitmap = await createImageBitmap(prepared.file);
          const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
          bitmap.close();
          if (codes.some((c) => isProgramQrPayload(c.rawValue))) {
            setReceiptFile(null);
            setPreview(null);
            setParseStatus("error");
            setParseError(POSTER_MEMBER_MESSAGE);
            return;
          }
        }
      } catch {
        // détecteur indisponible ou image récalcitrante → le serveur tranche
      }
      setReceiptFile(prepared.file);
      setPreview(URL.createObjectURL(prepared.file));
      // Entonnoir (ADR 0037) — pour TOUT LE MONDE, pas seulement le visiteur :
      // le décrochage « photo prise mais jamais envoyée » existe aussi chez un
      // membre déjà inscrit, et c'est le rapport photo → envoi qui nous
      // intéresse. GA4 est aveugle ici (Consent Mode v2 refuse par défaut).
      beaconFunnelStep(restaurantId, "ticket_capture_opened");
      // La photo reste sur l'appareil jusqu'à ce que le serveur ait le ticket :
      // le visiteur en attendant son compte (ADR 0040), le membre en attendant
      // l'envoi (ADR 0055) — s'il quitte avant, le bandeau « Ton ticket
      // t'attend » la lui rend. L'aperçu OCR tourne dans les deux cas
      // (visiteur : non authentifié, bridé par IP — ADR 0045).
      await savePendingTicket(restaurantId, prepared.file);
      if (visitor) track("visitor_ticket_captured", { restaurant_id: restaurantId });
      readFile = prepared.file;
      reading = await analyseReceipt(prepared.file);
    } finally {
      setPreparing(false);
    }
    if (readFile && reading) await afterReading(readFile, reading);
  }

  // ADR 0056 — la caméra intégrée d'abord ; l'appareil photo du téléphone
  // seulement si elle n'existe pas ici.
  function openCamera() {
    setCameraLost(false);
    if (inAppCameraAvailable()) setCameraOpen(true);
    else openNativeCamera();
  }

  // Doit rester appelé DANS un clic (sinon le navigateur refuse d'ouvrir).
  // La marque est effacée dès que la page reprend la main ; si Android la
  // tue entre-temps, elle survit et le montage suivant affiche le filet.
  function openNativeCamera() {
    markNativeCameraOpened();
    window.addEventListener("focus", () => window.setTimeout(() => clearNativeCameraMark(), 1500), { once: true });
    cameraInputRef.current?.click();
  }

  function openGallery() {
    setCameraOpen(false);
    fileInputRef.current?.click();
  }

  function handleCameraFailure(reason: CameraFailure) {
    track("receipt_camera_fallback", { restaurant_id: restaurantId, reason });
  }

  // ADR 0057 — caméra fermée sans photo à l'écran : la personne a changé
  // d'avis, retour là où elle était (accueil, vitrine…). Arrivée directe
  // (lien partagé, app rouverte) : pas d'historique, on rejoint l'établissement.
  function leaveTicketScreen() {
    if (window.history.length > 1) router.back();
    else router.replace(`/r/${restaurantId}`);
  }

  // ADR 0057 — après la lecture : photo incomplète → recadrer (sauf si la
  // personne a choisi la saisie à la main) ; sinon envoi auto ou récap.
  async function afterReading(file: File, reading: ParsedReceipt) {
    const missing = visitor ? null : missingReceiptParts(reading);
    if (missing && !manualEntry) {
      const attempt = framingFailures + 1;
      setFramingIssue(missing);
      setFramingFailures(attempt);
      track("receipt_reframe_requested", {
        restaurant_id: restaurantId,
        missing: missing.total && missing.key ? "both" : missing.total ? "total" : "key",
        attempt,
      });
      return;
    }
    await sendIfClean(file, reading);
  }

  // Deux photos ratées sur ce ticket : la personne choisit de taper les
  // valeurs. Le récap s'ouvre avec les champs manquants à remplir ; le
  // serveur relit la photo et envoie en revue ce qui ne se prouve pas.
  function enterManualEntry() {
    setManualEntry(true);
    setFramingIssue(null);
    track("receipt_manual_entry", { restaurant_id: restaurantId, attempts: framingFailures });
    if (parseStatus === "error") {
      // aperçu refusé (ticket non reconnu) : récap vide à compléter
      setParseError("");
      setParseStatus("done");
      setOrderNumberEditable(true);
      setAmountEditable(true);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    clearNativeCameraMark();
    setCameraLost(false);
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
    // Entonnoir (ADR 0037). `sendBeacon` et pas `fetch` : la redirection OAuth
    // qui suit annulerait une requête ordinaire (cf. lib/funnel-beacon).
    beaconFunnelStep(restaurantId, "signup_started");
    // ADR 0049 — c'est le cadeau qui paie la demande de compte : son nom suit
    // la personne jusqu'à l'écran d'inscription, qui titre « Réclame ton
    // cadeau » au lieu de « Créer un compte ».
    memoriserCadeauAReclamer(gainReward);
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

  async function analyseReceipt(fileArg?: File): Promise<ParsedReceipt | null> {
    const file = fileArg ?? receiptFile;
    if (!file) return null;
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
      const { ok, status, data: parsedData } = await readJsonSafe<ParsedReceipt & { error?: string }>(res);
      const data = parsedData ?? {};

      if (!ok) {
        // 422 : l'aperçu a refusé la photo (pas un ticket, affiche). Inutile
        // de la reproposer au membre via « Ton ticket t'attend » (ADR 0055).
        // La photo du visiteur suit son parcours inchangé (ADR 0045).
        // ADR 0057 — c'est aussi une photo ratée : elle compte pour proposer
        // la saisie à la main au bout de deux.
        if (status === 422 && !visitor) {
          void clearPendingTicket(restaurantId);
          const attempt = framingFailures + 1;
          setFramingFailures(attempt);
          track("receipt_reframe_requested", { restaurant_id: restaurantId, missing: "unrecognized", attempt });
        }
        setParseStatus("error");
        setParseError(describeUploadFailure(status, data.error));
        return null;
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
      setGainReward(data.reward ?? null);
      setGainNextTier(data.next_tier ?? null);
      return data;
    } catch (err) {
      setParseStatus("error");
      if (err instanceof DOMException && err.name === "AbortError") {
        setParseError("L'analyse a pris trop de temps. Réessaie avec une photo plus légère.");
      } else {
        setParseError("Erreur réseau. Vérifie ta connexion et réessaie.");
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ADR 0055 — lecture propre : le ticket part sans passer par le récap. Le
  // doublon est vérifié d'abord (best-effort : si le précheck échoue, le 409
  // de /api/orders reste le filet). Tout échec rend la main au récap, déjà
  // rempli par l'aperçu, qui affiche le message et le bouton.
  async function sendIfClean(file: File, reading: ParsedReceipt) {
    if (visitor || !canAutoSend(reading)) return;
    setAutoSending(true);
    const readOrderNumber = reading.order_number?.trim() ?? "";
    try {
      const res = await fetch("/api/orders/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, amount: reading.amount, order_number: readOrderNumber }),
      });
      const { data } = await readJsonSafe<{
        reward?: string | null;
        next_tier?: { item: string; pct: number } | null;
        duplicate?: boolean;
      }>(res);
      if (res.ok && data) {
        const duplicate = data.duplicate === true;
        setPrecheck({ reward: data.reward ?? null, next_tier: data.next_tier ?? null, duplicate });
        if (duplicate) {
          setAutoSending(false);
          return;
        }
      }
    } catch {
      // silencieux — le serveur tranche à l'envoi
    }
    await submitTicket({
      file,
      orderNumber: readOrderNumber,
      amount: String(reading.amount),
      scanId: reading.scan_id ?? null,
      ocrAmount: reading.amount ?? null,
      ocrConfidence: reading.confidence ?? null,
      noRestaurantHeader: !(reading.has_restaurant_header ?? true),
      autoSent: true,
    });
    setAutoSending(false);
  }

  // Relance manuelle de l'analyse après une erreur : même suite qu'une photo
  // neuve, une lecture propre part toute seule.
  async function retryAnalysis() {
    const file = receiptFile;
    if (!file) return;
    const reading = await analyseReceipt(file);
    if (reading) await afterReading(file, reading);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiptFile) return;
    await submitTicket({
      file: receiptFile,
      orderNumber,
      amount,
      scanId,
      ocrAmount,
      ocrConfidence,
      noRestaurantHeader,
      autoSent: false,
    });
  }

  // Valeurs passées explicitement et non lues dans le state : l'envoi
  // automatique part dans le même tour que l'aperçu, avant que React n'ait
  // appliqué les setState de analyseReceipt.
  async function submitTicket(t: {
    file: File;
    orderNumber: string;
    amount: string;
    scanId: string | null;
    ocrAmount: number | null;
    ocrConfidence: number | null;
    noRestaurantHeader: boolean;
    autoSent: boolean;
  }) {
    setSubmitStatus("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("receipt", t.file);
    formData.append("order_number", t.orderNumber);
    formData.append("amount", t.amount);
    formData.append("restaurantId", restaurantId);
    if (t.ocrAmount !== null)      formData.append("ocr_amount", String(t.ocrAmount));
    if (t.ocrConfidence !== null)  formData.append("ocr_confidence", String(t.ocrConfidence));
    if (t.noRestaurantHeader)      formData.append("no_restaurant_header", "true");
    if (t.scanId !== null)         formData.append("scan_id", t.scanId);

    // Le montant part en tranche, jamais en euros (ADR 0028) : la charge utile
    // d'un événement analytics est lisible côté client.
    track("order_submitted", {
      restaurant_id: restaurantId,
      amount_band: amountBand(Number(t.amount)),
      has_receipt_photo: true,
      auto_sent: t.autoSent,
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

      // Le serveur a tranché : ticket enregistré ou déjà utilisé. La photo
      // n'a plus rien à attendre sur l'appareil (ADR 0055). Une autre erreur
      // (date refusée, réseau) la garde pour un nouvel essai.
      if (res.status === 201 || res.status === 409) void clearPendingTicket(restaurantId);

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
    setGainReward(null);
    setGainNextTier(null);
    setSubmitStatus("idle");
    setFramingIssue(null);
    setFramingFailures(0);
    setManualEntry(false);
    setReward(null);
    setNextTier(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // ADR 0056 §4 — UN emplacement pour tout message, en haut de l'écran. Un
  // refus affiché sous les repères 1-2-3 tombait hors écran : « aucun
  // message ». Côté visiteur, seul le refus d'une photo qui n'a pas pu être
  // gardée s'affiche ; l'échec de l'aperçu OCR reste silencieux (ADR 0045).
  const framingTitle = framingIssue
    ? framingIssue.total && framingIssue.key
      ? `On voit mal le total et le ${keyLabel}`
      : framingIssue.total
        ? "On voit mal le total"
        : `On voit mal le ${keyLabel}`
    : "";
  const topAlert: { tone: "error" | "warn"; title: string; hint?: string; reframe?: boolean } | null =
    submitStatus === "error" && errorMsg
      ? { tone: "error", title: errorMsg }
      : submitStatus === "duplicate"
        ? // ADR 0052 §6 — message unique, sans détail technique : le membre
          // n'a pas à savoir QUEL signal a détecté le doublon.
          { tone: "warn", title: "Ce ticket a déjà été utilisé." }
        : !visitor && parseStatus === "done" && precheck?.duplicate
          ? {
              tone: "warn",
              title: "Ce numéro de ticket a déjà été utilisé",
              hint: `Vérifie le ${keyLabel.toLowerCase()} ci-dessous — ou reprends la photo si ce n'est pas le bon ticket.`,
            }
          : !visitor && parseStatus === "done" && framingIssue && !manualEntry
            ? // ADR 0057 — photo incomplète : dire QUOI recadrer, et rouvrir la caméra.
              {
                tone: "warn",
                title: framingTitle,
                hint: "Rapproche-toi, ticket bien à plat, et cadre-les dans le rectangle.",
                reframe: true,
              }
            : parseStatus === "error" && parseError && (!visitor || !preview)
              ? { tone: "error", title: parseError, reframe: true }
              : null;
  const topAlertKey = topAlert ? `${topAlert.tone}:${topAlert.title}` : "";

  // Un message qui apparaît alors qu'on a scrollé (récap long) : on remonte.
  useEffect(() => {
    if (topAlertKey) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [topAlertKey]);

  // ADR 0030 §6 — après un scan réussi, la suite naturelle est « qu'est-ce
  // que ça m'a rapporté ? » (libellés neutres : la validation est différée,
  // ADR 0008 — ne jamais promettre un cadeau déjà là).
  if (submitStatus === "success_validated") {
    // ADR 0028 — points gagnés sur CE ticket, même formule courbée
    // (pointsForOrder) que le score d'équipe et les compteurs header/dashboard :
    // pas d'euro affiché, "amount" ne ressort qu'ici, transformé en points.
    const earnedPoints = pointsForOrder(Number(amount));
    const pointsLabel = `point${earnedPoints > 1 ? "s" : ""} gagné${earnedPoints > 1 ? "s" : ""}`;
    const askTeam =
      !hasTeam && !teamAskDone && !!teamPrompt && teamPrompt.suggestions.length > 0;
    return (
      <div>
        {/* ADR 0049 — app + notifications en UNE feuille, posée ICI : le
            ticket est parti côté serveur (donc plus rien à perdre si la
            personne quitte Safari pour installer l'app) et un cadeau vient
            d'être gagné (donc la demande est payée). Le cadeau est nommé pour
            qu'elle le soit vraiment : « pour récupérer ton Finest burger ».
            Une fois par visite. */}
        <PostTicketSheet
          restaurantId={restaurantId}
          reward={reward}
          onDone={() => setSheetDone(true)}
        />
        {/* Étape 10 — la question d'équipe passe APRÈS l'app et les
            notifications : c'est l'ordre du parcours cible (gain → compte →
            app → notifs → équipes), et les deux sont payées par le même
            cadeau. La relance côté serveur est armée par la sortie
            « Plus tard ». */}
        {askTeam && sheetDone && teamPrompt && (
          <TeamRecognitionPrompt
            restaurantId={restaurantId}
            suggestions={teamPrompt.suggestions}
            onDone={() => setTeamAskDone(true)}
          />
        )}
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
              on retombe sur le titre neutre. Le plat gagné s'affiche en GRAND
              (lib/food-icon) — le cadeau doit se voir, pas se lire. */}
          {reward && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foodIconUrl(reward)}
              alt=""
              aria-hidden="true"
              className="w-28 h-28 mx-auto mb-3 drop-shadow-lg"
            />
          )}
          <h2 className="text-2xl font-black mb-5">
            {reward ? `${reward} débloqué !` : "Belle photo !"}
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
                <span className="font-bold inline-flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foodIconUrl(nextTier.item)} alt="" className="w-4 h-4" />
                  {nextTier.item}
                </span>
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
            onClick={() => {
              // ADR 0057 — « un autre ticket » = la caméra, directement.
              reset();
              openCamera();
            }}
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" /> Photographier un autre ticket
          </button>
        </div>
      </div>
    );
  }

  if (submitStatus === "success_pending") {
    return (
      <div className="text-center py-12">
        {/* ADR 0049 — cet écran PROMET une notification (« tu seras notifié
            dès que la vérification est terminée ») : c'est le seul endroit du
            parcours où la promesse tombe à plat si la permission n'a jamais
            été demandée. Aucun cadeau à nommer ici (rien n'est validé), donc
            c'est la notification elle-même qui paie la demande. */}
        <PostTicketSheet restaurantId={restaurantId} pending />
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
            onClick={() => {
              // ADR 0057 — « un autre ticket » = la caméra, directement.
              reset();
              openCamera();
            }}
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" /> Photographier un autre ticket
          </button>
        </div>
      </div>
    );
  }

  // ADR 0048 §6, étendu au membre par ADR 0055 — l'écran change de sujet dès
  // que la photo est là : la consigne a fait son travail. La garder en 4xl sur
  // deux lignes repoussait la suite sous la ligne de flottaison — les boutons
  // de connexion du visiteur (bouton Google à 901 px à 390×844, 749 px sans
  // elle), et « Envoyer mon ticket » du membre (~870 px sur 360×800, terrain
  // 2026-09-14 : la personne croyait avoir fini et quittait l'app). Basculé
  // sur `preview` et non sur la fin de l'analyse, pour ne pas faire sauter la
  // mise en page au milieu des 2 à 6 s d'OCR. Le logo reste — c'est le repère
  // d'établissement, pas une consigne.
  const photoTaken = !!preview;
  // Aucun changement de photo pendant qu'un envoi est en vol : la réponse
  // arriverait pour l'ancienne.
  const sending = autoSending || submitStatus === "loading";

  return (
    <div>
      {cameraOpen && (
        <ReceiptCamera
          keyLabel={keyLabel}
          onCapture={(file) => {
            setCameraOpen(false);
            void acceptFile(file);
          }}
          onClose={() => {
            setCameraOpen(false);
            // ADR 0057 — fermée sans photo à l'écran : retour là où elle était.
            // Avec une photo (reprise en cours) ou le filet affiché, on reste.
            if (!preview && !cameraLost) leaveTicketScreen();
          }}
          onNativeCamera={() => {
            setCameraOpen(false);
            openNativeCamera();
          }}
          onGallery={openGallery}
          onFailure={handleCameraFailure}
        />
      )}
      <div className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className={`block mx-auto h-14 w-auto object-contain ${photoTaken ? "" : "mb-6"}`}
          />
        ) : null}
        {!photoTaken && (
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            Prends ton ticket en photo
          </h1>
        )}
      </div>

      {/* ADR 0056 §3 — la page a été tuée pendant la photo : la photo n'existe
          plus nulle part. La galerie passe devant — la photo prise avec
          l'appareil du téléphone y est, elle. */}
      {cameraLost && !preview && (
        <div role="alert" className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
          <p className="font-bold text-amber-900 text-sm">Ton téléphone a fermé l&apos;app pendant la photo</p>
          <p className="text-amber-800 text-xs mt-1">
            Ta photo est dans ta galerie : choisis-la ici pour l&apos;envoyer.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              type="button"
              onClick={openGallery}
              className="inline-flex items-center gap-2 bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-red/85"
            >
              <Images className="w-4 h-4" aria-hidden="true" /> Choisir dans la galerie
            </button>
            <button type="button" onClick={openCamera} className="text-xs text-amber-900 underline">
              Reprendre une photo
            </button>
          </div>
        </div>
      )}

      {/* ADR 0056 §4 — tous les messages ici, jamais sous la ligne de flottaison. */}
      {topAlert && (
        <div
          role="alert"
          className={`rounded-xl p-4 mb-4 border ${
            topAlert.tone === "error" ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200"
          }`}
        >
          <p className={`text-sm font-semibold ${topAlert.tone === "error" ? "text-red-700" : "text-orange-900"}`}>
            {topAlert.title}
          </p>
          {topAlert.hint && (
            <p className={`text-xs mt-1 ${topAlert.tone === "error" ? "text-red-500" : "text-orange-700"}`}>
              {topAlert.hint}
            </p>
          )}
          {topAlert.reframe && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button
                type="button"
                onClick={openCamera}
                className="inline-flex items-center gap-2 bg-brand-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-red/85"
              >
                <Camera className="w-4 h-4" aria-hidden="true" /> Reprendre la photo
              </button>
              {/* ADR 0057 — au bout de deux photos ratées, jamais bloqué. */}
              {!visitor && preview && framingFailures >= 2 && (
                <button
                  type="button"
                  onClick={enterManualEntry}
                  className={`text-xs underline ${topAlert.tone === "error" ? "text-red-700" : "text-orange-900"}`}
                >
                  Je n&apos;y arrive pas, saisir à la main
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bandeau de reprise — une photo dort en IndexedDB et rien n'est
          encore affiché : un tap la recharge, prendre une autre photo
          l'ignore simplement. */}
      {pendingFile && !preview && !preparing && (
        <button
          type="button"
          onClick={() => void reprendrePendingFile()}
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4 text-left hover:bg-amber-100 transition-colors"
        >
          <Camera className="w-6 h-6 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-amber-900 text-sm">Ton ticket t&apos;attend</span>
            <span className="block text-xs text-amber-800">
              La photo de ta dernière visite est encore là — envoie-la avant qu&apos;elle expire.
            </span>
          </span>
          <span className="text-amber-900 text-sm font-bold shrink-0">Reprendre →</span>
        </button>
      )}

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
              // ADR 0045 puis 0055 — la photo cède la place à la suite (preuve
              // du scan et connexion côté visiteur, envoi ou récap côté
              // membre) : vignette plutôt qu'aperçu pleine taille. Le ticket
              // papier est dans la main, l'aperçu géant n'apprend rien.
              className="h-20 w-20 mx-auto rounded-lg object-cover"
            />
            <div className="flex justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={openCamera}
                disabled={sending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Reprendre
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <Images className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Autre photo
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {/* Spécimen de cadrage (incident 2026-09-02 : 70 % de refus) —
                montre la SEULE zone qui compte : total + clé de commande.
                L'ancien conseil « cadre tout le ticket » produisait des photos
                à bout de bras, illisibles, sur les tickets de 50 cm.
                Quand un échantillon RÉEL existe (echantillons/, ADR 0036 §3),
                la vraie photo remplace le dessin — rien ne vaut son propre
                ticket pour comprendre quoi cadrer. */}
            {guidePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guidePhotoUrl}
                alt="Exemple : la zone du ticket à photographier — le total et le numéro de commande"
                className="w-56 max-w-full h-auto mx-auto mb-3 rounded-lg border-2 border-brand-red/60 shadow-sm"
              />
            ) : (
            <svg
              viewBox="0 0 120 96"
              className="w-24 h-auto mx-auto mb-3"
              aria-hidden="true"
            >
              {/* Ticket au bord supérieur déchiré : le haut peut manquer */}
              <path
                d="M30 8 l6 -4 6 4 6 -4 6 4 6 -4 6 4 6 -4 6 4 6 -4 6 4 v84 h-60 z"
                fill="#fff"
                stroke="#d1d5db"
                strokeWidth="2"
              />
              <line x1="38" y1="20" x2="82" y2="20" stroke="#e5e7eb" strokeWidth="4" strokeLinecap="round" />
              <line x1="38" y1="30" x2="74" y2="30" stroke="#e5e7eb" strokeWidth="4" strokeLinecap="round" />
              <line x1="38" y1="40" x2="80" y2="40" stroke="#e5e7eb" strokeWidth="4" strokeLinecap="round" />
              {/* Zone utile : total + clé, encadrée */}
              <rect x="33" y="50" width="54" height="34" rx="4" fill="rgb(var(--brand-red) / 0.07)" stroke="rgb(var(--brand-red))" strokeWidth="2.5" />
              <line x1="38" y1="59" x2="60" y2="59" stroke="#374151" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="70" y1="59" x2="82" y2="59" stroke="#374151" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="38" y1="70" x2="82" y2="70" stroke="#6b7280" strokeWidth="4" strokeLinecap="round" />
              <line x1="38" y1="78" x2="66" y2="78" stroke="#e5e7eb" strokeWidth="4" strokeLinecap="round" />
            </svg>
            )}
            <p className="font-semibold text-gray-700 mb-4">Photo du ticket de caisse</p>
            <button
              type="button"
              onClick={openCamera}
              disabled={preparing}
              className="flex items-center justify-center gap-2 w-full sm:w-auto sm:mx-auto bg-brand-red text-white py-5 px-8 rounded-full font-bold text-xl hover:bg-brand-red/85 disabled:opacity-60 transition-colors shadow-lg"
            >
              Prendre le ticket en photo <Camera className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={preparing}
              className="block mx-auto mt-4 text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-60"
            >
              Choisir dans la galerie
            </button>
            <p className="text-xs text-gray-500 mt-4">
              L&apos;essentiel : le <span className="font-semibold text-gray-700">total</span> et le{" "}
              <span className="font-semibold text-gray-700">{keyLabel}</span> bien nets, de près.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Ticket très long ? Photographie seulement la partie où ils apparaissent — inutile de tout cadrer.
            </p>
            {/* ADR 0055 — une lecture propre part toute seule : c'est la photo
                qui envoie, la confirmation l'accompagne donc ici. */}
            <p className="text-xs text-gray-400 mt-3">
              En prenant la photo, tu confirmes une commande passée directement au restaurant{" "}
              {restaurantName} — pas via une plateforme de livraison.
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

      {/* Le repère 1-2-3 annonce le parcours tant qu'il est devant nous. Dès
          qu'une photo est là, la carte de gain (ADR 0048) dit la même chose en
          concret — un cadeau nommé plutôt qu'une promesse — et le rappel
          générique ne ferait que repousser les boutons sous la ligne de
          flottaison. */}
      {!preview && (
        <div className="mb-6 space-y-2">
          {STEPS.map((step) => (
            <p key={step.num} className="text-sm text-gray-500">
              <span className="font-bold text-gray-900">{step.num}</span> · {step.desc}
            </p>
          ))}
        </div>
      )}

      {/* ADR 0040 — la photo est prise : c'est LE moment où le compte devient
          utile, et le message dit pourquoi.
          ADR 0045 — l'aperçu OCR tourne déjà (non authentifié, ci-dessus).
          ADR 0048 — et il ne dit plus seulement que le scan a marché : il dit
          ce que le ticket VAUT. Le cadeau est gagné AVANT qu'on demande quoi
          que ce soit, puis c'est lui qui paie la demande de compte. */}
      {visitor && preview && !preparing && (
        <div className="bg-white border-2 border-brand-red/40 rounded-2xl p-5 text-center mb-4">
          {parseStatus === "done" && ocrAmount !== null ? (
            <TicketGainCard amount={ocrAmount} reward={gainReward} nextTier={gainNextTier} />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CAMERA_EMOJI} alt="" className="w-12 h-12 mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                {parseStatus === "parsing" ? "Lecture de ton ticket…" : "Ton ticket est prêt !"}
              </h2>
            </>
          )}
          {/* L'argument du compte devient le CADEAU quand il y en a un : c'est
              le gain déjà acquis qui justifie la demande, plus une promesse.
              Sans cadeau atteint (petit ticket, grille non configurée), les
              points restent l'argument. */}
          <p className="text-gray-600 text-sm mb-4">
            {gainReward ? (
              <>
                Crée ton compte pour <span className="font-semibold">réclamer ton cadeau</span>.
              </>
            ) : (
              <>
                Crée ton compte pour <span className="font-semibold">garder tes points</span>.
              </>
            )}{" "}
            La photo reste sur ton téléphone en attendant.
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

      {/* ADR 0055 — côté membre, un seul état d'attente de la photo au
          résultat : la lecture puis, si elle est propre, l'envoi (délai
          ADR 0008 inclus). Aucun bouton à trouver entre les deux. */}
      {!visitor && preview && (preparing || parseStatus === "parsing" || autoSending) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl animate-spin">⏳</span>
          <div>
            <p className="font-semibold text-blue-900 text-sm">
              {autoSending ? "Vérification en cours..." : "Lecture de ton ticket…"}
            </p>
            <p className="text-blue-700 text-xs mt-0.5">Reste sur cet écran, c&apos;est presque fini.</p>
          </div>
        </div>
      )}

      {/* L'analyse part automatiquement après la photo ; ce bouton ne sert
          qu'à relancer après une erreur (ou si l'auto-lancement a échoué). */}
      {!visitor && preview && !preparing && (parseStatus === "idle" || parseStatus === "error") && (
        <button
          onClick={() => void retryAnalysis()}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-xl font-semibold hover:bg-brand-red/85 disabled:opacity-60 transition-colors mb-4"
        >
          {parseStatus === "error" ? "Réessayer l'analyse" : "Analyser le ticket"}
        </button>
      )}

      {/* Formulaire — visible après analyse réussie, réservé aux membres
          connectés (un visiteur ne peut pas soumettre, /api/orders exige une
          session — ADR 0045). */}
      {parseStatus === "done" && !visitor && !autoSending && (!framingIssue || manualEntry) && (
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
          {/* Le doublon lui-même s'annonce en haut de l'écran (ADR 0056 §4). */}
          {precheck?.duplicate ? null : precheck?.reward ? (
            // Même palette verte fixe que la carte de gain visiteur
            // (TicketGainCard) : brand-gold résout en rouge pour Kraainem, et
            // le cadeau visé s'affichait dans un encadré rose — lu comme une
            // alerte à l'endroit exact où l'on annonce une bonne nouvelle.
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foodIconUrl(precheck.reward)} alt="" aria-hidden="true" className="w-14 h-14 shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Cadeau visé</p>
                <p className="font-black text-gray-900">{precheck.reward}</p>
                <p className="text-xs text-gray-500">À récupérer au comptoir après validation.</p>
              </div>
            </div>
          ) : precheck?.next_tier ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-600">Prochain cadeau</span>
                <span className="font-bold text-gray-900 inline-flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foodIconUrl(precheck.next_tier.item)} alt="" className="w-5 h-5" />
                  {precheck.next_tier.item}
                </span>
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

          {/* ADR 0055 — collé au-dessus de la barre du bas (≈ 58 px + le
              bouton photo qui dépasse de 24 px, + zone sûre iOS) tant que le
              récap est à l'écran : le bouton ne doit jamais demander de
              scroller, quelle que soit la hauteur d'écran ou le nombre
              d'alertes au-dessus. */}
          <button
            type="submit"
            disabled={submitStatus === "loading" || precheck?.duplicate === true}
            className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[5] w-full bg-brand-red text-white py-4 px-4 rounded-xl font-semibold text-lg shadow-lg hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
