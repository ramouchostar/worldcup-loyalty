"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { createClient } from "@/lib/supabase-browser";
import { rememberPendingSiteOrder } from "@/app/commander/[restaurantId]/actions";
import { LOGIN_REQUIRED } from "@/lib/site-orders/account";
import { addToCart, cartCount, cartTotal, removeLine, restoreCart, saveCart, setLineQty, toOrderLines, type Cart } from "@/lib/site-orders/cart";
import type { PublicItem, PublicMenu } from "@/lib/site-orders/menu";
import { cleanPhone } from "@/lib/site-orders/order";
import { shouldOfferRescue, type RescueEvent } from "@/lib/site-orders/rescue";
import { buildWhatsAppText, whatsAppChatLink, whatsAppLink } from "@/lib/site-orders/whatsapp";
import type { Selection } from "@/lib/menu-options/types";
import { ArticlesSlot } from "./ArticlesSlot";
import { CartBar } from "./CartBar";
import { CartPanel } from "./CartPanel";
import { ContactFields } from "./ContactFields";
import { DishSheet } from "./DishSheet";
import { LoginPanel } from "./LoginPanel";
import { MenuList } from "./MenuList";
import { OrderHeader } from "./OrderHeader";
import { PromotionsSlot } from "./PromotionsSlot";
import { RescuePanel } from "./RescuePanel";
import { SendPanel } from "./SendPanel";
import { SentConfirmation, type Sent } from "./SentConfirmation";
import { ClosedScreen, ErrorScreen, LoadingScreen } from "./StateScreens";

// ADR 0099 §2 et §8 — la page où un client commande chez un restaurant (module de Nina, Pro, en pilote) : il choisit ses
// plats et ses options, donne son prénom (son téléphone est facultatif), envoie, et PAIE AU COMPTOIR en retirant. Aucun paiement ici.
//
// ADR 0108 §2 — il faut un COMPTE pour envoyer, pas pour regarder. Sans compte, le serveur répond 401 : la page GARDE le panier
// (dans ce navigateur, pour deux heures), propose Google, la connexion ou l'inscription, et le client revient à sa commande.
// Honnêteté : « envoyée » veut dire que le serveur l'a enregistrée, pas que quelqu'un l'a lue (pas d'imprimante pour
// l'instant) : le texte de confirmation le dit.
//
// ADR 0107 §10 — le secours : quand le serveur ne peut pas prendre la commande (panne, pas de réseau), le panier RESTE et le
// client l'envoie lui-même au restaurateur par WhatsApp. Rien n'est enregistré chez nous dans ce cas (aucun doublon possible).

// Cette page porte l'état, les effets et les envois ; chaque morceau d'écran a son fichier dans ce dossier.

