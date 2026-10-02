"use server";
/*
  Placing a shop order. The browser sends ids, quantities, the contact details and its choices;
  everything that costs money is worked out here:
    1. the input checked with Zod (lib/checkout/input.ts), with length limits
    2. limits per client and per phone number, then Turnstile (the "not a robot" check)
    3. the cart priced again from the published catalog and settings in Sanity, and the coupon
       looked up again (lib/pricing/server.ts): if anything changed since the cart showed it, the
       customer is sent back to look
    4. the day checked against the owner's calendar (lead time, closed days, the delivery window)
    5. place_order in Supabase, which checks that the sums add up, takes the day's place under a
       lock (two customers can't take the last one), and checks the coupon's limits
  The answer is generic: what to fix, never why inside. The details go to the server log.
*/
import { after } from "next/server";
import { headers } from "next/headers";
import * as z from "zod/mini";
import { checkDate, israelDate } from "@/lib/checkout/calendar";
import { type CheckoutField, CheckoutInput, fieldsOf } from "@/lib/checkout/input";
import { clientIp, clientKey } from "@/lib/edge/ip";
import { growEnv, serverEnv } from "@/lib/env/server";
import { DEFAULT_LOCALE, isLocale, pick } from "@/lib/i18n/config";
import { notifyOrderPlaced } from "@/lib/notify/order";
import { startPayment } from "@/lib/grow/start";
import { orderLink } from "@/lib/orders/server";
import { quoteOnServer } from "@/lib/pricing/server";
import { allow } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

export type CheckoutError =
  | "fields"
  | "robot"
  | "busy"
  | "cart"
  | "coupon"
  | "date"
  | "date_full"
  | "window"
  | "outside"
  | "pickup"
  | "payment"
  | "too_many"
  | "closed"
  | "error";

export type CheckoutResult = { ok: true; href: string } | { ok: false; error: CheckoutError; fields?: CheckoutField[] };

const DB_ERRORS: Record<string, CheckoutError> = {
  date_full: "date_full",
  date_passed: "date",
  coupon_invalid: "coupon",
  too_many_open_orders: "too_many",
};

export async function placeOrder(rawLocale: unknown, input: unknown): Promise<CheckoutResult> {
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const parsed = z.safeParse(CheckoutInput, input);
  if (!parsed.success) return { ok: false, error: "fields", fields: fieldsOf(parsed.error) };
  const order = parsed.data;

  const db = supabaseAdmin();
  if (!db || !serverEnv().ORDER_LINK_SECRET) return { ok: false, error: "closed" };

  const h = await headers();
  if (!(await allow("checkoutIp", clientKey(h))) || !(await allow("checkoutPhone", order.phone))) return { ok: false, error: "busy" };
  if (!(await verifyTurnstile(order.turnstile, clientIp(h)))) return { ok: false, error: "robot" };

  const delivery = order.fulfilment.type === "delivery" ? ({ fulfilment: "delivery", city: order.fulfilment.city } as const) : ({ fulfilment: "pickup" } as const);
  let priced;
  try {
    priced = await quoteOnServer(order.lines, order.coupon, delivery);
  } catch (error) {
    console.error("[checkout] pricing failed:", error);
    return { ok: false, error: "error" };
  }
  const { quote, couponStatus, couponTerms, catalog, settings } = priced;
  if (!settings) return { ok: false, error: "closed" };
  if (quote.dropped.length > 0 || quote.lines.length === 0) return { ok: false, error: "cart" };
  if (couponStatus === "invalid" || couponStatus === "unmet") return { ok: false, error: "coupon" };

  if (order.fulfilment.type === "pickup" && !settings.pickupEnabled) return { ok: false, error: "pickup" };
  if (order.fulfilment.type === "delivery" && quote.shipping.status !== "zone") return { ok: false, error: "outside" };
  if (order.payment === "online" && !growEnv()) return { ok: false, error: "payment" };
  if (order.payment === "in_person" && order.fulfilment.type !== "pickup") return { ok: false, error: "payment" };

  const day = checkDate(settings, israelDate(), order.date, order.fulfilment.type === "delivery" ? { windowId: order.fulfilment.windowId } : null);
  if (!day.ok) return { ok: false, error: day.problem === "window" ? "window" : "date" };

  // the order keeps what the customer bought, in the owner's language, as it was priced now
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const items = quote.lines.map((line) => {
    const product = byId.get(line.productId)!;
    const variant = product.variants.find((v) => v.id === line.variantId)!;
    return {
      product_id: line.productId,
      variant_id: line.variantId,
      kind: line.kind,
      title: pick(product.title, DEFAULT_LOCALE).slice(0, 120) || line.productId,
      variant_label: pick(variant.label, DEFAULT_LOCALE).slice(0, 60) || "—",
      quantity: line.qty,
      unit_price_agorot: line.unitAgorot,
      bundle:
        line.kind === "bundle"
          ? product.bundle.map((b) => ({ product_id: b.productId, variant_id: b.variantId, quantity: b.quantity, title: pick(byId.get(b.productId)?.title, DEFAULT_LOCALE).slice(0, 120) }))
          : null,
    };
  });

  const f = order.fulfilment;
  const { data, error } = await db.rpc("place_order", {
    p_kind: "catalog",
    p_phone: order.phone,
    p_name: order.name,
    p_email: order.email || null,
    p_needed_date: order.date,
    p_capacity: day.capacity,
    p_fulfilment: f.type,
    p_delivery:
      f.type === "delivery" && quote.shipping.status === "zone"
        ? { zone: quote.shipping.zoneId, city: f.city, address: f.address, notes: f.notes ?? "", recipient_name: f.recipient?.name ?? "", recipient_phone: f.recipient?.phone ?? "" }
        : null,
    p_window_from: day.window?.from ?? null,
    p_window_to: day.window?.to ?? null,
    p_items: items,
    p_subtotal_agorot: quote.subtotalAgorot,
    p_discount_agorot: quote.discount?.amountAgorot ?? 0,
    p_discount_source: quote.discount?.source ?? null,
    p_coupon_id: quote.discount?.source === "coupon" ? (couponTerms?.id ?? null) : null,
    p_shipping_agorot: quote.shippingAgorot,
    p_total_agorot: quote.totalAgorot,
    p_payment_method: order.payment,
  });
  if (error) {
    const known = Object.keys(DB_ERRORS).find((k) => error.message.includes(k));
    if (known) return { ok: false, error: DB_ERRORS[known] };
    console.error("[checkout] place_order failed:", error.code, error.message);
    return { ok: false, error: "error" };
  }
  const placed = (Array.isArray(data) ? data[0] : data) as { order_id: string; order_code: string } | undefined;
  if (!placed?.order_code) {
    console.error("[checkout] place_order returned no order");
    return { ok: false, error: "error" };
  }

  after(() => notifyOrderPlaced(placed.order_id));

  const href = orderLink(locale, placed.order_code);
  if (!href) return { ok: false, error: "error" };
  if (order.payment === "online") {
    const pay = await startPayment(placed.order_id, locale);
    if (pay.ok) return { ok: true, href: pay.url };
  }
  return { ok: true, href };
}
