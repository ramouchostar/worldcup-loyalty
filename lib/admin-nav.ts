// Navigation de la console restaurateur — une seule définition pour les deux
// vues (ADR 0064) et pour la page « Plus » qui liste tout.
//
// Vue pro : les quatre sections de l'ADR 0030 §9 (Au quotidien = le comptoir,
// Fidélisation = faire revenir, Pilotage = comprendre, Configuration = réglé
// une fois). Vue simple : quatre onglets, ce qu'on touche tous les jours —
// tout le reste reste à un tap, dans « Plus ».
//
// Des clés d'icône (components/admin/AdminNavIcons.tsx) plutôt que des
// composants : le layout est un Server Component, un composant React ne
// traverse pas la frontière serveur → client en tant que prop.

export type AdminNavLink = {
  href: string;
  label: string;
  icon: string;
  /** Ce que la page fait, en mots de restaurateur — affiché sur « Plus ». */
  hint: string;
};

export type AdminNavSection = { title: string; links: AdminNavLink[] };

/** La vue choisie, mémorisée par cookie (préférence d'affichage, pas un droit). */
export type ConsoleView = "simple" | "pro";
export const CONSOLE_VIEW_COOKIE = "console_vue";

export function parseConsoleView(raw: string | undefined): ConsoleView {
  return raw === "pro" ? "pro" : "simple";
}

export function consoleSections(base: string, canManage: boolean): AdminNavSection[] {
  return [
    {
      title: "Au quotidien",
      links: [
        { href: base, label: "Dashboard", icon: "dashboard", hint: "Tes chiffres du mois et ce qu'il y a à faire" },
        // ADR 0052 — la file des doublons ambigus est un ONGLET de Commandes.
        { href: `${base}/orders`, label: "Commandes", icon: "orders", hint: "Les tickets de tes clients, à vérifier ou déjà validés" },
        { href: `${base}/pending-rewards`, label: "Cadeaux", icon: "gifts", hint: "Les cadeaux que tes clients viendront chercher" },
      ],
    },
    {
      title: "Fidélisation",
      links: [
        { href: `${base}/clients`, label: "Mes clients", icon: "clients", hint: "Qui vient, combien de fois, depuis quand" },
        { href: `${base}/teams`, label: "Équipes", icon: "teams", hint: "Les écoles, entreprises et quartiers de tes clients" },
        { href: `${base}/broadcast`, label: "Annonces", icon: "broadcasts", hint: "Un message à tous tes clients, ou à une équipe" },
        { href: `${base}/micro-rewards`, label: "Actions", icon: "actions", hint: "Avis Google et abonnements de tes clients" },
        { href: `${base}/referrals`, label: "Parrainages", icon: "referrals", hint: "Les clients qui en amènent d'autres" },
      ],
    },
    {
      title: "Pilotage",
      links: [
        { href: `${base}/sales`, label: "Ventes", icon: "sales", hint: "Ce que tu vends, plat par plat, et ta marge" },
        { href: `${base}/forecast`, label: "Prévisions", icon: "forecast", hint: "Ton chiffre d'affaires des 7 prochains jours" },
        { href: `${base}/insights`, label: "Opportunités", icon: "insights", hint: "Des idées de promos calculées sur tes tickets" },
        { href: `${base}/quality`, label: "Baromètre", icon: "quality", hint: "Ce que tes clients te disent, en privé" },
        { href: `${base}/benchmarks`, label: "Repères secteur", icon: "benchmarks", hint: "Toi face aux restaurants de ton secteur" },
      ],
    },
    {
      title: "Configuration",
      links: [
        { href: `${base}/menu`, label: "Menu & coûts", icon: "menu", hint: "Ta carte, tes prix de revient, tes cadeaux" },
        // ADR 0068 — le taux cadeaux : décision d’argent, donc gérant/manager.
        ...(canManage ? [{ href: `${base}/cadeaux`, label: "Taux cadeaux", icon: "gifts", hint: "Ce que tu rends à tes clients, et ce que ça te coûte" }] : []),
        // ADR 0041 §6 — un siège équipe n'a pas accès aux pages financières
        // et aux réglages : leur lien disparaît (la page se re-garde aussi).
        ...(canManage ? [{ href: `${base}/thresholds`, label: "Seuils CA", icon: "thresholds", hint: "L'objectif de chiffre qui ouvre les cadeaux d'équipe" }] : []),
        { href: `${base}/qr`, label: "QR code", icon: "qr", hint: "Tes supports à imprimer et les QR de ton équipe en salle" },
        ...(canManage ? [{ href: `${base}/settings`, label: "Réglages", icon: "settings", hint: "Logo, couleurs, communautés, liens" }] : []),
        { href: `${base}/access`, label: "Accès console", icon: "access", hint: "Qui peut ouvrir ta console" },
      ],
    },
  ];
}

/**
 * Les quatre onglets de la vue simple — bas d'écran sur téléphone, colonne
 * sur ordinateur. Quatre et pas cinq : chaque onglet doit se toucher au
 * pouce sans viser, et « Plus » garde l'accès à tout (règle `bottom-nav-limit`).
 */
export function simpleTabs(base: string): (AdminNavLink & { match: "exact" | "prefix" })[] {
  return [
    { href: base, label: "Accueil", icon: "home", hint: "", match: "exact" },
    { href: `${base}/orders`, label: "Tickets", icon: "orders", hint: "", match: "prefix" },
    { href: `${base}/broadcast`, label: "Annonces", icon: "broadcasts", hint: "", match: "prefix" },
    { href: `${base}/plus`, label: "Plus", icon: "more", hint: "", match: "prefix" },
  ];
}