type Phase = "loading" | "closed" | "error" | "ready" | "sent";

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
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null = on ne sait pas encore
  const [needLogin, setNeedLogin] = useState(false);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);

  const cartKey = `site_order_cart:${restaurantId}`;
  const pendingCookie = useRef<Promise<void> | null>(null);

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

  // Quand la carte est là : qui est connecté (pour préremplir le prénom) et le panier qui attendait la connexion.
  useEffect(() => {
    if (!menu) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/site-orders/me?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
        const { data } = await readJsonSafe<{ signedIn?: boolean; firstName?: string }>(res);
        if (!live || !res.ok || !data) return;
        setSignedIn(data.signedIn === true);
        if (data.firstName) setFirstName((n) => (n.trim() === "" ? data.firstName ?? "" : n));
      } catch {
        /* sans réponse, on ne sait pas : le serveur redemandera la connexion à l'envoi s'il le faut */
      }
    })();
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) {
        localStorage.removeItem(cartKey); // le panier ne dort dans le navigateur que le temps de la connexion
        const { cart: back, dropped } = restoreCart(JSON.parse(raw) as unknown, menu);
        if (back.length > 0) {
          setCart(back);
          setShowCart(true);
          const droppedNote = dropped === 0 ? "" : dropped === 1 ? " Un plat n'est plus proposé ou a changé : il a été retiré." : ` ${dropped} plats ne sont plus proposés ou ont changé : ils ont été retirés.`;
          setRestoredNote(`On a retrouvé ta commande.${droppedNote}`);
        }
      }
    } catch {
      /* stockage refusé ou illisible (navigation privée) : on repart d'un panier vide, jamais une erreur */
    }
    return () => { live = false; };
  }, [menu, restaurantId, cartKey]);

  const add = useCallback((item: PublicItem, selection: Selection, qty: number) => {
    setCart((c) => addToCart(c, item, selection, qty));
    setDish(null);
  }, []);

  // Facultatif (ADR 0108 §2) : vide, c'est bon ; rempli, il doit être lisible.
  const phoneOk = phone.trim() === "" || cleanPhone(phone) !== null;
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

  // Le serveur a dit « il faut un compte » : on garde le panier, on se souvient d'où le client vient, et on propose la connexion.
  // Le panneau s'ouvre TOUT DE SUITE : le cookie de retour se pose en arrière-plan (sur un réseau lent, le client ne regarde pas « Envoi… »).
  function askLogin() {
    try { localStorage.setItem(cartKey, JSON.stringify(saveCart(cart))); } catch { /* stockage refusé : le panier restera dans cet onglet */ }
    // Sans le cookie, la connexion ramène à la page de l'établissement : le panier attend quand même dans le navigateur.
    pendingCookie.current = rememberPendingSiteOrder(restaurantId).catch(() => undefined);
    setSignedIn(false);
    setNeedLogin(true);
  }

  async function signInWithGoogle() {
    await pendingCookie.current; // le départ vers Google ne doit pas couper la pose du cookie
    const supabase = createClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Toujours proposer le choix du compte Google, comme la connexion du reste de Boosteats.
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    if (oauthErr) setError("La connexion avec Google n'a pas marché. Réessaie, ou connecte-toi avec ton e-mail.");
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setRescue(false);
    setNeedLogin(false);
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
      const { data } = await readJsonSafe<{ number?: string; totalCents?: number; points?: boolean; error?: string; code?: string }>(res);
      // Pas de compte : ce n'est PAS une panne (aucun secours WhatsApp) et pas une erreur du client : la connexion, panier gardé.
      if (res.status === 401 && data?.code === LOGIN_REQUIRED.code) { askLogin(); return; }
      if (!res.ok || !data?.number) { failed(res.status, data?.code, data?.error ?? "Ta commande n'a pas pu partir. Réessaie, ou appelle le restaurant."); return; }
      setSent({ number: data.number, totalCents: data.totalCents ?? cartTotal(cart), phone: cleanPhone(phone) ?? "", points: data.points === true });
      try { localStorage.removeItem(cartKey); } catch { /* rien à effacer */ }
      setCart([]);
      setShowCart(false);
      setPhase("sent");
    } catch {
      failed(0, null, "Ta commande n'a pas pu partir. Vérifie ta connexion et réessaie : rien n'a été envoyé.");
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") return <LoadingScreen />;
  if (phase === "closed") return <ClosedScreen />;
  if (phase === "error" || !menu) return <ErrorScreen />;

  if (phase === "sent" && sent) return <SentConfirmation sent={sent} onAgain={() => { setSent(null); setPhase("ready"); }} />;

  const count = cartCount(cart);
  return (
    <main className="mx-auto max-w-2xl pb-28">
      <OrderHeader restaurant={menu.restaurant} />

      <PromotionsSlot restaurantId={restaurantId} menu={menu} />
      <ArticlesSlot restaurantId={restaurantId} menu={menu} />

      <MenuList categories={menu.categories} onPick={setDish} />

      {count > 0 && !showCart && <CartBar count={count} totalCents={cartTotal(cart)} onOpen={() => setShowCart(true)} />}

      {showCart && (
        <CartPanel
          cart={cart}
          restoredNote={restoredNote}
          onSetQty={(key, qty) => setCart((c) => setLineQty(c, key, qty))}
          onRemove={(key) => setCart((c) => removeLine(c, key))}
          onClose={() => setShowCart(false)}
        >
          <ContactFields firstName={firstName} phone={phone} phoneOk={phoneOk} retentionDays={menu.retentionDays} onFirstName={setFirstName} onPhone={setPhone} />

          {showRescue ? (
            <RescuePanel
              rescueLink={rescueLink} chatLink={chatLink} rescueText={rescueText} copied={copied} canSend={canSend} sending={sending}
              onOpenWhatsApp={() => track("whatsapp")} onCopy={() => void copyMessage()} onRetry={() => void send()}
            />
          ) : needLogin ? (
            <LoginPanel error={error} onGoogle={() => void signInWithGoogle()} />
          ) : (
            <SendPanel totalCents={cartTotal(cart)} canSend={canSend} sending={sending} error={error} signedIn={signedIn} onSend={() => void send()} />
          )}
        </CartPanel>
      )}

      {dish && <DishSheet item={dish} onClose={() => setDish(null)} onAdd={(selection, qty) => add(dish, selection, qty)} />}
    </main>
  );
}
