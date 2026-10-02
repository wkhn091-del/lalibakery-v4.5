/*
  Coupons live in Supabase, never in Sanity: a code is a secret, whoever knows it gets the
  discount. The code itself isn't stored either, only its HMAC with COUPON_PEPPER, so a leaked
  table gives away no working code. The owner sees a hint (the first characters) in her list.

  Here: turning a typed code into what the pricing engine needs, for a code that's switched on and
  within its dates. Whether this customer may still use it (the total and per-customer limits) is
  the database's call when the order is placed (place_order, under a lock), so two checkouts
  can't both take the last use.
*/
import "server-only";
import { createHmac } from "node:crypto";
import * as z from "zod/mini";
import type { CouponTerms } from "@/lib/pricing/engine";
import { CouponInput } from "@/lib/pricing/input";
import { serverEnv } from "@/lib/env/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** The stored form of a code (the admin screen uses the same when creating one) */
export function couponHash(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(code).digest("hex");
}

export function couponHint(code: string): string {
  return code.length <= 4 ? `${code.slice(0, 1)}…` : `${code.slice(0, 3)}…${code.slice(-1)}`;
}

const Row = z.object({
  id: z.string(),
  kind: z.enum(["percent", "amount"]),
  value: z.int(),
  min_subtotal_agorot: z.int(),
  starts_at: z.nullable(z.string()),
  ends_at: z.nullable(z.string()),
  active: z.boolean(),
});

export type CouponLookup = { status: "none" } | { status: "invalid" } | { status: "found"; terms: CouponTerms };

/** A typed code: none (empty), invalid (malformed, unknown, off, or outside its dates), or its terms */
export async function lookupCoupon(raw: string | undefined, now = new Date()): Promise<CouponLookup> {
  if (!raw?.trim()) return { status: "none" };
  const parsed = z.safeParse(CouponInput, raw);
  if (!parsed.success) return { status: "invalid" };

  const pepper = serverEnv().COUPON_PEPPER;
  const db = supabaseAdmin();
  if (!pepper || !db) return { status: "invalid" };

  const { data, error } = await db
    .from("coupons")
    .select("id, kind, value, min_subtotal_agorot, starts_at, ends_at, active")
    .eq("code_hash", couponHash(parsed.data, pepper))
    .maybeSingle();
  if (error) {
    console.error("[coupons] lookup failed:", error.message);
    return { status: "invalid" };
  }
  const row = z.safeParse(Row, data);
  if (!row.success) return { status: "invalid" };
  const c = row.data;
  const t = now.getTime();
  if (!c.active || (c.starts_at && t < Date.parse(c.starts_at)) || (c.ends_at && t >= Date.parse(c.ends_at))) return { status: "invalid" };
  return { status: "found", terms: { id: c.id, kind: c.kind, value: c.value, minSubtotalAgorot: c.min_subtotal_agorot } };
}
