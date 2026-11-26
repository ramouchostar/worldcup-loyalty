import Link from "next/link";
import { LOGIN_REQUIRED } from "@/lib/site-orders/account";
import { ghost, primary } from "./ui";

// ADR 0108 §2 — le serveur demande un compte : Google, la connexion ou l'inscription. Le panier est gardé par `OrderApp`.

export function LoginPanel({ error, onGoogle }: { error: string | null; onGoogle: () => void }) {
  return (
    <div className="space-y-3">
      <div role="alert" className="rounded-lg border border-paper-border bg-white px-3 py-3">
        <p className="text-[17px] font-semibold text-ink">{LOGIN_REQUIRED.message}</p>
        <p className="mt-1 text-[13px] text-ink-muted">Tu retrouveras ta commande telle quelle après la connexion. Aucun message publicitaire sans ton accord.</p>
      </div>
      <button type="button" onClick={onGoogle} className={`${ghost} w-full`}>Continuer avec Google</button>
      <div className="flex gap-2">
        <Link href="/login" className={`${primary} flex flex-1 items-center justify-center`}>Me connecter</Link>
        <Link href="/signup" className={`${ghost} flex flex-1 items-center justify-center`}>Créer un compte</Link>
      </div>
      {error && <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</p>}
    </div>
  );
}
