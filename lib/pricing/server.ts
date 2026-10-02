/*
  The server's price for a cart: the pricing engine run against the published catalog and
  settings in Sanity (never drafts: a price is charged only once the owner published it) and the
  coupon in Supabase. Used by the cart's quote and by the checkout, which prices again from
  scratch at the moment of the order.
*/
import "server-only";
import { lookupCoupon } from "@/lib/coupons/server";
import type { ShopCatalog, StoreSettings } from "@/lib/shop/normalize";
import { getShopCatalog, getStoreSettings } from "@/sanity/shop";
import { type CouponTerms, type Delivery, priceCart, type Quote } from "./engine";
import type { CartLine } from "./engine";

export type CouponStatus = "none" | "applied" | "invalid" | "unmet" | "not_better";

export type ServerQuote = {
  quote: Quote;
  couponStatus: CouponStatus;
  /** the coupon's terms when the code is valid now (its minimum is checked against the cart) */
  couponTerms: CouponTerms | null;
  catalog: ShopCatalog;
  settings: StoreSettings | null;
};

export async function quoteOnServer(lines: CartLine[], couponText: string | undefined, delivery: Delivery, now = new Date()): Promise<ServerQuote> {
  const [catalog, settings, coupon] = await Promise.all([
    getShopCatalog({ published: true }),
    getStoreSettings({ published: true }),
    lookupCoupon(couponText, now),
  ]);
  const terms = coupon.status === "found" ? coupon.terms : null;
  const quote = priceCart({ lines, products: catalog.products, settings, coupon: terms, delivery, now });

  let couponStatus: CouponStatus = coupon.status === "none" ? "none" : coupon.status === "invalid" ? "invalid" : "applied";
  if (couponStatus === "applied") {
    if (quote.couponUnmet) couponStatus = "unmet";
    else if (quote.discount?.source !== "coupon") couponStatus = "not_better";
  }
  return { quote, couponStatus, couponTerms: terms, catalog, settings };
}
