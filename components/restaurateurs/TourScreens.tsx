import { Camera, ChevronRight, CloudRain, Gift, MessageSquareReply, Send, Star, Trophy, UserMinus } from "lucide-react";

// Écrans de la visite guidée (FeatureTour). Données d'illustration figées.
//
// Établissements IMAGINAIRES (jamais un vrai client). L'app membre porte les
// couleurs de CHAQUE resto, jamais celles de Boosteats (ADR 0063) :
//   - Nonna Ottavia (pizzeria)    → écran fidélité (côté client, tutoyé)
//   - Smashly (burgers, Ixelles)  → écrans console (impersonnels)
//
// ADR 0074 (2026-09-29) : la visite montre un outil marketing — copilote du
// lundi, relance, avis, Google, résultats. Plus d'écran site de commande ni
// équipes. Aucun euro sur l'écran de fidélité (ADR 0007/0028). Côté console :
// couleurs Boosteats (ADR 0054). Jamais « grâce à nous » (ADR 0064) : on
// compare au groupe témoin, on ne revendique pas un chiffre d'affaires.

type Brand = { name: string; dark: string; primary: string; onPrimary: string; accent: string; soft: string };

const NONNA: Brand = { name: "Nonna Ottavia", dark: "#4A1621", primary: "#B8322A", onPrimary: "#FFFFFF", accent: "#F2C879", soft: "#E9CFC4" };
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

function ConsoleHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-4 pt-11 pb-3">
      <p className="text-[10.5px] text-ink-faint m-0">Smashly · Ixelles</p>
      <p className="font-display text-[18px] font-bold text-ink m-0 leading-tight">{title}</p>
      <p className="text-[11px] text-ink-muted m-0 mt-0.5">{sub}</p>
    </div>
  );
}

/* ---------- 2. Copilote du lundi — console ---------- */
const WEEK_ACTIONS = [
  { icon: CloudRain, signal: "Pluie jeudi et vendredi soir", action: "Relancer l'emporter · 140 habitués" },
  { icon: Trophy, signal: "Belgique–France samedi 21 h", action: "Offre menu partagé avant le match" },
  { icon: UserMinus, signal: "38 clients ont décroché", action: "Relance au rythme de chacun" },
];

export function CopilotScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="La semaine" sub="Trois actions prêtes · lundi 6 h" />
      <div className="px-4 flex flex-col gap-2.5">
        {WEEK_ACTIONS.map((a) => (
          <div key={a.signal} className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 shrink-0 rounded-md bg-moss-tint flex items-center justify-center">
                <a.icon className="w-3.5 h-3.5 text-moss-dark" strokeWidth={2.2} />
              </span>
              <p className="text-[10.5px] text-ink-faint m-0">{a.signal}</p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <p className="text-[12px] font-semibold text-ink m-0 leading-tight">{a.action}</p>
              <span className="shrink-0 text-[10.5px] font-bold text-white bg-ink rounded-md px-2.5 py-1.5">Envoyer</span>
            </div>
          </div>
        ))}
        <div className="bg-ink rounded-xl px-3.5 py-3">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-light m-0">Semaine dernière</p>
          <p className="text-white text-[12.5px] font-semibold m-0 mt-1">61 clients revenus après les campagnes</p>
          <p className="text-white/60 text-[10.5px] m-0 mt-0.5">12 dans le groupe non relancé</p>
        </div>
      </div>
      <ConsoleTabs active={0} />
    </div>
  );
}

/* ---------- 3. Relance — console ---------- */
export function RelaunchScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Relance" sub="Ils ont dépassé leur rythme habituel" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-ink-faint m-0">Pour</p>
            <p className="text-[12.5px] font-semibold text-ink m-0">38 clients qui ne sont pas revenus</p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-faint" />
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
          <p className="text-[10px] text-ink-faint m-0 mb-1">Message proposé</p>
          <p className="text-[12.5px] text-ink m-0 leading-snug">
            Ça fait un moment ! Ton double smash t&apos;attend, les frites sont pour nous cette semaine 🍟
          </p>
        </div>
        <div className="bg-ink rounded-xl py-3 flex items-center justify-center gap-2 text-white font-bold text-[12.5px]">
          <Send className="w-4 h-4" strokeWidth={2.4} />
          Envoyer
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
            <p className="text-[11px] text-ink-muted m-0 leading-snug">Ça fait un moment ! Ton double smash t&apos;attend 🍟</p>
          </div>
        </div>
      </div>
      <ConsoleTabs active={2} />
    </div>
  );
}

