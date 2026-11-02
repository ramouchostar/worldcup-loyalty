import { KRAAINEM_CASE as C, euros } from "@/lib/case-studies";

// Le cas Kraainem (accord du propriétaire du 2026-11-02, lib/case-studies.ts).
// Sans hook : utilisable dans une page serveur comme dans l'accueil (client).
export function CaseStudyBand({ id = "cas-client" }: { id?: string }) {
  const ratio = Math.round((C.before / C.after) * 100);
  return (
    <section id={id} className="bg-ink scroll-mt-16">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16 sm:py-20 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-moss-light">
            Cas client · {C.restaurant} · {C.since}
          </p>
          <h2 className="font-display text-[30px] sm:text-[40px] leading-[1.12] tracking-[-0.025em] font-bold text-white text-pretty mt-3">
            {C.headline}
          </h2>
          <p className="font-landing text-[16.5px] leading-[1.7] text-night-text mt-4">{C.intro}</p>
          <div className="mt-8 space-y-4" aria-label={`Chiffre d'affaires mensuel : ${euros(C.before)} puis ${euros(C.after)}`}>
            <div>
              <div className="flex justify-between text-[13px] text-night-text"><span>Au départ</span><span className="font-bold text-white">{euros(C.before)} / mois</span></div>
              <div className="h-3 rounded-full bg-white/10 mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-white/35" style={{ width: `${ratio}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-[13px] text-night-text"><span>Aujourd&apos;hui</span><span className="font-bold text-moss-light">{euros(C.after)} / mois</span></div>
              <div className="h-3 rounded-full bg-white/10 mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-moss" style={{ width: "100%" }} /></div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-6 sm:p-7">
          <p className="font-display text-[19px] font-bold text-white">Ce qu&apos;on a fait ensemble</p>
          <ol className="mt-5 space-y-4">
            {C.actions.map((a, i) => (
              <li key={a} className="flex gap-3.5">
                <span className="grid place-items-center w-7 h-7 rounded-full bg-moss text-ink text-[13px] font-bold shrink-0">{i + 1}</span>
                <span className="font-landing text-[15px] leading-[1.6] text-white/90 pt-0.5">{a}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
