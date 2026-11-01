import { CalendarDays, CloudRain, Landmark, MapPin, Trophy, Wallet } from "lucide-react";

// Visuels de la page « chiffre du jour ». Données d'ILLUSTRATION figées,
// établissement imaginaire (« Smashly »). Graphiques en SVG/CSS : une seule
// teinte pour le CA (moss), gris hachuré pour les jours fermés, un trait
// fin encre pour la moyenne des mêmes jours. Le texte reste en encre, jamais
// dans la couleur de la série.

const eur = (n: number) => `${n.toLocaleString("fr-BE")} €`;

/* ---------- Saisie du jour, téléphone ---------- */
export function DayEntryScreen() {
  const caisse = [
    ["Carte", 742],
    ["Cash", 286],
    ["Commandes internet", 94],
  ] as const;
  const plateformes = [
    ["Uber Eats", 188],
    ["Deliveroo", 121],
    ["Takeaway", 0],
  ] as const;
  const total = [...caisse, ...plateformes].reduce((s, [, v]) => s + v, 0);
  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-paper-border last:border-0">
      <span className="text-[11.5px] text-ink">{label}</span>
      <span className="text-[11.5px] font-semibold tabular-nums text-ink bg-paper rounded-md px-2 py-0.5 min-w-[64px] text-right">
        {value ? eur(value) : "—"}
      </span>
    </div>
  );
  return (
    <div className="h-full flex flex-col bg-paper">
      <div className="px-4 pt-11 pb-3 bg-white border-b border-paper-border">
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Dimanche 14</p>
        <p className="font-display text-[17px] font-bold text-ink">Le chiffre du jour</p>
      </div>
      <div className="px-3.5 py-3 space-y-2.5">
        <div className="bg-white border border-paper-border rounded-xl px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-moss-dark mb-1">Caisse</p>
          {caisse.map(([l, v]) => <Row key={l} label={l} value={v} />)}
        </div>
        <div className="bg-white border border-paper-border rounded-xl px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-moss-dark mb-1">Plateformes</p>
          {plateformes.map(([l, v]) => <Row key={l} label={l} value={v} />)}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-ink px-3.5 py-2.5">
          <span className="text-[11px] text-night-text">Total, calculé</span>
          <span className="font-display text-[18px] font-bold text-white tabular-nums">{eur(total)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-muted px-1">
          <span>Commandes</span>
          <span className="tabular-nums font-semibold text-ink">96</span>
        </div>
        <div className="rounded-xl bg-moss text-white text-center text-[12.5px] font-bold py-2.5">Enregistrer</div>
      </div>
    </div>
  );
}

/* ---------- 14 jours, barres + moyenne des mêmes jours ---------- */
type Day = { d: string; label: string; v: number | null; usual: number };
const DAYS: Day[] = [
  { d: "Lu", label: "1", v: null, usual: 0 },
  { d: "Ma", label: "2", v: 1480, usual: 1390 },
  { d: "Me", label: "3", v: 1320, usual: 1410 },
  { d: "Je", label: "4", v: 1560, usual: 1500 },
  { d: "Ve", label: "5", v: 2240, usual: 2100 },
  { d: "Sa", label: "6", v: 2610, usual: 2480 },
  { d: "Di", label: "7", v: 1890, usual: 1760 },
  { d: "Lu", label: "8", v: null, usual: 0 },
  { d: "Ma", label: "9", v: 1250, usual: 1390 },
  { d: "Me", label: "10", v: 1470, usual: 1410 },
  { d: "Je", label: "11", v: 1680, usual: 1500 },
  { d: "Ve", label: "12", v: 2390, usual: 2100 },
  { d: "Sa", label: "13", v: 2520, usual: 2480 },
  { d: "Di", label: "14", v: 1431, usual: 1760 },
];

