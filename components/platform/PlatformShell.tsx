"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

// ADR 0030 §2/§7 + ADR 0033 §4 — remplace l'ancienne barre d'onglets
// horizontale (components/platform/PlatformHeader.tsx, supprimée) par un
// vrai shell : barre latérale rétractable sur desktop, tiroir plein écran
// sur mobile. Même structure de nav (les 5 onglets existants), même garde
// d'accès portée par app/platform/layout.tsx — ce composant n'est que la
// chrome, il ne revérifie rien.

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/platform", label: "Réseau", icon: Network, exact: true },
  { href: "/platform/stats", label: "Chiffres", icon: BarChart3 },
  { href: "/platform/backlog", label: "Backlog", icon: ListTodo },
  { href: "/platform/members", label: "Membres", icon: Users },
  { href: "/platform/scans", label: "Tickets", icon: Receipt },
];

const COLLAPSE_KEY = "platform-sidebar-collapsed";
const THEME_KEY = "platform-theme";

// Le script bloquant posé par app/platform/layout.tsx applique déjà la
// classe `dark` avant l'hydratation (anti-flash) — ce hook ne fait que lire
// cet état pour piloter l'icône du bouton, jamais l'inverse.
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Stockage indisponible (navigation privée…) — le choix ne survit
        // juste pas au rechargement, ça ne doit jamais casser la page.
      }
      return next;
    });
  }

  return { theme, toggle };
}

const ITEM_CLS =
  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors";
const ITEM_INACTIVE = "text-gray-400 hover:bg-white/5 hover:text-white";
const ITEM_ACTIVE = "bg-white/10 text-white";

function NavLinks({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={`${ITEM_CLS} ${collapsed ? "justify-center" : ""} ${active ? ITEM_ACTIVE : ITEM_INACTIVE}`}
          >
            <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomSection({
  collapsed,
  backHref,
  userEmail,
  theme,
  onToggleTheme,
}: {
  collapsed: boolean;
  backHref: string;
  userEmail: string | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <div className="border-t border-white/10 p-2 space-y-1">
      <button
        type="button"
        onClick={onToggleTheme}
        title={collapsed ? (theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre") : undefined}
        className={`w-full ${ITEM_CLS} ${ITEM_INACTIVE} ${collapsed ? "justify-center" : ""}`}
      >
        {theme === "dark" ? (
          <Sun size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        ) : (
          <Moon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        )}
        {!collapsed && <span>{theme === "dark" ? "Mode clair" : "Mode sombre"}</span>}
      </button>

      <Link href={backHref} title={collapsed ? "Retour à l'app" : undefined} className={`${ITEM_CLS} ${ITEM_INACTIVE} ${collapsed ? "justify-center" : ""}`}>
        <ArrowLeft size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        {!collapsed && <span>Retour à l&apos;app</span>}
      </Link>

      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          title={collapsed ? "Déconnexion" : undefined}
          className={`w-full ${ITEM_CLS} ${ITEM_INACTIVE} ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </form>

      {!collapsed && userEmail && <p className="truncate px-2.5 pt-1 text-[11px] text-gray-500">{userEmail}</p>}
    </div>
  );
}

export function PlatformShell({
  backHref,
  userEmail,
  children,
}: {
  backHref: string;
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Préférence lue après le montage seulement : le rendu serveur (et le
  // premier rendu client, identique pour l'hydratation) ignore toujours
  // localStorage, sinon React log un warning de mismatch. Un pli qui se
  // réaffiche ouvert une fraction de seconde avant de se réduire est un
  // compromis acceptable sur cet outil interne.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // idem — localStorage indisponible, on reste replié par défaut (false).
    }
  }, []);

  // Le tiroir mobile ne doit jamais survivre à un changement de page.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // idem.
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 md:flex">
      {/* Sidebar desktop — rétractable, icônes seules une fois repliée.
          sticky + h-screen : sans ça, l'aside suit la hauteur naturelle de la
          ligne flex (celle du contenu de page, potentiellement bien plus
          grand qu'un écran), et son bas — bouton clair/sombre, retour,
          déconnexion — ne devient visible qu'en scrollant TOUTE la page. Ici
          elle reste plaquée à la fenêtre ; seule sa nav interne défile si
          jamais elle devient trop longue pour la hauteur d'écran. */}
      <aside
        className={`hidden md:flex md:sticky md:top-0 md:h-screen md:flex-col md:shrink-0 bg-brand-dark transition-[width] duration-200 ${
          collapsed ? "w-[72px]" : "w-[232px]"
        }`}
      >
        <div className="flex items-center gap-2 h-16 px-3 border-b border-white/10">
          {!collapsed && <span className="text-platform-accent font-black text-lg truncate px-1">Plateforme</span>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
            className={`h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors ${
              collapsed ? "" : "ml-auto"
            }`}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <NavLinks pathname={pathname} collapsed={collapsed} />
        <BottomSection collapsed={collapsed} backHref={backHref} userEmail={userEmail} theme={theme} onToggleTheme={toggle} />
      </aside>

      {/* Topbar + tiroir plein écran mobile. */}
      <div className="md:hidden">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-brand-dark text-white px-4 h-14 pt-safe">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="h-9 w-9 -ml-1.5 grid place-items-center rounded-lg hover:bg-white/10"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="text-platform-accent font-black text-base">Plateforme</span>
        </header>

        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu plateforme"
              className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[280px] flex-col bg-brand-dark text-white shadow-xl"
            >
              <div className="flex items-center justify-between h-14 px-4 pt-safe border-b border-white/10">
                <span className="text-platform-accent font-black text-base">Plateforme</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Fermer le menu"
                  className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <NavLinks pathname={pathname} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <BottomSection collapsed={false} backHref={backHref} userEmail={userEmail} theme={theme} onToggleTheme={toggle} />
            </div>
          </>
        )}
      </div>

      <main className="flex-1 min-w-0 dark:text-gray-100">{children}</main>
    </div>
  );
}
