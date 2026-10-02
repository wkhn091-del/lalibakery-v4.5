"use server";
/*
  A cake from the builder, sent to the owner as a request (no price, no payment: she prices it and
  sends a payment link, or it's paid when the cake is handed over):
    1. the input checked with Zod (lib/order/request.ts), with length limits
    2. limits per client and per phone number, then Turnstile
    3. the cake checked again against the published catalog and add-ons (lib/order/validate.ts):
       whatever summary or label the browser sent is never read, it's rebuilt here
    4. a date, when one was picked, checked against the owner's calendar
    5. place_order (kind builder) in Supabase, which takes the day's place under a lock
  The answer is generic: what to fix, never why inside. The details go to the server log.
*/
import { after } from "next/server";
import { headers } from "next/headers";
import * as z from "zod/mini";
import { checkDate, israelDate } from "@/lib/checkout/calendar";
import { clientIp, clientKey } from "@/lib/edge/ip";
import { notifyRequestPlaced } from "@/lib/notify/order";
import { BUILT_IN_CATALOG, indexed } from "@/lib/order/model";
import { CakeRequestInput, type CakeRequestField, requestFieldsOf } from "@/lib/order/request";
import { validateOrder } from "@/lib/order/validate";
import { allow } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { getCakePage } from "@/sanity/content";
import { getCatalog } from "@/sanity/data";
import { getStoreSettings, getWizardAddons } from "@/sanity/shop";

export type CakeRequestError = "fields" | "robot" | "busy" | "date" | "date_full" | "too_many" | "closed" | "error";
export type CakeRequestResult = { ok: true; code: string } | { ok: false; error: CakeRequestError; fields?: CakeRequestField[] };

const DB_ERRORS: Record<string, CakeRequestError> = {
  date_full: "date_full",
  date_passed: "date",
  too_many_open_orders: "too_many",
};

export async function sendCakeRequest(input: unknown): Promise<CakeRequestResult> {
  const parsed = z.safeParse(CakeRequestInput, input);
  if (!parsed.success) return { ok: false, error: "fields", fields: requestFieldsOf(parsed.error) };
  const req = parsed.data;

  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "closed" };

  const h = await headers();
  if (!(await allow("requestIp", clientKey(h))) || !(await allow("requestPhone", req.phone))) return { ok: false, error: "busy" };
  if (!(await verifyTurnstile(req.turnstile, clientIp(h)))) return { ok: false, error: "robot" };

  let checked;
  let settings;
  try {
    const [catalog, addons, page, store] = await Promise.all([getCatalog(), getWizardAddons(), getCakePage(false), getStoreSettings({ published: true })]);
    const cat = indexed({ ...(catalog ?? BUILT_IN_CATALOG), addons });
    checked = validateOrder(req.draft, cat, israelDate(), page.wizard.order);
    settings = store;
  } catch (error) {
    console.error("[cake request] loading the catalog failed:", error);
    return { ok: false, error: "error" };
  }
  if (!checked.ok) {
    console.warn("[cake request] the cake didn't pass the check:", Object.keys(checked.fields).join(", "));
    return { ok: false, error: "fields", fields: ["cake"] };
  }
  const { order } = checked;

  let capacity = 0;
  if (order.date) {
    if (!settings) return { ok: false, error: "date" };
    const day = checkDate(settings, israelDate(), order.date, null);
    if (!day.ok) return { ok: false, error: "date" };
    capacity = day.capacity;
  }

  const { summary, ...details } = order;
  const { data, error } = await db.rpc("place_order", {
    p_kind: "builder",
    p_phone: req.phone,
    p_name: req.name,
    p_email: req.email || null,
    p_needed_date: order.date ?? null,
    p_capacity: capacity,
    p_category: order.category.id,
    p_details: { summary, cake: details },
    p_estimated_price_agorot: order.price != null ? Math.round(order.price * 100) : null,
  });
  if (error) {
    const known = Object.keys(DB_ERRORS).find((k) => error.message.includes(k));
    if (known) return { ok: false, error: DB_ERRORS[known] };
    console.error("[cake request] place_order failed:", error.code, error.message);
    return { ok: false, error: "error" };
  }
  const placed = (Array.isArray(data) ? data[0] : data) as { order_id: string; order_code: string } | undefined;
  if (!placed?.order_code) {
    console.error("[cake request] place_order returned no order");
    return { ok: false, error: "error" };
  }

  after(() => notifyRequestPlaced(placed.order_id));
  return { ok: true, code: placed.order_code };
}
