"use server";
/*
  "Pay now" on the guest's order page: a fresh Grow payment page for that order. Allowed only with
  the order link's signature (the guest's key, checked here on the server), limited per client;
  the sum is the order's own (lib/grow/start.ts).
*/
import { headers } from "next/headers";
import * as z from "zod/mini";
import { clientKey } from "@/lib/edge/ip";
import { startPayment } from "@/lib/grow/start";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { canOpenOrder, orderByCode } from "@/lib/orders/server";
import { ORDER_CODE } from "@/lib/orders/token";
import { allow } from "@/lib/ratelimit";

const Input = z.object({ code: z.string().check(z.regex(ORDER_CODE)), token: z.string().check(z.maxLength(80)) });

export type PayResult = { ok: true; url: string } | { ok: false; error: "invalid" | "busy" | "expired" | "unavailable" };

export async function payOrder(rawLocale: unknown, input: unknown): Promise<PayResult> {
  const parsed = z.safeParse(Input, input);
  if (!parsed.success || !canOpenOrder(parsed.data.code, parsed.data.token)) return { ok: false, error: "invalid" };
  if (!(await allow("checkoutIp", clientKey(await headers())))) return { ok: false, error: "busy" };
  try {
    const order = await orderByCode(parsed.data.code);
    if (!order) return { ok: false, error: "invalid" };
    const result = await startPayment(order.id, isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE);
    if (result.ok) return result;
    return { ok: false, error: result.error === "expired" ? "expired" : result.error === "not_payable" ? "invalid" : "unavailable" };
  } catch (error) {
    console.error("[order] pay failed:", error);
    return { ok: false, error: "unavailable" };
  }
}
