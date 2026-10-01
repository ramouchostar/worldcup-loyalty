"use client";

// ADR 0075 §2 — avec plusieurs établissements, la carte et le format du ticket
// se saisissent une fois et se copient (oui par défaut). `siblings` = les
// AUTRES établissements du restaurateur à qui cette étape manque encore.
export type Sibling = { id: string; name: string; sector: string | null };

export function SameForAll({
  siblings,
  same,
  onChange,
  what,
}: {
  siblings: Sibling[];
  same: boolean;
  onChange: (same: boolean) => void;
  what: "carte" | "caisse";
}) {
  if (siblings.length === 0) return null;
  const n = siblings.length + 1;
  const names = siblings.map((s) => (s.sector ? `${s.name} (${s.sector})` : s.name)).join(", ");
  const opt = "flex gap-3 items-start border rounded-xl p-3 cursor-pointer text-sm";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-gray-900 mb-2">
        {what === "carte" ? "Votre carte" : "Votre caisse"}
      </legend>
      <label className={`${opt} ${same ? "border-brand-red bg-brand-red/5" : "border-gray-200"}`}>
        <input type="radio" checked={same} onChange={() => onChange(true)} className="mt-1" />
        <span>
          <span className="font-semibold text-gray-900 block">
            {what === "carte" ? `La même carte dans mes ${n} établissements` : `La même caisse dans mes ${n} établissements`}
          </span>
          <span className="text-xs text-gray-500">
            Appliquée aussi à {names}. Modifiable ensuite dans chaque console.
          </span>
        </span>
      </label>
      <label className={`${opt} ${!same ? "border-brand-red bg-brand-red/5" : "border-gray-200"}`}>
        <input type="radio" checked={!same} onChange={() => onChange(false)} className="mt-1" />
        <span>
          <span className="font-semibold text-gray-900 block">
            {what === "carte" ? "Une carte différente par établissement" : "Une caisse différente par établissement"}
          </span>
          <span className="text-xs text-gray-500">Vous ferez cette étape pour chacun, à la suite.</span>
        </span>
      </label>
    </fieldset>
  );
}

/** Les champs cachés `copy_to` d'un formulaire, quand « la même » est choisi. */
export function CopyToInputs({ siblings, same }: { siblings: Sibling[]; same: boolean }) {
  if (!same) return null;
  return (
    <>
      {siblings.map((s) => (
        <input key={s.id} type="hidden" name="copy_to" value={s.id} />
      ))}
    </>
  );
}