export function FourteenDaysChart() {
  const W = 680, H = 250, padL = 44, padB = 34, padT = 16;
  const max = 3000;
  const bw = (W - padL - 8) / DAYS.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Smashly · 14 derniers jours</p>
          <p className="font-display text-[22px] font-bold text-ink mt-1">21 841 € <span className="text-[13px] font-semibold text-good">+3 % face aux mêmes jours</span></p>
        </div>
        <div className="flex flex-wrap gap-4 text-[11.5px] text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-moss" /> Chiffre noté</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] bg-ink" /> Moyenne des 4 mêmes jours</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[repeating-linear-gradient(45deg,#d9d9d4_0_2px,#f4f4f0_2px_5px)]" /> Fermé</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-4" role="img" aria-label="Chiffre d'affaires jour par jour sur 14 jours, comparé à la moyenne des mêmes jours de la semaine (illustration)">
        <defs>
          <pattern id="ferme" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#f4f4f0" />
            <rect width="2" height="6" fill="#d9d9d4" />
          </pattern>
        </defs>
        {[0, 1000, 2000, 3000].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#E2E2DC" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#8a8a84">{t === 0 ? "0" : `${t / 1000} k€`}</text>
          </g>
        ))}
        {DAYS.map((day, i) => {
          const x = padL + i * bw + 3;
          const w = bw - 6;
          return (
            <g key={i}>
              {day.v === null ? (
                <rect x={x} y={y(600)} width={w} height={y(0) - y(600)} rx={4} fill="url(#ferme)" />
              ) : (
                <>
                  <rect x={x} y={y(day.v)} width={w} height={y(0) - y(day.v)} rx={4} fill={i === DAYS.length - 1 ? "#83A115" : "#A2C523"}>
                    <title>{`${day.d} ${day.label} : ${eur(day.v)} (moyenne des mêmes jours ${eur(day.usual)})`}</title>
                  </rect>
                  <line x1={x - 2} x2={x + w + 2} y1={y(day.usual)} y2={y(day.usual)} stroke="#0A0A0A" strokeWidth={2} strokeLinecap="round" />
                </>
              )}
              <text x={x + w / 2} y={H - 18} textAnchor="middle" fontSize="10.5" fill="#5c5c57">{day.d}</text>
              <text x={x + w / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="#8a8a84">{day.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <MiniStat label="Hier, dimanche 14" value="1 431 €" note="−19 % face aux 4 derniers dimanches" tone="down" />
        <MiniStat label="Ticket moyen" value="14,90 €" note="96 commandes" />
        <MiniStat label="Semaine jusqu'à hier" value="10 741 €" note="−3 % face à la semaine d'avant" tone="down" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-paper-border bg-paper px-3.5 py-3">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="font-display text-[19px] font-bold text-ink tabular-nums">{value}</p>
      <p className={`text-[11.5px] font-semibold ${tone === "up" ? "text-good" : tone === "down" ? "text-danger" : "text-ink-muted"}`}>{note}</p>
    </div>
  );
}

/* ---------- Part du CA venue des clients du programme ---------- */
export function ProgramShare() {
  const total = 1431, program = 344, cash = 96, progTickets = 21;
  const pct = Math.round((program / total) * 100);
  const capture = Math.round((progTickets / cash) * 100);
  return (
    <div className="rounded-3xl bg-white border border-paper-border p-6 sm:p-8 shadow-[0_20px_60px_rgba(10,10,10,0.06)]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Dimanche 14 · illustration</p>
      <div className="mt-4 h-14 rounded-2xl overflow-hidden flex gap-[2px] bg-white">
        <div className="bg-moss-dark flex items-center px-4 text-white text-[13px] font-bold" style={{ width: `${pct}%` }}>{pct} %</div>
        <div className="bg-moss-tint2 flex-1 flex items-center px-4 text-ink text-[13px] font-semibold">Autres clients</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5 mt-6">
        <div>
          <p className="font-display text-[30px] font-bold text-ink tabular-nums">{eur(program)}</p>
          <p className="font-landing text-[14.5px] text-ink-muted leading-relaxed">sur {eur(total)} viennent de vos clients inscrits, ceux que vous pouvez recontacter.</p>
        </div>
        <div>
          <p className="font-display text-[30px] font-bold text-ink tabular-nums">{capture} %</p>
          <p className="font-landing text-[14.5px] text-ink-muted leading-relaxed">des tickets de caisse sont passés par le programme ({progTickets} sur {cash}). C&apos;est votre taux de capture.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Ce qui s'est passé un jour inhabituel ---------- */
export function DayReasonsCard() {
  const facts = [
    { icon: CloudRain, text: "Soir : pluie, 6 mm" },
    { icon: Trophy, text: "Match de foot à 20 h 45" },
    { icon: MapPin, text: "Concert à 1,2 km, grande salle" },
    { icon: CalendarDays, text: "Vacances de Toussaint (Fédération Wallonie-Bruxelles)" },
  ];
  return (
    <div className="rounded-3xl bg-ink p-6 sm:p-7 text-white">
      <p className="text-[11px] uppercase tracking-[0.12em] text-night-faint">Dimanche 14 · −19 % face aux 4 derniers dimanches</p>
      <p className="font-display text-[22px] font-bold mt-2">Ce jour-là</p>
      <ul className="mt-4 space-y-3">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-[15px]">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/10"><Icon className="w-[18px] h-[18px] text-moss-light" aria-hidden /></span>
            {text}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-night-text mt-5 leading-relaxed">Des faits, pas de conclusion à votre place : vous faites le lien avec ce que vous avez vu en salle.</p>
    </div>
  );
}

/* ---------- Prévisions : fourchette + repères du calendrier ---------- */
const FORECAST = [
  { d: "Lu 15", closed: true, low: 0, exp: 0, high: 0, tag: null as null | { icon: typeof Wallet; label: string } },
  { d: "Ma 16", closed: false, low: 1240, exp: 1380, high: 1520, tag: null },
  { d: "Me 17", closed: false, low: 1280, exp: 1430, high: 1590, tag: null },
  { d: "Je 18", closed: false, low: 1350, exp: 1510, high: 1680, tag: null },
  { d: "Ve 19", closed: false, low: 1960, exp: 2180, high: 2400, tag: null },
  { d: "Sa 20", closed: false, low: 2480, exp: 2760, high: 3020, tag: { icon: CalendarDays, label: "Vacances" } },
  { d: "Di 21", closed: false, low: 1900, exp: 2120, high: 2350, tag: { icon: CalendarDays, label: "Vacances" } },
  { d: "Lu 22", closed: true, low: 0, exp: 0, high: 0, tag: null },
  { d: "Ma 23", closed: false, low: 1180, exp: 1320, high: 1470, tag: { icon: Landmark, label: "Jour férié" } },
  { d: "Me 24", closed: false, low: 1290, exp: 1450, high: 1600, tag: null },
  { d: "Je 25", closed: false, low: 1340, exp: 1490, high: 1650, tag: null },
  { d: "Ve 26", closed: false, low: 2110, exp: 2340, high: 2580, tag: { icon: Wallet, label: "Paye" } },
];

export function ForecastChart() {
  const W = 680, H = 270, padL = 44, padB = 30, padT = 46;
  const max = 3200;
  const bw = (W - padL - 8) / FORECAST.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Prévision de chiffre d'affaires sur 12 jours, en fourchette, avec vacances, jour férié et jour de paye signalés (illustration)">
      {[0, 1000, 2000, 3000].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#2A2A2A" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#6E6E68">{t === 0 ? "0" : `${t / 1000} k€`}</text>
        </g>
      ))}
      {FORECAST.map((f, i) => {
        const cx = padL + i * bw + bw / 2;
        return (
          <g key={f.d}>
            {f.closed ? (
              <text x={cx} y={y(300)} textAnchor="middle" fontSize="10" fill="#6E6E68">fermé</text>
            ) : (
              <>
                <rect x={cx - 9} y={y(f.high)} width={18} height={y(f.low) - y(f.high)} rx={9} fill="#A2C523" opacity={0.28} />
                <circle cx={cx} cy={y(f.exp)} r={5} fill="#B8D953" stroke="#0A0A0A" strokeWidth={2}>
                  <title>{`${f.d} : environ ${eur(f.exp)} (entre ${eur(f.low)} et ${eur(f.high)})`}</title>
                </circle>
              </>
            )}
            {f.tag && (
              <g transform={`translate(${cx - 11}, 6)`}>
                <rect width={22} height={22} rx={7} fill="#1F1F1F" stroke="#2A2A2A" />
                <f.tag.icon x={4} y={4} width={14} height={14} color="#B8D953" aria-hidden />
              </g>
            )}
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill="#B8B8B0">{f.d}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Jeu de la croissance : paliers ---------- */
export function GrowthSteps() {
  const steps = [
    { v: 350, label: "Départ", note: "28 premiers jours notés" },
    { v: 370, label: "Palier 1" },
    { v: 390, label: "Palier 2" },
    { v: 410, label: "Palier 3" },
    { v: 430, label: "Palier 4" },
    { v: 450, label: "Le cap" },
  ];
  return (
    <div className="flex items-end gap-2 sm:gap-3 h-[220px]">
      {steps.map((s, i) => (
        <div key={s.label} className="flex-1 flex flex-col items-center justify-end h-full">
          <p className="font-display text-[15px] sm:text-[18px] font-bold text-ink tabular-nums">{s.v} €</p>
          <div
            className={`w-full rounded-t-xl mt-1.5 ${i === 0 ? "bg-paper-border" : i <= 2 ? "bg-moss" : "bg-moss-tint2"}`}
            style={{ height: `${40 + i * 28}px` }}
          />
          <p className="text-[11.5px] font-semibold text-ink mt-2 text-center">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
