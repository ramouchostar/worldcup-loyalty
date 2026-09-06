"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { forceValidateScan } from "./actions";

// Colonne « Actions » de la table des scans : le seul endroit du produit qui
// voit l'image, la lecture OCR et l'encodage final ensemble est aussi le seul
// où l'on peut trancher pour de bon. Trois points → une fenêtre qui montre le
// ticket et laisse corriger le montant avant de valider.
//
// Le menu est en `position: fixed` : la table vit dans un conteneur qui défile
// horizontalement, un menu en absolu y serait rogné.

export type ScanActionTarget = {
  scanId: string;
  memberLabel: string;
  restaurantLabel: string;
  scannedLabel: string;
  imageUrl: string | null;
  ocrAmount: number | null;
  ocrOrderNumber: string | null;
  ocrConfidence: number | null;
  // null = le scan n'a jamais produit de commande.
  orderStatus: string | null;
  orderAmount: number | null;
  orderNumber: string | null;
};

function montantInitial(t: ScanActionTarget): string {
  const n = t.orderAmount ?? t.ocrAmount;
  return n === null || n === undefined ? "" : n.toFixed(2);
}

function Modale({ target, onClose }: { target: ScanActionTarget; onClose: () => void }) {
  const router = useRouter();
  const [montant, setMontant] = useState(() => montantInitial(target));
  const [cle, setCle] = useState(target.orderNumber ?? target.ocrOrderNumber ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const nouvelle = target.orderStatus === null;

  function valider() {
    setErreur(null);
    const n = parseFloat(montant.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErreur("Montant invalide.");
      return;
    }
    startTransition(async () => {
      const res = await forceValidateScan({ scanId: target.scanId, amount: n, orderKey: cle });
      if (!res.ok) {
        setErreur(res.message);
        return;
      }
      // Le message de succès est volontairement perdu avec la fenêtre : la
      // ligne du tableau, elle, dit désormais « Devenu commande ». C'est la
      // preuve, pas un toast.
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {nouvelle ? "Valider ce ticket" : "Corriger et valider la commande"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {target.memberLabel} · {target.restaurantLabel} · scanné le {target.scannedLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        <div className="flex gap-4 px-4 py-4">
          {target.imageUrl ? (
            <a href={target.imageUrl} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={target.imageUrl}
                alt="Ticket de caisse"
                className="h-40 w-28 rounded border border-gray-200 object-cover hover:opacity-80"
              />
            </a>
          ) : (
            <div className="flex h-40 w-28 shrink-0 items-center justify-center rounded border border-dashed border-gray-200 px-2 text-center text-xs text-gray-400">
              image effacée
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label htmlFor="montant" className="block text-xs font-medium text-gray-700">
                Montant du ticket
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="montant"
                  type="text"
                  inputMode="decimal"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="w-32 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm tabular-nums focus:border-gray-900 focus:outline-none"
                  placeholder="0.00"
                />
                <span className="text-sm text-gray-500">€</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Lu par Vision :{" "}
                {target.ocrAmount === null ? (
                  "—"
                ) : (
                  <button
                    type="button"
                    onClick={() => setMontant(target.ocrAmount!.toFixed(2))}
                    className="underline underline-offset-2 hover:text-gray-800"
                  >
                    {target.ocrAmount.toFixed(2)} €
                  </button>
                )}
                {target.ocrConfidence !== null ? ` · confiance ${target.ocrConfidence} %` : ""}
              </p>
            </div>

            <div>
              <label htmlFor="cle" className="block text-xs font-medium text-gray-700">
                Numéro / clé de commande
              </label>
              <input
                id="cle"
                type="text"
                value={cle}
                onChange={(e) => setCle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                placeholder="laisser vide si illisible"
              />
              <p className="mt-1 text-xs text-gray-500">
                C&apos;est la clé anti-doublon. Vide = clé interne rattachée à ce scan : le ticket ne
                pourra plus être renvoyé par un autre chemin.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">
            La validation fait tout ce que fait une validation normale : score d&apos;équipe, CA du
            programme du mois, récompenses (3 couches) et notification au membre. La commande garde la
            trace <code className="rounded bg-gray-100 px-1">platform_forced</code>.
          </p>
          {erreur && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
              {erreur}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={valider}
              disabled={pending}
              className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {pending ? "Validation…" : nouvelle ? "Créer et valider" : "Valider"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScanActions({ target }: { target: ScanActionTarget }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [modale, setModale] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fermer = () => setMenu(null);
    // Le menu est ancré à des coordonnées écran : au moindre défilement il
    // ne pointe plus rien, on le referme plutôt que de le laisser flotter.
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    return () => {
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [menu]);

  const dejaValidee = target.orderStatus === "validated";

  function ouvrirMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (menu ? setMenu(null) : ouvrirMenu())}
        aria-label="Actions sur ce ticket"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            role="menu"
            style={{ top: menu.top, right: menu.right }}
            className="fixed z-50 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {dejaValidee ? (
              <p className="px-3 py-2 text-xs text-gray-500">
                Commande déjà validée — son montant ne se corrige plus ici (le score d&apos;équipe est
                crédité une seule fois, au passage à « validée »).
              </p>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  setModale(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                {target.orderStatus === null ? "Valider ce ticket…" : "Corriger et valider…"}
                <span className="mt-0.5 block text-xs text-gray-500">
                  {target.orderStatus === null
                    ? "Crée la commande au montant que tu confirmes"
                    : "Reprend la commande en attente ou refusée"}
                </span>
              </button>
            )}
            {target.imageUrl && (
              <a
                role="menuitem"
                href={target.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenu(null)}
                className="block px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                Ouvrir l&apos;image
              </a>
            )}
          </div>
        </>
      )}

      {modale && <Modale target={target} onClose={() => setModale(false)} />}
    </>
  );
}
