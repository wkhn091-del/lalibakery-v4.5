/*
  The server's secrets and settings, checked (lib/env/schema.ts). Every secret is read through
  here, and this file never reaches the browser.
*/
import "server-only";
import { parseEnv, type ServerEnv } from "./schema";

let checked: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  return (checked ??= parseEnv(process.env));
}

/** Grow's settings, or null while any of them is missing (the checkout then offers manual payment only) */
export function growEnv(env: ServerEnv = serverEnv()) {
  if (!env.GROW_PAGE_CODE || !env.GROW_USER_ID) return null;
  return {
    apiUrl: (env.GROW_API_URL ?? (env.NODE_ENV === "production" ? "https://secure.meshulam.co.il" : "https://sandbox.meshulam.co.il")).replace(/\/+$/, ""),
    pageCode: env.GROW_PAGE_CODE,
    userId: env.GROW_USER_ID,
    apiKey: env.GROW_API_KEY,
  };
}

/** The site's own address, for links in emails and the payment page's return addresses */
export function siteUrl(env: ServerEnv = serverEnv()): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
