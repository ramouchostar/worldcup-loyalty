"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FilterTabs } from "@/components/admin/ui";

// Page QR : deux onglets, l'équipe d'abord (première source d'inscriptions,
// ADR 0053). L'ancre choisit l'onglet — `#equipe` (tâche de l'accueil,
// ADR 0064) ou `#etablissement` — pour que les liens existants restent bons.
type Tab = "equipe" | "etablissement";

export function QrTabs({ teamCount, equipe, etablissement }: { teamCount: number; equipe: ReactNode; etablissement: ReactNode }) {
  const [tab, setTab] = useState<Tab>("equipe");

  useEffect(() => {
    const read = () => setTab(window.location.hash === "#etablissement" ? "etablissement" : "equipe");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function choose(next: Tab) {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  }

  return (
    <div className="space-y-5">
      <FilterTabs
        tabs={[
          { key: "equipe", label: "Mon équipe", count: teamCount },
          { key: "etablissement", label: "QR de l'établissement" },
        ]}
        value={tab}
        onChange={choose}
      />
      <div hidden={tab !== "equipe"}>{equipe}</div>
      <div hidden={tab !== "etablissement"}>{etablissement}</div>
    </div>
  );
}
