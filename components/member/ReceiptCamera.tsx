"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, Images, X } from "lucide-react";
import { RECEIPT_JPEG_QUALITY, RECEIPT_MAX_EDGE } from "@/lib/receipt-image-client";
import { createQrDetector, showsProgramQr } from "@/lib/poster-detect";

// Viseur surveillé toutes les 600 ms ; le message reste 1,5 s après la
// dernière vue du QR, pour ne pas clignoter quand la main bouge.
const POSTER_SCAN_MS = 600;
const POSTER_HOLD_MS = 1500;

// Lampe (audit écran photo, 2026-09-15). Luminosité moyenne du viseur
// (0-255) sous laquelle on propose d'allumer la lampe, mesurée chaque seconde
// sur une vignette de 24 px — coût négligeable.
const DARK_LUMA = 60;
const DARK_SCAN_MS = 1000;

type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

// ADR 0056 — la photo du ticket se prend DANS la page.
//
// L'appareil photo du téléphone (<input capture>) est une autre app : la page
// passe en arrière-plan et Android la tue quand la mémoire manque. Au retour,
// l'app redémarre sur l'écran vide et la photo est perdue (terrain
// 2026-09-14). Ici, la page reste au premier plan du début à la fin.
//
// Tout échec (navigateur sans caméra, accès refusé, caméra occupée) ouvre un
// panneau avec les deux portes historiques. Leurs boutons sont un geste
// direct : le navigateur accepte d'ouvrir l'appareil photo ou la galerie, ce
// qu'il refuserait après l'attente d'une permission.

export type CameraFailure = "unsupported" | "denied" | "error";

export function inAppCameraAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };

// Repli quand ImageCapture manque (iOS, Firefox) : une image du flux vidéo,
// déjà à la taille que prepareReceiptImage viserait.
function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", RECEIPT_JPEG_QUALITY));
}

