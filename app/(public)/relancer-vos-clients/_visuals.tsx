import { PhoneFrame } from "@/components/restaurateurs/PhoneFrame";

// Maquettes de la page « relancer vos clients ». Établissement IMAGINAIRE
// (Smashly, burgers à Ixelles), jamais un vrai client. Les messages côté
// client ne contiennent aucun euro (ADR 0007/0028).

type Notif = { app?: string; when: string; title: string; body: string };

function NotificationCard({ n, faded = false }: { n: Notif; faded?: boolean }) {
  return (
    <div className={`rounded-[18px] bg-white/80 backdrop-blur-md px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${faded ? "opacity-70 scale-[0.96]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-5 h-5 rounded-md bg-[#141414] text-[#FFCC00] text-[10px] font-black">S</span>
        <span className="text-[10px] font-semibold text-ink/70 uppercase tracking-wide">{n.app ?? "Smashly"}</span>
        <span className="ml-auto text-[10px] text-ink/50">{n.when}</span>
      </div>
      <p className="text-[12px] font-bold text-ink m-0 mt-1.5 leading-snug">{n.title}</p>
      <p className="text-[11.5px] text-ink/80 m-0 mt-0.5 leading-snug">{n.body}</p>
    </div>
  );
}

/** Écran verrouillé couvert de notifications du restaurant. */
export function LockScreen() {
  const notifs: Notif[] = [
    { when: "maintenant", title: "Mardi tranquille chez Smashly 🍔", body: "Ce soir jusqu'à 21 h, tes frites sont offertes avec un Smash. Montre l'app au comptoir." },
    { when: "il y a 3 j", title: "Nouveau : le Smash au cheddar fumé", body: "Il arrive vendredi. Les membres le goûtent en premier." },
    { when: "il y a 9 j", title: "Joyeux anniversaire Inès 🎂", body: "Un cadeau t'attend au comptoir cette semaine." },
  ];
  return (
    <PhoneFrame className="w-[270px] sm:w-[300px]" screenClassName="h-[580px]" statusTone="light">
      <div className="h-full bg-[radial-gradient(120%_80%_at_20%_0%,#5b6b2c_0%,#1d2410_45%,#0c1509_100%)] px-3 pt-14">
        <p className="text-center text-white/80 text-[12px] font-semibold m-0">Mardi 4 novembre</p>
        <p className="text-center text-white font-display text-[62px] font-bold leading-none m-0 mt-1 tracking-tight">18:02</p>
        <div className="mt-8 space-y-2.5">
          {notifs.map((n, i) => (
            <NotificationCard key={n.title} n={n} faded={i > 0} />
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

export type Example = {
  tag: string;
  situation: string;
  title: string;
  body: string;
  when: string;
  who: string;
  tone: string;
};

export const EXAMPLES: Example[] = [
  {
    tag: "Soir calme",
    situation: "Le mardi soir, la salle est à moitié vide.",
    title: "Mardi tranquille chez Smashly",
    body: "Ce soir jusqu'à 21 h, tes frites sont offertes avec un Smash. Montre l'app au comptoir.",
    when: "Mardi, 17 h 30",
    who: "Tous les clients qui acceptent les offres",
    tone: "from-[#FFE9A8] to-[#FFF7DA]",
  },
  {
    tag: "Nouveau plat",
    situation: "Vous lancez un burger et voulez des avis vite.",
    title: "Le Smash au cheddar fumé arrive",
    body: "Il sort vendredi. Les membres le goûtent en premier, dès jeudi soir.",
    when: "Mercredi, 11 h",
    who: "Tous les membres",
    tone: "from-[#FFD9CC] to-[#FFF1EC]",
  },
  {
    tag: "Anniversaire",
    situation: "Il part tout seul, le bon jour, sans que vous y pensiez.",
    title: "Joyeux anniversaire Inès 🎂",
    body: "Un cadeau t'attend au comptoir cette semaine. À très vite chez Smashly.",
    when: "Le jour J, automatiquement",
    who: "Le client concerné",
    tone: "from-[#E3D9FF] to-[#F4F0FF]",
  },
  {
    tag: "Fête",
    situation: "Fin du Ramadan, fête des mères, réveillon : une occasion de partager.",
    title: "Un Family Box pour la fête",
    body: "Ce week-end, commande le Family Box et repars avec les desserts pour toute la table.",
    when: "Deux jours avant",
    who: "Les clients qui acceptent les offres",
    tone: "from-[#D4F0E2] to-[#EEFAF4]",
  },
  {
    tag: "Match",
    situation: "Les Diables jouent à 21 h, vos clients cherchent où manger.",
    title: "Belgique ce soir à 21 h ⚽",
    body: "Commande ton menu avant le coup d'envoi et prends la boisson géante pour le même prix.",
    when: "Le jour du match, 16 h",
    who: "Groupe « Rues / quartiers » ou tous",
    tone: "from-[#D6E6FF] to-[#EEF4FF]",
  },
];

export function MessageCard({ e }: { e: Example }) {
  return (
    <article className={`rounded-3xl bg-gradient-to-br ${e.tone} p-5 h-full flex flex-col border border-black/5`}>
      <span className="self-start rounded-full bg-white/80 px-3 py-1 text-[12px] font-bold text-ink">{e.tag}</span>
      <p className="font-landing text-[14.5px] leading-[1.6] text-ink/80 mt-3">{e.situation}</p>
      <div className="mt-4 rounded-2xl bg-white shadow-[0_10px_24px_rgba(10,10,10,0.08)] p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-6 h-6 rounded-md bg-[#141414] text-[#FFCC00] text-[11px] font-black">S</span>
          <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Smashly</span>
        </div>
        <p className="text-[14px] font-bold text-ink mt-2 m-0">{e.title}</p>
        <p className="text-[13.5px] text-ink/80 mt-1 m-0 leading-snug">{e.body}</p>
      </div>
      <dl className="mt-auto pt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-ink-faint">Quand</dt>
          <dd className="font-semibold text-ink m-0">{e.when}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">À qui</dt>
          <dd className="font-semibold text-ink m-0">{e.who}</dd>
        </div>
      </dl>
    </article>
  );
}

/** Le message de parrainage tel que le client le partage sur WhatsApp. */
export function WhatsAppShare() {
  return (
    <div className="rounded-[28px] bg-[#0b141a] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.3)] max-w-[360px] mx-auto">
      <div className="flex items-center gap-2 pb-3 border-b border-white/10">
        <span className="w-8 h-8 rounded-full bg-[#25D366]/80 grid place-items-center text-white text-[12px] font-bold">Y</span>
        <div>
          <p className="text-white text-[13px] font-semibold m-0">Yassine</p>
          <p className="text-white/50 text-[10.5px] m-0">en ligne</p>
        </div>
      </div>
      <div className="pt-4 space-y-2">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[13px] text-white leading-snug">
          Je mange chez Smashly à Ixelles, ils ont une carte de fidélité sur le téléphone. Inscris-toi avec mon lien, tu as des frites offertes au premier ticket 🍟
          <p className="mt-1.5 mb-0 text-[#53bdeb] underline text-[12px] break-all">boosteats.be/join?ref=YAS42</p>
          <p className="text-right text-[10px] text-white/50 mb-0 mt-1">18:14 ✓✓</p>
        </div>
        <div className="max-w-[60%] rounded-2xl rounded-tl-sm bg-[#202c33] px-3 py-2 text-[13px] text-white">
          Vas-y je teste ce soir
          <p className="text-right text-[10px] text-white/50 mb-0 mt-1">18:16</p>
        </div>
      </div>
    </div>
  );
}

/** Le classement des QR de l'équipe en salle. */
export function StaffBoard() {
  const staff = [
    { name: "Rayan", n: 48, w: "100%" },
    { name: "Clara", n: 35, w: "73%" },
    { name: "Mehmet", n: 22, w: "46%" },
    { name: "Julie", n: 9, w: "19%" },
  ];
  return (
    <div className="rounded-3xl bg-white border border-paper-border p-5 shadow-[0_20px_50px_rgba(10,10,10,0.08)] max-w-[360px] mx-auto w-full">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-faint m-0">Inscriptions par employé · ce mois</p>
      <ul className="mt-4 space-y-3">
        {staff.map((s, i) => (
          <li key={s.name}>
            <div className="flex justify-between text-[14px]">
              <span className="font-semibold text-ink">{i === 0 ? "🥇 " : ""}{s.name}</span>
              <span className="font-bold text-ink tabular-nums">{s.n}</span>
            </div>
            <div className="h-2 rounded-full bg-paper-subtle mt-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-moss" style={{ width: s.w }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
