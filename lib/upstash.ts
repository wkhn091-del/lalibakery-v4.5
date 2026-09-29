/*
  Upstash Redis from the environment, for the rate limits (middleware.ts and the Send SMS hook).
  Upstash's own variable names, or the KV_ names the Vercel Marketplace integration sets.
  null when neither is set: the caller decides what that means (the middleware lets requests
  through; the SMS hook refuses to run in production).

  Every caller works to a tight budget (the middleware adds to each request; Supabase waits 5 s
  for the hook), so one quick retry instead of the client's default five.

  The fetch-only build of the client (published as "cloudflare"): the default build reads
  process.version, which Next.js flags in the Edge runtime the middleware runs on.
*/
import { Redis } from "@upstash/redis/cloudflare";

export function redisFromEnv(env: Record<string, string | undefined> = process.env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, retry: { retries: 1, backoff: () => 50 }, enableTelemetry: false });
}
