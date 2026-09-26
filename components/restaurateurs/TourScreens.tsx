import { Camera, ChevronRight, Gift, Plus, Send, ShoppingBag, Star, Users } from "lucide-react";

// Écrans de la visite guidée (FeatureTour). Données d'illustration figées.
//
// Établissements IMAGINAIRES (jamais un vrai client), chacun avec sa charte
// côté client, pour montrer que l'app membre et le site de commande portent
// les couleurs de CHAQUE resto, jamais celles de Boosteats (ADR 0063) :
//   - Nonna Ottavia (pizzeria)    → écran fidélité
//   - Kōen Ramen                  → écran équipes
//   - Smashly (burgers, Ixelles)  → site de commande + écrans console
//
// Aucun euro sur les écrans de fidélité (ADR 0007/0028) : points seulement ;
// les prix n'apparaissent que sur la carte du site de commande, et aucun
// ratio points/euros n'y est affiché. Côté console : couleurs Boosteats
// (ADR 0054).

type Brand = { name: string; dark: string; primary: string; onPrimary: string; accent: string; soft: string };

const NONNA: Brand = { name: "Nonna Ottavia", dark: "#4A1621", primary: "#B8322A", onPrimary: "#FFFFFF", accent: "#F2C879", soft: "#E9CFC4" };
const KOEN: Brand = { name: "Kōen Ramen", dark: "#10262B", primary: "#1FA187", onPrimary: "#FFFFFF", accent: "#F4D35E", soft: "#B9D3CE" };
const SMASHLY: Brand = { name: "Smashly", dark: "#141414", primary: "#FFCC00", onPrimary: "#141414", accent: "#FF4F1F", soft: "#BDBDBD" };

function BrandTitle({ brand, italic = false }: { brand: Brand; italic?: boolean }) {
  return (
    <p className={`font-display font-bold text-[15px] tracking-tight m-0 ${italic ? "italic" : ""}`} style={{ color: brand.accent }}>
      {brand.name}
    </p>
  );
}

