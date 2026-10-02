/*
  Opening Grow's payment page for an order that waits to be paid online: the sum is the order's
  total as the database holds it (priced on the server at checkout), never a number from the
  browser. The page's address is fresh each time (Grow's links are short-lived); the order keeps
  its day for 30 minutes from checkout, so after that there's nothing to pay for.
*/
import "server-only";
import * as Sentry from "@sentry/nextjs";
import * as z from "zod/mini";
import { growEnv, serverEnv, siteUrl } from "@/lib/env/server";
import type { Locale } from "@/lib/i18n/config";
import { orderLink } from "@/lib/orders/server";
import { localPhone } from "@/lib/phone";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GrowError, growCall, toSum } from "./client";
import { notifyRef } from "./update";

const Payable = z.object({
  id: z.string(),
  public_code: z.string(),
  status: z.string(),
  payment_status: z.string(),
  payment_method: z.nullable(z.string()),
  slot_held_until: z.nullable(z.string()),
  total_agorot: z.nullable(z.int()),
  contact_name: z.nullable(z.string()),
  contact_email: z.nullable(z.string()),
  customers: z.object({ phone: z.string() }),
});

export type StartResult = { ok: true; url: string } | { ok: false; error: "not_payable" | "expired" | "unavailable" };

export async function startPayment(orderId: string, locale: Locale, now = new Date()): Promise<StartResult> {
  const db = supabaseAdmin();
  const secret = serverEnv().ORDER_LINK_SECRET;
  if (!db || !secret || !growEnv()) return { ok: false, error: "unavailable" };

  const { data, error } = await db
    .from("orders")
    .select("id, public_code, status, payment_status, payment_method, slot_held_until, total_agorot, contact_name, contact_email, customers(phone)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[grow] order read failed:", error.message);
    return { ok: false, error: "unavailable" };
  }
  const row = z.safeParse(Payable, data);
  if (!row.success) return { ok: false, error: "unavailable" };
  const o = row.data;
  if (o.payment_method !== "online" || o.payment_status === "paid" || !o.total_agorot || o.total_agorot <= 0) return { ok: false, error: "not_payable" };
  if (o.status !== "pending_payment") return { ok: false, error: o.status === "cancelled" ? "expired" : "not_payable" };
  if (!o.slot_held_until || Date.parse(o.slot_held_until) <= now.getTime()) return { ok: false, error: "expired" };

  const back = orderLink(locale, o.public_code, now.getTime());
  if (!back) return { ok: false, error: "unavailable" };
  const site = siteUrl();
  const ref = notifyRef(o.id, secret);
  const fields: Record<string, string> = {
    sum: toSum(o.total_agorot),
    chargeType: "1",
    description: `Lalibakery ${o.public_code}`,
    successUrl: `${site}${back}&paid=1`,
    cancelUrl: `${site}${back}`,
    notifyUrl: `${site}/api/hooks/grow?o=${ref.o}&s=${ref.s}`,
    "pageField[fullName]": o.contact_name ?? "",
    "pageField[phone]": localPhone(o.customers.phone).replace(/-/g, ""),
    cField1: o.id,
  };
  if (o.contact_email) fields["pageField[email]"] = o.contact_email;

  try {
    const answer = await growCall("createPaymentProcess", fields);
    const url = (answer.data as { url?: unknown } | null)?.url;
    if (typeof url !== "string" || !/^https:\/\/([a-z0-9-]+\.)*(meshulam\.co\.il|grow\.business|grow\.link)\//i.test(url)) throw new GrowError("createPaymentProcess", "no payment page address");
    return { ok: true, url };
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "grow" } });
    console.error("[grow]", error instanceof Error ? error.message : error);
    return { ok: false, error: "unavailable" };
  }
}
