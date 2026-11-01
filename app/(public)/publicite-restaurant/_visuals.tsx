import Image from "next/image";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Pause, Plus, Send, Store } from "lucide-react";

// Maquettes de la page « Pub de quartier ». Établissement IMAGINAIRE (Smashly,
// burgers à Ixelles, déjà utilisé par la visite guidée de l'accueil). Tous les
// chiffres affichés sont des données d'illustration, présentées comme telles.

const SMASH = { dark: "#141414", yellow: "#FFCC00", orange: "#FF4F1F" };

/** Une publication sponsorisée dans le fil Instagram, vue sur téléphone. */
export function InstagramAdScreen() {
  return (
    <div className="h-full flex flex-col bg-white pt-10 text-ink">
      <div className="flex items-center justify-between px-3 py-2 border-b border-paper-border">
        <span className="font-display font-bold text-[17px] italic tracking-tight">Instagram</span>
        <span className="flex gap-3 text-ink" aria-hidden>
          <Heart className="w-[18px] h-[18px]" />
          <Send className="w-[18px] h-[18px]" />
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-full text-[11px] font-black" style={{ background: SMASH.yellow, color: SMASH.dark }}>
          S
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-[12.5px] font-bold m-0">smashly.ixelles</p>
          <p className="text-[10.5px] text-ink-faint m-0">Sponsorisé</p>
        </div>
        <MoreHorizontal className="w-4 h-4 text-ink-faint" aria-hidden />
      </div>
      {/* Visuel fourni par Mehdi (2026-11-01), cadré en 4:5 comme un post Instagram. */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[#3a1d17]">
        <Image
          src="/marketing/pub-burger-premium.jpg"
          alt="Exemple de pub : burger premium, 25 % de réduction"
          fill
          sizes="300px"
          className="object-cover object-top"
        />
      </div>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: SMASH.yellow }}>
        <span className="text-[12px] font-bold" style={{ color: SMASH.dark }}>Itinéraire</span>
        <span className="text-[14px] font-bold" style={{ color: SMASH.dark }} aria-hidden>›</span>
      </div>
      <div className="flex gap-3.5 px-3 pt-2.5 text-ink" aria-hidden>
        <Heart className="w-[19px] h-[19px]" />
        <MessageCircle className="w-[19px] h-[19px]" />
        <Send className="w-[19px] h-[19px]" />
        <Bookmark className="w-[19px] h-[19px] ml-auto" />
      </div>
      <p className="px-3 pt-1.5 text-[11.5px] leading-snug m-0">
        <span className="font-bold">smashly.ixelles</span> Notre burger premium à −25 % pendant deux semaines. Dites SMASH au comptoir.
      </p>
    </div>
  );
}

/** La zone de diffusion : des cercles autour du restaurant sur un plan de quartier. */
export function RadiusMap() {
  const streets = [
    "M0 90 L400 70", "M0 180 L400 205", "M0 290 L400 270", "M80 0 L110 380", "M210 0 L190 380", "M320 0 L300 380",
    "M0 20 L180 380", "M400 30 L230 380",
  ];
  return (
    <div className="relative rounded-3xl overflow-hidden border border-paper-border bg-[#EEF1E6] shadow-[0_24px_60px_rgba(10,10,10,0.12)]">
      <svg viewBox="0 0 400 380" className="w-full h-auto block" role="img" aria-label="Plan d'un quartier avec trois cercles de diffusion autour du restaurant : 1, 3 et 5 kilomètres">
        <rect width="400" height="380" fill="#EEF1E6" />
        <path d="M250 300 C 300 260, 340 300, 400 280 L400 380 L230 380 Z" fill="#D5E5C3" />
        <path d="M0 0 L70 0 C 60 40, 30 60, 0 70 Z" fill="#D5E5C3" />
        <path d="M-10 330 C 80 300, 120 360, 210 330" stroke="#B9D4EA" strokeWidth="14" fill="none" />
        {streets.map((d) => (
          <path key={d} d={d} stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" />
        ))}
        <circle cx="200" cy="190" r="168" fill="#A2C523" fillOpacity="0.08" stroke="#83A115" strokeOpacity="0.35" strokeDasharray="6 6" strokeWidth="1.5" />
        <circle cx="200" cy="190" r="110" fill="#A2C523" fillOpacity="0.16" stroke="#83A115" strokeWidth="2" />
        <circle cx="200" cy="190" r="42" fill="#A2C523" fillOpacity="0.22" stroke="#83A115" strokeOpacity="0.6" strokeWidth="1.5" />
        <g fontFamily="inherit" fontSize="12" fontWeight="700" fill="#4F5C2D">
          <text x="246" y="186">1 km</text>
          <text x="314" y="150">3 km</text>
          <text x="352" y="70">5 km</text>
        </g>
        <circle cx="200" cy="190" r="15" fill="#141414" />
        <circle cx="200" cy="190" r="6" fill="#FFCC00" />
      </svg>
      <div className="absolute left-4 top-4 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-sm">
        <p className="text-[12px] font-bold text-ink m-0 flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5" aria-hidden /> Votre restaurant
        </p>
        <p className="text-[11.5px] text-ink-muted m-0 mt-0.5">Rayon choisi : 3 km</p>
      </div>
    </div>
  );
}