// Barres d'onglets en bas d'écran, comme dans la vraie app : côté client aux
// couleurs du resto, côté console celles de la vue simple (ADR 0064).
function ClientTabs({ brand, active }: { brand: Brand; active: number }) {
  return (
    <div className="mt-auto border-t border-paper-border bg-white grid grid-cols-4 px-2 pt-2.5 pb-5">
      {["Accueil", "Points", "Équipe", "Profil"].map((t, i) => (
        <span
          key={t}
          className={`text-center text-[10px] ${i === active ? "font-bold" : "text-ink-faint"}`}
          style={i === active ? { color: brand.primary } : undefined}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function ConsoleTabs({ active }: { active: number }) {
  return (
    <div className="mt-auto border-t border-paper-border bg-white grid grid-cols-4 px-2 pt-2.5 pb-5">
      {["Accueil", "Tickets", "Annonces", "Plus"].map((t, i) => (
        <span key={t} className={`text-center text-[10px] ${i === active ? "font-bold text-moss-dark" : "text-ink-faint"}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

/* ---------- 1. Fidélité — côté client ---------- */
export function LoyaltyScreen() {
  const b = NONNA;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-11 pb-5" style={{ background: b.dark }}>
        <BrandTitle brand={b} italic />
        <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase mt-4 mb-1" style={{ color: b.soft }}>
          Ton cadeau t&apos;attend
        </p>
        <p className="font-display text-[20px] font-bold text-white m-0 leading-tight">Tiramisu offert</p>
        <span
          className="inline-block mt-3 text-[11.5px] font-bold rounded-lg px-3 py-2"
          style={{ background: b.primary, color: b.onPrimary }}
        >
          Récupérer au comptoir
        </span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="bg-white border border-paper-border rounded-xl p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-ink">Mes points</span>
            <span className="font-display text-[18px] font-bold" style={{ color: b.primary }}>
              1 240
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-subtle mt-2 overflow-hidden">
            <div className="h-full rounded-full w-[88%]" style={{ background: b.primary }} />
          </div>
          <p className="text-[10.5px] text-ink-faint mt-1.5 mb-0">Plus que 160 points pour une Margherita</p>
        </div>
        <div
          className="rounded-xl py-3.5 flex items-center justify-center gap-2 text-white font-bold text-[13px]"
          style={{ background: b.primary }}
        >
          <Camera className="w-4 h-4" strokeWidth={2.4} />
          Photographier mon ticket
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["Mes tickets", "Mon équipe", "Parrainer"].map((t) => (
            <div key={t} className="bg-white border border-paper-border rounded-lg py-2.5 text-center text-[10.5px] text-ink">
              {t}
            </div>
          ))}
        </div>
      </div>
      <ClientTabs brand={b} active={0} />
    </div>
  );
}

/* ---------- 2. Équipes — classement côté client ---------- */
const TEAMS = [
  { name: "Bureau Louise", members: 11, pts: "7 240" },
  { name: "Étudiants du campus", members: 18, pts: "6 910", mine: true },
  { name: "Salle de sport", members: 9, pts: "5 480" },
  { name: "Taxis de nuit", members: 7, pts: "4 120" },
  { name: "Lycée du quartier", members: 14, pts: "3 760" },
];

export function TeamScreen() {
  const b = KOEN;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-11 pb-4" style={{ background: b.dark }}>
        <BrandTitle brand={b} />
        <p className="font-display text-[17px] font-bold text-white mt-3 mb-0 whitespace-nowrap">Classement des équipes</p>
        <p className="text-[11px] mt-1 mb-0" style={{ color: b.soft }}>
          Septembre · 5 équipes
        </p>
      </div>
      <div className="px-3.5 py-3 flex flex-col gap-1.5">
        {TEAMS.map((t, i) => (
          <div
            key={t.name}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 ${t.mine ? "border-[1.5px]" : "bg-white border border-paper-border"}`}
            style={t.mine ? { borderColor: b.primary, background: "#EAF6F3" } : undefined}
          >
            <span
              className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={i === 0 ? { background: b.accent, color: b.dark } : { background: "#F1EFEA", color: "#555" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink m-0 truncate">{t.name}</p>
              <p className="text-[10px] text-ink-faint m-0">
                {t.members} membres
                {t.mine && (
                  <span className="font-bold" style={{ color: b.primary }}>
                    {" "}· toi
                  </span>
                )}
              </p>
            </div>
            <span className="font-display text-[12.5px] font-bold text-ink whitespace-nowrap">
              {t.pts}
              <span className="text-[9.5px] font-semibold text-ink-faint"> pts</span>
            </span>
          </div>
        ))}
        <div
          className="mt-1.5 rounded-xl py-3 flex items-center justify-center gap-2 text-white font-bold text-[12.5px]"
          style={{ background: "#25D366" }}
        >
          <Users className="w-4 h-4" strokeWidth={2.4} />
          Inviter sur WhatsApp
        </div>
      </div>
      <ClientTabs brand={b} active={2} />
    </div>
  );
}

/* ---------- 3. Site de commande — côté client ---------- */
const MENU = [
  { name: "Double smash", desc: "Deux steaks, cheddar, oignons", price: "11,90 €" },
  { name: "Chicken smash", desc: "Poulet croustillant, sauce maison", price: "10,50 €" },
  { name: "Frites maison", desc: "Sel fumé", price: "3,90 €" },
];

export function OrderSiteScreen() {
  const b = SMASHLY;
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="pt-10 px-3 pb-2 bg-paper-subtle border-b border-paper-border">
        <div className="bg-white rounded-lg text-center text-[10.5px] text-ink-muted py-1.5 border border-paper-border">
          commander.smashly.be
        </div>
      </div>
      <div className="px-4 pt-4 pb-3" style={{ background: b.dark }}>
        <p className="font-display font-bold text-[18px] m-0 tracking-tight" style={{ color: b.primary }}>
          SMASHLY
        </p>
        <p className="text-[11px] m-0 mt-0.5" style={{ color: b.soft }}>
          Ixelles · à emporter · prêt en 15 min
        </p>
      </div>
      <div className="flex gap-1.5 px-4 py-2.5">
        {["Burgers", "Poulet", "Frites", "Boissons"].map((c, i) => (
          <span
            key={c}
            className={`text-[10.5px] rounded-full px-2.5 py-1 ${i === 0 ? "font-semibold" : "bg-paper-subtle text-ink-muted"}`}
            style={i === 0 ? { background: b.primary, color: b.onPrimary } : undefined}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="px-4 flex flex-col">
        {MENU.map((m) => (
          <div key={m.name} className="flex items-center gap-3 py-2.5 border-b border-paper-border">
            <div className="w-12 h-12 shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${b.primary}, ${b.accent})` }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink m-0">{m.name}</p>
              <p className="text-[10.5px] text-ink-faint m-0 truncate">{m.desc}</p>
              <p className="text-[12px] font-bold text-ink m-0 mt-0.5">{m.price}</p>
            </div>
            <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center" style={{ background: b.primary, color: b.onPrimary }}>
              <Plus className="w-4 h-4" strokeWidth={2.6} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto px-3 pb-5 pt-3">
        <p className="text-center text-[10px] text-ink-faint mb-1.5 mt-0">Tu gagnes des points à chaque commande</p>
        <div
          className="rounded-xl py-3 px-4 flex items-center justify-between font-bold text-[12.5px]"
          style={{ background: b.primary, color: b.onPrimary }}
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" strokeWidth={2.4} />
            Commander (2)
          </span>
          <span className="whitespace-nowrap">15,80 €</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. Origine des commandes — console ---------- */
const SOURCES = [
  { label: "Instagram", n: 84, v: "1 932 €", w: "100%" },
  { label: "Google", n: 61, v: "1 403 €", w: "73%" },
  { label: "QR code en salle", n: 47, v: "1 081 €", w: "56%" },
  { label: "WhatsApp", n: 22, v: "506 €", w: "26%" },
];

function ConsoleHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-4 pt-11 pb-3">
      <p className="text-[10.5px] text-ink-faint m-0">Smashly · Ixelles</p>
      <p className="font-display text-[18px] font-bold text-ink m-0 leading-tight">{title}</p>
      <p className="text-[11px] text-ink-muted m-0 mt-0.5">{sub}</p>
    </div>
  );
}

export function SourcesScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="D'où viennent les commandes" sub="Septembre · 214 commandes" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-ink rounded-xl px-3.5 py-3">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-light m-0">Meilleure pub</p>
          <p className="text-white text-[13px] font-semibold m-0 mt-1">Instagram · 84 commandes</p>
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3 flex flex-col gap-3">
          {SOURCES.map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] text-ink">{s.label}</span>
                <span className="text-[11px] text-ink-muted whitespace-nowrap">
                  {s.n} · <span className="font-bold text-ink">{s.v}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-paper-subtle mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-moss" style={{ width: s.w }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConsoleTabs active={3} />
    </div>
  );
}

/* ---------- 5. Google — console ---------- */
const RANKS = [9, 8, 8, 6, 5, 5, 4, 3];
const KEYWORDS = [
  { k: "burger Ixelles", r: "3ᵉ" },
  { k: "smash burger Bruxelles", r: "5ᵉ" },
  { k: "burger près de moi", r: "8ᵉ" },
];

export function GoogleScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Place sur Google" sub="Suivie chaque semaine" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[30px] font-bold text-ink leading-none">3ᵉ</span>
            <span className="text-[11px] font-bold text-moss-dark bg-moss-tint rounded-full px-2 py-0.5">+6 places</span>
          </div>
          <p className="text-[10.5px] text-ink-faint m-0 mt-1">« burger Ixelles » · 2 mois</p>
          <div className="flex items-end gap-1.5 h-16 mt-3">
            {RANKS.map((r, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t ${i === RANKS.length - 1 ? "bg-moss" : "bg-moss-tint"}`}
                style={{ height: `${((10 - r) / 7) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-1.5">
          {KEYWORDS.map((w) => (
            <div key={w.k} className="flex items-center justify-between py-2 border-b border-paper-border last:border-b-0">
              <span className="text-[11.5px] text-ink">{w.k}</span>
              <span className="font-display text-[13px] font-bold text-ink">{w.r}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5 flex items-center gap-2">
          <Star className="w-4 h-4 text-moss-dark" fill="currentColor" />
          <span className="text-[11.5px] text-ink">
            <span className="font-bold">4,6</span> · 12 nouveaux avis ce mois
          </span>
        </div>
      </div>
      <ConsoleTabs active={3} />
    </div>
  );
}

/* ---------- 6. Annonces — console ---------- */
export function MessageScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Nouvelle annonce" sub="Mardi soir, c'est calme" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-ink-faint m-0">Pour</p>
            <p className="text-[12.5px] font-semibold text-ink m-0">Équipe Bureau Louise · 11</p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-faint" />
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
          <p className="text-[10px] text-ink-faint m-0 mb-1">Message</p>
          <p className="text-[12.5px] text-ink m-0 leading-snug">
            Ce mardi soir, les frites sont offertes dès 2 menus 🍟
          </p>
        </div>
        <div className="bg-ink rounded-xl py-3 flex items-center justify-center gap-2 text-white font-bold text-[12.5px]">
          <Send className="w-4 h-4" strokeWidth={2.4} />
          Envoyer mardi à 17 h
        </div>
        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-faint text-center mt-2 mb-0">
          Ce que les clients reçoivent
        </p>
        <div className="rounded-2xl bg-white/90 border border-paper-border shadow-[0_8px_20px_rgba(10,10,10,0.08)] px-3 py-2.5 flex gap-2.5">
          <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ background: SMASHLY.primary, color: SMASHLY.onPrimary }}>
            <Gift className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-ink m-0">Smashly · maintenant</p>
            <p className="text-[11px] text-ink-muted m-0 leading-snug">Ce mardi soir, les frites sont offertes dès 2 menus 🍟</p>
          </div>
        </div>
      </div>
      <ConsoleTabs active={2} />
    </div>
  );
}
