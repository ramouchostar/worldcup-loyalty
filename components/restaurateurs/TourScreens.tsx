import { Camera, ChevronRight, Gift, Plus, Send, ShoppingBag, Star, Users } from "lucide-react";

// Écrans de la visite guidée (FeatureTour). Données d'illustration figées,
// établissement fictif Belchicken, comme les autres mockups de la page.
//
// Côté client (fidélité, équipes, site de commande) : couleurs de
// l'établissement (#D93A1E / #F5B32B), jamais la charte Boosteats — l'app
// membre porte la couleur du resto. Aucun euro sur les écrans de fidélité
// (ADR 0007/0028) : points seulement ; les prix n'apparaissent que sur la
// carte du site de commande, et aucun ratio points/euros n'y est affiché.
//
// Côté console : couleurs Boosteats (ADR 0054).

const RED = "#D93A1E";
const GOLD = "#F5B32B";
const DARK = "#1A0F0B";

/* ---------- 1. Fidélité — côté client ---------- */
export function LoyaltyScreen() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-11 pb-5" style={{ background: DARK }}>
        <p className="text-white font-bold text-[13px] tracking-wide m-0">BELCHICKEN</p>
        <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase mt-4 mb-1" style={{ color: GOLD }}>
          Ton cadeau t&apos;attend
        </p>
        <p className="font-display text-[20px] font-bold text-white m-0 leading-tight">Churros offerts</p>
        <span
          className="inline-block mt-3 text-[11.5px] font-bold text-white rounded-lg px-3 py-2"
          style={{ background: RED }}
        >
          Récupérer au comptoir
        </span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="bg-white border border-paper-border rounded-xl p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-ink">Mes points</span>
            <span className="font-display text-[18px] font-bold" style={{ color: RED }}>
              1 240
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-subtle mt-2 overflow-hidden">
            <div className="h-full rounded-full w-[88%]" style={{ background: RED }} />
          </div>
          <p className="text-[10.5px] text-ink-faint mt-1.5 mb-0">Plus que 160 points pour un Finest burger</p>
        </div>
        <div
          className="rounded-xl py-3.5 flex items-center justify-center gap-2 text-white font-bold text-[13px]"
          style={{ background: RED }}
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
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-11 pb-4" style={{ background: DARK }}>
        <p className="text-white font-bold text-[13px] tracking-wide m-0">BELCHICKEN</p>
        <p className="font-display text-[17px] font-bold text-white mt-3 mb-0 whitespace-nowrap">Classement des équipes</p>
        <p className="text-[11px] mt-1 mb-0" style={{ color: "#D9C4B8" }}>
          Septembre · 5 équipes
        </p>
      </div>
      <div className="px-3.5 py-3 flex flex-col gap-1.5">
        {TEAMS.map((t, i) => (
          <div
            key={t.name}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 ${t.mine ? "border-[1.5px]" : "bg-white border border-paper-border"}`}
            style={t.mine ? { borderColor: RED, background: "#FDF1EE" } : undefined}
          >
            <span
              className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={i === 0 ? { background: GOLD, color: DARK } : { background: "#F1EFEA", color: "#555" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink m-0 truncate">{t.name}</p>
              <p className="text-[10px] text-ink-faint m-0">
                {t.members} membres
                {t.mine && (
                  <span className="font-bold" style={{ color: RED }}>
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
          Inviter un collègue sur WhatsApp
        </div>
      </div>
    </div>
  );
}

/* ---------- 3. Site de commande — côté client ---------- */
const MENU = [
  { name: "Finest burger", desc: "Poulet croustillant, cheddar", price: "8,90 €" },
  { name: "Tenders (6)", desc: "Sauce au choix", price: "6,50 €" },
  { name: "Churros (6)", desc: "Sucre cannelle", price: "3,90 €" },
];

export function OrderSiteScreen() {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="pt-10 px-3 pb-2 bg-paper-subtle border-b border-paper-border">
        <div className="bg-white rounded-lg text-center text-[10.5px] text-ink-muted py-1.5 border border-paper-border">
          belchicken-kraainem.be
        </div>
      </div>
      <div className="px-4 pt-4 pb-3" style={{ background: RED }}>
        <p className="text-white font-bold text-[15px] m-0">Belchicken Kraainem</p>
        <p className="text-[11px] m-0 mt-0.5" style={{ color: "#FFE3DC" }}>
          À emporter · prêt en 15 min
        </p>
      </div>
      <div className="flex gap-1.5 px-4 py-2.5">
        {["Burgers", "Tenders", "Desserts", "Boissons"].map((c, i) => (
          <span
            key={c}
            className={`text-[10.5px] rounded-full px-2.5 py-1 ${i === 0 ? "text-white font-semibold" : "bg-paper-subtle text-ink-muted"}`}
            style={i === 0 ? { background: DARK } : undefined}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="px-4 flex flex-col">
        {MENU.map((m) => (
          <div key={m.name} className="flex items-center gap-3 py-2.5 border-b border-paper-border">
            <div className="w-12 h-12 shrink-0 rounded-lg" style={{ background: "linear-gradient(135deg,#F5B32B,#D93A1E)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink m-0">{m.name}</p>
              <p className="text-[10.5px] text-ink-faint m-0">{m.desc}</p>
              <p className="text-[12px] font-bold text-ink m-0 mt-0.5">{m.price}</p>
            </div>
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: RED }}>
              <Plus className="w-4 h-4" strokeWidth={2.6} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto px-3 pb-5 pt-3">
        <p className="text-center text-[10px] text-ink-faint mb-1.5 mt-0">Tu gagnes des points à chaque commande</p>
        <div
          className="rounded-xl py-3 px-4 flex items-center justify-between text-white font-bold text-[12.5px]"
          style={{ background: DARK }}
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" strokeWidth={2.4} />
            Commander (2)
          </span>
          <span className="whitespace-nowrap">12,80 €</span>
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
      <p className="text-[10.5px] text-ink-faint m-0">Belchicken Kraainem</p>
      <p className="font-display text-[18px] font-bold text-ink m-0 leading-tight">{title}</p>
      <p className="text-[11px] text-ink-muted m-0 mt-0.5">{sub}</p>
    </div>
  );
}

export function SourcesScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="D'où viennent tes commandes" sub="Septembre · 214 commandes" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-ink rounded-xl px-3.5 py-3">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-light m-0">Ta meilleure pub</p>
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
    </div>
  );
}

/* ---------- 5. Google — console ---------- */
const RANKS = [9, 8, 8, 6, 5, 5, 4, 3];
const KEYWORDS = [
  { k: "poulet frit Kraainem", r: "3ᵉ" },
  { k: "snack Kraainem", r: "5ᵉ" },
  { k: "fast food près de moi", r: "8ᵉ" },
];

export function GoogleScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Ta place sur Google" sub="Suivie chaque semaine" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[30px] font-bold text-ink leading-none">3ᵉ</span>
            <span className="text-[11px] font-bold text-moss-dark bg-moss-tint rounded-full px-2 py-0.5">+6 places</span>
          </div>
          <p className="text-[10.5px] text-ink-faint m-0 mt-1">« poulet frit Kraainem » · 2 mois</p>
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
            Ce mardi soir, les churros sont offerts dès 2 menus 🍩
          </p>
        </div>
        <div className="bg-ink rounded-xl py-3 flex items-center justify-center gap-2 text-white font-bold text-[12.5px]">
          <Send className="w-4 h-4" strokeWidth={2.4} />
          Envoyer mardi à 17 h
        </div>
        <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-faint text-center mt-2 mb-0">
          Ce que tes clients reçoivent
        </p>
        <div className="rounded-2xl bg-white/90 border border-paper-border shadow-[0_8px_20px_rgba(10,10,10,0.08)] px-3 py-2.5 flex gap-2.5">
          <span className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ background: RED }}>
            <Gift className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-ink m-0">Belchicken · maintenant</p>
            <p className="text-[11px] text-ink-muted m-0 leading-snug">Ce mardi soir, les churros sont offerts dès 2 menus 🍩</p>
          </div>
        </div>
      </div>
    </div>
  );
}
