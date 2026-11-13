// ADR 0099 §10 — le son d'une nouvelle commande, dans le navigateur. Web Audio : pas de fichier son à héberger, pas de
// dépendance. Un navigateur ne joue AUCUN son avant un geste du restaurateur : la page demande donc un appui sur
// « Activer le son », et le dit clairement quand il faut le refaire (page rechargée, iPhone, iPad).

/** Le contexte audio, à créer DANS un geste (un clic). `null` si le navigateur n'a pas de Web Audio. */
export function createAudio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/** Réveille un contexte suspendu (onglet resté en arrière-plan). Renvoie `true` s'il joue ensuite. */
export async function resumeAudio(ctx: AudioContext): Promise<boolean> {
  try {
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/** Deux notes (la, ré aigu), deux fois : un carillon qui s'entend dans une cuisine sans être agressif. */
export function chime(ctx: AudioContext): void {
  const t0 = ctx.currentTime + 0.02;
  const notes: [number, number, number][] = [[880, 0, 0.2], [1175, 0.22, 0.32], [880, 0.7, 0.2], [1175, 0.92, 0.32]];
  for (const [freq, at, len] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.45, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + len + 0.05);
  }
}

// ─── Garder l'écran allumé ───────────────────────────────────────────────────

type WakeLock = { release(): Promise<void> };

/** Empêche l'écran de se mettre en veille (une tablette en veille n'entend plus rien). `null` si le navigateur ne sait pas. */
export async function keepScreenOn(): Promise<WakeLock | null> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLock> } };
    return nav.wakeLock ? await nav.wakeLock.request("screen") : null;
  } catch {
    return null; // refusé (économie d'énergie) : la page le dit déjà, le son reste actif
  }
}

// ─── Le choix du restaurateur, sur CET appareil ──────────────────────────────

const key = (restaurantId: string) => `site-orders-sound:${restaurantId}`;

export function readSoundPref(restaurantId: string): boolean {
  try {
    return window.localStorage.getItem(key(restaurantId)) === "on";
  } catch {
    return false;
  }
}

export function writeSoundPref(restaurantId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key(restaurantId), "on");
    else window.localStorage.removeItem(key(restaurantId));
  } catch {
    /* navigation privée : le choix ne survivra pas au rechargement, rien d'autre ne casse */
  }
}
