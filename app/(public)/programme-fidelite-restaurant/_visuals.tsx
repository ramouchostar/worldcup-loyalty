import { Camera, Check, Gift, QrCode, ScanLine, Star, Ticket, TrendingUp, Users } from "lucide-react";
import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";
import { LaptopFrame } from "@/components/marketing/kit";

// Maquettes de la page « programme de fidélité ». Établissement IMAGINAIRE
// (Smashly, burgers) : jamais un vrai client. Côté client, aux couleurs du resto
// et sans aucun euro (ADR 0007/0028), sauf les 10 € du retrait d'un cadeau.
// Côté console, couleurs Boosteats.

const B = { dark: "#141414", primary: "#FFCC00", onPrimary: "#141414", accent: "#FF4F1F", soft: "#BDBDBD" };

function AppTop({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="px-4 pt-11 pb-4" style={{ background: B.dark }}>
      <p className="font-display font-bold text-[14px] tracking-tight m-0" style={{ color: B.primary }}>Smashly</p>
      {kicker && <p className="font-mono text-[9px] tracking-[0.12em] uppercase mt-3 mb-1" style={{ color: B.soft }}>{kicker}</p>}
      <p className="font-display text-[17px] font-bold text-white m-0 leading-tight">{title}</p>
    </div>
  );
}

/* ---------- Les quatre écrans du parcours client ---------- */

export function ScreenJoin() {
  return (
    <div className="h-full flex flex-col">
      <AppTop kicker="Bienvenue" title="Ton cadeau de bienvenue t'attend" />
      <div className="px-4 py-4 space-y-3">
        <div className="rounded-xl bg-white border border-paper-border p-3 flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-lg" style={{ background: B.primary }}>
            <Gift className="w-5 h-5" style={{ color: B.onPrimary }} />
          </span>
          <div>
            <p className="text-[12px] font-bold text-ink m-0">Frites offertes</p>
            <p className="text-[10px] text-ink-faint m-0">Dès ton premier ticket</p>
          </div>
        </div>
        {["Ton prénom", "Ton e-mail"].map((f) => (
          <div key={f} className="rounded-lg border border-paper-border bg-white px-3 py-2.5 text-[11px] text-ink-faint">{f}</div>
        ))}
        <div className="rounded-xl py-3 text-center font-bold text-[12.5px]" style={{ background: B.primary, color: B.onPrimary }}>
          Je m&apos;inscris
        </div>
        <p className="text-[9.5px] text-ink-faint text-center m-0">Sans application à télécharger</p>
      </div>
    </div>
  );
}

export function ScreenTicket() {
  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      <div className="pt-11 px-4 text-center">
        <p className="text-[11px] font-semibold text-white/80 m-0">Prends ton ticket en photo</p>
      </div>
      <div className="relative mx-6 mt-5 rounded-lg bg-[#f7f5ef] shadow-[0_10px_30px_rgba(0,0,0,0.5)] px-3 py-3 rotate-[-2deg]">
        <p className="text-center font-mono text-[9px] font-bold m-0">SMASHLY IXELLES</p>
        <div className="mt-2 space-y-1 font-mono text-[8.5px] text-ink">
          <div className="flex justify-between"><span>1 Smash double</span><span>11,90</span></div>
          <div className="flex justify-between"><span>1 Frites</span><span>3,50</span></div>
          <div className="flex justify-between"><span>1 Boisson</span><span>2,80</span></div>
          <div className="border-t border-dashed border-ink/30 pt-1 flex justify-between font-bold"><span>TOTAL</span><span>18,20</span></div>
        </div>
        <span className="absolute -inset-2 border-2 border-moss rounded-xl" aria-hidden />
        {(["top-[-10px] left-[-10px] border-t-4 border-l-4", "top-[-10px] right-[-10px] border-t-4 border-r-4", "bottom-[-10px] left-[-10px] border-b-4 border-l-4", "bottom-[-10px] right-[-10px] border-b-4 border-r-4"] as const).map((c) => (
          <span key={c} className={`absolute w-4 h-4 border-moss ${c} rounded-[3px]`} aria-hidden />
        ))}
      </div>
      <div className="mt-auto pb-6 flex flex-col items-center gap-2">
        <span className="grid place-items-center w-14 h-14 rounded-full border-4 border-white/90">
          <span className="w-10 h-10 rounded-full bg-white" />
        </span>
        <p className="text-[9.5px] text-white/60 m-0">Le ticket est lu tout seul</p>
      </div>
    </div>
  );
}

