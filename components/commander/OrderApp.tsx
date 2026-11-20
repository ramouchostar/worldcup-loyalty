"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { addToCart, cartCount, cartTotal, euro, removeLine, setLineQty, toOrderLines, type Cart } from "@/lib/site-orders/cart";
import type { PublicItem, PublicMenu } from "@/lib/site-orders/menu";
import { cleanPhone } from "@/lib/site-orders/order";
import { shouldOfferRescue, type RescueEvent } from "@/lib/site-orders/rescue";
import { buildWhatsAppText, whatsAppChatLink, whatsAppLink } from "@/lib/site-orders/whatsapp";
import type { Selection } from "@/lib/menu-options/types";
import { DishSheet } from "./DishSheet";

// ADR 0099 §2 et §8 — la page où un client commande chez un restaurant (module de Nina, Pro, en pilote) : il choisit ses
// plats et ses options, donne son prénom et son téléphone, envoie, et PAIE AU COMPTOIR en retirant. Aucun paiement ici.
// Honnêteté : « envoyée » veut dire que le serveur l'a enregistrée, pas que quelqu'un l'a lue (pas d'imprimante pour
// l'instant) : le texte de confirmation le dit.
//
// ADR 0107 §10 — le secours : quand le serveur ne peut pas prendre la commande (panne, pas de réseau), le panier RESTE et le
// client l'envoie lui-même au restaurateur par WhatsApp. Rien n'est enregistré chez nous dans ce cas (aucun doublon possible).

