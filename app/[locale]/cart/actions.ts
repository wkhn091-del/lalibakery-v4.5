"use server";
/*
  The cart's coupon check: the server's price for what's in the cart, with the coupon looked up in
  Supabase. A public action (anyone may ask), so: the input checked with Zod and length limits, the
  calls limited per client (the coupon bucket is tight, against guessing codes), and the answer
  shaped to what the cart shows. Errors are generic; the details stay in the server log.

  A valid coupon's terms come back (its kind, value and minimum, never its id), so the cart can
  update its estimate as quantities change without asking again. That estimate is for display
  only: the checkout prices the order and checks the coupon again, from scratch.
*/
import { headers } from "next/headers";
import * as z from "zod/mini";
import { clientKey } from "@/lib/edge/ip";
import type { CouponTerms, Quote } from "@/lib/pricing/engine";
import { QuoteInput } from "@/lib/pricing/input";
import { type CouponStatus, quoteOnServer } from "@/lib/pricing/server";
import { allow } from "@/lib/ratelimit";

export type PublicCouponTerms = Omit<CouponTerms, "id">;

export type QuoteResult =
  | {
      ok: true;
      subtotalAgorot: number;
      discountAgorot: number;
      totalAgorot: number;
      dropped: { productId: string; variantId: string }[];
      couponStatus: CouponStatus;
      coupon: PublicCouponTerms | null;
      freeDelivery: Quote["freeDelivery"];
    }
  | { ok: false; error: "invalid" | "busy" | "error" };

export async function quoteCart(input: unknown): Promise<QuoteResult> {
  const parsed = z.safeParse(QuoteInput, input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { lines, coupon, delivery } = parsed.data;

  const who = clientKey(await headers());
  const withCoupon = !!coupon?.trim();
  if (!(await allow(withCoupon ? "coupon" : "quote", who))) return { ok: false, error: "busy" };

  try {
    const { quote, couponStatus, couponTerms } = await quoteOnServer(lines, coupon, delivery ?? null);
    return {
      ok: true,
      subtotalAgorot: quote.subtotalAgorot,
      discountAgorot: quote.discount?.amountAgorot ?? 0,
      totalAgorot: quote.totalAgorot,
      dropped: quote.dropped.map(({ productId, variantId }) => ({ productId, variantId })),
      couponStatus,
      coupon: couponTerms && { kind: couponTerms.kind, value: couponTerms.value, minSubtotalAgorot: couponTerms.minSubtotalAgorot },
      freeDelivery: quote.freeDelivery,
    };
  } catch (error) {
    console.error("[cart] quote failed:", error);
    return { ok: false, error: "error" };
  }
}