export function ScreenPoints() {
  const items = [
    { name: "Boisson", pts: 75, ok: true },
    { name: "Frites", pts: 60, ok: true },
    { name: "Smash simple", pts: 240, ok: false },
  ];
  return (
    <div className="h-full flex flex-col">
      <AppTop kicker="Mes points" title="+182 points" />
      <div className="px-4 py-3 space-y-2.5">
        <div className="rounded-xl bg-white border border-paper-border p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-ink">Solde</span>
            <span className="font-display text-[17px] font-bold text-ink">212</span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-subtle mt-2 overflow-hidden">
            <div className="h-full rounded-full w-[88%]" style={{ background: B.primary }} />
          </div>
          <p className="text-[9.5px] text-ink-faint mt-1.5 mb-0">Plus que 28 points pour un Smash simple</p>
        </div>
        {items.map((i) => (
          <div key={i.name} className="rounded-lg bg-white border border-paper-border px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink">{i.name}</span>
            <span
              className="text-[10px] font-bold rounded-md px-2 py-1"
              style={i.ok ? { background: B.primary, color: B.onPrimary } : { background: "#EFEFEA", color: "#6E6E68" }}
            >
              {i.ok ? `Choisir · ${i.pts}` : `${i.pts} pts`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScreenCoupon() {
  return (
    <div className="h-full flex flex-col">
      <AppTop kicker="Au comptoir" title="Boisson offerte" />
      <div className="px-4 py-4 flex flex-col items-center">
        <div className="w-full rounded-2xl bg-white border border-paper-border p-4 text-center shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ink-faint m-0">Montre cet écran au comptoir</p>
          <p className="font-display text-[34px] font-bold text-ink m-0 mt-1 tabular-nums">09:42</p>
          <p className="text-[10px] text-ink-faint m-0">Le coupon expire dans 10 minutes</p>
          <div className="mt-3 h-1.5 rounded-full bg-paper-subtle overflow-hidden">
            <div className="h-full w-[96%] rounded-full" style={{ background: B.accent }} />
          </div>
          <p className="text-[9.5px] text-ink-muted mt-3 mb-0">Valable pour une commande d&apos;au moins 10 €</p>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-good font-semibold">
          <Check className="w-3.5 h-3.5" /> Le caissier valide d&apos;un geste
        </div>
      </div>
    </div>
  );
}

/* ---------- La console du restaurateur ---------- */

export function ConsoleDashboard() {
  const tickets = [
    { who: "Inès", when: "12:41", pts: "+182" },
    { who: "Yassine", when: "12:37", pts: "+96" },
    { who: "Lucas", when: "12:20", pts: "+144" },
    { who: "Sarah", when: "11:58", pts: "+121" },
  ];
  return (
    <div className="grid grid-cols-[150px_1fr] min-h-[380px] text-ink">
      <aside className="bg-ink text-night-text px-3 py-4 space-y-1 text-[11px]">
        <p className="text-white font-bold text-[12px] mb-3">Smashly · Ixelles</p>
        {["Accueil", "Tickets", "Mes clients", "Cadeaux", "Menu & coûts", "Annonces", "QR code"].map((n, i) => (
          <p key={n} className={`rounded-md px-2 py-1.5 m-0 ${i === 0 ? "bg-white/10 text-white font-semibold" : ""}`}>{n}</p>
        ))}
      </aside>
      <div className="bg-paper p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Clients inscrits", v: "412", sub: "+23 cette semaine", Icon: Users },
            { label: "Tickets reçus", v: "96", sub: "cette semaine", Icon: Ticket },
            { label: "Cadeaux remis", v: "31", sub: "cette semaine", Icon: Gift },
          ].map(({ label, v, sub, Icon }) => (
            <div key={label} className="rounded-xl bg-white border border-paper-border p-3">
              <p className="flex items-center gap-1.5 text-[10px] text-ink-muted m-0"><Icon className="w-3 h-3" /> {label}</p>
              <p className="font-display text-[22px] font-bold m-0 mt-1 tabular-nums">{v}</p>
              <p className="text-[9.5px] text-good font-semibold m-0">{sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
          <div className="rounded-xl bg-white border border-paper-border p-3">
            <p className="text-[11px] font-bold m-0 mb-2">Derniers tickets</p>
            {tickets.map((t) => (
              <div key={t.who} className="flex items-center justify-between py-1.5 border-t border-paper-border first:border-t-0 text-[10.5px]">
                <span className="flex items-center gap-2">
                  <span className="grid place-items-center w-5 h-5 rounded-full bg-moss-tint text-moss-dark text-[9px] font-bold">{t.who[0]}</span>
                  {t.who}
                </span>
                <span className="text-ink-faint">{t.when}</span>
                <span className="font-semibold text-good">{t.pts} pts</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white border border-paper-border p-3">
            <p className="text-[11px] font-bold m-0">Taux cadeaux</p>
            <p className="font-display text-[26px] font-bold m-0 mt-1">8 %</p>
            <div className="relative h-1.5 rounded-full bg-paper-subtle mt-2">
              <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-moss" />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-moss-dark" />
            </div>
            <div className="flex justify-between text-[9px] text-ink-faint mt-1"><span>4 %</span><span>12 %</span></div>
            <p className="text-[9.5px] text-ink-muted mt-2 mb-0">Chaque cadeau est mis à prix d&apos;après son prix de revient.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Héros : l'ordinateur du restaurateur, le téléphone du client devant. */
export function HeroComposite() {
  return (
    <div className="relative pt-6 pb-10">
      <div className="absolute inset-x-6 top-10 bottom-0 rounded-[40px] bg-gradient-to-br from-moss-tint via-white to-moss-tint2 blur-0" aria-hidden />
      <div className="relative pr-0 lg:pr-24">
        <LaptopFrame url="boosteats.be/admin/smashly">
          <ConsoleDashboard />
        </LaptopFrame>
      </div>
      <div className="absolute right-0 sm:right-2 bottom-0 hidden sm:block">
        <PhoneFrame className="w-[190px]" screenClassName="h-[390px]" statusTone="light">
          <ScreenPoints />
        </PhoneFrame>
      </div>
      <span className="hidden md:flex absolute left-0 bottom-16 items-center gap-2 rounded-full bg-white shadow-[0_10px_30px_rgba(10,10,10,0.12)] border border-paper-border px-3.5 py-2 text-[12.5px] font-semibold text-ink">
        <ScanLine className="w-4 h-4 text-moss-dark" /> Ticket lu, 182 points crédités
      </span>
      <span className="hidden md:flex absolute right-44 top-0 items-center gap-2 rounded-full bg-ink text-white shadow-[0_10px_30px_rgba(10,10,10,0.2)] px-3.5 py-2 text-[12.5px] font-semibold">
        <TrendingUp className="w-4 h-4 text-moss-light" /> +23 clients inscrits cette semaine
      </span>
    </div>
  );
}

export const JOURNEY = [
  { n: 1, Icon: QrCode, title: "Il scanne le QR au comptoir", body: "Une affiche près de la caisse. Il s'inscrit en quelques secondes, depuis son téléphone, sans rien télécharger.", Screen: ScreenJoin },
  { n: 2, Icon: Camera, title: "Il prend son ticket en photo", body: "Le ticket que votre caisse imprime déjà. Chaque euro dépensé lui donne 10 points.", Screen: ScreenTicket },
  { n: 3, Icon: Star, title: "Il choisit son cadeau", body: "Un catalogue tiré de votre carte. Il voit ce qu'il peut déjà prendre et ce qui lui manque.", Screen: ScreenPoints },
  { n: 4, Icon: Gift, title: "Il revient le chercher", body: "Le cadeau s'ouvre quelques heures après le ticket : il revient pour le récupérer, avec une nouvelle commande.", Screen: ScreenCoupon },
] as const;
