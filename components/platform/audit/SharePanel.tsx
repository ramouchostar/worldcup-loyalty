"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { ShareListing } from "@/lib/audit/share";
import s from "./report.module.css";

// ADR 0069 §6 — console : figer une version, copier son lien, l'ouvrir ou
// l'imprimer en PDF, voir si le gérant l'a ouvert, révoquer.

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });

function FreezeButton({ first }: { first: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.cta} disabled={pending}>
      {pending ? "Création du lien…" : first ? "Figer cette version et créer le lien" : "Figer une nouvelle version"}
    </button>
  );
}

function CopyButton({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={s.btnGhost}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copier le lien :", url);
        }
      }}
    >
      {done ? "Copié ✓" : "Copier le lien"}
    </button>
  );
}

export function SharePanel({
  origin,
  shares,
  freeze,
  revoke,
  flash,
  disabled,
}: {
  origin: string;
  shares: ShareListing[] | null;
  freeze: () => void;
  revoke: (shareId: string) => void;
  flash: { kind: "ok" | "echec" | "en_cours"; motif?: string } | null;
  disabled: boolean;
}) {
  const active = (shares ?? []).filter((x) => !x.revokedAt && new Date(x.expiresAt).getTime() > Date.now());
  const latest = active[0] ?? null;
  const older = (shares ?? []).filter((x) => x !== latest);
  return (
    <div id="partage" className={`${s.card} ${s.share} ${s.noPrint}`}>
      <div className={s.bar}>
        <div>
          <span className={s.eyebrow}>Envoyer au gérant</span>
          <h2 style={{ margin: 0, fontSize: 18 }}>Lien du rapport et PDF</h2>
        </div>
        {!disabled && shares !== null && (
          <form action={freeze}>
            <FreezeButton first={!latest} />
          </form>
        )}
      </div>
      {flash?.kind === "echec" && <p className={s.notice}>Lien non créé : {flash.motif ?? "erreur inconnue"}</p>}
      {flash?.kind === "en_cours" && <p className={s.notice}>L&apos;audit est encore en cours : attends la fin de la mesure pour figer une version.</p>}
      {shares === null && <p className={s.notice}>Tables des versions absentes (migration 20260923-2039 non appliquée).</p>}
      {latest ? (
        <>
          <div className={s.shareRow}>
            <span className={s.shareLink} title={origin + latest.path}>{origin.replace(/^https?:\/\//, "") + latest.path}</span>
            <CopyButton url={origin + latest.path} />
            <a className={s.btnGhost} href={latest.path} target="_blank" rel="noreferrer">Ouvrir</a>
            <a className={s.btnGhost} href={`${latest.path}?pdf=1`} target="_blank" rel="noreferrer">Télécharger en PDF</a>
          </div>
          <span className={s.sum} style={{ fontWeight: 500 }}>
            Version {latest.version} du {day(latest.createdAt)} · {latest.views === 0 ? "pas encore ouvert" : `ouvert ${latest.views} fois, dernière fois le ${day(latest.lastViewedAt!)}`} · valable jusqu&apos;au {day(latest.expiresAt)}. Les modifications faites après ne changent pas ce lien : fige une nouvelle version.
          </span>
        </>
      ) : (
        shares !== null && <span className={s.sum} style={{ fontWeight: 500 }}>Le lien montre une version figée du rapport, sans boutons ni détails techniques. Il reste valable 90 jours et se révoque ici.</span>
      )}
      {older.length > 0 && (
        <details>
          <summary className={s.sum}>Liens précédents ({older.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            {older.map((x) => (
              <li key={x.shareId}>
                v{x.version} du {day(x.createdAt)} · {x.views} ouverture{x.views > 1 ? "s" : ""} ·{" "}
                {x.revokedAt ? `révoqué le ${day(x.revokedAt)}` : new Date(x.expiresAt).getTime() < Date.now() ? "expiré" : <a href={x.path} target="_blank" rel="noreferrer">ouvrir</a>}
                {!x.revokedAt && new Date(x.expiresAt).getTime() > Date.now() && (
                  <form action={revoke.bind(null, x.shareId)} style={{ display: "inline" }}>
                    {" · "}
                    <button type="submit" className={s.linkBtn}>révoquer</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {latest && (
        <form action={revoke.bind(null, latest.shareId)}>
          <button type="submit" className={s.linkBtn}>Révoquer ce lien</button>
        </form>
      )}
    </div>
  );
}
