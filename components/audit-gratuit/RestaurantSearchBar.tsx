"use client";

// ADR 0071 — la barre « Chercher votre restaurant » de la landing : le
// prospect choisit son établissement dans les suggestions Google, puis
// « Audit gratuit » ouvre /audit-gratuit qui lance l'analyse tout de suite.
// Sans choix dans la liste, le texte tapé est repris sur /audit-gratuit.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { track } from "@/lib/analytics";

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

function newSession(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function RestaurantSearchBar({ location }: { location: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const session = useRef("");
  if (!session.current) session.current = newSession();

  useEffect(() => {
    if (picked || q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/audit-gratuit/suggest?q=${encodeURIComponent(q.trim())}&s=${session.current}`, { signal: ctrl.signal });
        if (!res.ok) return setItems([]);
        const j = (await res.json()) as { suggestions?: Suggestion[] };
        setItems(j.suggestions ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* frappe suivante : requête annulée */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, picked]);

  const go = (choice: Suggestion | null) => {
    track("cta_clicked", { cta_id: "audit_gratuit", cta_location: location, audience: "restaurateur" });
    if (choice) {
      const p = new URLSearchParams({ place: choice.placeId, nom: choice.name, adresse: choice.address, s: session.current });
      router.push(`/audit-gratuit?${p}`);
    } else {
      router.push(q.trim() ? `/audit-gratuit?${new URLSearchParams({ q: q.trim() })}` : "/audit-gratuit");
    }
  };

  const choose = (s: Suggestion) => {
    setPicked(s);
    setQ(s.name);
    setOpen(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(picked ?? (open && items[active] ? items[active] : null));
      }}
      className="relative w-full flex flex-col sm:flex-row items-stretch gap-2"
    >
      <div className="relative flex-1">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint pointer-events-none" aria-hidden="true" />
        <label htmlFor={`recherche-${location}`} className="sr-only">
          Chercher votre restaurant
        </label>
        <input
          id={`recherche-${location}`}
          type="text"
          autoComplete="off"
          value={q}
          placeholder="Chercher votre restaurant"
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
            setOpen(true);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`suggestions-${location}`}
          className="w-full h-full min-h-[52px] text-[16px] font-medium text-ink pl-12 pr-4 rounded-xl bg-paper border border-transparent focus:border-moss outline-none"
        />
        {open && items.length > 0 && (
          <ul
            id={`suggestions-${location}`}
            role="listbox"
            className="absolute z-30 left-0 right-0 top-[calc(100%+6px)] bg-white border border-paper-border rounded-xl shadow-[0_14px_34px_rgba(10,10,10,0.14)] overflow-hidden text-left"
          >
            {items.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className={`w-full text-left grid grid-cols-[16px_1fr] gap-2.5 px-4 py-3 border-b border-paper-subtle ${i === active ? "bg-moss-tint" : ""}`}
                >
                  <MapPin className="w-4 h-4 text-moss-dark mt-0.5" aria-hidden="true" />
                  <span>
                    <b className="block text-ink text-sm font-semibold">{s.name}</b>
                    <span className="text-[13px] text-ink-muted">{s.address}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="px-4 py-2 text-[11.5px] text-ink-faint bg-paper">Recherche limitée aux 19 communes de Bruxelles</li>
          </ul>
        )}
      </div>
      <button
        type="submit"
        className="shrink-0 bg-moss hover:bg-moss-dark text-white text-[15px] font-bold px-7 py-3.5 rounded-xl transition-colors"
      >
        Audit gratuit
      </button>
    </form>
  );
}
