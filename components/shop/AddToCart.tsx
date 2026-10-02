"use client";
/*
  On a product page: the size (for a single product), how many, and "add to cart". What goes into
  the cart is ids, the quantity and the names to show (lib/cart/store.ts); the price stays the
  catalog's and is charged as the server computes it at checkout.
*/
import Link from "next/link";
import { useState } from "react";
import type { Messages } from "@/lib/i18n/messages";
import { hydrateCart, useCart } from "@/lib/cart/store";
import { agorotText } from "@/lib/price";
import QtyStepper from "./QtyStepper";

export type AddVariant = { id: string; label: string; priceAgorot: number; available: boolean; servings: string };

type T = Pick<Messages["product"], "sizes" | "unavailable" | "quantity" | "addToCart" | "added" | "viewCart"> & Pick<Messages["cart"], "decrease" | "increase">;

export default function AddToCart({
  product,
  variants,
  cartHref,
  t,
}: {
  product: { id: string; kind: "single" | "bundle"; title: string; href: string; thumb: string | null };
  variants: AddVariant[];
  cartHref: string;
  t: T;
}) {
  const [variantId, setVariantId] = useState(() => variants.find((v) => v.available)?.id ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const chosen = variants.find((v) => v.id === variantId && v.available);

  async function add() {
    if (!chosen) return;
    await hydrateCart();
    useCart.getState().add(
      { productId: product.id, variantId: chosen.id, title: product.title.slice(0, 120), variantLabel: chosen.label.slice(0, 60), thumb: product.thumb, href: product.href },
      qty,
    );
    setAdded(true);
  }

  return (
    <div className="add-to-cart">
      {product.kind === "single" && (
        <fieldset className="product-section">
          <legend className="product-h">{t.sizes}</legend>
          <ul className="product-sizes">
            {variants.map((v) => (
              <li key={v.id} data-unavailable={v.available ? undefined : ""}>
                <label className="size-option">
                  <input
                    type="radio"
                    name="size"
                    value={v.id}
                    checked={variantId === v.id}
                    disabled={!v.available}
                    onChange={() => {
                      setVariantId(v.id);
                      setAdded(false);
                    }}
                  />
                  <span className="product-size-label">
                    {v.label}
                    {v.servings && <span className="soft block text-[15px]">{v.servings}</span>}
                  </span>
                </label>
                <span className="product-size-price">{v.available ? agorotText(v.priceAgorot) : t.unavailable}</span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {chosen ? (
        <div className="add-row mt-6">
          <QtyStepper
            value={qty}
            onChange={(n) => {
              setQty(n);
              setAdded(false);
            }}
            label={t.quantity}
            decrease={t.decrease}
            increase={t.increase}
          />
          <button type="button" className="btn-primary" onClick={add}>{t.addToCart}</button>
        </div>
      ) : (
        <p className="soft mt-6">{t.unavailable}</p>
      )}
      <p className="add-status" role="status">
        {added && (
          <>
            {t.added} · <Link href={cartHref} className="text-link">{t.viewCart}</Link>
          </>
        )}
      </p>
    </div>
  );
}