/** La carte d'estimation affichée avant de payer (fourchette, jamais une promesse). */
export function EstimateCard() {
  return (
    <div className="rounded-3xl bg-white border border-paper-border p-6 shadow-[0_24px_60px_rgba(10,10,10,0.1)]">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint">Votre pub, avant de payer</p>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          ["Budget", "200 €"],
          ["Durée", "14 jours"],
          ["Zone", "3 km"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-paper p-3">
            <p className="text-[11.5px] text-ink-faint m-0">{k}</p>
            <p className="font-display text-[18px] font-bold text-ink m-0 mt-0.5">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-moss-tint p-4">
        <p className="text-[13px] text-moss-dark font-semibold m-0">Personnes du quartier qui peuvent la voir</p>
        <p className="font-display text-[30px] font-bold text-ink m-0 leading-tight mt-1">
          45 000 <span className="text-ink-faint text-[20px]">à</span> 70 000
        </p>
        <p className="text-[12px] text-ink-muted m-0 mt-1">Une fourchette calculée sur des campagnes réelles, pas une promesse.</p>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-[12.5px] text-ink-muted">
          <span>Par jour : environ 14 €</span>
          <span className="font-semibold text-good">Dans le repère 10 à 15 €</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-paper-subtle mt-2 overflow-hidden">
          <div className="absolute inset-y-0 left-[33%] w-[17%] bg-good/25" aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[47%] rounded-full bg-moss" />
        </div>
        <div className="flex justify-between text-[11px] text-ink-faint mt-1">
          <span>5 €</span>
          <span>30 € par jour</span>
        </div>
      </div>
      <p className="text-[11px] text-ink-faint mt-4 m-0">Exemple d&apos;écran, chiffres d&apos;illustration.</p>
    </div>
  );
}

/** Le suivi de la campagne dans l'espace du restaurateur, sur ordinateur. */
export function ConsolePubScreen() {
  return (
    <div className="bg-paper p-5 sm:p-7 text-ink">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint m-0">Pub · Smashly Ixelles</p>
          <p className="font-display text-[20px] font-bold m-0 mt-1">Se faire connaître dans le quartier</p>
        </div>
        <span className="rounded-full bg-good/10 text-good text-[12px] font-bold px-3 py-1">En diffusion</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-[#EFF1E4] p-4">
          <p className="font-display text-[26px] font-bold m-0">38 400</p>
          <p className="text-[12.5px] text-[#4F5C2D] m-0">personnes touchées</p>
        </div>
        <div className="rounded-xl bg-white border border-paper-border p-4">
          <p className="font-display text-[26px] font-bold m-0">9 jours</p>
          <p className="text-[12.5px] text-ink-muted m-0">de diffusion sur 14</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-[13px]">
          <span>
            Dépensé <strong>126 €</strong> sur 200 €
          </span>
          <span className="text-ink-muted">reste 74 €</span>
        </div>
        <div className="h-2.5 rounded-full bg-white border border-paper-border mt-2 overflow-hidden">
          <div className="h-full w-[63%] rounded-full bg-[#6B7C3F]" />
        </div>
        <p className="text-[12px] text-ink-muted mt-1.5 m-0">Au rythme actuel : encore environ 5 jours.</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B7C3F] text-white text-[12.5px] font-bold px-3.5 py-2">
          <Plus className="w-3.5 h-3.5" aria-hidden /> Ajouter du budget
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-paper-border bg-white text-[12.5px] font-bold px-3.5 py-2">
          <Pause className="w-3.5 h-3.5" aria-hidden /> Mettre en pause
        </span>
      </div>
      <div className="mt-5 rounded-xl border border-dashed border-ink/20 bg-white p-3.5">
        <p className="text-[12px] font-bold m-0">Rappel pour l&apos;équipe</p>
        <p className="text-[12.5px] text-ink-muted m-0 mt-0.5">Offre : −25 % sur le burger premium · mot clé : SMASH · du 7 au 21</p>
      </div>
    </div>
  );
}

/** Deux semaines de campagne en période creuse, jour par jour. */
export function CampaignCalendar() {
  const days = Array.from({ length: 16 }, (_, i) => i);
  const label = (i: number) => {
    if (i === 0) return { tag: "Briefing", tone: "bg-ink text-white" };
    if (i === 15) return { tag: "Bilan", tone: "bg-moss text-ink" };
    return { tag: "Diffusion", tone: "bg-moss-tint text-moss-dark" };
  };
  return (
    <div className="rounded-3xl border border-paper-border bg-white p-5 sm:p-6">
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {days.map((i) => {
          const l = label(i);
          return (
            <div key={i} className={`rounded-xl p-2.5 ${l.tone}`}>
              <p className="text-[11px] font-bold opacity-70 m-0">{i === 0 ? "Veille" : i === 15 ? "Après" : `Jour ${i}`}</p>
              <p className="text-[12px] font-semibold m-0 mt-1">{l.tag}</p>
            </div>
          );
        })}
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mt-6">
        <div>
          <p className="font-bold text-[15px] text-ink m-0">La veille</p>
          <p className="font-landing text-[14.5px] leading-[1.6] text-ink-muted m-0 mt-1">
            L&apos;équipe connaît l&apos;offre et le mot clé. Une feuille près de la caisse pour cocher chaque client qui le dit.
          </p>
        </div>
        <div>
          <p className="font-bold text-[15px] text-ink m-0">Pendant deux semaines</p>
          <p className="font-landing text-[14.5px] leading-[1.6] text-ink-muted m-0 mt-1">
            La pub tourne dans le quartier. Vous regardez les personnes touchées et le budget qui reste, depuis votre téléphone.
          </p>
        </div>
        <div>
          <p className="font-bold text-[15px] text-ink m-0">Le lendemain</p>
          <p className="font-landing text-[14.5px] leading-[1.6] text-ink-muted m-0 mt-1">
            Vous comptez les mots clés cochés, vous regardez vos ventes de ces deux semaines face aux deux d&apos;avant, et vous décidez de la suite.
          </p>
        </div>
      </div>
    </div>
  );
}
