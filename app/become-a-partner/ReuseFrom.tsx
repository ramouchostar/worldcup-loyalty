import type { Sibling } from "./SameForAll";

// ADR 0075 §6 — établissement ajouté plus tard : reprendre la carte ou la
// caisse d'un établissement existant, en un clic. Formulaires serveur.
export function ReuseFrom({
  sources,
  action,
  what,
}: {
  sources: Sibling[];
  action: (sourceId: string) => Promise<void>;
  what: "carte" | "caisse";
}) {
  if (sources.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 space-y-3 mb-5">
      <p className="text-sm font-semibold text-gray-900">
        {what === "carte" ? "La même carte qu'un de vos établissements ?" : "La même caisse qu'un de vos établissements ?"}
      </p>
      <div className="flex flex-col gap-2">
        {sources.map((s) => (
          <form key={s.id} action={action.bind(null, s.id)}>
            <button
              type="submit"
              className="w-full text-left border border-gray-200 hover:border-brand-red rounded-xl px-4 py-3 text-sm"
            >
              <span className="font-semibold text-gray-900">
                {what === "carte" ? "Reprendre la carte de " : "Reprendre la caisse de "}
                {s.name}
              </span>
              {s.sector && <span className="text-gray-500"> · {s.sector}</span>}
            </button>
          </form>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {what === "carte"
          ? "Copiée telle quelle, modifiable ensuite. Sinon, importez une autre carte ci-dessous."
          : "Le format du ticket est repris ; le code propre à cet établissement est lu sur ses tickets. Sinon, envoyez des photos ci-dessous."}
      </p>
    </div>
  );
}
