/*
  Named rate limits for the shop's server actions (coupon guesses, checkouts, availability), on
  top of the proxy's general 30 a minute per client. Keys are hashed with RATE_LIMIT_SALT before
  they reach Redis, so no phone number or address is stored there.

  Without Upstash: allowed in development; in production allowed too, but reported to Sentry
  once, since the database's own limits (open orders per customer, the day's capacity) still hold.
*/
import "server-only";
import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";
import { redisFromEnv } from "@/lib/upstash";

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

const RULES = {
  coupon: { tokens: 8, window: "10 m" },
  quote: { tokens: 60, window: "10 m" },
  checkoutIp: { tokens: 10, window: "1 h" },
  checkoutPhone: { tokens: 5, window: "1 h" },
  requestIp: { tokens: 6, window: "1 h" },
  requestPhone: { tokens: 3, window: "1 h" },
  availability: { tokens: 60, window: "1 m" },
  login: { tokens: 10, window: "15 m" },
} satisfies Record<string, { tokens: number; window: Window }>;

export type LimitName = keyof typeof RULES;

const limiters = new Map<LimitName, Ratelimit>();
let warned = false;

function limiter(name: LimitName): Ratelimit | null {
  const had = limiters.get(name);
  if (had) return had;
  const redis = redisFromEnv();
  if (!redis) return null;
  const { tokens, window } = RULES[name];
  const made = new Ratelimit({ redis, prefix: `rl:${name}`, limiter: Ratelimit.slidingWindow(tokens, window), timeout: 800 });
  limiters.set(name, made);
  return made;
}

const hashed = (key: string) => createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? ""}:${key}`).digest("hex").slice(0, 32);

/** true: go ahead. false: over the limit (tell the customer to try again a little later) */
export async function allow(name: LimitName, key: string): Promise<boolean> {
  const l = limiter(name);
  if (!l) {
    if (process.env.NODE_ENV === "production" && !warned) {
      warned = true;
      Sentry.captureMessage("Rate limits are off: Upstash isn't configured", "warning");
    }
    return true;
  }
  try {
    const { success } = await l.limit(hashed(key));
    return success;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "rate-limit", limit: name } });
    return true;
  }
}
