"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { createClient } from "@/lib/supabase-browser";
import { rememberPendingSiteOrder } from "@/app/commander/[restaurantId]/actions";
import { LOGIN_REQUIRED } from "@/lib/site-orders/account";
import { addToCart, cartCount, cartTotal, removeLine, replaceLine, setLineQty, toOrderLines, type CartLine } from "@/lib/site-orders/cart";
import type { PublicItem, PublicMenu } from "@/lib/site-orders/menu";
import { cleanPhone } from "@/lib/site-orders/order";
import { shouldOfferRescue, type RescueEvent } from "@/lib/site-orders/rescue";
import { LABELS_FR, buildWhatsAppText, whatsAppChatLink, whatsAppLink } from "@/lib/site-orders/whatsapp";
import type { PublicOffer } from "@/lib/site-offers/offers";
import type { Selection } from "@/lib/menu-options/types";
import { ArticlesSlot } from "./ArticlesSlot";
import { CartBar } from "./CartBar";
import { CartPanel } from "./CartPanel";
import { ContactFields } from "./ContactFields";
import { DishSheet } from "./DishSheet";
import { InfoBanner } from "./InfoBanner";
import { LoginPanel } from "./LoginPanel";
import { MenuList } from "./MenuList";
import { OfferNote } from "./OfferNote";
import { OfferSheet } from "./OfferSheet";
import { OrderHeader } from "./OrderHeader";
import { PromotionsSlot } from "./PromotionsSlot";
import { RescuePanel } from "./RescuePanel";
import { SendPanel } from "./SendPanel";
import { SentConfirmation, type Sent } from "./SentConfirmation";
import { ClosedScreen, ErrorScreen, LoadingScreen } from "./StateScreens";
import { useFiche } from "./useFiche";
import { useOffers } from "./useOffers";
import { useStoredCart } from "./useStoredCart";
import { useWide } from "./useWide";

// ADR 0099 §2 et §8 — la page où un client commande chez un restaurant (module de Nina, Pro, en pilote) : il choisit ses
// plats et ses options, donne son prénom (son téléphone est facultatif), envoie, et PAIE AU COMPTOIR en retirant. Aucun paiement ici.
//
// ADR 0108 §2 — il faut un COMPTE pour envoyer, pas pour regarder. Sans compte, le serveur répond 401 : la page propose
// Google, la connexion ou l'inscription, et le client revient à sa commande (le panier est gardé dans ce navigateur à
// chaque changement, pour deux heures : `useStoredCart`).
// ADR 0108 §4, ADR 0109 §3 — restaurant fermé selon sa fiche, ou horaires inconnus : le panier se prépare, l'envoi est
// fermé, et le serveur refuse aussi.
// Honnêteté : « envoyée » veut dire que le serveur l'a enregistrée, pas que quelqu'un l'a lue (pas d'imprimante pour
// l'instant) : le texte de confirmation le dit.
//
// ADR 0110 — les offres du jour s'affichent sans changer aucun prix : la remise se demande au comptoir, la page le dit.
//
// ADR 0107 §10 — le secours : quand le serveur ne peut pas prendre la commande (panne, pas de réseau), le panier RESTE et le
// client l'envoie lui-même au restaurateur par WhatsApp. Rien n'est enregistré chez nous dans ce cas (aucun doublon possible).
//
// Cette page porte l'état, les effets et les envois ; chaque morceau d'écran a son fichier dans ce dossier.

type Phase = "loading" | "closed" | "error" | "ready" | "sent";

