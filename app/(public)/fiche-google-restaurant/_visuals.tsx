import { Clock, Globe, MapPin, Navigation, Phone, Share2, ShoppingBag, Star } from "lucide-react";

// Maquettes de la page « Fiche Google ». Établissement IMAGINAIRE (Trattoria
// Sole, Ixelles), numéro et avis fictifs. Le logo Google est recréé en lettres
// de couleur pour illustrer de quoi on parle ; mention de marque sous la maquette.

const G = { blue: "#4285F4", red: "#EA4335", yellow: "#FBBC05", green: "#34A853" };

export function GoogleWordmark({ className = "text-[28px]" }: { className?: string }) {
  const letters: [string, string][] = [
    ["G", G.blue],
    ["o", G.red],
    ["o", G.yellow],
    ["g", G.blue],
    ["l", G.green],
    ["e", G.red],
  ];
  return (
    <span className={`font-sans font-semibold tracking-[-0.02em] ${className}`} aria-label="Google">
      {letters.map(([l, c], i) => (
        <span key={i} style={{ color: c }} aria-hidden>
          {l}
        </span>
      ))}
    </span>
  );
}

function Marker({ n, className }: { n: number; className: string }) {
  return (
    <span
      className={`absolute z-10 grid place-items-center w-7 h-7 rounded-full bg-ink text-moss-light text-[12.5px] font-bold ring-4 ring-moss/40 ${className}`}
      aria-hidden
    >
      {n}
    </span>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className="w-3.5 h-3.5" fill={i < Math.round(value) ? "#FBBC05" : "none"} stroke="#FBBC05" />
      ))}
    </span>
  );
}

export const PROFILE_ANNOTATIONS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "Les photos", body: "La première chose qu'on regarde. Une façade reconnaissable, la salle, vos plats phares, à la lumière du jour." },
  { n: 2, title: "La note et le nombre d'avis", body: "4,6 sur 412 avis inspire plus confiance que 4,9 sur 11. Le volume et la fraîcheur des avis comptent." },
  { n: 3, title: "La catégorie", body: "Elle décide des recherches où vous apparaissez. « Restaurant italien » plutôt que « Restaurant »." },
  { n: 4, title: "Les boutons", body: "Itinéraire, Appeler, Site, Commander : chaque bouton vide est un client qui part chez le voisin." },
  { n: 5, title: "Les horaires", body: "« Ouvert · Ferme à 22:30 ». Des horaires faux un jour férié, et la confiance tombe pour longtemps." },
  { n: 6, title: "Les réponses aux avis", body: "Les futurs clients lisent vos réponses autant que les avis. Une réponse calme à un avis dur rassure." },
];

