"use client";
/*
  The cart, in the browser (Zustand, kept in localStorage). It holds only what the Security
  Baseline allows: product and size ids, quantities, the basics to show a line (name, size name,
  thumbnail, address) and the coupon as typed. Never a price, a total, a phone number or an address:
  prices come from the catalog the page was given, and the order is priced on the server.

  What comes back from localStorage is checked (it could be old, or edited by hand): a line that
  doesn't match the shape is dropped, quantities stay 1 to 20, at most 30 lines. Lines whose product
  or size is gone from the catalog are removed by the cart page (reconcile).
*/
import { useEffect, useState } from "react";
import * as z from "zod/mini";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MAX_LINES, MAX_QTY } from "@/lib/pricing/engine";
import { CartLineInput } from "@/lib/pricing/input";

const Display = z.object({
  title: z.string().check(z.maxLength(120)),
  variantLabel: z.string().check(z.maxLength(60)),
  thumb: z.nullable(z.string().check(z.maxLength(600), z.regex(/^(https:\/\/cdn\.sanity\.io\/|\/)/))),
  href: z.string().check(z.maxLength(200), z.regex(/^\/[^/]/)),
});

const Item = z.extend(CartLineInput, Display.shape);
export type CartItem = z.infer<typeof Item>;

const Stored = z.object({
  items: z.array(z.unknown()).check(z.maxLength(100)),
  coupon: z.optional(z.string().check(z.maxLength(64))),
});

type CartState = {
  items: CartItem[];
  coupon: string;
  add: (item: Omit<CartItem, "qty">, qty: number) => void;
  setQty: (productId: string, variantId: string, qty: number) => void;
  remove: (productId: string, variantId: string) => void;
  /** keep only lines the catalog still has (by product and size id) */
  reconcile: (keep: (productId: string, variantId: string) => boolean) => void;
  setCoupon: (coupon: string) => void;
  clear: () => void;
};

const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
const same = (a: { productId: string; variantId: string }, productId: string, variantId: string) => a.productId === productId && a.variantId === variantId;

function cleanItems(raw: unknown[]): CartItem[] {
  const out: CartItem[] = [];
  for (const r of raw) {
    const parsed = z.safeParse(Item, r);
    if (!parsed.success) continue;
    const had = out.find((i) => same(i, parsed.data.productId, parsed.data.variantId));
    if (had) had.qty = clampQty(had.qty + parsed.data.qty);
    else if (out.length < MAX_LINES) out.push(parsed.data);
  }
  return out;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      coupon: "",
      add: (item, qty) =>
        set((s) => {
          const had = s.items.find((i) => same(i, item.productId, item.variantId));
          if (had) return { items: s.items.map((i) => (i === had ? { ...i, ...item, qty: clampQty(i.qty + qty) } : i)) };
          if (s.items.length >= MAX_LINES) return s;
          return { items: [...s.items, { ...item, qty: clampQty(qty) }] };
        }),
      setQty: (productId, variantId, qty) => set((s) => ({ items: s.items.map((i) => (same(i, productId, variantId) ? { ...i, qty: clampQty(qty) } : i)) })),
      remove: (productId, variantId) => set((s) => ({ items: s.items.filter((i) => !same(i, productId, variantId)) })),
      reconcile: (keep) =>
        set((s) => {
          const items = s.items.filter((i) => keep(i.productId, i.variantId));
          return items.length === s.items.length ? s : { items };
        }),
      setCoupon: (coupon) => set({ coupon: coupon.slice(0, 64) }),
      clear: () => set({ items: [], coupon: "" }),
    }),
    {
      name: "lali-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, coupon: s.coupon }),
      merge: (persisted, current) => {
        const parsed = z.safeParse(Stored, persisted);
        if (!parsed.success) return current;
        return { ...current, items: cleanItems(parsed.data.items), coupon: parsed.data.coupon ?? "" };
      },
      skipHydration: true,
    },
  ),
);

/** Read the stored cart once, on the client (the server render always starts empty) */
let hydrating: Promise<void> | null = null;
export function hydrateCart(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydrating ??= Promise.resolve(useCart.persist.rehydrate());
  return hydrating;
}

/** false until the stored cart is read: until then the page shows no count and no lines */
export function useCartReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void hydrateCart().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
