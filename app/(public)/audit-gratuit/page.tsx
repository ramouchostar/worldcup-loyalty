import { Header } from "@/components/restaurateurs/Header";
import { Footer } from "@/components/restaurateurs/Footer";
import { AuditGratuit } from "@/components/audit-gratuit/AuditGratuit";

// ADR 0071 — l'audit gratuit, appel à l'action principal de la landing
// restaurateurs : l'établissement, l'analyse en direct, la note, puis le
// numéro WhatsApp qui débloque le rapport complet (ADR 0069).
export const metadata = {
  title: "Audit gratuit de votre établissement",
  description:
    "Fiche Google, avis, concurrents à 600 m, site et mobile : une note sur 100 en moins d'une minute, puis le rapport complet et cinq priorités sur WhatsApp.",
};

export default function AuditGratuitPage() {
  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <AuditGratuit />
      </main>
      <Footer />
    </div>
  );
}
