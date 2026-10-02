/*
  What the browser may send about a cart, and nothing more: product ids, size ids, quantities and a
  coupon's text. Checked with Zod, with length limits, by every server action that prices a cart.
  The same limits keep the browser's stored cart tidy (lib/cart/store.ts).
*/
import * as z from "zod/mini";
import { MAX_LINES, MAX_QTY } from "./engine";

const ID = /^[A-Za-z0-9._-]{1,128}$/;

export const CartLineInput = z.object({
  productId: z.string().check(z.regex(ID)),
  variantId: z.string().check(z.regex(ID)),
  qty: z.int().check(z.gte(1), z.lte(MAX_QTY)),
});

export const CartLinesInput = z.array(CartLineInput).check(z.minLength(1), z.maxLength(MAX_LINES));

/** A coupon as typed: letters, digits and dashes, 3 to 32 of them (spaces and case don't matter) */
export const COUPON_MAX = 32;
export const normalizeCoupon = (raw: string) => raw.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
export const CouponInput = z.pipe(
  z.string().check(z.maxLength(64)),
  z.pipe(z.transform(normalizeCoupon), z.string().check(z.regex(/^[A-Z0-9-]{3,32}$/))),
);

export const CityInput = z.string().check(z.minLength(2), z.maxLength(40));

export const DeliveryInput = z.nullish(
  z.discriminatedUnion("fulfilment", [
    z.object({ fulfilment: z.literal("pickup") }),
    z.object({ fulfilment: z.literal("delivery"), city: CityInput }),
  ]),
);

export const QuoteInput = z.object({
  lines: CartLinesInput,
  coupon: z.optional(z.string().check(z.maxLength(64))),
  delivery: DeliveryInput,
});
export type QuoteInput = z.infer<typeof QuoteInput>;
