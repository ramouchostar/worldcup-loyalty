import { Camera, ChevronRight, Gift, MessageSquareReply, Send, Star } from "lucide-react";

// Écrans de la visite guidée (FeatureTour). Données d'illustration figées.
//
// Établissements IMAGINAIRES (jamais un vrai client). L'app membre porte les
// couleurs de CHAQUE resto, jamais celles de Boosteats (ADR 0063) :
//   - Nonna Ottavia (pizzeria)    → écran fidélité (côté client, tutoyé)
//   - Smashly (burgers, Ixelles)  → écrans console (impersonnels)
//
// Remise à plat du 2026-11-02 : seulement des fonctions livrées — fidélité,
// relance, pub de quartier, avis, chiffre du jour (copilote, place sur Google et
// résultats contre groupe témoin retirés, non livrés). Plus d'écran site de
// commande ni équipes. Aucun euro sur l'écran de fidélité (ADR 0007/0028). Côté console :
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

/* ---------- Pub de quartier — côté console (2026-11-02) ---------- */
// Visuel de pub fourni par Mehdi (public/marketing/pub-burger-premium.jpg).
// Chiffres d'illustration ; l'offre et le mot clé suivent la page /publicite-restaurant.
export function PubScreen() {
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Pub de quartier" sub="Du 7 au 21 · 3 km autour de Smashly" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="relative rounded-xl overflow-hidden h-[190px] bg-[#3a1d17]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/pub-burger-premium.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
          <span className="absolute left-2 top-2 rounded-md bg-white/90 text-[9.5px] font-bold text-ink px-2 py-1">Sponsorisé · Instagram</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-paper-border rounded-xl p-3">
            <p className="font-display text-[18px] font-bold text-ink m-0">12 400</p>
            <p className="text-[10px] text-ink-faint m-0">personnes touchées</p>
          </div>
          <div className="bg-white border border-paper-border rounded-xl p-3">
            <p className="font-display text-[18px] font-bold text-ink m-0">96 €</p>
            <p className="text-[10px] text-ink-faint m-0">dépensés sur 200 €</p>
          </div>
        </div>
        <div className="bg-moss-tint rounded-xl p-3">
          <p className="text-[11px] font-bold text-moss-dark m-0">Mot clé au comptoir : SMASH</p>
          <p className="text-[10.5px] text-ink m-0 mt-0.5">−25 % sur le burger premium. Vous comptez qui vient par la pub.</p>
        </div>
      </div>
      <ConsoleTabs active={0} />
    </div>
  );
}

/* ---------- Chiffre du jour — côté console (2026-11-02) ---------- */
export function RevenueScreen() {
  const days = [62, 70, 58, 0, 74, 92, 100, 66, 72, 61, 0, 79, 95, 98];
  return (
    <div className="h-full flex flex-col">
      <ConsoleHeader title="Votre chiffre du jour" sub="Hier, et les jours qui viennent" />
      <div className="px-4 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-xl p-3.5">
          <p className="text-[10.5px] text-ink-faint m-0">Hier, samedi</p>
          <p className="font-display text-[24px] font-bold text-ink m-0 leading-tight">1 240 €</p>
          <p className="text-[10.5px] text-good font-semibold m-0">Au-dessus de vos 4 derniers samedis</p>
          <div className="flex items-end gap-[3px] h-16 mt-3" aria-hidden>
            {days.map((v, i) => (
              <span
                key={i}
                className={`flex-1 rounded-t-[2px] ${v === 0 ? "bg-paper-border" : i === days.length - 2 ? "bg-moss" : "bg-moss/45"}`}
                style={{ height: `${v === 0 ? 8 : v}%` }}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-paper-border rounded-xl p-3">
            <p className="text-[10px] text-ink-faint m-0">Caisse</p>
            <p className="font-display text-[15px] font-bold text-ink m-0">980 €</p>
          </div>
          <div className="bg-white border border-paper-border rounded-xl p-3">
            <p className="text-[10px] text-ink-faint m-0">Plateformes</p>
            <p className="font-display text-[15px] font-bold text-ink m-0">260 €</p>
          </div>
        </div>
        <div className="bg-ink rounded-xl p-3 text-white">
          <p className="text-[10px] text-night-text m-0">Demain, dimanche</p>
          <p className="text-[12px] font-bold m-0 mt-0.5">Entre 900 et 1 100 € · vacances scolaires</p>
        </div>
      </div>
      <ConsoleTabs active={0} />
    </div>
  );
}
