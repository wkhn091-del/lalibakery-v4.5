/*
  Reading Grow's server update, and the reference we put in its address. Pure, so it's tested.

  The update isn't signed by Grow, so nothing in it is believed: it only says which transaction to
  ask Grow about (getTransactionInfo, server to server), and that answer is checked against the
  order. The address it's posted to carries the order id and our own HMAC of it, so a random
  POST is refused before anything is looked up.
*/
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const refSig = (orderId: string, secret: string) => createHmac("sha256", secret).update(`grow-notify:${orderId}`).digest("base64url");

export const notifyRef = (orderId: string, secret: string) => ({ o: orderId, s: refSig(orderId, secret) });

export function checkNotifyRef(orderId: string | null, sig: string | null, secret: string): orderId is string {
  if (!orderId || !sig || !UUID.test(orderId) || sig.length > 64) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(refSig(orderId, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The fields of an update, from form data or JSON, flat or under `data` (Grow sends both shapes:
 * `data[transactionId]=…` in a form, or {data: {transactionId}} in JSON).
 */
export function flattenUpdate(entries: Iterable<[string, unknown]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of entries) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const key = rawKey.replace(/^data\[([^\]]+)\]$/, "$1");
    if (key.length <= 64 && !(key in out)) out[key] = String(value).slice(0, 500);
  }
  return out;
}

export function fieldsOfJson(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object") return {};
  const top = json as Record<string, unknown>;
  const inner = top.data && typeof top.data === "object" && !Array.isArray(top.data) ? (top.data as Record<string, unknown>) : top;
  return flattenUpdate(Object.entries(inner));
}

/** What identifies the transaction to ask Grow about */
export function transactionOf(fields: Record<string, string>): { transactionId: string; transactionToken: string } | null {
  const transactionId = fields.transactionId ?? "";
  const transactionToken = fields.transactionToken ?? "";
  if (!/^\d{1,20}$/.test(transactionId) || !/^[A-Za-z0-9]{8,128}$/.test(transactionToken)) return null;
  return { transactionId, transactionToken };
}

const METHODS: Record<string, string> = { "1": "card", "6": "bit", "13": "apple_pay", "14": "google_pay" };
export const methodOf = (transactionTypeId: string | undefined) => METHODS[transactionTypeId ?? ""] ?? "other";

/** Grow's answer about a transaction: data is one object, or a list with it */
export function transactionInfo(data: unknown): Record<string, string> | null {
  const one = Array.isArray(data) ? data[0] : data;
  if (!one || typeof one !== "object") return null;
  const row = one as Record<string, unknown>;
  const custom = row.customFields && typeof row.customFields === "object" ? Object.entries(row.customFields as Record<string, unknown>) : [];
  return flattenUpdate([...Object.entries(row), ...custom]);
}