/** Une fiche d'établissement Google, telle qu'elle s'affiche dans Google Maps. */
export function GoogleProfileMock() {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <Marker n={1} className="-left-3 top-[70px]" />
      <Marker n={2} className="-right-3 top-[214px]" />
      <Marker n={3} className="-left-3 top-[246px]" />
      <Marker n={4} className="-right-3 top-[300px]" />
      <Marker n={5} className="-left-3 top-[402px]" />
      <Marker n={6} className="-right-3 top-[560px]" />
      <div className="rounded-[22px] bg-white shadow-[0_30px_80px_rgba(10,10,10,0.18)] ring-1 ring-black/5 overflow-hidden font-sans text-[#202124]">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#e8eaed]">
          <GoogleWordmark className="text-[18px]" />
          <span className="flex-1 rounded-full bg-[#f1f3f4] text-[12px] text-[#5f6368] px-3 py-1.5 truncate">trattoria ixelles</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr] gap-0.5 h-[150px]">
          <div className="bg-[linear-gradient(135deg,#C0392B,#7B241C_55%,#2C1810)] relative">
            <span className="absolute bottom-2 left-2 rounded bg-black/55 text-white text-[10px] px-1.5 py-0.5">Voir les photos (86)</span>
          </div>
          <div className="grid grid-rows-2 gap-0.5">
            <div className="bg-[linear-gradient(135deg,#F4D03F,#B9770E)]" />
            <div className="bg-[linear-gradient(135deg,#7DCEA0,#1E8449)]" />
          </div>
        </div>
        <div className="px-4 pt-3.5">
          <p className="text-[21px] leading-tight m-0">Trattoria Sole</p>
          <p className="flex items-center gap-1.5 text-[13px] m-0 mt-1">
            <span>4,6</span>
            <Stars value={4.6} />
            <span className="text-[#5f6368]">(412)</span>
          </p>
          <p className="text-[13px] text-[#5f6368] m-0 mt-0.5">Restaurant italien · €€ · Ixelles</p>
          <div className="flex gap-4 mt-3 text-[13px] border-b border-[#e8eaed]">
            {["Présentation", "Menu", "Avis", "À propos"].map((t, i) => (
              <span key={t} className={`pb-2 ${i === 0 ? "text-[#1a73e8] border-b-2 border-[#1a73e8] font-medium" : "text-[#5f6368]"}`}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-5 px-2 py-3.5 text-center">
          {[
            [Navigation, "Itinéraire", true],
            [Phone, "Appeler", false],
            [Globe, "Site", false],
            [ShoppingBag, "Commander", false],
            [Share2, "Partager", false],
          ].map(([Icon, label, primary]) => {
            const I = Icon as typeof Navigation;
            return (
              <div key={label as string} className="flex flex-col items-center gap-1">
                <span className={`grid place-items-center w-9 h-9 rounded-full ${primary ? "bg-[#1a73e8] text-white" : "bg-[#e8f0fe] text-[#1a73e8]"}`}>
                  <I className="w-4 h-4" aria-hidden />
                </span>
                <span className="text-[10.5px] text-[#1a73e8]">{label as string}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-[#e8eaed] px-4 py-3 space-y-2.5 text-[13px]">
          <p className="flex gap-3 m-0">
            <MapPin className="w-4 h-4 text-[#1a73e8] shrink-0" aria-hidden /> Chaussée d&apos;Ixelles 000, 1050 Ixelles
          </p>
          <p className="flex gap-3 m-0">
            <Clock className="w-4 h-4 text-[#1a73e8] shrink-0" aria-hidden />
            <span>
              <span className="text-[#188038] font-medium">Ouvert</span> · Ferme à 22:30
            </span>
          </p>
          <p className="flex gap-3 m-0">
            <Phone className="w-4 h-4 text-[#1a73e8] shrink-0" aria-hidden /> 02 000 00 00
          </p>
        </div>
        <div className="border-t border-[#e8eaed] px-4 py-3.5">
          <p className="text-[14px] font-medium m-0">Avis</p>
          <div className="mt-2.5">
            <p className="text-[12.5px] m-0">
              <span className="font-medium">Julie M.</span> <span className="text-[#5f6368]">· il y a 3 jours</span>
            </p>
            <Stars value={5} />
            <p className="text-[12.5px] text-[#3c4043] m-0 mt-1">Les pâtes fraîches sont incroyables, service rapide même un vendredi soir.</p>
            <div className="mt-2 ml-3 pl-3 border-l-2 border-[#e8eaed]">
              <p className="text-[12px] font-medium m-0">Réponse du propriétaire</p>
              <p className="text-[12px] text-[#5f6368] m-0 mt-0.5">Merci Julie, toute l&apos;équipe est ravie. À très vite pour la carte d&apos;hiver.</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-ink-faint text-center mt-3">Illustration, établissement imaginaire. Google est une marque de Google LLC.</p>
    </div>
  );
}

/** Les trois familles de critères que Google cite pour classer les résultats locaux. */
export function RankingTrio() {
  const items = [
    { title: "La pertinence", body: "Votre fiche répond-elle à ce que la personne cherche ? Catégorie, description, menu et attributs le disent à Google.", color: G.blue },
    { title: "La distance", body: "À quelle distance êtes-vous de la personne, ou du lieu qu'elle tape ? Vous n'y pouvez rien, sauf avoir une adresse exacte.", color: G.green },
    { title: "La notoriété", body: "Est-ce qu'on parle de vous ? Le nombre et la note des avis, les photos, les liens vers votre site, l'activité de la fiche.", color: G.red },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-5">
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl bg-white border border-paper-border p-6 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: it.color }} aria-hidden />
          <h3 className="font-bold text-[18px] text-ink">{it.title}</h3>
          <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2">{it.body}</p>
        </div>
      ))}
    </div>
  );
}
