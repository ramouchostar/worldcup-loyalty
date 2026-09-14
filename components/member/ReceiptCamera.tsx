"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { RECEIPT_JPEG_QUALITY, RECEIPT_MAX_EDGE } from "@/lib/receipt-image-client";

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
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setReady(false);
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

  async function capture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || busy) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      // Une vraie photo (mise au point, pleine résolution) quand le navigateur
      // le permet — Chrome Android. prepareReceiptImage la réduit ensuite.
      const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      const track = stream.getVideoTracks()[0];
      if (Ctor && track) {
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
          // Cadre de la seule zone qui compte — total + clé de commande
          // (incident 2026-09-02 : les photos du ticket entier à bout de bras
          // étaient illisibles). L'ombre géante assombrit tout le reste.
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8">
            <div className="aspect-[4/3] w-full max-w-xs rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
            <p className="mt-4 text-center text-sm font-semibold text-white drop-shadow">
              Cadre le <span className="font-black">total</span> et le{" "}
              <span className="font-black">{keyLabel}</span>, de près
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
              disabled={!ready || busy}
              aria-label="Prendre la photo"
              className="h-20 w-20 justify-self-center rounded-full border-4 border-white bg-white/30 transition-transform active:scale-95 disabled:opacity-40"
            />
            <span aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