export function OrderApp({ restaurantId }: { restaurantId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  /** La fiche de plat ouverte : un nouveau plat, ou la ligne du panier qu'on modifie. */
  const [dish, setDish] = useState<{ item: PublicItem; line?: CartLine } | null>(null);
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

  const wide = useWide();
  const { openness, blocked, fiche, now, reload: reloadFiche } = useFiche(restaurantId);
  const { cart, setCart, resumed, markLoginLeave, forgetNote } = useStoredCart(restaurantId, menu);
  const { offers, shown: offersShown, opened: offerOpened } = useOffers(restaurantId);
  const [openOffer, setOpenOffer] = useState<PublicOffer | null>(null);
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

  // Quand la carte est là : qui est connecté (pour préremplir le prénom).
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
    return () => { live = false; };
  }, [menu, restaurantId]);

  // Le retour de la connexion ouvre le panier ; un simple retour ne l'ouvre pas.
  useEffect(() => {
    if (resumed?.open) setShowCart(true);
  }, [resumed]);

  const closeDish = useCallback(() => setDish(null), []);
  const items = useMemo(() => new Map((menu?.categories ?? []).flatMap((c) => c.items).map((it) => [it.id, it] as const)), [menu]);
  // Une offre sur un plat que cette carte ne montre pas ne se montre pas non plus.
  const visibleOffers = useMemo(() => offers.filter((o) => !o.itemId || items.has(o.itemId)), [offers, items]);
  const closeOffer = useCallback(() => setOpenOffer(null), []);
  const readOffer = useCallback((offer: PublicOffer) => { setOpenOffer(offer); offerOpened(offer.id); }, [offerOpened]);

  function confirmDish(selection: Selection, qty: number) {
    if (!dish) return;
    const { item, line } = dish;
    setCart((c) => (line ? replaceLine(c, line.key, item, selection, qty) : addToCart(c, item, selection, qty)));
    setDish(null);
  }

  // Facultatif (ADR 0108 §2) : vide, c'est bon ; rempli, il doit être lisible.
  const phoneOk = phone.trim() === "" || cleanPhone(phone) !== null;
  const canSend = !blocked && cart.length > 0 && firstName.trim() !== "" && phoneOk && !sending;

  // Le message WhatsApp du secours : le panier tel qu'il est maintenant (le client a pu le changer avant de réessayer).
  const whatsappNumber = menu?.whatsapp ?? null;
  // Un panier vidé n'a plus rien à envoyer, et un restaurant fermé entre-temps ne se contourne pas par WhatsApp.
  const showRescue = rescue && cart.length > 0 && !blocked;
  const rescueText = useMemo(
    () => (showRescue ? buildWhatsAppText(cart, firstName, LABELS_FR, visibleOffers.map((o) => o.title)) : ""),
    [showRescue, cart, firstName, visibleOffers],
  );
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

  // Le serveur a dit « il faut un compte » : on se souvient d'où le client vient, et on propose la connexion.
  // Le panneau s'ouvre TOUT DE SUITE : le cookie de retour se pose en arrière-plan (sur un réseau lent, le client ne regarde pas « Envoi… »).
  function askLogin() {
    // Sans le cookie, la connexion ramène à la page de l'établissement : le panier attend quand même dans le navigateur.
    pendingCookie.current = rememberPendingSiteOrder(restaurantId).catch(() => undefined);
    setSignedIn(false);
    setNeedLogin(true);
  }

  async function signInWithGoogle() {
    markLoginLeave();
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
      const { data } = await readJsonSafe<{ number?: string; totalCents?: number; points?: boolean; offers?: Sent["offers"]; error?: string; code?: string }>(res);
      // Pas de compte : ce n'est PAS une panne (aucun secours WhatsApp) et pas une erreur du client : la connexion, panier gardé.
      if (res.status === 401 && data?.code === LOGIN_REQUIRED.code) { askLogin(); return; }
      // Fermé ou horaires inconnus selon le serveur : la page relit la fiche pour dire la même chose que lui.
      if (data?.code === "ferme" || data?.code === "horaires_inconnus") reloadFiche();
      if (!res.ok || !data?.number) { failed(res.status, data?.code, data?.error ?? "Ta commande n'a pas pu partir. Réessaie, ou appelle le restaurant."); return; }
      setSent({ number: data.number, totalCents: data.totalCents ?? cartTotal(cart), phone: cleanPhone(phone) ?? "", points: data.points === true, offers: data.offers ?? [] });
      setCart([]); // le panier gardé dans le navigateur s'efface avec lui
      forgetNote();
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
  const restaurantPhone = menu.restaurant.phone ?? null;
  const note = resumed?.note ?? null;

  const panel = (variant: "overlay" | "aside") => (
    <CartPanel
      variant={variant}
      restaurantName={menu.restaurant.name}
      cart={cart}
      restoredNote={note}
      onSetQty={(key, qty) => setCart((c) => setLineQty(c, key, qty))}
      onRemove={(key) => setCart((c) => removeLine(c, key))}
      canEdit={(line) => (items.get(line.articleId)?.groups.length ?? 0) > 0}
      onEdit={(line) => { const item = items.get(line.articleId); if (item) setDish({ item, line }); }}
      onClose={() => setShowCart(false)}
      offerNote={<OfferNote offers={visibleOffers} onRead={readOffer} />}
    >
      {cart.length > 0 && (
        <>
          {!blocked && <ContactFields firstName={firstName} phone={phone} phoneOk={phoneOk} retentionDays={menu.retentionDays} onFirstName={setFirstName} onPhone={setPhone} />}
          {showRescue ? (
            <RescuePanel
              rescueLink={rescueLink} chatLink={chatLink} rescueText={rescueText} copied={copied} canSend={canSend} sending={sending}
              onOpenWhatsApp={() => track("whatsapp")} onCopy={() => void copyMessage()} onRetry={() => void send()}
            />
          ) : needLogin && !blocked ? (
            <LoginPanel error={error} onGoogle={() => void signInWithGoogle()} onLeave={markLoginLeave} />
          ) : (
            <SendPanel canSend={canSend} sending={sending} error={error} blocked={blocked} phone={restaurantPhone} signedIn={signedIn} onSend={() => void send()} />
          )}
        </>
      )}
    </CartPanel>
  );

  return (
    <main className="pb-36 lg:pb-12">
      <OrderHeader restaurant={menu.restaurant} fiche={fiche} openness={openness} now={now} />

      <div className="mx-auto max-w-2xl lg:flex lg:max-w-[1140px] lg:items-start lg:gap-12 lg:px-5 lg:pt-7">
        <div className="min-w-0 lg:flex-1">
          <div className="p-4 lg:p-0">
            <InfoBanner openness={openness} phone={restaurantPhone} signedIn={signedIn} />
            {/* Un plat retiré du panier gardé se dit, même quand il ne reste rien à ouvrir. */}
            {note && count === 0 && !wide && <p role="status" className="mt-3 text-[15px] text-ink">{note}</p>}
          </div>

          <PromotionsSlot offers={visibleOffers} onShown={offersShown} onOpen={readOffer} />
          <ArticlesSlot restaurantId={restaurantId} menu={menu} />

          <MenuList categories={menu.categories} onPick={(item) => setDish({ item })} />
        </div>

        {wide && panel("aside")}
      </div>

      {!wide && !showCart && <CartBar count={count} openness={openness} origin={fiche?.origin ?? null} signedIn={signedIn} phone={restaurantPhone} onOpen={() => setShowCart(true)} />}
      {!wide && showCart && panel("overlay")}

      {openOffer && (
        <OfferSheet
          restaurantName={menu.restaurant.name}
          offer={openOffer}
          item={openOffer.itemId ? items.get(openOffer.itemId) ?? null : null}
          onClose={closeOffer}
          onSeeDish={() => {
            const item = openOffer.itemId ? items.get(openOffer.itemId) : undefined;
            setOpenOffer(null);
            if (item) { setShowCart(false); setDish({ item }); }
          }}
        />
      )}

      {dish && (
        <DishSheet
          key={dish.line?.key ?? dish.item.id}
          item={dish.item}
          initial={dish.line ? { selection: dish.line.selection, qty: dish.line.qty } : undefined}
          onClose={closeDish}
          onAdd={confirmDish}
        />
      )}
    </main>
  );
}
