/*
  Orders on the server: the guest's signed link, and reading one order for the page that link
  opens. The read names its columns (no select *), and goes through the service role only after
  the link's signature was checked by the caller: that signature is the guest's authorization.
*/
import "server-only";
import * as z from "zod/mini";
import { serverEnv } from "@/lib/env/server";
import { type Locale, localePath } from "@/lib/i18n/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORDER_CODE, orderToken, verifyOrderToken } from "./token";

/** The guest's link to an order, or null while ORDER_LINK_SECRET isn't set */
export function orderLink(locale: Locale, code: string, now = Date.now()): string | null {
  const secret = serverEnv().ORDER_LINK_SECRET;
  if (!secret) return null;
  return localePath(locale, `/order/${code}?t=${orderToken(code, secret, now)}`);
}

export function canOpenOrder(code: string, token: string | undefined | null): boolean {
  const secret = serverEnv().ORDER_LINK_SECRET;
  return !!secret && verifyOrderToken(code, token, secret);
}

const Item = z.object({
  line_no: z.int(),
  title: z.string(),
  variant_label: z.string(),
  kind: z.enum(["single", "bundle"]),
  quantity: z.int(),
  unit_price_agorot: z.int(),
});

const Row = z.object({
  id: z.string(),
  public_code: z.string(),
  kind: z.enum(["builder", "catalog"]),
  status: z.enum(["pending_payment", "requested", "quoted", "confirmed", "completed", "cancelled"]),
  needed_date: z.nullable(z.string()),
  fulfilment: z.nullable(z.enum(["delivery", "pickup"])),
  delivery_city: z.nullable(z.string()),
  window_from: z.nullable(z.string()),
  window_to: z.nullable(z.string()),
  subtotal_agorot: z.nullable(z.int()),
  discount_agorot: z.int(),
  discount_source: z.nullable(z.enum(["coupon", "launch_promo"])),
  shipping_agorot: z.nullable(z.int()),
  total_agorot: z.nullable(z.int()),
  payment_method: z.nullable(z.enum(["online", "whatsapp", "phone", "in_person"])),
  payment_status: z.enum(["unpaid", "pending", "paid", "refunded"]),
  slot_held_until: z.nullable(z.string()),
  cancelled_reason: z.nullable(z.string()),
  contact_name: z.nullable(z.string()),
  order_items: z.array(Item),
});
export type GuestOrder = z.infer<typeof Row>;

const COLUMNS =
  "id, public_code, kind, status, needed_date, fulfilment, delivery_city, window_from, window_to, subtotal_agorot, discount_agorot, discount_source, shipping_agorot, total_agorot, payment_method, payment_status, slot_held_until, cancelled_reason, contact_name, order_items(line_no, title, variant_label, kind, quantity, unit_price_agorot)";

/** One order by its public code (the caller has checked the link), or null */
export async function orderByCode(code: string): Promise<GuestOrder | null> {
  if (!ORDER_CODE.test(code)) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("orders").select(COLUMNS).eq("public_code", code).maybeSingle();
  if (error) throw new Error(`order read failed: ${error.message}`);
  if (!data) return null;
  const row = z.safeParse(Row, data);
  if (!row.success) throw new Error("order row has an unexpected shape");
  row.data.order_items.sort((a, b) => a.line_no - b.line_no);
  return row.data;
}
