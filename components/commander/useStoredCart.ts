"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resumeCart, saveCart, type Cart } from "@/lib/site-orders/cart";
import type { PublicMenu } from "@/lib/site-orders/menu";

// ADR 0111 §1 — le panier gardé dans le navigateur À CHAQUE CHANGEMENT : le client lit une autre page et revient, il le
// retrouve. Même durée de vie qu'avant (deux heures après le dernier changement : le simple fait de revenir ne la prolonge
// pas). Un simple retour restaure en silence ; seul le retour de la connexion ouvre le panier et l'annonce.
// Un stockage refusé (navigation privée) n'est jamais une erreur : le panier vit alors dans cet onglet seulement.

type Resume = { open: boolean; note: string | null };

export function useStoredCart(restaurantId: string, menu: PublicMenu | null) {
  const key = `site_order_cart:${restaurantId}`;
  const [cart, setCart] = useState<Cart>([]);
  const [resumed, setResumed] = useState<Resume | null>(null);
  /** Le panier tel qu'il vient d'être relu : le réécrire changerait son âge. */
  const asRead = useRef<Cart | null>(null);

  // La carte est là : on reconstruit le panier gardé à partir d'elle.
  useEffect(() => {
    if (!menu) return;
    let next: Cart = [];
    let resume: Resume = { open: false, note: null };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        const r = resumeCart(saved, menu);
        next = r.cart;
        resume = { open: r.open, note: r.note };
        if (r.cart.length === 0) localStorage.removeItem(key); // périmé, illisible ou vidé par la carte
        else if (saved.login === true) localStorage.setItem(key, JSON.stringify({ ...saved, login: false })); // annoncé une fois
      }
    } catch {
      /* stockage refusé ou illisible : on repart d'un panier vide */
    }
    asRead.current = next;
    setCart(next);
    // Une seconde exécution (mode strict) ne doit pas effacer l'annonce de la première.
    setResumed((before) => (before?.open ? before : resume));
  }, [menu, key]);

  const loaded = resumed !== null;
  useEffect(() => {
    if (!loaded || cart === asRead.current) return;
    try {
      if (cart.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(saveCart(cart)));
    } catch {
      /* stockage refusé : le panier reste dans cet onglet */
    }
  }, [cart, loaded, key]);

  /** Le client part se connecter : son panier est daté de maintenant, et il s'ouvrira à son retour. */
  const markLoginLeave = useCallback(() => {
    try {
      if (cart.length > 0) localStorage.setItem(key, JSON.stringify({ ...saveCart(cart), login: true }));
    } catch {
      /* stockage refusé : le panier restera dans cet onglet */
    }
  }, [cart, key]);

  /** La commande est partie : l'annonce de reprise n'a plus d'objet. */
  const forgetNote = useCallback(() => setResumed({ open: false, note: null }), []);

  return { cart, setCart, resumed, markLoginLeave, forgetNote };
}
