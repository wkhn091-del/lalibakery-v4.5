/*
  A cheap first check at the edge: requests that change something (Server Actions on
  /custom-cake, and our own API routes) are limited per client, 30 a minute, before any function
  runs. Page views never reach Redis: the matcher only runs this for Server Action calls on the
  cake page, and GET requests pass straight through.

  Left out: the two signed callbacks (the SMS hook and the QStash reminder), which have limits of
  their own, and Sentry's /monitoring tunnel, which Sentry 11 no longer exempts from middleware.

  Without Upstash (development, or a deploy without the variables) everything passes, as it does
  when Redis is slow (after 500 ms) or failing: this layer is a filter, and the limits that guard
  money (SMS, Supabase) don't depend on it.
*/
import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clientKey } from "@/lib/edge/ip";
import { redisFromEnv } from "@/lib/upstash";

let perClient: Ratelimit | null = null;
function limiter(): Ratelimit | null {
  if (perClient) return perClient;
  const redis = redisFromEnv();
  return (perClient = redis && new Ratelimit({
    redis,
    prefix: "ip",
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    ephemeralCache: new Map(), // a client already over the limit is refused without asking Redis
    timeout: 500,
  }));
}

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (READS.has(req.method)) return NextResponse.next();
  const perIp = limiter();
  if (!perIp) return NextResponse.next();
  try {
    const { success, reset, pending } = await perIp.limit(clientKey(req.headers));
    event.waitUntil(pending);
    if (success) return NextResponse.next();
    const wait = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": String(wait) } });
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "rate-limit" } });
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Server Actions post to the page itself, with a Next-Action header
    { source: "/custom-cake", has: [{ type: "header", key: "next-action" }] },
    // our API routes, except the SMS hook (/api/hooks/*) and the QStash reminder (/api/cart/remind)
    "/api/((?!hooks/|cart/remind).*)",
  ],
};
