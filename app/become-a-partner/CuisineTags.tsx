"use client";

import { useState } from "react";
import { CUISINE_MAX, addCuisineTag, suggestCuisineTags } from "@/lib/cuisine-tags";

// Type de cuisine en étiquettes : le champ reste vide, les étiquettes
// choisies s'affichent au-dessus (× pour retirer), et des propositions tirées
// de la fiche Google et du nom s'offrent en un clic. On peut taper la sienne
// (Entrée ou virgule).
export function CuisineTags({
  value,
  onChange,
  name,
  hints,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  name: string;
  hints?: { category: string; types: string[] };
}) {
  const [text, setText] = useState("");
  const full = value.length >= CUISINE_MAX;
  const proposals = full ? [] : suggestCuisineTags({ name, category: hints?.category, types: hints?.types }, value);

  function add(raw: string) {
    onChange(addCuisineTag(value, raw));
    setText("");
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Types de cuisine choisis">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="inline-flex items-center gap-1 bg-brand-red text-white text-xs font-semibold rounded-full pl-3 pr-2 py-1"
                aria-label={`Retirer ${tag}`}
              >
                {tag}
                <span aria-hidden="true" className="text-white/80">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <input
          type="text"
          value={text}
          maxLength={40}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            }
          }}
          onBlur={() => text.trim() && add(text)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
          aria-label="Ajouter un type de cuisine"
        />
      )}
      {proposals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {proposals.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="text-xs font-medium text-gray-700 bg-gray-100 hover:bg-brand-red/10 hover:text-brand-red rounded-full px-3 py-1 transition-colors"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        {full ? `${CUISINE_MAX} types maximum.` : "Touchez une proposition, ou tapez le vôtre puis Entrée."}
      </p>
    </div>
  );
}
