/*
  The scheduled jobs' door: Vercel Cron calls them with "Authorization: Bearer <CRON_SECRET>".
  Compared in constant time; without CRON_SECRET every call is refused.
*/
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

export function cronAllowed(headers: Headers): boolean {
  const secret = serverEnv().CRON_SECRET;
  const given = headers.get("authorization") ?? "";
  if (!secret || !given.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(given.slice(7)).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