type Phase = "loading" | "closed" | "error" | "ready" | "sent";
type Sent = { number: string; totalCents: number; phone: string };

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const primary = `${btn} bg-boost-olive text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
const ghost = `${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`;
const field = "block min-h-[44px] w-full min-w-0 rounded-lg border border-paper-border bg-white px-3 py-2 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

export function OrderApp({ restaurantId }: { restaurantId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Cart>([]);
  const [dish, setDish] = useState<PublicItem | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [rescue, setRescue] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  // La trace du secours (compteurs seuls, aucune donnée du client) : jamais bloquante, jamais une erreur pour le client.
  const track = useCallback((event: RescueEvent) => {
    void fetch("/api/site-orders/rescue", {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ restaurantId, event }),
    }).catch(() => undefined);
  }, [restaurantId]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/site-orders/menu?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
        const { data } = await readJsonSafe<PublicMenu>(res);
        if (!live) return;
        if (res.status === 404) { setPhase("closed"); return; }
        if (!res.ok || !data?.categories) { setPhase("error"); return; }
        setMenu(data);
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => { live = false; };
  }, [restaurantId]);

  const add = useCallback((item: PublicItem, selection: Selection, qty: number) => {
    setCart((c) => addToCart(c, item, selection, qty));
    setDish(null);
  }, []);

  const phoneOk = cleanPhone(phone) !== null;
  const canSend = cart.length > 0 && firstName.trim() !== "" && phoneOk && !sending;

  // Le message WhatsApp du secours : le panier tel qu'il est maintenant (le client a pu le changer avant de réessayer).
  const whatsappNumber = menu?.whatsapp ?? null;
  const showRescue = rescue && cart.length > 0; // un panier vidé n'a plus rien à envoyer : l'écran redevient normal
  const rescueText = useMemo(() => (showRescue ? buildWhatsAppText(cart, firstName) : ""), [showRescue, cart, firstName]);
  const rescueLink = showRescue ? whatsAppLink(whatsappNumber, rescueText) : null;
  const chatLink = whatsAppChatLink(whatsappNumber);

  async function copyMessage() {
    track("copie");
    try {
      await navigator.clipboard.writeText(rescueText);
      setCopied("ok");
    } catch {
      setCopied("fail"); // le texte s'affiche alors dans un champ à copier à la main : jamais un échec muet
    }
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setRescue(false);
    setCopied("idle");
    // Le secours n'existe que si le restaurateur a donné son numéro WhatsApp ; sinon le client garde le message d'avant.
    const failed = (status: number, code: string | null | undefined, message: string) => {
      if (whatsappNumber !== null && shouldOfferRescue(status, code)) { setRescue(true); track("propose"); return; }
      setError(message);
    };
    try {
      const res = await fetch("/api/site-orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId, firstName, phone, lines: toOrderLines(cart) }),
      });
      const { data } = await readJsonSafe<{ number?: string; totalCents?: number; error?: string; code?: string }>(res);
      if (!res.ok || !data?.number) { failed(res.status, data?.code, data?.error ?? "Ta commande n'a pas pu partir. Réessaie, ou appelle le restaurant."); return; }
      setSent({ number: data.number, totalCents: data.totalCents ?? cartTotal(cart), phone });
      setCart([]);
      setShowCart(false);
      setPhase("sent");
    } catch {
      failed(0, null, "Ta commande n'a pas pu partir. Vérifie ta connexion et réessaie : rien n'a été envoyé.");
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") return <main className="mx-auto max-w-2xl space-y-3 p-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-paper-border bg-white" />)}</main>;
  if (phase === "closed") return <main className="mx-auto max-w-2xl p-4"><p className="text-[17px] text-ink">La commande en ligne n&apos;est pas ouverte pour ce restaurant.</p></main>;
  if (phase === "error" || !menu) return <main className="mx-auto max-w-2xl p-4"><p role="alert" className="text-[17px] text-danger">Impossible d&apos;afficher la carte pour le moment. Recharge la page, ou appelle le restaurant.</p></main>;

  if (phase === "sent" && sent) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-[24px] font-semibold text-ink">Commande envoyée</h1>
        <p className="text-[32px] font-semibold leading-tight text-ink">N° {sent.number}</p>
        <p className="text-[17px] text-ink">À payer au comptoir en venant la chercher : <b className="tabular-nums">{euro(sent.totalCents)}</b>.</p>
        <p className="text-[15px] text-ink">Le restaurant t&apos;appelle au {sent.phone} quand elle est prête. Si tu n&apos;as pas de nouvelles au bout de dix minutes, appelle le restaurant en donnant ce numéro.</p>
        <button type="button" className={primary} onClick={() => { setSent(null); setPhase("ready"); }}>Faire une autre commande</button>
      </main>
    );
  }

  const count = cartCount(cart);
  return (
    <main className="mx-auto max-w-2xl pb-28">
      <header className="flex items-center gap-3 border-b border-paper-border p-4">
        {menu.restaurant.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={menu.restaurant.logoUrl} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />}
        <div className="min-w-0">
          <h1 className="break-words text-[20px] font-semibold text-ink">{menu.restaurant.name}</h1>
          <p className="text-[13px] text-ink-muted">Commande à emporter. Tu paies au comptoir en la retirant.</p>
        </div>
      </header>

      {menu.categories.length === 0 && <p className="p-4 text-[15px] text-ink-muted">Aucun plat n&apos;est proposé à la commande pour le moment.</p>}
      {menu.categories.map((cat) => (
        <section key={cat.name} className="px-4 pt-5" aria-label={cat.name}>
          <h2 className="text-[17px] font-semibold text-ink">{cat.name}</h2>
          <ul className="mt-2 divide-y divide-paper-border">
            {cat.items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => setDish(it)} className="flex w-full min-w-0 items-start gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="min-w-0 flex-1">
                    <b className="block break-words text-[15px] text-ink">{it.name}</b>
                    {it.description && <span className="mt-0.5 block break-words text-[13px] text-ink-muted">{it.description}</span>}
                    <span className="mt-0.5 block text-[13px] tabular-nums text-ink">{euro(it.priceCents)}{it.groups.length > 0 ? " · avec choix" : ""}</span>
                  </span>
                  {it.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {count > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-border bg-white p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
          <div className="mx-auto max-w-2xl">
            <button type="button" onClick={() => setShowCart(true)} className={`${primary} w-full`}>Voir ma commande ({count}) · {euro(cartTotal(cart))}</button>
          </div>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Ma commande">
          <div className="mx-auto max-w-2xl space-y-5 p-4 pb-10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[24px] font-semibold text-ink">Ma commande</h2>
              <button type="button" className={ghost} onClick={() => setShowCart(false)}>Retour à la carte</button>
            </div>

            <ul className="divide-y divide-paper-border">
              {cart.map((l) => (
                <li key={l.key} className="space-y-1 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <b className="min-w-0 break-words text-[15px] text-ink">{l.name}</b>
                    <span className="shrink-0 text-[15px] tabular-nums text-ink">{euro(l.unitCents * l.qty)}</span>
                  </div>
                  {l.details.length > 0 && (
                    <p className="break-words text-[13px] text-ink-muted">
                      {l.details.map((d) => (d.kind === "sans" ? `sans ${d.name.toLocaleLowerCase("fr-BE")}` : d.kind === "extra" ? `+ ${d.name}${d.qty > 1 ? ` ×${d.qty}` : ""}` : d.name)).join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" aria-label={`Un ${l.name} de moins`} className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => setCart((c) => setLineQty(c, l.key, l.qty - 1))}>−</button>
                    <span className="w-8 text-center text-[17px] font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`Un ${l.name} de plus`} className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => setCart((c) => setLineQty(c, l.key, l.qty + 1))}>+</button>
                    <button type="button" className={`${ghost} ml-auto`} onClick={() => setCart((c) => removeLine(c, l.key))}>Retirer</button>
                  </div>
                </li>
              ))}
            </ul>
            {cart.length === 0 && <p className="text-[15px] text-ink-muted">Ta commande est vide.</p>}

            <div className="flex justify-between border-t border-dashed border-paper-border pt-3 text-[17px] font-semibold text-ink"><span>À payer au comptoir</span><span className="tabular-nums">{euro(cartTotal(cart))}</span></div>

            <div className="space-y-3">
              <div>
                <label htmlFor="co-prenom" className="mb-1 block text-[15px] font-semibold text-ink">Ton prénom</label>
                <input id="co-prenom" value={firstName} maxLength={24} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="co-tel" className="mb-1 block text-[15px] font-semibold text-ink">Ton téléphone</label>
                <input id="co-tel" type="tel" inputMode="tel" value={phone} maxLength={20} autoComplete="tel" placeholder="0470 12 34 56" onChange={(e) => setPhone(e.target.value)} className={field} aria-describedby="co-tel-aide" />
                <p id="co-tel-aide" className="mt-1 text-[13px] text-ink-muted">
                  {phone.trim() !== "" && !phoneOk ? "Ce numéro n'est pas lisible. Exemple : 0470 12 34 56." : `Le restaurant t'appelle quand c'est prêt. Ton prénom et ton téléphone ne servent qu'à ça : ils sont effacés après ${menu.retentionDays} jours.`}
                </p>
              </div>
            </div>

            {showRescue ? (
              <div className="space-y-3">
                <div role="alert" className="rounded-lg border border-danger px-3 py-3">
                  <p className="text-[15px] font-semibold text-danger">Le restaurant ne peut pas recevoir ta commande pour le moment.</p>
                  <p className="mt-1 text-[13px] text-ink">Ton panier est gardé. Envoie-le au restaurant par WhatsApp : tu paies au comptoir, comme d&apos;habitude.</p>
                </div>
                {rescueLink ? (
                  <a href={rescueLink} target="_blank" rel="noopener noreferrer" onClick={() => track("whatsapp")} className={`${primary} flex w-full items-center justify-center`}>Envoyer ma commande via WhatsApp</a>
                ) : (
                  <>
                    <p className="text-[13px] text-ink-muted">Ta commande est longue : copie le message, puis colle-le dans WhatsApp.</p>
                    <button type="button" onClick={() => void copyMessage()} className={`${primary} w-full`}>Copier le message</button>
                    {chatLink && <a href={chatLink} target="_blank" rel="noopener noreferrer" onClick={() => track("whatsapp")} className={`${ghost} flex w-full items-center justify-center`}>Ouvrir WhatsApp</a>}
                  </>
                )}
                <div className="flex gap-2">
                  {rescueLink && <button type="button" onClick={() => void copyMessage()} className={`${ghost} flex-1`}>Copier le message</button>}
                  <button type="button" disabled={!canSend} onClick={() => void send()} className={`${ghost} flex-1 disabled:cursor-not-allowed disabled:opacity-50`}>{sending ? "Envoi…" : "Réessayer"}</button>
                </div>
                {copied === "ok" && <p role="status" className="text-[13px] text-ink">Message copié.</p>}
                {copied === "fail" && (
                  <div>
                    <label htmlFor="co-msg" className="mb-1 block text-[15px] font-semibold text-ink">Copie ce message à la main</label>
                    <textarea id="co-msg" readOnly rows={8} value={rescueText} onFocus={(e) => e.currentTarget.select()} className={field} />
                  </div>
                )}
                <p className="text-[13px] text-ink-muted">Rien n&apos;a été enregistré sur le site. En général, WhatsApp affiche deux coches bleues quand le restaurant a ouvert ton message.</p>
              </div>
            ) : (
              <>
                {error && <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</p>}
                <button type="button" disabled={!canSend} onClick={() => void send()} className={`${primary} w-full`}>{sending ? "Envoi…" : `Envoyer ma commande · ${euro(cartTotal(cart))}`}</button>
                <p className="text-[13px] text-ink-muted">Tu ne paies rien en ligne : tu règles au comptoir en venant la retirer.</p>
              </>
            )}
          </div>
        </div>
      )}

      {dish && <DishSheet item={dish} onClose={() => setDish(null)} onAdd={(selection, qty) => add(dish, selection, qty)} />}
    </main>
  );
}