export default function ReceiptCamera({
  keyLabel,
  onCapture,
  onClose,
  onNativeCamera,
  onGallery,
  onFailure,
  onPosterSeen,
  onTorchOn,
}: {
  keyLabel: string;
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Appelé dans le clic : ouvre l'appareil photo du téléphone. */
  onNativeCamera: () => void;
  /** Appelé dans le clic : ouvre la galerie. */
  onGallery: () => void;
  /** Mesure uniquement — une fois par échec. */
  onFailure?: (reason: CameraFailure) => void;
  /** Mesure uniquement — une fois par ouverture, quand l'affiche entre dans le viseur. */
  onPosterSeen?: () => void;
  /** Mesure uniquement — une fois par ouverture, quand la lampe est allumée. */
  onTorchOn?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Lampe : pilotable depuis une page web sur Chrome Android seulement (Safari
  // iOS n'expose pas `torch`) — le bouton n'apparaît que si le téléphone
  // l'annonce dans les capacités de la caméra.
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [dark, setDark] = useState(false);
  const onTorchOnRef = useRef(onTorchOn);
  onTorchOnRef.current = onTorchOn;
  const torchReportedRef = useRef(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setReady(false);
    // Un flux relancé repart lampe éteinte.
    setTorchOn(false);
    setTorchAvailable(false);
    if (!inAppCameraAvailable()) {
      setFailure("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      // Fermée pendant la demande de permission : on relâche la caméra.
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      const videoTrack = stream.getVideoTracks()[0];
      const caps = (videoTrack?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(caps.torch === true);
      setFailure(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const name = err instanceof DOMException ? err.name : "";
      setFailure(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, [stop]);

  useEffect(() => {
    mountedRef.current = true;
    void start();
    // Retour au premier plan (appel, notification…) : le système a pu couper
    // le flux — on le relance plutôt que de laisser une image figée.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") void start();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    if (failure) onFailureRef.current?.(failure);
  }, [failure]);

  // Le QR de l'affiche dans le viseur : on le dit AVANT la photo (terrain
  // Kraainem, septembre 2026 : une lecture sur cinq était l'affiche, que le
  // client venait de scanner). Chrome Android seulement ; ailleurs le cadre
  // et son libellé guident seuls, et le serveur refuse l'affiche.
  const [posterInView, setPosterInView] = useState(false);
  const onPosterSeenRef = useRef(onPosterSeen);
  onPosterSeenRef.current = onPosterSeen;
  const posterReportedRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    const detector = ready && !failure ? createQrDetector() : null;
    if (!video || !detector) return;
    let stopped = false;
    let lastSeen = 0;
    let timer: number | undefined;
    const tick = async () => {
      if (video.readyState >= 2 && (await showsProgramQr(detector, video))) {
        lastSeen = Date.now();
        if (!posterReportedRef.current) {
          posterReportedRef.current = true;
          onPosterSeenRef.current?.();
        }
      }
      if (stopped) return;
      setPosterInView(Date.now() - lastSeen < POSTER_HOLD_MS);
      timer = window.setTimeout(() => void tick(), POSTER_SCAN_MS);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      setPosterInView(false);
    };
  }, [ready, failure]);

  // Viseur trop sombre et lampe éteinte : on propose de l'allumer.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready || failure || !torchAvailable || torchOn) {
      setDark(false);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const measure = () => {
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, 24, 24);
      const px = ctx.getImageData(0, 0, 24, 24).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      setDark(sum / (px.length / 4) < DARK_LUMA);
    };
    measure();
    const timer = window.setInterval(measure, DARK_SCAN_MS);
    return () => window.clearInterval(timer);
  }, [ready, failure, torchAvailable, torchOn]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] });
      setTorchOn(next);
      if (next && !torchReportedRef.current) {
        torchReportedRef.current = true;
        onTorchOnRef.current?.();
      }
    } catch {
      // Capacité annoncée mais refusée (certains appareils) : on retire le bouton.
      setTorchAvailable(false);
      setTorchOn(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || busy) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      // Une vraie photo (mise au point, pleine résolution) quand le navigateur
      // le permet — Chrome Android. prepareReceiptImage la réduit ensuite.
      // Lampe allumée : selon les téléphones, la prise de photo coupe la lampe
      // continue au moment du déclenchement — on garde l'image du flux, éclairée.
      const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      const track = stream.getVideoTracks()[0];
      if (Ctor && track && !torchOn) {
        try {
          blob = await new Ctor(track).takePhoto();
        } catch {
          blob = null;
        }
      }
      if (!blob) blob = await grabFrame(video);
      if (!blob) throw new Error("capture");
      stop();
      onCapture(new File([blob], `ticket-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" }));
    } catch {
      setBusy(false);
      setFailure("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prendre le ticket en photo"
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onPlaying={() => setReady(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {!failure && (
          // ADR 0056 amendé (2026-09-15) — un cadre qui A LA FORME d'un ticket
          // de caisse (étroit, vertical, bord déchiré) : le client vient de
          // scanner l'affiche et vise encore dans sa direction. Étroit plutôt
          // que le ticket entier : le total et la clé tiennent en bas du ticket,
          // sur sa largeur — la photo à bout de bras d'un ticket de 50 cm
          // était illisible (incident 2026-09-02). L'ombre assombrit le reste.
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10">
            <p
              // z-10 : au-dessus de l'ombre du cadre, qui l'assombrissait.
              className={`relative z-10 mb-5 rounded-full px-4 py-1.5 text-center text-sm font-bold text-white ${
                posterInView ? "bg-red-600" : "bg-black/55"
              }`}
            >
              {posterInView ? "C'est l'affiche : vise ton ticket" : "Ton ticket de caisse"}
            </p>
            <div
              className={`relative aspect-[5/7] w-full max-w-[15rem] rounded-b-2xl border-4 border-t-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors ${
                posterInView ? "border-red-500" : "border-white/90"
              }`}
            >
              {/* Bord supérieur déchiré */}
              <svg
                viewBox="0 0 120 8"
                preserveAspectRatio="none"
                aria-hidden="true"
                className={`absolute -left-1 -right-1 -top-2 h-3 w-[calc(100%+0.5rem)] ${
                  posterInView ? "text-red-500" : "text-white/90"
                }`}
              >
                <polyline
                  points="0,7 7.5,1 15,7 22.5,1 30,7 37.5,1 45,7 52.5,1 60,7 67.5,1 75,7 82.5,1 90,7 97.5,1 105,7 112.5,1 120,7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* Repères discrets : les lignes d'articles, puis la zone utile en bas */}
              <div className="absolute inset-x-5 top-6 space-y-2.5 opacity-40">
                <div className="h-1 w-3/4 rounded-full bg-white" />
                <div className="h-1 w-2/3 rounded-full bg-white" />
                <div className="h-1 w-4/5 rounded-full bg-white" />
              </div>
              <div className="absolute inset-x-3 bottom-3 flex h-[34%] flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-white/60 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-white/85">
                <span>Total</span>
                <span className="truncate">{keyLabel}</span>
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-semibold text-white drop-shadow">
              Le <span className="font-black">total</span> et le{" "}
              <span className="font-black">{keyLabel}</span> dans le cadre, de près
            </p>
          </div>
        )}

        {failure && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center">
              <Camera className="mx-auto mb-2 h-8 w-8 text-gray-700" aria-hidden="true" />
              <p className="font-bold text-gray-900">
                {failure === "denied" ? "L'accès à la caméra est bloqué" : "La caméra ne s'ouvre pas ici"}
              </p>
              <p className="mb-4 mt-1 text-sm text-gray-600">
                Pas grave : prends ton ticket avec l&apos;appareil photo de ton téléphone.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onNativeCamera}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-red py-3 font-semibold text-white hover:bg-brand-red/85"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" /> Ouvrir l&apos;appareil photo du téléphone
                </button>
                <button
                  type="button"
                  onClick={onGallery}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 font-semibold text-gray-800 hover:bg-gray-200"
                >
                  <Images className="h-4 w-4" aria-hidden="true" /> Choisir dans la galerie
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la caméra"
          // Sous l'encoche : décalage et non padding (un padding écraserait l'icône).
          style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
          className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {!failure && (
        <div className="pb-safe bg-black">
          {dark && (
            <p className="px-6 pt-3 text-center text-sm font-semibold text-amber-300">
              Il fait sombre ? Allume la lampe
            </p>
          )}
          <div className="grid grid-cols-3 items-center px-6 py-5">
            <button
              type="button"
              onClick={onGallery}
              aria-label="Choisir dans la galerie"
              className="flex h-12 w-12 items-center justify-center justify-self-start rounded-full bg-white/15 text-white"
            >
              <Images className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void capture()}
              // L'affiche serait refusée juste après la photo : autant ne pas la prendre.
              disabled={!ready || busy || posterInView}
              aria-label={posterInView ? "Vise ton ticket de caisse, pas l'affiche" : "Prendre la photo"}
              className="h-20 w-20 justify-self-center rounded-full border-4 border-white bg-white/30 transition-transform active:scale-95 disabled:opacity-40"
            />
            {torchAvailable ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-label={torchOn ? "Éteindre la lampe" : "Allumer la lampe"}
                aria-pressed={torchOn}
                className={`flex h-12 w-12 items-center justify-center justify-self-end rounded-full transition-colors ${
                  torchOn
                    ? "bg-amber-300 text-black"
                    : dark
                      ? "bg-white/15 text-amber-300 ring-2 ring-amber-300 animate-pulse"
                      : "bg-white/15 text-white"
                }`}
              >
                {torchOn ? (
                  <Flashlight className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <FlashlightOff className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
