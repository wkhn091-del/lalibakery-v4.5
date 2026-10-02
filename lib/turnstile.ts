/*
  Cloudflare Turnstile, checked on the server: the browser's token is sent to Cloudflare with the
  secret, and only a "success" from Cloudflare lets the checkout (or the builder's request) through.
  A token is good once. Without TURNSTILE_SECRET_KEY the check is off (development); in production
  that's reported to Sentry once, since the rate limits and the database's own limits still hold.
*/
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serverEnv } from "@/lib/env/server";

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warned = false;

export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = serverEnv().TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production" && !warned) {
      warned = true;
      Sentry.captureMessage("Turnstile is off: TURNSTILE_SECRET_KEY isn't set", "warning");
    }
    return true;
  }
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`Turnstile answered ${res.status}`);
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch (error) {
    // Cloudflare unreachable: refuse (the customer can try again), and tell us
    Sentry.captureException(error, { tags: { area: "turnstile" } });
    return false;
  }
}
