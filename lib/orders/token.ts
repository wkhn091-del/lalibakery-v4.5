/*
  The guest's link to their order: /order/LB-7KQ2M9XA?t=<expiry>.<signature>. There's no login in
  this checkout, so the link itself is the key: the code alone isn't enough (it isn't secret, it
  goes in WhatsApp messages), the signature proves the server made the link, and it expires after
  72 hours. HMAC-SHA256 with ORDER_LINK_SECRET, compared in constant time.
*/
import { createHmac, timingSafeEqual } from "node:crypto";

export const ORDER_CODE = /^LB-[A-HJ-KMNP-Z2-9]{8}$/;
export const ORDER_LINK_HOURS = 72;
const TOKEN = /^(\d{10})\.([A-Za-z0-9_-]{43})$/;

const sign = (code: string, exp: number, secret: string) => createHmac("sha256", secret).update(`order:${code}:${exp}`).digest("base64url");

export function orderToken(code: string, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ORDER_LINK_HOURS * 3600;
  return `${exp}.${sign(code, exp, secret)}`;
}

export function verifyOrderToken(code: string, token: string | undefined | null, secret: string, now = Date.now()): boolean {
  if (!ORDER_CODE.test(code) || typeof token !== "string") return false;
  const m = TOKEN.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 <= now) return false;
  const given = Buffer.from(m[2]);
  const expected = Buffer.from(sign(code, exp, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