/* ---------- 4. Avis — console ---------- */
export function ReviewsScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Avis Google" sub="4,6 · 23 nouveaux ce mois · 100 % répondus" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-semibold text-ink m-0">Karim B.</p>
            <span className="flex gap-0.5 text-moss-dark">
              {[0, 1].map((i) => (
                <Star key={i} className="w-3 h-3" fill="currentColor" />
              ))}
              {[2, 3, 4].map((i) => (
                <Star key={i} className="w-3 h-3 text-paper-border" fill="currentColor" />
              ))}
            </span>
          </div>
          <p className="text-[11.5px] text-ink-muted m-0 mt-1 leading-snug">
            Bon burger mais 25 minutes d&apos;attente vendredi soir…
          </p>
        </div>
        <div className="bg-moss-tint rounded-xl px-3.5 py-3">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-dark m-0 flex items-center gap-1.5">
            <MessageSquareReply className="w-3 h-3" /> Réponse proposée
          </p>
          <p className="text-[11.5px] text-ink m-0 mt-1.5 leading-snug">
            Merci Karim, et désolés pour l&apos;attente. Le vendredi soir, une deuxième plaque tourne désormais dès
            19 h. Au plaisir de vous revoir !
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-center text-[11.5px] font-bold text-white bg-ink rounded-lg py-2.5">Publier</span>
          <span className="text-center text-[11.5px] font-semibold text-ink bg-white border border-paper-border rounded-lg py-2.5">
            Modifier
          </span>
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5">
          <p className="text-[10px] text-ink-faint m-0">Ce qui revient dans les avis</p>
          <p className="text-[11.5px] text-ink m-0 mt-0.5">
            <span className="font-semibold">Attente le vendredi soir</span> · 3 avis ce mois
          </p>
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

/* ---------- 6. Résultats — console ---------- */
const RESULTS = [
  { label: "Relance pluie · jeudi", n: "21", ctrl: "4" },
  { label: "Clients qui décrochaient", n: "17", ctrl: "3" },
  { label: "Match Belgique–France", n: "23", ctrl: "5" },
];

export function ResultsScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Ce qu'ont rapporté les campagnes" sub="Septembre · clients revenus" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-ink rounded-xl px-3.5 py-3">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-light m-0">Ce mois-ci</p>
          <p className="text-white text-[13px] font-semibold m-0 mt-1">61 clients revenus après une campagne</p>
          <p className="text-white/60 text-[10.5px] m-0 mt-0.5">contre 12 dans le groupe non relancé</p>
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-1.5">
          {RESULTS.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 py-2 border-b border-paper-border last:border-b-0">
              <span className="text-[11.5px] text-ink">{r.label}</span>
              <span className="text-[11px] text-ink-muted whitespace-nowrap">
                <span className="font-display text-[13px] font-bold text-ink">{r.n}</span> vs {r.ctrl}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5">
          <p className="text-[10px] text-ink-faint m-0">Pub Instagram</p>
          <p className="text-[11.5px] text-ink m-0 mt-0.5">
            <span className="font-bold">84 clients</span> venus au comptoir après la campagne
          </p>
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5 flex items-center gap-2">
          <Star className="w-4 h-4 text-moss-dark" fill="currentColor" />
          <span className="text-[11.5px] text-ink">
            <span className="font-bold">+23 avis</span> · <span className="font-bold">+140</span> abonnés Instagram
          </span>
        </div>
      </div>
      <ConsoleTabs active={0} />
    </div>
  );
}
